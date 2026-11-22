// varn.js - NYTT 22/11: SMHI:s vadervarningar (konsekvensbaserade, IBW) pa kartan
// Hamtas via mellanservern (/varningar, cache 5 min) - SMHI:s API kan inte lasas direkt fran sidan.
// Kartan foljer den visade tiden: varningar som galler da = fylld yta, som borjar senare (inom 48 h) = streckad kant.
// Symbol i varje omrade (SMHI:s: gul cirkel, orange romb, rod triangel). Hovra over ytan eller tryck pa symbolen = info.
// Hela texten i listan under kartan. Hydrologiska meddelanden (vattenbrist, hoga floden) har en egen bock (av som standard).
// Test: lagg ?varntest=1..5 i adressen -> SMHI:s testvarningar, alla visas oavsett tid.
// SMHI:s texter visas alltid som ren text (textContent), aldrig som HTML.
const VARN_URL = "https://modelltittaren.metvyer.workers.dev/varningar";
const VARN_DIREKT = "https://opendata-download-warnings.smhi.se/ibww/api/version/1/warning.json";
const VARN_FARG = { YELLOW: "#f2c500", ORANGE: "#f07d00", RED: "#d6001c", MESSAGE: "#5b8db8" };
const VARN_NAMN = { YELLOW: "Gul varning", ORANGE: "Orange varning", RED: "Röd varning", MESSAGE: "Meddelande" };
const VARN_ORD = { MESSAGE: 0, YELLOW: 1, ORANGE: 2, RED: 3 };
const VARN_FRAMAT_H = 48;          // sa langt fram visas kommande varningar (streckade)
const VARN_OMHAMTA = 5 * 60e3;     // ny hamtning var 5:e minut medan knappen ar pa
let VARN = { pa: lasa("mt:varn") === "pa", hyd: lasa("mt:varnHyd") === "pa", lista: null, hamtad: 0, fel: "", hamtar: false, nyckel: "",
  test: ((new URLSearchParams(location.search).get("varntest") || "").match(/^[1-5]$/) || [""])[0] };

const varnTx = o => !o ? "" : typeof o === "string" ? o : (o.sv || o.en || "");
const varnTid1 = t => { const d = new Date(t); return VECKODAG[d.getUTCDay()].toLowerCase() + " " + d.getUTCDate() + "/" + (d.getUTCMonth() + 1) + " " + p2(d.getUTCHours()) + "Z"; };
const varnPeriod = v => (isFinite(v.t0) ? varnTid1(v.t0) : "?") + " – " + (v.t1 ? varnTid1(v.t1) : "tills vidare");

