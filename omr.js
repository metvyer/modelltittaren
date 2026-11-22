// omr.js - NYTT 22/11: omraden pa kartan (knappen "Områden ▾")
// Luftrum fran LFV:s oppna AIP-data (WFS, uppdateras per AIRAC): TRA, R-, D-omraden, CTR, TMA, ATZ.
// Sjovaderomraden och lan fran SMHI (samma omraden som varningarna).
// Hamtas via mellanservern (/omraden?k=..., cache 1 dygn), en gang per lager och sidvisning.
// OBS: gransernas lage - inte om omradet ar aktivt (det styrs av NOTAM/eAUP, som inte ar oppna data). Inte for navigering.
// Texter fran LFV/SMHI visas alltid som ren text.
const OMR_URL = "https://modelltittaren.metvyer.workers.dev/omraden?k=";
// lager: nyckel, kalla (k), filter, namn, farg, streck, etiketter alltid (true) eller forst vid inzoomning
const OMR_LAGER = [
  { id: "SJO", k: "SMHI", f: a => a.k === "SJO", namn: "Sjöväderområden (SMHI)", farg: "#0b6e99", streck: "", etik: true },
  { id: "LAN", k: "SMHI", f: a => a.k === "LAN", namn: "Län (SMHI:s varningsindelning)", farg: "#777777", streck: "2 3", etik: false },
  { id: "TRA", k: "TRA", namn: "TRA – militära övningsområden, högt (LFV)", farg: "#8e44ad", streck: "8 4", etik: true },
  { id: "RSTA", k: "RSTA", namn: "R-områden – restriktionsområden (LFV)", farg: "#d62728", streck: "", etik: false },
  { id: "DNGA", k: "DNGA", namn: "D-områden – farliga områden (LFV)", farg: "#e67e00", streck: "6 3", etik: false },
  { id: "CTR", k: "CTR", namn: "CTR – kontrollzoner (LFV)", farg: "#1f6fb4", streck: "", etik: false },
  { id: "TMAW", k: "TMAW", namn: "TMA – terminalområden (LFV)", farg: "#17a2b8", streck: "3 3", etik: false },
  { id: "ATZ", k: "ATZ", namn: "ATZ – trafikzoner (LFV)", farg: "#2e8b57", streck: "", etik: false },
  // 22/11: flygledningssektorer (ACC) - ligger i flera hojdskikt ovanpa varandra, anvand hojdfiltret
  { id: "ESOS", k: "ATCCS_ESOS", namn: "Sektorer Stockholm kontroll (LFV)", farg: "#475569", streck: "5 3", etik: false },
  { id: "ESMM", k: "ATCCS_ESMM", namn: "Sektorer Malmö kontroll (LFV)", farg: "#8b5a2b", streck: "5 3", etik: false },
];
// 22/11: hojdfilter for LFV-lagren - visa bara omraden som omfattar vald hojd (fot). 0 = alla.
const OMR_HOJDER = [[0, "alla höjder"], [1000, "1 000 ft"], [3000, "3 000 ft"], [5000, "FL 50"], [10000, "FL 100"], [15000, "FL 150"], [20000, "FL 200"], [25000, "FL 250"], [30000, "FL 300"], [40000, "FL 400"]];
// LFV:s hojder: "GND", "UNL", "FL 95", "4500" (fot over havet) -> fot
const omrFot = h => { h = String(h == null ? "" : h).trim().toUpperCase(); if (!h || h === "GND" || h === "SFC") return 0; if (h === "UNL") return 1e6;
  const m = h.match(/^FL\s*(\d+)/); if (m) return +m[1] * 100; const n = parseFloat(h); return isFinite(n) ? n : null; };
const omrHojdOk = a => { const H = OMR.hojd; if (!H || a.l === undefined) return true; const l = omrFot(a.l), u = omrFot(a.u);
  return (l === null || l <= H) && (u === null || u >= H); };
let OMR = { hojd: +(lasa("mt:omrHojd") || 0) || 0, pa: (() => { try { return JSON.parse(lasa("mt:omr") || "[]"); } catch (e) { return []; } })(), data: {}, hamtar: {}, fel: {}, nyckel: "" };
const omrLager = id => OMR_LAGER.find(l => l.id === id);

