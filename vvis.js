// vvis.js - NYTT 23/11: VAGVADER (Trafikverkets VViS-stationer) pa kartan, knappen "🛣 Vägväder" + val av parameter.
// Data via mellanservern /vvis (alla stationer, senaste matningen, cache 5 min). Hamtas om var 5:e minut nar lagret ar pa.
// Observationer - galler NU, inte kartans prognostid (tiden star i hovringsrutan).
// HALKRISK (egen tolkning, enkel och genomskinlig):
//   rod    = stationen rapporterar is eller sno pa vagen, eller underkylt regn
//   orange = vagtemp < +0,5 och (vagtemp <= daggpunkt [rimfrost], nederbord/vatten pa vagen nu,
//            eller regn/sno inom 3 h [23/11 kvall: "kallt efter nederbord" - regn och uppklarning])
//   gul    = vagtemp <= +1 och vagtemp - daggpunkt <= 1 (nara rimfrost/frysning)
//   gron   = ingen av ovanstaende, gra = saknar vagtemp
// NYTT 23/11 kvall:
//  - DIAGRAM i hovringsrutan: stationens historik (6/24/72 h, mellanservern /vvis/historik) - vagtemp, daggpunkt, lufttemp,
//    nederbord (regn gront, sno blatt, underkylt rott) + MEPS yttemp (air_temperature_0m) i narmaste 2,5 km-ruta:
//    senaste korningen (orange streckad, aven framat) och aldsta korningen i mepslatest (~1 dygn gammal, svagare).
//    Hamtas forst nar musen stannat 0,3 s pa en station; cache 5 min per station.
//  - "VViS − modell" (Karta MBR0): rutorna fargas efter obs minus medlem 0 for det falt som visas (yttemp, temp 2 m,
//    daggpunkt eller yttemp − daggpunkt) om kartans tid ligger inom 1 h fran matningen. Inga extra hamtningar.
// Data ar CC0 (Trafikverket). Namn fran Trafikverket visas alltid escapade.
const VVIS_URL = "https://modelltittaren.metvyer.workers.dev/vvis";
let VV = { pa: lasa("mt:vvis") === "ja", par: lasa("mt:vvisPar") || "halka", h: [6, 24, 72].includes(+lasa("mt:vvisH")) ? +lasa("mt:vvisH") : 24,
  lista: [], t: 0, tim: 0, tipsId: null, tipsTim: 0, tipsXY: [0, 0], hist: new Map(), mod: new Map() };