// geometrin: Polygon, MultiPolygon, LineString, Feature, FeatureCollection ... -> [{linje, ringar:[[[lon,lat],...]]}]
function varnGeo(g, ut) {
  if (!g || typeof g !== "object") return ut;
  if (g.type === "FeatureCollection") (g.features || []).forEach(f => varnGeo(f, ut));
  else if (g.type === "Feature") varnGeo(g.geometry, ut);
  else if (g.type === "GeometryCollection") (g.geometries || []).forEach(x => varnGeo(x, ut));
  else if (g.type === "Polygon") ut.push({ linje: false, ringar: g.coordinates || [] });
  else if (g.type === "MultiPolygon") (g.coordinates || []).forEach(c => ut.push({ linje: false, ringar: c }));
  else if (g.type === "LineString") ut.push({ linje: true, ringar: [g.coordinates || []] });
  else if (g.type === "MultiLineString") ut.push({ linje: true, ringar: g.coordinates || [] });
  return ut;
}
// SMHI:s JSON -> platt lista, en rad per varningsomrade
function varnTolka(js) {
  const ut = [];
  for (const h of Array.isArray(js) ? js : []) {
    const ev = h.event || {}, klass = (ev.mhoClassification && ev.mhoClassification.code) || "";
    for (const a of h.warningAreas || []) {
      const niv = (a.warningLevel && a.warningLevel.code) || "MESSAGE";
      const besk = (a.descriptions && a.descriptions.length ? a.descriptions : h.descriptions || [])
        .map(d => ({ kod: (d.title && d.title.code) || "", titel: varnTx(d.title), text: varnTx(d.text).replace(/\\n/g, "\n").trim() })).filter(d => d.text);
      const lan = (a.affectedAreas || []).map(varnTx).filter(Boolean).join(", ");
      const geo = varnGeo(a.area, []);
      ut.push({ id: h.id + ":" + a.id, niv, ord: VARN_ORD[niv] !== undefined ? VARN_ORD[niv] : 0, hand: varnTx(ev), typ: varnTx(a.eventDescription) || varnTx(ev),
        omr: varnTx(a.areaName) || varnTx(h.areaName) || lan, lan, klass, hyd: klass === "HYD",
        t0: Date.parse(a.approximateStart), t1: a.approximateEnd ? Date.parse(a.approximateEnd) : null, publ: Date.parse(a.published), besk, geo });
    }
  }
  return ut;
}
async function varnHamta(tvinga) {
  if (VARN.hamtar || (!tvinga && VARN.lista && Date.now() - VARN.hamtad < VARN_OMHAMTA)) return;
  VARN.hamtar = true; VARN.fel = ""; varnLista();
  try {
    let js = null;
    try { const r = await fetch(VARN_URL + (VARN.test ? "?test=" + VARN.test : ""), { cache: "no-cache" }); if (!r.ok) throw new Error("mellanservern svarade " + r.status); js = await r.json(); }
    catch (e) { if (VARN.test) throw e; const r = await fetch(VARN_DIREKT); if (!r.ok) throw new Error("SMHI svarade " + r.status); js = await r.json(); }   // reserv: direkt (gar bara om SMHI tillater det)
    VARN.lista = varnTolka(js); VARN.hamtad = Date.now();
  } catch (e) { VARN.fel = "Kunde inte hämta varningarna (" + (e.message || e) + ")."; }
  VARN.hamtar = false; VARN.nyckel = ""; varnUppdatera();
}

// tiden kartan visar just nu: [fran, till] i ms
function varnTid() {
  const nu = Date.now();
  try {
    if (lage === "p" && P.dtg) { let a = +$("pFran").value, b = +$("pTill").value; if (b < a) [a, b] = [b, a]; const bas = dtgDatum(P.dtg).getTime(); if (isFinite(a)) return [bas + a * 3600e3, bas + b * 3600e3]; }
    if (lage === "m0" && M0F.t0) { const t = M0F.t0 + M0F.t * 3600e3; return [t, t]; }
    if (lage === "exp" && M0F.t0 && EXP && EXP.t !== null && isFinite(EXP.t)) { const t = M0F.t0 + EXP.t * 3600e3; return [t, t]; }
    if ((lage === "sat" || lage === "rad") && OBS.ramar && OBS.ramar[OBS.i]) { const t = OBS.ramar[OBS.i].t; return [t, t]; }
  } catch (e) {}
  return [nu, nu];
}
// galler varningen under [a,b]? 1 = ja, 2 = borjar inom 48 h efter, 0 = nej
function varnStatus(v, a, b) {
  if (VARN.test) return 1;
  const s = isFinite(v.t0) ? v.t0 : -Infinity, e = v.t1 || Infinity;
  if (s <= b && e >= a) return 1;
  if (s > b && s <= b + VARN_FRAMAT_H * 3600e3) return 2;
  return 0;
}
const varnUrval = () => (VARN.lista || []).filter(v => VARN.hyd || !v.hyd);

