// qff.js - NYTT 23/11 kvall: ISOBARER (marktryck QFF, MEPS medlem 0) ovanpa kartan i alla flikar, knappen "〰 Isobarer".
// Data: forhamtat i GitHub Actions till R2 (forhamta.py qff): HELA MEPS-omradet i 10 km, +0..+66, de 4 senaste korningarna,
// via mellanservern /r2/qff/... Utanfor det (eller om R2 inte svarar) hamtas timmen direkt ur senaste korningen (~250 kB).
// Tid: Karta MBR0 = kartans tid, Sannolikhet/Favoriter = vald timme (ingenting vid en period), ovriga flikar = narmaste hela timme nu.
// Faltet jamnas ut latt (3x3 tva ganger) - 2,5 km-trycket ar brusigt over fjallen. Linjer var 2, 5 eller 10 hPa (5 forvalt),
// centra = lokala hogsta/lagsta varden inom ca 300 km (inte vid kanten): bara trycket, blatt = hog, rott = lag.
const QFF_R2 = "https://modelltittaren.metvyer.workers.dev/r2/qff/";
let QF = { pa: lasa("mt:qff") === "ja", steg: [2, 5, 10].includes(+lasa("mt:qffSteg")) ? +lasa("mt:qffSteg") : 5, idx: null, idxT: 0, falt: new Map(), tim: 0, nyckel: "", info: "" };
function qffTid() {   // giltig tid (ms) for fliken som visas, eller null
  if (typeof lage === "undefined" || lage === "exp") return null;
  if (lage === "m0") return typeof M0F !== "undefined" && M0F.t0 && M0F.t !== null ? M0F.t0 + M0F.t * 3600e3 : null;
  if (lage === "p") { if (typeof P === "undefined" || !P.dtg) return null; const a = +$("pFran").value, b = +$("pTill").value;
    // 23/11 kvall (Jakob): vald PERIOD (mer an en timme) -> inga isobarer, annars ser det ut som en enda tidpunkt
    if (a !== b) { QF.info = "Isobarer visas bara när en enda timme är vald (nu är en period vald)."; return null; }
    return isFinite(a) ? dtgDatum(P.dtg).getTime() + a * 3600e3 : null; }
  // 25/11 (Jakob): satellit/radar - narmaste hela timme till bilden som visas (aven met.no:s prognosbilder)
  if ((lage === "sat" || lage === "rad") && typeof OBS !== "undefined" && OBS.ramar && OBS.ramar[OBS.i] && OBS.ramar[OBS.i].t) return Math.round(OBS.ramar[OBS.i].t / 3600e3) * 3600e3;
  return Math.round(Date.now() / 3600e3) * 3600e3;
}
async function qffIndex() {
  if (QF.idx && Date.now() - QF.idxT < 5 * 60e3) return QF.idx;
  try { const r = await fetch(QFF_R2 + "index.json", { cache: "no-store" }); if (r.ok) { QF.idx = await r.json(); QF.idxT = Date.now(); } } catch (e) {}
  return QF.idx;
}
async function qffFalt(T) {   // -> { f: Float32Array (hPa, rad 0 = sodra), o, dtg, t } eller null
  const idx = await qffIndex();
  if (idx && idx.klar) {
    const kor = (idx.korningar && idx.korningar.length ? idx.korningar : [idx.dtg]).slice().sort().reverse();
    for (const dtg of kor) { const t = Math.round((T - dtgDatum(dtg).getTime()) / 3600e3); if (t < 0 || !idx.tider.includes(t)) continue;
      const k = dtg + ":" + t; if (QF.falt.has(k)) return QF.falt.get(k);
      try { const r = await fetch(QFF_R2 + dtg + "/p_" + t + ".bin.gz"); if (!r.ok) continue;
        const gz = await r.arrayBuffer(), ds = new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip"));
        const u = new Uint16Array(await new Response(ds).arrayBuffer()), f = new Float32Array(u.length);
        for (let i = 0; i < u.length; i++) f[i] = u[i] === 65535 ? NaN : u[i] * (idx.steg || 0.1);
        const ut = { f, o: { y0: idx.y0, x0: idx.x0, s: idx.s, ny: idx.ny, nx: idx.nx }, dtg, t, kalla: "R2" }; qffSpara(k, ut); return ut;
      } catch (e) {} }
  }
  // reserv: hamta timmen direkt ur senaste korningen (hela omradet, 10 km)
  const sen = lasa("mt:senast"); if (!sen) return null;
  const t = Math.round((T - dtgDatum(sen).getTime()) / 3600e3); if (t < 0 || t > 66) return null;
  const k = sen + ":" + t; if (QF.falt.has(k)) return QF.falt.get(k);
  const o = { y0: 0, x0: 0, s: 4, ny: 268, nx: 238 }, n = o.ny * o.nx;
  try { const bas = (typeof valjVag === "function" && (await valjVag()) === "mellan") ? MELLAN : BAS;
    const fr = enc("air_pressure_at_sea_level[" + t + ":1:" + t + "][0][0:4:1068][0:4:948]");
    const r = await fetch(bas + FIL(sen) + ".dods?" + fr); if (!r.ok) return null;
    const raa = typeof lasDods === "function" ? lasDods(await r.arrayBuffer(), n) : null; if (!raa) return null;
    const f = new Float32Array(n); for (let i = 0; i < n; i++) f[i] = isFinite(raa[i]) && Math.abs(raa[i]) < 1e30 ? raa[i] / 100 : NaN;
    const ut = { f, o, dtg: sen, t, kalla: "direkt" }; qffSpara(k, ut); return ut;
  } catch (e) { return null; }
}
function qffSpara(k, v) { QF.falt.set(k, v); if (QF.falt.size > 40) QF.falt.delete(QF.falt.keys().next().value); }
function qffJamna(f, o) {   // 3x3-medel tva ganger (NaN hoppas over)
  let a = f;
  for (let varv = 0; varv < 2; varv++) { const b = new Float32Array(a.length);
    for (let y = 0; y < o.ny; y++) for (let x = 0; x < o.nx; x++) { let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= o.ny) continue;
        for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= o.nx) continue; const w = a[yy * o.nx + xx]; if (isFinite(w)) { s += w; n++; } } }
      b[y * o.nx + x] = n ? s / n : NaN; }
    a = b; }
  return a;
}
function qffCentra(f, o) {   // lokala extremvarden inom R rutor (ca 300 km), inte narmare kanten an 6 rutor
  const R = Math.round(300 / (2.5 * o.s)), K = 6, ut = [];
  for (let y = K; y < o.ny - K; y++) for (let x = K; x < o.nx - K; x++) {
    const v = f[y * o.nx + x]; if (!isFinite(v)) continue;
    let max = true, min = true;
    for (let dy = -1; dy <= 1 && (max || min); dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const w = f[(y + dy) * o.nx + x + dx]; if (w >= v) max = false; if (w <= v) min = false; }
    if (!max && !min) continue;
    let ok = true, kontrast = 0;
    for (let dy = -R; dy <= R && ok; dy++) { const yy = y + dy; if (yy < 0 || yy >= o.ny) continue;
      for (let dx = -R; dx <= R; dx++) { const xx = x + dx; if (xx < 0 || xx >= o.nx || dx * dx + dy * dy > R * R) continue; const w = f[yy * o.nx + xx]; if (!isFinite(w)) continue;
        if (max && w > v || min && w < v) { ok = false; break; } kontrast = Math.max(kontrast, Math.abs(w - v)); } }
    if (ok && kontrast >= 2) ut.push({ x, y, v, typ: max ? "H" : "L" });   // minst 2 hPa skillnad mot omgivningen
  }
  return ut;
}
async function qffRita() {
  const g = $("kQff"); if (!g) return;
  const T = QF.pa ? qffTid() : null;
  if (!QF.pa || T === null) { g.textContent = ""; QF.nyckel = ""; if (!QF.pa || lage !== "p") QF.info = ""; qffKnapp(); return; }
  const d = await qffFalt(T);
  if (!QF.pa || qffTid() !== T) return;   // tiden/fliken bytt medan vi hamtade
  // 25/11: samma timme som redan ritad (t.ex. nar radarloopen stegar inom timmen) -> rita inte om
  const nyck = d ? d.dtg + ":" + d.t + ":" + QF.steg + ":" + lage : ""; if (d && QF.nyckel === nyck && g.childNodes.length) return; QF.nyckel = nyck;
  g.textContent = "";
  if (!d) { QF.info = "Isobarer: inget marktryck för " + new Date(T).toISOString().slice(11, 13) + "Z (utanför körningarna)."; qffKnapp(); return; }
  if (!d.j) { d.j = qffJamna(d.f, d.o); d.c = qffCentra(d.j, d.o); }
  const f = d.j, o = d.o;
  let mn = Infinity, mx = -Infinity; for (const w of f) if (isFinite(w)) { if (w < mn) mn = w; if (w > mx) mx = w; }
  const niv = []; for (let v = Math.ceil(mn / QF.steg) * QF.steg; v <= mx; v += QF.steg) niv.push(v);
  const tS = niv.some(v => v % 20 === 0) ? 20 : 10;   // tjock var 20:e hPa (1000, 1020 ...), var 10:e om ingen sadan finns i faltet
  for (const v of niv) {
    const dd = isoSegment(f, o, v); if (!dd) continue;
    const tjock = v % tS === 0;
    g.appendChild(el("path", { d: dd, fill: "none", stroke: "#ffffff", "stroke-width": tjock ? 4.4 : 3.4, "vector-effect": "non-scaling-stroke", "stroke-linecap": "round", opacity: 0.75 }));
    g.appendChild(el("path", { d: dd, fill: "none", stroke: "#111827", "stroke-width": tjock ? 2.2 : 1.4, "vector-effect": "non-scaling-stroke", "stroke-linecap": "round" }));
    if (tjock) qffEtiketter(g, dd, String(v));   // 23/11 kvall (Jakob): varden bara pa tjocka linjer, halften sa tatt
  }
  // 23/11 21:28 (Jakob): H/L tillbaka, tryckvardet mindre under bokstaven. Blatt = hogtryck, rott = lagtryck.
  const fs = (typeof vb !== "undefined" ? vb.w : 949) / 30;
  for (const c of d.c) { const X = o.x0 + c.x * o.s, Y = KY - 1 - (o.y0 + c.y * o.s), fa = c.typ === "H" ? "#1d4ed8" : "#b91c1c";
    g.appendChild(el("text", { x: X, y: Y, class: "qffHL", "font-size": fs, "font-weight": 800, "text-anchor": "middle", "dominant-baseline": "central", fill: fa, stroke: "#fff", "stroke-width": fs / 7, "paint-order": "stroke" }, c.typ));
    g.appendChild(el("text", { x: X, y: Y + fs * 0.78, class: "qffHLv", "font-size": fs * 0.4, "font-weight": 700, "text-anchor": "middle", "dominant-baseline": "central", fill: fa, stroke: "#fff", "stroke-width": fs / 14, "paint-order": "stroke" }, String(Math.round(c.v)))); }
  const tid = new Date(T);
  QF.info = "Isobarer QFF var " + QF.steg + " hPa, " + p2(tid.getUTCHours()) + "Z " + tid.getUTCDate() + "/" + (tid.getUTCMonth() + 1) + " (körning " + d.dtg.slice(6, 8) + "/" + d.dtg.slice(9, 11) + "Z +" + d.t + ", MEPS medlem 0, 10 km" + (d.kalla === "direkt" ? ", hämtad direkt" : "") + ")." +
    (lage === "m0" ? "" : lage === "p" ? " Vald timme." : lage === "sat" || lage === "rad" ? " Närmaste hela timme till bilden." : " Närmaste hela timme nu.");
  qffKnapp();
}
// varden pa linjen: som isoEtiketter i sannolikhet.js men dubbelt sa glest
function qffEtiketter(g, d, text) {
  const seg = [...d.matchAll(/M([-\d.]+) ([-\d.]+)L([-\d.]+) ([-\d.]+)/g)].map(m => [(+m[1] + +m[3]) / 2, (+m[2] + +m[4]) / 2]);
  const vw = typeof vb !== "undefined" ? vb.w : 949, avst = vw / 1.75, fs = vw / 124, satta = [];   // 23/11 21:30: halva storleken
  for (let i = 0; i < seg.length && satta.length < 20; i += 3) { const [x, y] = seg[i];
    if (satta.some(([a, b]) => Math.hypot(a - x, b - y) < avst)) continue; satta.push([x, y]);
    g.appendChild(el("text", { x, y, class: "qffEtikett", "font-size": fs, "font-weight": 700, "text-anchor": "middle", "dominant-baseline": "central",
      fill: "#111827", stroke: "#ffffff", "stroke-width": fs / 4, "paint-order": "stroke" }, text)); }
}
function qffKnapp() { const b = $("qffKnapp"); if (b) b.title = (QF.pa && QF.info ? QF.info + "\n" : "") + "Isobarer (marktryck QFF, MEPS medlem 0) ovanpå kartan. H (blå) = högtryck, L (röd) = lågtryck, med tryckvärde. Värden på de tjocka linjerna (var 20:e hPa). Förhämtat för hela MEPS-området, +0 till +66 h. Visas inte när en period (flera timmar) är vald."; }
function qffSnart() { clearTimeout(QF.tim); QF.tim = setTimeout(qffRita, 250); }
(function qffInit() {
  const b = $("qffKnapp"), st = $("qffSteg"); if (!b) return;
  b.setAttribute("aria-pressed", String(QF.pa)); if (st) { st.value = String(QF.steg); st.hidden = !QF.pa; }
  b.addEventListener("click", () => { QF.pa = !QF.pa; lagra("mt:qff", QF.pa ? "ja" : ""); b.setAttribute("aria-pressed", String(QF.pa)); if (st) st.hidden = !QF.pa; qffRita(); });
  if (st) st.addEventListener("change", () => { QF.steg = +st.value; lagra("mt:qffSteg", String(QF.steg)); qffRita(); });
  // tiden byts: tidsrutorna i kartan (Sannolikhet/MBR0) skrivs om, flikbyte (body-klass), zoom (H/L-storlek)
  const mo = new MutationObserver(() => { if (QF.pa) qffSnart(); });
  // 25/11: obsTid = satellit/radarbildens tid
  for (const id of ["kartTid", "kartTidM0", "obsTid"]) { const e = $(id); if (e) mo.observe(e, { childList: true, subtree: true, characterData: true }); }
  mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  const svg = $("karta"); if (svg) new MutationObserver(() => { if (!QF.pa) return; const fs = vb.w / 30;
    document.querySelectorAll(".qffHL").forEach(t => { t.setAttribute("font-size", fs); t.setAttribute("stroke-width", fs / 7); });
    document.querySelectorAll(".qffEtikett").forEach(t => { t.setAttribute("font-size", vb.w / 124); t.setAttribute("stroke-width", vb.w / 496); });
    document.querySelectorAll(".qffHLv").forEach(t => { const h = t.previousSibling; if (h) t.setAttribute("y", +h.getAttribute("y") + fs * 0.78); t.setAttribute("font-size", fs * 0.4); t.setAttribute("stroke-width", fs / 14); }); }).observe(svg, { attributes: true, attributeFilter: ["viewBox"] });
  setInterval(() => { if (QF.pa && !document.hidden && lage !== "m0" && lage !== "p") qffRita(); }, 10 * 60e3);   // "nu"-flikarna: ny timme
  if (QF.pa) setTimeout(qffRita, 1500);
})();
