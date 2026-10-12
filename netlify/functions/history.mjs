import { getStore } from "@netlify/blobs";
import { json } from "../lib/auth.mjs";

const MAX_ENTRIES = 400;
const DEFAULT_PROFILE = { name: "", age: 13, height: 160, weight: 69 };

export default async (req) => {
  const store = getStore("platopower");
  const entries = (await store.get("entries", { type: "json" })) || [];
  const profile = (await store.get("profile", { type: "json" })) || DEFAULT_PROFILE;

  if (req.method === "GET") return json({ entries, profile });

  if (req.method === "POST") {
    const { entry } = await req.json();
    if (!entry?.id || !entry?.result) return json({ error: "Entrada no válida" }, 400);
    const next = [entry, ...entries.filter((e) => e.id !== entry.id)]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, MAX_ENTRIES);
    await store.setJSON("entries", next);
    return json({ ok: true, entries: next });
  }

  if (req.method === "PUT") {
    const { profile: p } = await req.json();
    const clean = {
      name: String(p?.name ?? "").slice(0, 30),
      age: clamp(p?.age, 8, 18, 13),
      height: clamp(p?.height, 100, 220, 160),
      weight: clamp(p?.weight, 25, 200, 69),
    };
    await store.setJSON("profile", clean);
    return json({ ok: true, profile: clean });
  }

  if (req.method === "DELETE") {
    return json({ error: "Los platos guardados no se pueden borrar" }, 403);
  }

  return json({ error: "Método no permitido" }, 405);
};

function clamp(v, min, max, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export const config = { path: "/api/history" };
