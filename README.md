# 🥗 PlatoPower

Web para analizar platos con una foto: semáforo nutricional, anillos de nutrientes, consejos y siguiente comida. El historial se guarda en la nube, así que se ve igual desde el móvil y desde el ordenador.

## Cómo funciona

- `public/` → la web (HTML, CSS y JS puros, fondo claro, pensada para móvil).
- `netlify/functions/analyze.mjs` → recibe la foto y llama a Claude (la clave API nunca llega al navegador).
- `netlify/functions/history.mjs` → guarda historial y perfil en Netlify Blobs (sincronización entre dispositivos).
- Un **PIN familiar** protege la API.

## Puesta en marcha (≈10 min)

1. **GitHub**: crea un repositorio vacío (por ejemplo `platopower`) y sube esta carpeta:
   ```bash
   git init && git add . && git commit -m "PlatoPower"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/platopower.git
   git push -u origin main
   ```
2. **Netlify**: *Add new project → Import from Git* → elige el repo. No hace falta comando de build; Netlify lee `netlify.toml`. Cada proyecto nuevo es independiente, así que puedes añadirlo como tu tercer proyecto.
3. En **Project configuration → Environment variables** añade:
   | Variable | Valor |
   |---|---|
   | `ANTHROPIC_API_KEY` | tu clave de https://console.anthropic.com |
   | `FAMILY_PIN` | un PIN que elijáis (mejor 6+ dígitos) |
   | `ANTHROPIC_MODEL` | *(opcional)* otro modelo de Claude |
4. Lanza un nuevo deploy (*Deploys → Trigger deploy*) y abre la URL. Introduce el PIN en cada dispositivo una sola vez.
5. En el móvil: *Compartir → Añadir a pantalla de inicio* para usarla como una app.

## Notas

- La API de Claude tiene coste por uso (centavos por análisis). Pon un límite de gasto en la consola de Anthropic.
- Las funciones de Netlify tienen un límite de tiempo de unos 10 s en el plan gratuito; la foto se reduce a 1024 px y la respuesta es compacta para ir sobrada de tiempo.
- Las cifras son estimaciones orientativas. PlatoPower no sustituye a un pediatra o dietista.
- Desarrollo local: `npm install && npx netlify dev` (con un `.env` con las variables de arriba).