async function omrHamta(k) {
  if (OMR.data[k] || OMR.hamtar[k]) return;
  OMR.hamtar[k] = true; OMR.fel[k] = ""; omrMenyStatus();
  try { const r = await fetch(OMR_URL + k); if (!r.ok) throw new Error("svar " + r.status); OMR.data[k] = await r.json(); }
  catch (e) { OMR.fel[k] = String(e.message || e); }
  OMR.hamtar[k] = false; omrMenyStatus(); OMR.nyckel = ""; omrRita();
}
// geometri -> lista av ringar (varje ring = [[lon,lat],...]); linje = inte sluten
function omrRingar(g, ut) {
  if (!g) return ut;
  if (g.type === "Polygon") g.coordinates.forEach(r => ut.push({ r, sluten: true }));
  else if (g.type === "MultiPolygon") g.coordinates.forEach(p => p.forEach(r => ut.push({ r, sluten: true })));
  else if (g.type === "LineString") ut.push({ r: g.coordinates, sluten: false });
  else if (g.type === "MultiLineString") g.coordinates.forEach(r => ut.push({ r, sluten: false }));
  else if (g.type === "GeometryCollection") (g.geometries || []).forEach(x => omrRingar(x, ut));
  return ut;
}
// hojd fran LFV: "GND", "UNL", "FL 95", "4500" (= fot over havet)
const omrHojd = h => { h = String(h == null ? "" : h).trim(); return /^\d+$/.test(h) ? h + " ft" : h || "?"; };

function omrRita() {
  const g = $("kOmraden"); if (!g) return; g.textContent = "";
  const w = typeof vb !== "undefined" && vb ? vb.w : 949, fs = Math.max(3, w / 949 * 11), nara = w < 420;
  const etiketter = [];
  for (const L of OMR_LAGER) {
    if (!OMR.pa.includes(L.id)) continue;
    const lista = OMR.data[L.k]; if (!lista) continue;
    lista.forEach((a, i) => {
      if (L.f && !L.f(a)) return;
      if (L.k !== "SMHI" && !omrHojdOk(a)) return;
      let d = "", storst = null, yta = -1;
      for (const { r, sluten } of omrRingar(a.g, [])) {
        const pts = r.filter(p => p && isFinite(p[0]) && isFinite(p[1])).map(p => tillKarta(p[1], p[0])); if (pts.length < 2) continue;
        d += "M" + pts.map(p => p.x.toFixed(1) + " " + p.y.toFixed(1)).join("L") + (sluten ? "Z" : "");
        if (sluten) { let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
          if ((x1 - x0) * (y1 - y0) > yta) { yta = (x1 - x0) * (y1 - y0); storst = pts; } }
      }
      if (!d) return;
      g.appendChild(el("path", { class: "omryta", "data-l": L.id, "data-i": i, d, "fill-rule": "evenodd", fill: L.farg, "fill-opacity": 0.001,
        stroke: L.farg, "stroke-width": L.id === "LAN" ? 1 : 1.6, "stroke-dasharray": L.streck, "vector-effect": "non-scaling-stroke" }));
      if (storst && (L.etik || nara)) { let sx = 0, sy = 0; for (const p of storst) { sx += p.x; sy += p.y; } etiketter.push({ L, i, a, x: sx / storst.length, y: sy / storst.length }); }
    });
  }
  for (const e of etiketter) {
    const t = el("text", { class: "omretik", "data-l": e.L.id, "data-i": e.i, x: e.x, y: e.y, "text-anchor": "middle", "font-size": fs, "stroke-width": fs * 0.22, fill: e.L.farg, "font-weight": 600 },
      e.L.id === "SJO" || e.L.id === "LAN" ? e.a.n : e.a.n.replace(/^ES\s*/, ""));
    g.appendChild(t);
  }
}
function omrTipsText(L, a) {
  if (L.k === "SMHI") return (L.id === "SJO" ? "Sjöväderområde: " : "Län: ") + a.n + "\nKälla: SMHI";
  let t = a.n + "\n" + L.namn.replace(/ \(LFV\)$/, "") + "\nHöjd: " + omrHojd(a.l) + " – " + omrHojd(a.u);
  if (a.c) t += "\n\n" + (a.c.length > 400 ? a.c.slice(0, 390) + " …" : a.c);
  return t + "\n\nKälla: LFV (AIP" + (a.w ? ", gäller från " + String(a.w).slice(0, 10) : "") + "). Gränser, inte aktivering. Inte för navigering.";
}
function omrFran(mal) {
  const m = mal && mal.closest && mal.closest(".omryta, .omretik"); if (!m) return null;
  const L = omrLager(m.dataset.l), lista = L && OMR.data[L.k], a = lista && lista[+m.dataset.i];
  return a ? { L, a } : null;
}
// anropas fran kartTips: hovra yta/namn (ytor inte i Sannolikhet/m0, dar faltets varden gar fore)
function omrTips(e) {
  if (!OMR.pa.length || e.pointerType === "touch") return false;
  const m = e.target && e.target.closest && e.target.closest(".omretik, .omryta"); if (!m) return false;
  if (m.classList.contains("omryta") && (lage === "p" || lage === "m0")) return false;
  const x = omrFran(m); if (!x) return false;
  visaKTips(omrTipsText(x.L, x.a), e.clientX + 14, e.clientY + 14); return true;
}
// tryck pa ett namn (mobil)
function omrKlick(e, mal) { const x = omrFran(mal); if (x) visaKTips(omrTipsText(x.L, x.a), e.clientX + 14, e.clientY + 14); }

