"use strict";

const $ = (s, r = document) => r.querySelector(s); const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (n) => Math.round(Number(n) || 0);

const LS = { cache: "pp_cache" };
const state = {
  entries: [],
  profile: { name: "", age: 13, height: 160, weight: 69 },
  image: null,   // base64 jpeg (sin prefijo) para analizar
  thumb: null,   // miniatura para el historial
  meal: autoMeal(),
};

/* ---------------- API ---------------- */
async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { "content-type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Algo ha fallado");
  return data;
}

function setSync(ok) {
  const el = $("#sync");
  el.textContent = ok ? "● sincronizado" : "● sin conexión";
  el.classList.toggle("off", !ok);
}

async function loadAll() {
  try {
    const d = await api("/api/history");
    state.entries = d.entries; state.profile = d.profile;
    try { localStorage.setItem(LS.cache, JSON.stringify(d)); } catch {}
    setSync(true);
  } catch (e) {
    try {
      const c = JSON.parse(localStorage.getItem(LS.cache) || "null");
      if (c) { state.entries = c.entries; state.profile = c.profile; }
    } catch {}
    setSync(false);
  }
  return true;
}

async function start() {
  await loadAll();
  $("#app").hidden = false;
  renderAll();
}

/* ---------------- Utilidades ---------------- */
function autoMeal() {
  const h = new Date().getHours();
  if (h < 12) return "Desayuno";
  if (h < 18) return "Almuerzo";
  return "Cena";
}
const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const fmtDay = (ts) => {
  const today = dayKey(Date.now()), y = dayKey(Date.now() - 864e5);
  const k = dayKey(ts);
  if (k === today) return "Hoy";
  if (k === y) return "Ayer";
  return new Date(ts).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
};
const fmtTime = (ts) => new Date(ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2600);
}

function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const box = $("#confetti"); const colors = ["#6c5ce7", "#14c38e", "#ffb020", "#35b6ff", "#ff5d73"];
  for (let i = 0; i < 46; i++) {
    const p = document.createElement("i");
    p.style.left = Math.random() * 100 + "vw";
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = 1.6 + Math.random() * 1.6 + "s";
    p.style.animationDelay = Math.random() * 0.4 + "s";
    box.appendChild(p); setTimeout(() => p.remove(), 3800);
  }
}

/* ---------------- Imagen ---------------- */
function loadImg(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img); img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}
function toJpeg(img, max, q) {
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", q);
}

$("#photo").addEventListener("change", async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const img = await loadImg(file);
    const big = toJpeg(img, 1024, 0.8);
    state.image = big.split(",")[1];
    state.thumb = toJpeg(img, 180, 0.6);
    $("#preview").src = big; $("#preview").hidden = false; $("#drop-empty").hidden = true;
    $("#reset").hidden = false;
  } catch { toast("No he podido abrir esa foto"); }
});

$("#reset").addEventListener("click", resetScan);
function resetScan() {
  state.image = null; state.thumb = null;
  $("#photo").value = ""; $("#desc").value = "";
  $("#preview").hidden = true; $("#drop-empty").hidden = false;
  $("#reset").hidden = true; $("#result").innerHTML = ""; }  /* ---------------- Chips ---------------- */ function renderChips() {   $$("#meal-chips .chip").forEach((c) => c.classList.toggle("is-on", c.dataset.meal === state.meal));
}
$("#meal-chips").addEventListener("click", (e) => {
  const c = e.target.closest(".chip"); if (!c) return;
  state.meal = c.dataset.meal; renderChips();
});

/* ---------------- Analizar ---------------- */
const LOADING = ["Mirando tu plato…", "Contando proteínas 💪", "Buscando verduritas 🥦", "Calculando la energía ⚡", "Preparando tus consejos ✨"];

$("#analyze").addEventListener("click", async () => {
  const text = $("#desc").value.trim();
  if (!state.image && !text) { toast("Haz una foto o cuéntame qué comes 📸"); return; }

  const btn = $("#analyze"); btn.disabled = true;
  $("#result").innerHTML = ""; $("#loading").hidden = false;
  $("#drop").classList.add("scanning");
  let i = 0; const timer = setInterval(() => { $("#loading-text").textContent = LOADING[++i % LOADING.length]; }, 1700);

  try {
    const { result } = await api("/api/analyze", {
      method: "POST",
      body: JSON.stringify({ image: state.image, text, profile: state.profile, meal: state.meal }),
    });

    if (result.needs_clarification) {
      $("#result").innerHTML = `<div class="ask">🤔 ${esc(result.clarification || "¿Me cuentas algún ingrediente o cantidad más?")}</div>`;
      $("#desc").focus();
    } else {
      $("#result").innerHTML = renderResult(result, state.meal);
      $("#result").scrollIntoView({ behavior: "smooth", block: "start" });
      if (result.light === "green") confetti();
      const entry = { id: crypto.randomUUID(), ts: Date.now(), meal: state.meal, thumb: state.thumb, result };
      state.entries.unshift(entry);
      saveEntry(entry);
      renderToday(); renderHistory();
    }
  } catch (e) {
    $("#result").innerHTML = `<div class="ask">😕 ${esc(e.message)}</div>`;
  } finally {
    clearInterval(timer); btn.disabled = false;
    $("#loading").hidden = true; $("#drop").classList.remove("scanning");
  }
});