// symbolen: cirkel (gul), romb (orange), triangel (rod), fyrkant med i (meddelande)
function varnSymbol(v, x, y, r) {
  const f = VARN_FARG[v.niv] || VARN_FARG.MESSAGE, g = el("g", { class: "varnsym", "data-v": v.id });
  const a = { fill: f, stroke: "#222", "stroke-width": 1.2, "vector-effect": "non-scaling-stroke" };
  if (v.niv === "ORANGE") g.appendChild(el("path", { ...a, d: `M${x} ${y - r * 1.25}L${x + r * 1.25} ${y}L${x} ${y + r * 1.25}L${x - r * 1.25} ${y}Z` }));
  else if (v.niv === "RED") g.appendChild(el("path", { ...a, d: `M${x} ${y - r * 1.3}L${x + r * 1.3} ${y + r * 0.95}L${x - r * 1.3} ${y + r * 0.95}Z` }));
  else if (v.niv === "MESSAGE") { g.appendChild(el("rect", { ...a, x: x - r, y: y - r, width: 2 * r, height: 2 * r, rx: r * 0.3 })); g.appendChild(el("text", { x, y: y + r * 0.55, "text-anchor": "middle", "font-size": r * 1.5, "font-weight": 700, fill: "#fff", "pointer-events": "none" }, "i")); }
  else g.appendChild(el("circle", { ...a, cx: x, cy: y, r }));
  if (v.niv !== "MESSAGE") g.appendChild(el("text", { x, y: y + r * 0.5, "text-anchor": "middle", "font-size": r * 1.3, "font-weight": 700, fill: "#222", "pointer-events": "none" }, "!"));
  return g;
}
function varnRita() {
  const g = $("kVarn"); if (!g) return; g.textContent = "";
  if (!VARN.pa || !VARN.lista) return;
  const [a, b] = varnTid(), w = typeof vb !== "undefined" && vb ? vb.w : 949, r = Math.max(2.5, w / 949 * 9);
  const synliga = varnUrval().map(v => ({ v, s: varnStatus(v, a, b) })).filter(x => x.s).sort((p, q) => (q.s - p.s) || (p.v.ord - q.v.ord));   // kommande under, hogre niva overst
  const sym = [];
  for (const { v, s } of synliga) {
    const f = VARN_FARG[v.niv] || VARN_FARG.MESSAGE; let sx = 0, sy = 0, n = 0, storst = null, yta = -1;
    for (const geo of v.geo) {
      let d = "";
      for (const ring of geo.ringar) {
        const pts = ring.filter(p => p && isFinite(p[0]) && isFinite(p[1])).map(p => tillKarta(p[1], p[0])); if (pts.length < 2) continue;
        d += "M" + pts.map(p => p.x.toFixed(1) + " " + p.y.toFixed(1)).join("L") + (geo.linje ? "" : "Z");
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
        const ar = (x1 - x0) * (y1 - y0); if (ar > yta) { yta = ar; storst = pts; }
      }
      if (!d) continue;
      g.appendChild(el("path", { class: "varnyta" + (s === 2 ? " kommande" : ""), "data-v": v.id, d, "fill-rule": "evenodd",
        fill: geo.linje || s === 2 ? "none" : f, "fill-opacity": 0.28, stroke: f, "stroke-width": geo.linje ? 4 : 2.2, "stroke-dasharray": s === 2 ? "7 5" : "", "vector-effect": "non-scaling-stroke" }));
    }
    if (storst) { for (const p of storst) { sx += p.x; sy += p.y; n++; } sym.push({ v, x: sx / n, y: sy / n, s }); }
  }
  for (const p of sym) { const sg = varnSymbol(p.v, p.x, p.y, p.s === 2 ? r * 0.75 : r); if (p.s === 2) sg.setAttribute("opacity", 0.75); g.appendChild(sg); }
}
const varnHitta = id => (VARN.lista || []).find(v => v.id === id);
function varnTipsText(v) {
  const [a, b] = varnTid(), s = varnStatus(v, a, b), inc = v.besk.find(d => d.kod === "INCIDENT") || v.besk[0];
  let t = "⚠ " + (VARN_NAMN[v.niv] || v.niv) + " – " + v.typ + "\n" + v.omr + "\n" + varnPeriod(v) + (s === 2 ? " (börjar senare)" : "");
  if (inc) t += "\n\n" + (inc.text.length > 350 ? inc.text.slice(0, 340) + " …" : inc.text);
  return t + "\n\nHela texten i listan under kartan · SMHI";
}
// anropas fran kartTips (index.html). Ytan ger info utom i Sannolikhet/m0 (dar faltets varden har foretrade) - symbolen alltid.
function varnTips(e) {
  if (!VARN.pa || !e.target || !e.target.closest || e.pointerType === "touch") return false;
  const s = e.target.closest(".varnsym"), y = !s && lage !== "p" && lage !== "m0" ? e.target.closest(".varnyta") : null, m = s || y;
  const v = m && varnHitta(m.dataset.v); if (!v) return false;
  visaKTips(varnTipsText(v), e.clientX + 14, e.clientY + 14); return true;
}
// klick/tryck pa symbolen: info + oppna varningen i listan
function varnKlick(e, mal) {
  const v = varnHitta(mal.closest(".varnsym").dataset.v); if (!v) return;
  visaKTips(varnTipsText(v), e.clientX + 14, e.clientY + 14);
  const d = document.querySelector('#varnLista details[data-v="' + CSS.escape(v.id) + '"]'); if (d) d.open = true;
}

