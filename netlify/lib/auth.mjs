// PIN familiar: protege la API para que solo tu familia pueda usarla.
export function authOk(req) {
  const expected = Netlify.env.get("FAMILY_PIN") || "";
  const given = req.headers.get("x-pin") || "";
  if (!expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