async function saveEntry(entry) {
  try {
    const d = await api("/api/history", { method: "POST", body: JSON.stringify({ entry }) });
    state.entries = d.entries; setSync(true);
    try { localStorage.setItem(LS.cache, JSON.stringify({ entries: state.entries, profile: state.profile })); } catch {}
    toast("Guardado en tu historial ✅");
  } catch { setSync(false); toast("No se pudo guardar. Revisa tu conexión"); }
}

/* ---------------- Render resultado ---------------- */
function ring(label, value, ref, color, unit = "g") {
  const C = 2 * Math.PI * 33;
  const on = Math.min(1, value / ref) * C;
  return `<div class="ring">
    <svg viewBox="0 0 80 80" aria-hidden="true"><circle class="bg" cx="40" cy="40" r="33"/><circle class="fg" cx="40" cy="40" r="33" stroke="${color}" style="--on:${on.toFixed(1)}"/></svg>
    <div><b>${value}${unit}</b><small>${label}</small></div>
  </div>`;
}

function renderResult(r, meal) {
  const n = r.nutrition || {};
  const light = ["green", "yellow", "red"].includes(r.light) ? r.light : "yellow";
  const items = (r.items || []).map((i) => `<span class="item">${esc(i.emoji || "🍽️")} ${esc(i.name)} <em>~${num(i.grams)} g</em></span>`).join("");
  const tips = (r.tips || []).map((t) => `<div class="tip"><span>${esc(t.emoji || "💡")}</span><div>${esc(t.text)}</div></div>`).join("");
  return `<div class="res">
    <div class="res-hero ${light}">
      <div class="light" aria-hidden="true"><i></i><i></i><i></i></div>
      <div>
        <div class="meal">${esc(r.emoji || "🍽️")} ${esc(meal || "")} · ${esc(r.title)}</div>
        <h2>${esc(r.light_title)}</h2>
        <p>${esc(r.light_reason)}</p>
      </div>
    </div>

    <div class="card">
      <h3>🍽️ Lo que veo</h3>
      <div class="items">${items}</div>
      ${r.portion_note ? `<p class="note" style="margin-top:12px">${esc(r.portion_note)}</p>` : ""}
    </div>

    <div class="card">
      <h3>📊 Tu energía y nutrientes</h3>
      <div class="kcal"><b>${num(n.kcal)}</b><span>kcal aprox.</span></div>
      <div class="rings">
        ${ring("Proteína", num(n.protein_g), 30, "#6c5ce7")}
        ${ring("Carbohidratos", num(n.carbs_g), 80, "#ffb020")}
        ${ring("Fibra", num(n.fiber_g), 8, "#14c38e")}
        ${ring("Grasas", num(n.fat_g), 25, "#35b6ff")}
      </div>
      <p class="fact" style="margin-top:12px">Los círculos se llenan según lo que suele tener un plato completo.</p>
    </div>

    <div class="card"><h3>💡 Mejora tu plato</h3><div class="tips">${tips}</div></div>

    <div class="card next"><h3>🎯 Para la próxima comida</h3><p>${esc(r.next_meal)}</p></div>

    ${r.fun_fact ? `<p class="fact">🧠 ${esc(r.fun_fact)}</p>` : ""}
    <p class="disclaimer">Son estimaciones orientativas. Ante dudas, consulta con tu pediatra o dietista.</p>
  </div>`;
}

/* ---------------- Hoy ---------------- */
function renderToday() {
  const today = dayKey(Date.now());
  const list = state.entries.filter((e) => dayKey(e.ts) === today);
  const sum = (k) => list.reduce((a, e) => a + num(e.result?.nutrition?.[k]), 0);
  const greens = state.entries.filter((e) => Date.now() - e.ts < 7 * 864e5 && e.result?.light === "green").length;

  const days = [...Array(7)].map((_, i) => Date.now() - (6 - i) * 864e5);
  const week = days.map((ts) => {
    const k = dayKey(ts);
    const dots = state.entries.filter((e) => dayKey(e.ts) === k).map((e) => `<i class="${e.result?.light || "yellow"}"></i>`).join("");
    const name = new Date(ts).toLocaleDateString("es-ES", { weekday: "short" }).replace(".", "");
    return `<div class="day ${k === today ? "now" : ""}">${esc(name)}<div class="dots">${dots}</div></div>`;
  }).join("");

  const name = state.profile.name ? `, ${esc(state.profile.name)}` : "";
  $("#today").innerHTML = `<div class="stack">
    <div><h2 style="font-size:clamp(26px,5vw,36px);font-weight:800">¡Hola${name}! 👋</h2>
    <p class="muted" style="margin-top:6px">${list.length ? "Así va tu día." : "Aún no has apuntado nada hoy. ¡Haz una foto de tu próxima comida!"}</p></div>
    <div class="stats">
      <div class="stat v"><b>${list.length}</b><span>comidas hoy</span></div>
      <div class="stat o"><b>${sum("kcal")}</b><span>kcal aprox.</span></div>
      <div class="stat s"><b>${sum("protein_g")} g</b><span>proteína 💪</span></div>
      <div class="stat m"><b>${sum("fiber_g")} g</b><span>fibra 🌱</span></div>
    </div>
    <div class="card"><h3>🟢 Platos excelentes esta semana: ${greens}</h3><div class="week">${week}</div></div>
    ${list.length ? "" : `<div class="empty"><div class="big">🍽️</div><strong>Tu día está en blanco</strong><button class="btn btn-main" data-go="scan">Analizar un plato</button></div>`}
  </div>`;
}