// menyn
function omrMenyStatus() {
  for (const L of OMR_LAGER) { const s = document.querySelector('#omrMeny [data-s="' + L.id + '"]'); if (!s) continue;
    s.textContent = OMR.hamtar[L.k] ? " hämtar …" : OMR.fel[L.k] ? " fel: " + OMR.fel[L.k] : OMR.pa.includes(L.id) && OMR.data[L.k] ? " (" + OMR.data[L.k].filter(a => (!L.f || L.f(a)) && (L.k === "SMHI" || omrHojdOk(a))).length + ")" : ""; }
  const k = $("visaOmr"); if (k) k.setAttribute("aria-pressed", String(OMR.pa.length > 0));
}
(function omrInit() {
  const k = $("visaOmr"), m = $("omrMeny"); if (!k || !m) return;
  for (const L of OMR_LAGER) {
    const lb = document.createElement("label"), cb = document.createElement("input"), pr = document.createElement("i"), s = document.createElement("span");
    cb.type = "checkbox"; cb.checked = OMR.pa.includes(L.id);
    pr.className = "omrprick"; pr.style.borderColor = L.farg; if (L.streck) pr.style.borderStyle = "dashed";
    s.dataset.s = L.id; s.className = "dim";
    cb.addEventListener("change", () => { OMR.pa = OMR.pa.filter(x => x !== L.id); if (cb.checked) { OMR.pa.push(L.id); omrHamta(L.k); }
      lagra("mt:omr", JSON.stringify(OMR.pa)); omrMenyStatus(); OMR.nyckel = ""; omrRita(); });
    lb.append(cb, pr, L.namn, s); m.appendChild(lb);
  }
  { const lb = document.createElement("label"), sel = document.createElement("select"); lb.className = "omrhojd";
    for (const [v, t] of OMR_HOJDER) sel.add(new Option(t, v)); sel.value = String(OMR.hojd);
    sel.addEventListener("change", () => { OMR.hojd = +sel.value; lagra("mt:omrHojd", sel.value); omrMenyStatus(); OMR.nyckel = ""; omrRita(); });
    lb.append("Höjdfilter (LFV-lagren): ", sel); lb.title = "Visa bara områden vars nedre gräns ligger under och övre gräns över vald höjd - bra för sektorerna, som ligger i flera skikt"; m.appendChild(lb); }
  const not = document.createElement("div"); not.className = "dim";
  not.textContent = "Visar var gränserna går – inte om ett område är aktivt (det meddelas via NOTAM/eAUP). Inte för navigering. Hovra eller tryck på namnet för höjder och anmärkningar. Källor: LFV (AIP Sverige, öppna data), SMHI.";
  m.appendChild(not);
  k.addEventListener("click", ev => { ev.stopPropagation(); m.hidden = !m.hidden; });
  document.addEventListener("click", ev => { if (!m.hidden && !m.contains(ev.target) && ev.target !== k) m.hidden = true; });
  for (const id of OMR.pa) { const L = omrLager(id); if (L) omrHamta(L.k); }
  omrMenyStatus();
  // ritas om vid zoom (etikettstorlek / namn vid inzoomning)
  setInterval(() => { if (!OMR.pa.length) return; const w = typeof vb !== "undefined" && vb ? Math.round(vb.w) : 0, ny = w + "|" + OMR.pa.join(",");
    if (ny !== OMR.nyckel) { OMR.nyckel = ny; omrRita(); } }, 700);
})();