// listan under kartan
function varnLista() {
  const L = $("varnLista"); if (!L) return;
  L.hidden = !VARN.pa; if (!VARN.pa) return; L.textContent = "";
  const hv = document.createElement("div"); hv.className = "varnhuvud";
  const rub = document.createElement("b"); rub.textContent = "SMHI:s vädervarningar" + (VARN.test ? " (TESTDATA " + VARN.test + ")" : ""); hv.appendChild(rub);
  const lb = document.createElement("label"); lb.title = "Vattenbrist, höga flöden m.m. - ofta hela län och utan sluttid";
  const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = VARN.hyd; cb.addEventListener("change", () => { VARN.hyd = cb.checked; lagra("mt:varnHyd", cb.checked ? "pa" : "av"); varnUppdatera(); });
  lb.append(cb, " hydrologiska meddelanden"); hv.appendChild(lb);
  const st = document.createElement("span"); st.className = "dim";
  st.textContent = VARN.hamtar ? "hämtar …" : VARN.fel ? VARN.fel : VARN.hamtad ? "hämtad " + p2(new Date(VARN.hamtad).getUTCHours()) + ":" + p2(new Date(VARN.hamtad).getUTCMinutes()) + "Z" : "";
  hv.appendChild(st); L.appendChild(hv);
  if (!VARN.lista) return;
  const [a, b] = varnTid(), rader = varnUrval().map(v => ({ v, s: varnStatus(v, a, b) })).sort((p, q) => ((p.s || 9) - (q.s || 9)) || (q.v.ord - p.v.ord) || (p.v.t0 - q.v.t0));
  const forkl = document.createElement("div"); forkl.className = "dim";
  forkl.textContent = "Kartan visar läget " + (a === b ? varnTid1(a) : varnTid1(a) + " – " + varnTid1(b)) + ": fylld yta = gäller då, streckad kant = börjar inom " + VARN_FRAMAT_H + " h. Hovra över en yta eller tryck på symbolen.";
  L.appendChild(forkl);
  if (!rader.length) { const p = document.createElement("div"); p.textContent = "Inga varningar just nu."; L.appendChild(p); return; }
  for (const { v, s } of rader) {
    const d = document.createElement("details"); d.dataset.v = v.id; if (!s) d.className = "varnann";
    const sm = document.createElement("summary"), pr = document.createElement("i"); pr.className = "varnprick niv" + v.niv; pr.style.background = VARN_FARG[v.niv] || VARN_FARG.MESSAGE;
    const tt = document.createElement("span"); tt.textContent = (VARN_NAMN[v.niv] || v.niv) + " · " + v.typ + " · " + v.omr + " · " + varnPeriod(v) + (s === 1 ? (VARN.test ? "" : " · gäller") : s === 2 ? " · kommande" : " · inte vid kartans tid");
    sm.append(pr, tt); d.appendChild(sm);
    if (v.lan) { const p = document.createElement("div"); p.className = "dim"; p.textContent = "Berör: " + v.lan; d.appendChild(p); }
    for (const x of v.besk) { const h = document.createElement("b"); h.textContent = x.titel; const p = document.createElement("div"); p.className = "varntext"; p.textContent = x.text; d.append(h, p); }
    if (isFinite(v.publ)) { const p = document.createElement("div"); p.className = "dim"; p.textContent = "Publicerad " + varnTid1(v.publ) + " · Källa: SMHI (öppna data)"; d.appendChild(p); }
    L.appendChild(d);
  }
}