/* ---------------- Historial ---------------- */
function renderHistory() {
  if (!state.entries.length) {
    $("#history").innerHTML = `<div class="empty"><div class="big">🗓️</div><strong>Aquí aparecerán tus platos</strong><button class="btn btn-main" data-go="scan">Analizar el primero</button></div>`;
    return;
  }
  let html = "", last = "";
  for (const e of state.entries) {
    const k = dayKey(e.ts);
    if (k !== last) { html += `<h3 class="day-title">${esc(fmtDay(e.ts))}</h3>`; last = k; }
    const r = e.result || {}, n = r.nutrition || {};
    html += `<article class="entry" data-id="${esc(e.id)}">
      ${e.thumb ? `<img class="thumb" src="${esc(e.thumb)}" alt="">` : `<div class="thumb">${esc(r.emoji || "🍽️")}</div>`}
      <div><h4>${esc(r.title)}</h4><p>${esc(e.meal || "")} · ${fmtTime(e.ts)} · ${num(n.kcal)} kcal · ${num(n.protein_g)} g prot.</p></div>
      <span class="badge ${esc(r.light || "yellow")}" title="${esc(r.light_title)}"></span>
      <div class="entry-detail"></div>
    </article>`;
  }
  $("#history").innerHTML = html;
}

$("#history").addEventListener("click", async (e) => {
  const del = e.target.closest("[data-del]");
  if (del) {
    if (!confirm("¿Borrar este plato del historial?")) return;
    try {
      const d = await api("/api/history?id=" + encodeURIComponent(del.dataset.del), { method: "DELETE" });
      state.entries = d.entries; renderHistory(); renderToday(); toast("Borrado");
    } catch { toast("No se pudo borrar"); }
    return;
  }
  const card = e.target.closest(".entry"); if (!card || e.target.closest(".entry-detail")) return;
  const open = card.classList.toggle("open");
  const detail = $(".entry-detail", card);
  if (open) {
    const entry = state.entries.find((x) => x.id === card.dataset.id);
    detail.innerHTML = renderResult(entry.result, entry.meal) + `<button class="del" data-del="${esc(entry.id)}">🗑️ Borrar este plato</button>`;
  } else detail.innerHTML = "";
});

/* ---------------- Navegación ---------------- */
function go(view) {
  $$(".tab").forEach((t) => t.classList.toggle("is-on", t.dataset.view === view));   $$
(".view").forEach((v) => v.classList.toggle("is-on", v.id === "view-" + view));
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$("#tabs").addEventListener("click", (e) => { const t = e.target.closest(".tab"); if (t) go(t.dataset.view); });
document.addEventListener("click", (e) => { const g = e.target.closest("[data-go]"); if (g) go(g.dataset.go); });

/* ---------------- Ajustes ---------------- */
$("#open-settings").addEventListener("click", () => {
  const p = state.profile;
  $("#s-name").value = p.name \vert{}\vert{} ""; $("#s-age").value = p.age; $("#s-height").value = p.height; $("#s-weight").value = p.weight;
  $("#settings").showModal();
});
$("#settings-form").addEventListener("submit", async (e) => {
  if (e.submitter?.value !== "save") return;
  const profile = { name: $("#s-name").value.trim(), age: +$("#s-age").value, height: +$("#s-height").value, weight: +$("#s-weight").value };
  try {
    const d = await api("/api/history", { method: "PUT", body: JSON.stringify({ profile }) });
    state.profile = d.profile; renderToday(); toast("Ajustes guardados ✅");
  } catch { toast("No se pudieron guardar"); }
});

/* ---------------- Sincronización al volver a la app ---------------- */
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && !$("#app").hidden) {
    if (await loadAll()) { renderToday(); renderHistory(); }
  }
});

function renderAll() { renderChips(); renderToday(); renderHistory(); }
start();