const vvEsc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const VV_NB = { no: "ingen", rain: "regn", freezing_rain: "underkylt regn", snow: "snö", sleet: "snöblandat regn", yes: "nederbörd (okänd typ)" };
const VV_PAR = {
  halka: { namn: "Halkrisk", enh: "" },
  ty: { namn: "Vägtemp", enh: "°" }, tl: { namn: "Lufttemp", enh: "°" }, td: { namn: "Daggpunkt", enh: "°" },
  dy: { namn: "Vägtemp − daggpunkt", enh: "°" }, s: { namn: "Sikt", enh: " m" }, v: { namn: "Vind", enh: " m/s" },
  vb: { namn: "Byvind (max 30 min)", enh: " m/s" }, nb: { namn: "Nederbördstyp", enh: "" },
  jmf: { namn: "VViS − modell (Karta MBR0)", enh: "°" },
};
// VViS-parameter for faltet som visas i Karta MBR0 (bara de som gar att jamfora)
const VV_JMF = { t0: ["ty", "vägtemp mot modellens yttemp"], t2: ["tl", "lufttemp mot temp 2 m"], td: ["td", "daggpunkt mot daggpunkt 2 m"], spread: ["dy", "vägtemp − daggpunkt mot yttemp − daggpunkt"] };
const vvMin = t => { const d = new Date(t); return isNaN(d) ? null : (Date.now() - d) / 60e3; };
function vvHalka(s) {
  if (s.is || s.sn) return [3, "is/snö på vägen"];
  if (s.nb === "freezing_rain") return [3, "underkylt regn"];
  if (s.ty == null) return [-1, "saknar vägtemp"];
  const nb = s.nb && s.nb !== "no", dy = s.td != null ? s.ty - s.td : null, vm = s.vt ? vvMin(s.vt) : null;
  // 23/11 16:31 (Jakob): orange kraver vagtemp < +0,5
  if (s.ty < 0.5 && ((dy != null && dy <= 0) || nb || s.va))
    return [2, dy != null && dy <= 0 ? "vägtemp ≤ daggpunkt (rimfrost)" : "vägtemp < +0,5 och fukt/nederbörd"];
  if (s.ty < 0.5 && vm != null && vm <= 180) return [2, "kallt efter nederbörd (senast " + vvTid(s.vt).slice(0, 5) + ", " + Math.round(vm) + " min sedan)"];
  if (s.ty <= 1 && dy != null && dy <= 1) return [1, "nära frysning/rimfrost"];
  return [0, "ingen tydlig halkrisk"];
}
const VV_HFARG = { "-1": "#9ca3af", 0: "#16a34a", 1: "#facc15", 2: "#f97316", 3: "#dc2626" };
function vvTempFarg(t) {   // blatt under noll, rott over
  if (t == null) return "#9ca3af";
  const st = [[-15, "#312e81"], [-8, "#1d4ed8"], [-3, "#3b82f6"], [0, "#93c5fd"], [0.01, "#fde68a"], [3, "#fbbf24"], [8, "#f97316"], [15, "#dc2626"]];
  for (let i = st.length - 1; i >= 0; i--) if (t >= st[i][0]) return st[i][1];
  return st[0][1];
}
function vvDiffFarg(d) {   // obs - modell: blatt = verkligheten kallare, rott = varmare
  if (d == null) return "#9ca3af";
  const a = Math.abs(d);
  if (a < 1) return "#f3f4f6";
  if (d < 0) return a < 2 ? "#bfdbfe" : a < 4 ? "#60a5fa" : "#1d4ed8";
  return a < 2 ? "#fecaca" : a < 4 ? "#f87171" : "#b91c1c";
}
function vvVarde(s, p) { return p === "dy" ? (s.ty != null && s.td != null ? +(s.ty - s.td).toFixed(1) : null) : s[p]; }
// ---- jamforelse mot Karta MBR0 ----
function vvJmfLage() {   // -> {ok, p (VViS-falt), v (MBR0-falt), text} eller {ok:false, varfor}
  if (typeof lage === "undefined" || lage !== "m0" || typeof M0F === "undefined") return { ok: false, varfor: "Fungerar i fliken Karta MBR0." };
  const j = VV_JMF[M0F.v];
  if (!j) return { ok: false, varfor: "Välj Yttemperatur 0 m, Temperatur 2 m, Daggpunkt 2 m eller Yttemp minus daggpunkt i Karta MBR0." };
  if (!M0F.data || !M0F.o || M0F.t === null) return { ok: false, varfor: "Modellfältet är inte hämtat än." };
  const kt = M0F.t0 + M0F.t * 3600e3, nu = VV.lista.reduce((m, s) => s.t > m ? s.t : m, ""), dt = nu ? Math.abs(new Date(nu) - kt) / 3600e3 : 99;
  if (dt > 1) return { ok: false, varfor: "Kartans tid ligger " + Math.round(dt) + " h från mätningarna – stega till nu (±1 h)." };
  vvM25Hamta();
  return { ok: true, p: j[0], v: M0F.v, text: j[1] };
}
// 23/11 kvall: forst stationens EGEN 2,5 km-ruta (forhamtat per korning, R2 vvmod/senaste.json, +2..+6) om kartan visar
// samma korning och timme - annars MBR0-faltets 5 km-punkt (varannan ruta, inte medelvarde).
const VV_M25 = "https://modelltittaren.metvyer.workers.dev/r2/vvmod/senaste.json";
async function vvM25Hamta() {
  if (VV.m25T && Date.now() - VV.m25T < 10 * 60e3) return;
  VV.m25T = Date.now();
  try { const r = await fetch(VV_M25, { cache: "no-store" }); if (r.ok) { VV.m25 = await r.json(); if (VV.par === "jmf") vvRita(); } } catch (e) {}
}
function vvModellIKarta(s) {   // -> { v, upp } i visningsenhet, eller null
  const m = VV.m25, hi = m && m.dtg === M0F.dtg ? m.tider.indexOf(M0F.t) : -1, rad = hi >= 0 && m.st[s.id] && m.st[s.id][hi];
  if (rad) { const [t0, t2, td] = rad, v = M0F.v === "t0" ? t0 : M0F.v === "t2" ? t2 : M0F.v === "td" ? td : M0F.v === "spread" && t0 != null && td != null ? +(t0 - td).toFixed(1) : null;
    if (v != null) return { v, upp: "2,5 km" }; }
  const o = M0F.o, d = M0F.data, f = rutaF(s.lat, s.lon), y = Math.round((f.fy - o.y0) / o.s), x = Math.round((f.fx - o.x0) / o.s);
  if (y < 0 || y >= o.ny || x < 0 || x >= o.nx) return null;
  const w = d[y * o.nx + x]; return isFinite(w) ? { v: w, upp: "5 km" } : null;
}
function vvDiff(s, J) { const ob = vvVarde(s, J.p), mo = vvModellIKarta(s); return ob == null || !mo ? null : { ob, mo: mo.v, upp: mo.upp, d: +(ob - mo.v).toFixed(1) }; }
// ---- ritning ----
function vvFarg(s, J) {
  const p = VV.par, x = vvVarde(s, p);
  if (p === "jmf") { if (!J || !J.ok) return "#9ca3af"; const d = vvDiff(s, J); return vvDiffFarg(d && d.d); }
  if (p === "halka") return VV_HFARG[vvHalka(s)[0]];
  if (p === "ty" || p === "tl" || p === "td") return vvTempFarg(x);
  if (x == null && p !== "nb") return "#9ca3af";
  if (p === "dy") return x <= 0 ? "#dc2626" : x <= 1 ? "#f97316" : x <= 3 ? "#facc15" : "#16a34a";
  if (p === "s") return x < 200 ? "#7f1d1d" : x < 1000 ? "#dc2626" : x < 3000 ? "#f97316" : x < 5000 ? "#facc15" : "#16a34a";
  if (p === "v" || p === "vb") return x >= 21 ? "#7f1d1d" : x >= 14 ? "#dc2626" : x >= 10 ? "#f97316" : x >= 6 ? "#facc15" : "#16a34a";
  if (p === "nb") return { rain: "#16a34a", freezing_rain: "#dc2626", snow: "#3b82f6", sleet: "#a855f7", yes: "#6b7280" }[s.nb] || "#e5e7eb";
  return "#9ca3af";
}
function vvText(s, J) {   // kort siffra bredvid punkten (inzoomat)
  const p = VV.par;
  if (p === "jmf") { if (!J || !J.ok) return ""; const d = vvDiff(s, J); return d ? (d.d > 0 ? "+" : "") + d.d.toFixed(1) : ""; }
  const x = p === "halka" ? s.ty : vvVarde(s, p);
  if (p === "nb" || x == null) return "";
  return p === "s" ? (x >= 10000 ? "10k" : x >= 1000 ? (x / 1000).toFixed(1) + "k" : String(Math.round(x))) : String(Math.round(x));
}
async function vvHamta(tvinga) {
  if (!VV.pa) return;
  if (!tvinga && VV.lista.length && Date.now() - VV.t < 5 * 60e3) { vvRita(); return; }
  try { const r = await fetch(VVIS_URL); const js = r.ok ? await r.json() : null;
    if (Array.isArray(js)) { VV.lista = js; VV.t = Date.now(); } } catch (e) {}
  vvRita();
}
function vvRita() {
  const g = $("kVvis"); if (!g) return; g.textContent = ""; if (!VV.pa) return;
  // 23/11 16:31: storlek i SKARMPIXLAR (ruta 11 px, siffror 12 px) oavsett zoom; siffror nar man zoomat in lite
  const svg = $("karta"), bw = svg && svg.getBoundingClientRect().width || 800, vw = typeof vb !== "undefined" ? vb.w : 949;
  const enh = vw / bw, r = 5.5 * enh, fs = 12 * enh, J = VV.par === "jmf" ? vvJmfLage() : null, visaText = vw / 949 < 0.6 || (J && J.ok && vw / 949 < 0.85);
  // ritordning: lagst risk/minst skillnad forst sa de viktigaste hamnar overst
  const vikt = s => VV.par === "halka" ? vvHalka(s)[0] : J && J.ok ? Math.abs((vvDiff(s, J) || { d: 0 }).d) : 0;
  const ord = VV.lista.map((s, i) => [i, vikt(s)]).sort((a, b) => a[1] - b[1]);
  for (const [i] of ord) { const s = VV.lista[i], p = tillKarta(s.lat, s.lon);
    const c = el("g", { class: "vvis", "data-i": i, transform: "translate(" + p.x.toFixed(1) + "," + p.y.toFixed(1) + ")", style: "cursor:pointer" });
    c.appendChild(el("rect", { x: -r, y: -r, width: 2 * r, height: 2 * r, rx: r * 0.3, fill: vvFarg(s, J), stroke: "#111827", "stroke-width": r * 0.16 }));
    const tx = visaText ? vvText(s, J) : "";
    if (tx) c.appendChild(el("text", { x: r * 1.25, y: fs * 0.36, "font-size": fs, "font-weight": 600, fill: "#111827", stroke: "#fff", "stroke-width": fs * 0.22, "paint-order": "stroke" }, tx));
    g.appendChild(c); }
  const k = $("vvisKnapp"), tid = VV.lista.reduce((m, s) => s.t > m ? s.t : m, "");
  if (k) k.title = "Vägväder från Trafikverkets VViS-stationer: " + VV.lista.length + " stationer" + (tid ? ", senaste mätning " + vvTid(tid) : "") +
    ". Observationer – gäller nu, inte kartans prognostid. Hovra/tryck på en station för värden och diagram." +
    (VV.par === "jmf" ? "\nVViS − modell: " + (J.ok ? J.text + " (blått = verkligheten kallare än modellen, rött = varmare, vitt = inom ±1°)." : J.varfor) : "");
}
function vvTid(t) { const d = new Date(t); return isNaN(d) ? "" : p2(d.getUTCHours()) + p2(d.getUTCMinutes()) + "Z " + d.getUTCDate() + "/" + (d.getUTCMonth() + 1); }
function vvFran(mal) { const m = mal && mal.closest && mal.closest(".vvis"); return m ? VV.lista[+m.dataset.i] : null; }
// ---- historik + modell for en station (diagrammet) ----
async function vvHist(s) {
  const k = s.id + ":" + VV.h, c = VV.hist.get(k);
  if (c && Date.now() - c.t < 5 * 60e3) return c.d;
  const r = await fetch(VVIS_URL + "/historik?id=" + encodeURIComponent(s.id) + "&h=" + VV.h); const d = r.ok ? await r.json() : null;
  if (!d || !Array.isArray(d.obs)) throw new Error("ingen historik");
  VV.hist.set(k, { t: Date.now(), d }); return d;
}
const vvRuta = s => { const f = rutaF(s.lat, s.lon); return [Math.round(f.fy), Math.round(f.fx)]; };
async function vvModell(s) {   // MEPS yttemp (medlem 0) i stationens ruta: senaste och aldsta korningen i mepslatest
  const [iy, ix] = vvRuta(s);
  if (iy < 0 || iy >= KY || ix < 0 || ix >= KX) return null;
  const k = iy + ":" + ix, c = VV.mod.get(k);
  if (c && Date.now() - c.t < 15 * 60e3) return c.d;
  let sen = lasa("mt:senast");
  if (!sen) { const d = new Date(Date.now() - 4 * 3600e3); d.setUTCMinutes(0, 0, 0); d.setUTCHours(d.getUTCHours() - d.getUTCHours() % 3); sen = dtgText(d); }
  const bas = (typeof valjVag === "function" && (await valjVag()) === "mellan") ? MELLAN : BAS;
  const en = async (dtg, n) => {
    const r = await fetch(bas + FIL(dtg) + ".ascii?" + enc("air_temperature_0m[0:1:" + n + "][0][" + iy + "][" + ix + "]"));
    if (!r.ok) return null; const v = tolka(await r.text()).air_temperature_0m; if (!v || !v.length) return null;
    const t0 = dtgDatum(dtg).getTime(); return { dtg, p: Array.from(v, (x, i) => [t0 + i * 3600e3, isFinite(x) ? x - 273.15 : null]) };
  };
  const gam = d => dtgText(new Date(dtgDatum(sen).getTime() - d * 3600e3));
  const [ny, aldst] = await Promise.all([en(sen, 40).catch(() => null), (async () => {   // aldsta som finns kvar (mepslatest har ~8 korningar)
    for (const d of [21, 18, 15]) { const x = await en(gam(d), 36).catch(() => null); if (x) return x; } return null; })()]);
  const d = { ny, aldst }; VV.mod.set(k, { t: Date.now(), d }); return d;
}
function vvDiagram(h, m) {   // SVG-strang. h = historik, m = modell (kan vara null)
  const W = 500, H = 240, vL = 44, hR = 8, top = 8, nbH = 36, botT = H - 18, tempB = botT - nbH - 6;
  const nu = Date.now(), fram = VV.h === 6 ? 3 : VV.h === 24 ? 12 : 24, x0 = nu - VV.h * 3600e3, x1 = nu + fram * 3600e3;
  const X = t => vL + (t - x0) / (x1 - x0) * (W - vL - hR);
  const obs = h.obs.map(o => ({ ...o, ms: new Date(o.t).getTime() })).filter(o => o.ms >= x0);
  const mser = m ? [m.aldst, m.ny].map(r => r ? r.p.filter(p => p[0] >= x0 && p[0] <= x1 && p[1] != null) : []) : [[], []];
  const alla = [0]; obs.forEach(o => [o.ty, o.tl, o.td].forEach(v => v != null && alla.push(v))); mser.forEach(r => r.forEach(p => alla.push(p[1])));
  let lo = Math.floor(Math.min(...alla) - 0.5), hi = Math.ceil(Math.max(...alla) + 0.5); if (hi - lo < 4) { const c = (hi + lo) / 2; lo = Math.floor(c - 2); hi = Math.ceil(c + 2); }
  const Y = v => top + (hi - v) / (hi - lo) * (tempB - top);
  const linje = (pts, attr) => { let d = "", ny = true; for (const [t, v] of pts) { if (v == null) { ny = true; continue; } d += (ny ? "M" : "L") + X(t).toFixed(1) + " " + Y(v).toFixed(1); ny = false; }
    return d ? '<path d="' + d + '" fill="none" ' + attr + '/>' : ""; };
  let s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" style="display:block;max-width:100%;height:auto;margin-top:6px;background:#fff;border:1px solid #e5e7eb;border-radius:4px;font:10px system-ui,sans-serif">';
  // y-axel: hela grader, max ca 6 etiketter, 0 blå
  const steg = Math.max(1, Math.ceil((hi - lo) / 6));
  for (let v = Math.ceil(lo / steg) * steg; v <= hi; v += steg) s += '<line x1="' + vL + '" x2="' + (W - hR) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="' + (v === 0 ? "#2563eb" : "#eef0f3") + '" stroke-width="' + (v === 0 ? 1.2 : 1) + '"/><text x="' + (vL - 3) + '" y="' + (Y(v) + 3) + '" text-anchor="end" fill="' + (v < 0 ? "#2563eb" : v > 0 ? "#dc2626" : "#111") + '">' + v + '°</text>';
  // tidsaxel (UTC) + nu-linje
  const ts = VV.h === 6 ? 1 : VV.h === 24 ? 3 : 12, start = Math.ceil(x0 / (ts * 3600e3)) * ts * 3600e3;
  for (let t = start; t <= x1; t += ts * 3600e3) { const d = new Date(t), x = X(t);
    s += '<line x1="' + x + '" x2="' + x + '" y1="' + top + '" y2="' + botT + '" stroke="#f3f4f6"/><text x="' + x + '" y="' + (H - 5) + '" text-anchor="middle" fill="#6b7280">' + (d.getUTCHours() === 0 && VV.h > 6 ? d.getUTCDate() + "/" + (d.getUTCMonth() + 1) : p2(d.getUTCHours()) + "Z") + '</text>'; }
  s += '<line x1="' + X(nu) + '" x2="' + X(nu) + '" y1="' + top + '" y2="' + botT + '" stroke="#111" stroke-width="1" stroke-dasharray="2 2"/><text x="' + (X(nu) + 2) + '" y="' + (top + 8) + '" fill="#111">nu</text>';
  // nederbord: staplar (regn gront, sno blatt ovanpa), underkylt = rod markering ovanfor. Skala: hogsta stapeln, minst 0,3 mm
  const per = obs.length && obs[0].p || 5, nbTop = tempB + 6, nbMax = Math.max(0.3, ...obs.map(o => (o.r || 0) + (o.s || 0)));
  const bw = Math.max(1, X(x0 + per * 60e3) - X(x0) - 0.3);
  // 23/11 kvall: tydlig skala - stapelns hojd = mangd under en matperiod (5 min), toppen = hogsta vardet i perioden
  const nbEtik = v => v.toFixed(v < 0.1 ? 2 : 1).replace(".", ",");
  s += '<line x1="' + vL + '" x2="' + (W - hR) + '" y1="' + botT + '" y2="' + botT + '" stroke="#d1d5db"/>' +
    '<line x1="' + vL + '" x2="' + (W - hR) + '" y1="' + (botT - nbH) + '" y2="' + (botT - nbH) + '" stroke="#eef0f3" stroke-dasharray="2 2"/>' +
    '<line x1="' + (vL - 2) + '" x2="' + (vL - 2) + '" y1="' + (botT - nbH) + '" y2="' + botT + '" stroke="#9ca3af"/>' +
    '<text x="' + (vL - 4) + '" y="' + (botT - nbH + 4) + '" text-anchor="end" fill="#6b7280">' + nbEtik(nbMax) + '</text>' +
    '<text x="' + (vL - 4) + '" y="' + (botT - 1) + '" text-anchor="end" fill="#6b7280">0</text>' +
    '<text x="2" y="' + (botT - nbH / 2 + 3) + '" fill="#6b7280" font-size="9">mm/' + per + '</text>';
  for (const o of obs) { const x = X(o.ms) - bw, hr = (o.r || 0) / nbMax * nbH, hs = (o.s || 0) / nbMax * nbH;
    if (hr > 0) s += '<rect x="' + x.toFixed(1) + '" y="' + (botT - hr).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hr.toFixed(1) + '" fill="#16a34a"/>';
    if (hs > 0) s += '<rect x="' + x.toFixed(1) + '" y="' + (botT - hr - hs).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hs.toFixed(1) + '" fill="#3b82f6"/>';
    if (o.nb === "freezing_rain") s += '<rect x="' + x.toFixed(1) + '" y="' + (nbTop - 4) + '" width="' + Math.max(2, bw).toFixed(1) + '" height="3" fill="#dc2626"/>';
    else if (o.nb && o.nb !== "no" && !hr && !hs) s += '<rect x="' + x.toFixed(1) + '" y="' + (botT - 1.5) + '" width="' + bw.toFixed(1) + '" height="1.5" fill="#9ca3af"/>'; }
  const sumR = obs.reduce((a, o) => a + (o.r || 0), 0), sumS = obs.reduce((a, o) => a + (o.s || 0), 0);
  s += '<text x="' + (W - hR) + '" y="' + (nbTop + 8) + '" text-anchor="end" fill="#374151">summa ' + VV.h + ' h: ' + (sumR + sumS).toFixed(1).replace(".", ",") + ' mm' +
    (sumS > 0.05 && sumR > 0.05 ? ' (regn ' + sumR.toFixed(1).replace(".", ",") + ', snö ' + sumS.toFixed(1).replace(".", ",") + ')' : sumS > 0.05 ? ' (snö)' : sumR > 0.05 ? ' (regn)' : '') + '</text>';
  // modell: aldsta korningen svag, senaste tydlig (streckad)
  s += linje(mser[0], 'stroke="#f97316" stroke-opacity="0.45" stroke-width="1.5" stroke-dasharray="1 2"');
  s += linje(mser[1], 'stroke="#ea580c" stroke-width="1.8" stroke-dasharray="5 3"');
  // obs: lufttemp tunn gra, daggpunkt gron streckad, vagtemp tjock svart
  s += linje(obs.map(o => [o.ms, o.tl]), 'stroke="#9ca3af" stroke-width="1"');
  s += linje(obs.map(o => [o.ms, o.td]), 'stroke="#15803d" stroke-width="1.2" stroke-dasharray="3 2"');
  s += linje(obs.map(o => [o.ms, o.ty]), 'stroke="#111827" stroke-width="2"');
  const kt = r => r.dtg.slice(6, 8) + "/" + r.dtg.slice(9, 11) + "Z";
  return s + '</svg>' +
    '<div style="font-size:11px;color:#374151;margin-top:3px;line-height:1.35"><b style="color:#111827">━</b> vägtemp · <span style="color:#15803d">╌</span> daggpunkt · <span style="color:#9ca3af">━</span> lufttemp · ' +
    '<span style="color:#16a34a">■</span> regn <span style="color:#3b82f6">■</span> snö <span style="color:#dc2626">▬</span> underkylt (staplar = mm per ' + per + ' min, skalan till vänster, vatteninnehåll)' +
    (m && (m.ny || m.aldst) ? '<br><span style="color:#ea580c">╌</span> MEPS yttemp, körning ' + (m.ny ? kt(m.ny) : "–") +
      (m.aldst ? ' · <span style="color:#f97316;opacity:.6">┄</span> äldre körning ' + kt(m.aldst) + ' (vad modellen trodde för ~1 dygn sedan)' : "") : '<br>(modellens yttemp kunde inte hämtas)') +
    (VV.h === 72 && m ? '<br>Modellen finns bara ca 1 dygn bakåt (met.no sparar 8 körningar).' : '') + '</div>';
}
function vvTipsText(s, diag) {
  const f = (x, e, d) => x == null ? "–" : (+x).toFixed(d == null ? 1 : d) + e, h = vvHalka(s);
  const alder = s.t ? vvMin(s.t) : null;
  const rad = [
    '<b>' + vvEsc(s.n) + '</b> <span style="color:#6b7280">' + vvTid(s.t) + (alder != null && alder > 60 ? ' (' + Math.round(alder / 60) + ' h gammal)' : '') + '</span>',
    'Halkrisk: <b style="color:' + VV_HFARG[h[0]] + '">■</b> ' + h[1],
    'Vägtemp ' + f(s.ty, "°") + ' · luft ' + f(s.tl, "°") + ' · daggpunkt ' + f(s.td, "°") + (s.rh != null ? ' · RH ' + f(s.rh, " %", 0) : ''),
    'Vind ' + f(s.v, " m/s") + (s.vr != null ? ' från ' + Math.round(s.vr) + '°' : '') + (s.vb != null ? ' · byar ' + f(s.vb, " m/s") : ''),
    'Nederbörd: ' + (VV_NB[s.nb] || (s.nb ? vvEsc(s.nb) : "ingen typgivare")) + (s.mm != null ? ' (' + f(s.mm, " mm") + ' senaste 30 min)' : '') +
      (s.vt ? ' · senast ' + vvTid(s.vt).slice(0, 5) : ''),
  ];
  if (s.s != null) rad.push('Sikt ' + (s.s >= 1000 ? f(s.s / 1000, " km") : f(s.s, " m", 0)));
  const yta = [s.is && "is", s.sn && "snö", s.va && "vatten"].filter(Boolean);
  if (yta.length || s.g != null) rad.push('Vägbana: ' + (yta.length ? yta.join(", ") : "–") + (s.g != null ? ' · friktion ' + f(s.g, "", 2) : ''));
  if (VV.par === "jmf") { const J = vvJmfLage(), d = J.ok && vvDiff(s, J);
    rad.push(J.ok ? (d ? 'VViS − modell: <b>' + (d.d > 0 ? "+" : "") + d.d.toFixed(1) + '°</b> (obs ' + d.ob.toFixed(1) + '°, modell ' + d.mo.toFixed(1) + '° i ' + d.upp + '-ruta – ' + J.text + ')' : 'VViS − modell: saknar värde') : '<span style="color:#6b7280">' + J.varfor + '</span>'); }
  rad.push(diag || '<span style="color:#6b7280">Diagram: håll musen still …</span>');
  rad.push('<span style="color:#6b7280;font-size:11px;display:inline-block;max-width:500px;line-height:1.3">Trafikverket VViS (observation). Vägtemp = en punkt i vägbanan; modellens yttemp = hudtemperaturen för en hel 2,5 km-ruta (skog, åker, snö) – jämför trender och fel, inte exakta grader. ' +
    'Nederbördstypen kommer från en optisk givare: runt 0 °C kan blötsnö och regn blandas ihop, och underkylt regn missas ibland. Alla stationer har inte typgivare. Halkrisken är Modelltittarens enkla tolkning.</span>');
  return rad.join("\n");
}
// anropas fran kartTips och kartKlick i index.html
function vvVisa(s, x, y) {
  VV.tipsXY = [x, y]; const c = VV.hist.get(s.id + ":" + VV.h), cm = VV.mod.get(vvRuta(s).join(":"));
  const klar = c && Date.now() - c.t < 5 * 60e3 && cm;
  $("kTips").style.maxWidth = "520px";
  visaKTips(vvTipsText(s, klar ? vvDiagram(c.d, cm.d) : null), x, y, true);
  if (klar || VV.tipsId === s.id) return;
  VV.tipsId = s.id; clearTimeout(VV.tipsTim);
  VV.tipsTim = setTimeout(async () => {   // musen stannade 0,3 s -> hamta historik och modell
    if (VV.tipsId !== s.id) return;
    let html;
    try { const [h, m] = await Promise.all([vvHist(s), vvModell(s).catch(() => null)]); html = vvDiagram(h, m); }
    catch (e) { html = '<span style="color:#b91c1c">Kunde inte hämta historiken (' + vvEsc(e.message || e) + ').</span>'; }
    if (VV.tipsId === s.id && !$("kTips").hidden) visaKTips(vvTipsText(s, html), VV.tipsXY[0], VV.tipsXY[1], true);
  }, 300);
}
function vvisTips(e) {
  const s = vvFran(e.target); if (!s) { VV.tipsId = null; return false; }
  vvVisa(s, e.clientX + 14, e.clientY + 14); return true;
}
function vvisKlick(e, mal) {   // tryck (mobil) = visa rutan
  const s = vvFran(mal); if (!s) return false;
  vvVisa(s, (e.clientX || 20) + 14, (e.clientY || 20) + 14); return true;
}
(function vvInit() {
  const b = $("vvisKnapp"), sel = $("vvisPar"), hs = $("vvisH"); if (!b || !sel) return;
  for (const [k, p] of Object.entries(VV_PAR)) sel.appendChild(Object.assign(document.createElement("option"), { value: k, textContent: p.namn }));
  if (!VV_PAR[VV.par]) VV.par = "halka";
  sel.value = VV.par; sel.hidden = !VV.pa; if (hs) { hs.value = String(VV.h); hs.hidden = !VV.pa; }
  b.setAttribute("aria-pressed", String(VV.pa));
  b.addEventListener("click", () => { VV.pa = !VV.pa; lagra("mt:vvis", VV.pa ? "ja" : ""); b.setAttribute("aria-pressed", String(VV.pa)); sel.hidden = !VV.pa; if (hs) hs.hidden = !VV.pa;
    if (VV.pa) vvHamta(); else vvRita(); });
  sel.addEventListener("change", () => { VV.par = sel.value; lagra("mt:vvisPar", VV.par); vvRita(); });
  if (hs) hs.addEventListener("change", () => { VV.h = +hs.value; lagra("mt:vvisH", String(VV.h)); VV.tipsId = null; });
  setInterval(() => { if (VV.pa && !document.hidden) vvHamta(true); }, 5 * 60e3);
  const svg = $("karta");   // zoom: storlek och siffror foljer med
  if (window.MutationObserver && svg) new MutationObserver(() => { clearTimeout(VV.tim); VV.tim = setTimeout(vvRita, 300); }).observe(svg, { attributes: true, attributeFilter: ["viewBox"] });
  // flikbyte: jamforelsen mot MBR0 galler bara i den fliken
  document.querySelectorAll('[role="tab"]').forEach(t => t.addEventListener("click", () => setTimeout(() => { if (VV.pa) vvRita(); }, 60)));
  if (VV.pa) setTimeout(vvHamta, 1200);
})();