// meteogrammet: rad med varningar som tacker punkten under meteogrammets tider
function varnIRing(lon, lat, ring) {
  let inne = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inne = !inne; }
  return inne;
}
const varnInne = (v, lat, lon) => v.geo.some(g => !g.linje && g.ringar.length && varnIRing(lon, lat, g.ringar[0]) && !g.ringar.slice(1).some(h => varnIRing(lon, lat, h)));
function varnMeteo() {
  const e = $("pMeteoVarn"); if (!e) return; e.textContent = "";
  const M = typeof P !== "undefined" && P.meteo;
  if (!VARN.pa || !VARN.lista || !M) { e.hidden = true; return; }
  const bas = dtgDatum(M.dtg).getTime(), a = bas, b = bas + (ENS_TIDER - 1) * 3600e3;
  const tr = varnUrval().filter(v => (VARN.test || (v.t0 <= b && (v.t1 || Infinity) >= a)) && varnInne(v, M.lat, M.lon)).sort((p, q) => q.ord - p.ord);
  if (!tr.length) { e.hidden = true; return; }
  for (const v of tr) { const d = document.createElement("div"), pr = document.createElement("i"); pr.className = "varnprick"; pr.style.background = VARN_FARG[v.niv] || VARN_FARG.MESSAGE;
    d.append(pr, (VARN_NAMN[v.niv] || v.niv) + ": " + v.typ + " (" + v.omr + ") " + varnPeriod(v)); e.appendChild(d); }
  e.hidden = false;
}

function varnUppdatera() { varnRita(); varnLista(); varnMeteo(); }
(function varnInit() {
  const k = $("visaVarn"); if (!k) return;
  const satt = () => { k.setAttribute("aria-pressed", String(VARN.pa)); if (VARN.pa) varnHamta(); varnUppdatera(); };
  k.addEventListener("click", () => { VARN.pa = !VARN.pa; lagra("mt:varn", VARN.pa ? "pa" : "av"); satt(); });
  if (VARN.test) VARN.pa = true;
  satt();
  // ritas om nar kartans tid, flik eller zoom andras (billig koll) och hamtas om var 5:e minut
  setInterval(() => {
    if (!VARN.pa) return;
    if (Date.now() - VARN.hamtad > VARN_OMHAMTA && !VARN.hamtar && !document.hidden) varnHamta();
    const t = varnTid(), w = typeof vb !== "undefined" && vb ? Math.round(vb.w) : 0;
    const ny = [lage, t[0], t[1], w, VARN.hyd, VARN.hamtad, P && P.meteo ? P.meteo.lat + "," + P.meteo.lon + M0Fsak() : ""].join("|");
    if (ny !== VARN.nyckel) { VARN.nyckel = ny; varnUppdatera(); }
  }, 700);
})();
function M0Fsak() { try { return typeof P !== "undefined" && P.meteo ? P.meteo.dtg : ""; } catch (e) { return ""; } }
