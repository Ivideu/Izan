import { authOk, json } from "../lib/auth.mjs";

const SYSTEM = `Eres un dietista y nutricionista infantil experto, empático y motivador, especializado en recomposición corporal para adolescentes. Hablas con un chico de 13 años: lenguaje sencillo, cercano, positivo, educador, NUNCA culpabilizador ni restrictivo. No hables de "prohibido" ni de "malo".
Solo existen tres comidas al día: desayuno, comida y cena. Nunca hables de almuerzo, merienda, tentempié ni snacks entre horas; en "next_meal" refiérete siempre a la siguiente de esas tres.\nPromueves comida real (proteínas magras, legumbres, verduras, frutas, frutos secos, cereales integrales) e hidratación con agua. El objetivo es perder grasa de forma saludable, mantener/ganar músculo y tener energía sin comprometer el crecimiento: nunca sugieras recortar calorías de forma drástica ni saltarse comidas.
Analiza la foto (o la descripción) del plato, comida, aperitivo o bebida. Estima porciones y valores de forma aproximada y dilo con naturalidad (son estimaciones).
Semáforo: "green" = excelente/muy adecuado (equilibrado, denso en nutrientes); "yellow" = adecuado con matices (ajustar porción de algún macronutriente); "red" = ocasional (ultraprocesado o muy calórico, para consumo puntual).
Si la foto no es clara o falta información importante, pon needs_clarification=true y pregunta con amabilidad por el ingrediente o cantidad concreta.
Responde SOLO con un objeto JSON válido (sin markdown, sin texto extra) con esta forma exacta:
{
 "needs_clarification": false,
 "clarification": "",
 "title": "nombre corto y simpático del plato",
 "emoji": "un emoji",
 "items": [{"emoji":"🍗","name":"Pechuga a la plancha","grams":120}],
 "nutrition": {"kcal":0,"protein_g":0,"carbs_g":0,"fiber_g":0,"fat_g":0},
 "light": "green|yellow|red",
 "light_title": "frase corta (máx. 6 palabras)",
 "light_reason": "1-2 frases fáciles de entender explicando el semáforo",
 "tips": [{"emoji":"🥗","text":"consejo práctico y positivo, máx. 20 palabras"}],
 "portion_note": "1 frase sobre si la ración es adecuada, escasa o abundante y cómo ajustarla (o cadena vacía)",
 "next_meal": "1-2 frases: qué priorizar en la siguiente comida",
 "fun_fact": "dato curioso corto sobre algún alimento del plato"
}
"tips": entre 2 y 3 elementos. "items": máximo 6. Todos los números son enteros.`;

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  if (!authOk(req)) return json({ error: "PIN incorrecto" }, 401);

  const apiKey = (Netlify.env.get("GEMINI_API_KEY") || "").trim();
  if (!apiKey) return json({ error: "Falta configurar GEMINI_API_KEY en Netlify" }, 500);

  const { image, text, profile, meal } = await req.json();
  if (!image && !text?.trim()) return json({ error: "Envía una foto o una descripción" }, 400);

  const p = profile || {};
  const context =
    `Perfil: ${p.age ?? 13} años, ${p.height ?? 160} cm, ${p.weight ?? 69} kg. ` +
    `Momento del día: ${meal || "sin indicar"}.` +
    (text?.trim() ? ` Descripción del chico: "${text.trim().slice(0, 600)}".` : "");

  const parts = [];
  if (image) parts.push({ inline_data: { mime_type: "image/jpeg", data: image } });
  parts.push({ text: context });

  // Modelos a probar, en orden: primero el más rápido (Netlify gratis corta a ~10 s).
  // Se ignora un GEMINI_MODEL de la serie 2.5 (retirada para cuentas nuevas).
  const envModel = (Netlify.env.get("GEMINI_MODEL") || "").trim();
  const candidates = [...new Set([
    envModel && !envModel.startsWith("gemini-2.5") ? envModel : "",
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash",
  ].filter(Boolean))];

  const buildBody = (model) => {
    const generationConfig = { responseMimeType: "application/json", maxOutputTokens: 2048 };
    // Flash-Lite ya piensa lo mínimo por defecto y no admite temperature personalizada.
    if (!/flash-lite/.test(model)) generationConfig.thinkingConfig = { thinkingLevel: "low" };
    return JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts }],
      generationConfig,
    });
  };

  const deadline = Date.now() + 8500; // devolvemos un error limpio antes de que Netlify corte
  let res, model, detail = "";
  try {
    for (model of candidates) {
      const left = deadline - Date.now();
      if (left < 1500) break;
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
          body: buildBody(model),
          signal: AbortSignal.timeout(left),
        }
      );
      if (res.ok) break;
      detail = await res.text();
      console.error("Gemini error", model, res.status, detail);
      if (![404, 503].includes(res.status)) break; // se prueba el siguiente solo si no existe o está saturado
    }
  } catch (e) {
    console.error("Gemini timeout/red", model, e?.name, e?.message);
    return json({ error: "El análisis ha tardado demasiado. Prueba otra vez (con una foto más sencilla si insiste)." }, 504);
  }

  if (!res) return json({ error: "El análisis ha tardado demasiado. Prueba otra vez." }, 504);

  if (!res.ok) {
    let googleMsg = "";
    try { googleMsg = JSON.parse(detail)?.error?.message || ""; } catch {}
    const hint =
      res.status === 400 ? "Clave de API no válida o petición incorrecta" :
      res.status === 403 ? "La clave no tiene permiso (revisa que sea de Google AI Studio)" :
      res.status === 404 ? "Ningún modelo de Gemini está disponible para tu clave" :
      res.status === 429 ? "Se ha alcanzado el límite gratuito de Gemini. Espera un minuto" :
      "Gemini no responde ahora mismo";
    return json({ error: `${hint} [${model}, error ${res.status}]. ${googleMsg}`.trim().slice(0, 300) }, 502);
  }

  const data = await res.json();
  const raw = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  try {
    const result = JSON.parse(raw.slice(start, end + 1));
    return json({ result });
  } catch {
    return json({ error: "La respuesta no se entendió bien. Prueba otra vez." }, 502);
  }
};

export const config = { path: "/api/analyze" };
