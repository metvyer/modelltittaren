// ===================================================================
//  EXPERIMENT (NYTT 22/11) - fliken "Experiment": udda saker att undersöka
// ===================================================================
// Forsta experimentet: GRAUPEL I KOLUMNEN (MEPS medlem 0, det-korningen, 2,5 km).
//  - Klicka pa stora kartan = mitten av en ruta (75/150/250 km). For vald timme hamtas graupel
//    (mass_fraction_of_graupel_in_air_ml) pa ALLA 65 modellnivaer + marktrycket i rutan (ca 1 MB per timme).
//  - Tva kartor bredvid varandra under kartan:
//      INTEGRERAD MANGD (kg/m2) = summan over nivaerna av graupel x lagrets massa (dp/g) - som radarns VIL, fast graupel
//      MAX I KOLUMNEN (g/kg) - hogsta halten oavsett hojd (som radarns max-CAPPI); hojden for max visas i tipsrutan
//  - Klick i en av de sma kartorna: kolumnens profil (graupel, sno, is, molnvatten + temperatur) hamtas for punkten
//    och ritas bredvid, med 0-, -10- och -25-gradersnivaerna markerade (23/11: -25 + laddningszonen).
// Trycket pa nivaerna: p = ap + b * marktryck (hybridkoordinaten). Hojd som flygniva enligt standardatmosfaren.
// Allt hamtas av webblasaren som ovrig MEPS-data (via mellanservern enligt valet langst ner).
const EXP_STORLEK = [[75, "75 km"], [150, "150 km"], [250, "250 km"]];
const EXP_NIV = 65, EXP_G = 9.80665;
const EXP_VIG_K = [0.01, 0.03, 0.1, 0.3, 0.6, 1, 2, 4];            // kg/m2
const EXP_MAX_K = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 4];           // g/kg
const EXP_FARG = ["#e0f2fe", "#bae6fd", "#7dd3fc", "#a78bfa", "#8b5cf6", "#7c3aed", "#db2777", "#9f1239"];
const EXP_TFARG = ["#1e3a8a", "#2563eb", "#60a5fa", "#a5f3fc", "#fde68a", "#fb923c", "#dc2626", "#7f1d1d"];
// 22/11: kartor att valja i de tva rutorna. Laddningszonen = dar graupel, is och underkylt vatten kan ladda upp
// (icke-induktiv laddning, -10 till -25 grader). GFX = McCauls blixtproxy: uppvind x graupel vid -15 grader.
const EXP_FALT = {
  vig:  { namn: "Integrerad graupel i kolumnen", enh: "kg/m² (= mm vatten)", K: EXP_VIG_K },
  max:  { namn: "Max graupel i kolumnen", enh: "g/kg", K: EXP_MAX_K },
  ladd: { namn: "Graupel i laddningszonen (−10 till −25 °C)", enh: "kg/m²", K: [0.003, 0.01, 0.03, 0.1, 0.3, 0.6, 1, 2] },
  samf: { namn: "Laddningsskikt: graupel + is + underkylt vatten (−10 till −25 °C)", enh: "kg/m² graupel", K: [0.003, 0.01, 0.03, 0.1, 0.3, 0.6, 1, 2] },
  tmax: { namn: "Temperatur vid graupelmaxet", enh: "°C (där max ≥ 0,01 g/kg)", K: [-60, -30, -25, -20, -15, -10, -5, 0], F: EXP_TFARG, alla: true },
  gfx:  { namn: "Uppvind × graupel vid −15 °C (McCaul)", enh: "m/s · g/kg", K: [0.01, 0.03, 0.1, 0.3, 0.6, 1, 2, 4] },
  wmax: { namn: "Max uppvind i kolumnen", enh: "m/s", K: [0.3, 0.6, 1, 2, 3, 5, 8, 12] }
};
let EXP = (() => { let o = {}; try { o = JSON.parse(lasa("mt:exp") || "{}"); } catch (e) {}
  return { lat: o.lat || 59.9, lon: o.lon || 17.6, km: o.km || 150, v1: o.v1 || "vig", v2: o.v2 || "max", t: null, ab: null, data: null, o: null, hamtar: 0, cache: new Map(), punkt: null }; })();
const expSpara = () => lagra("mt:exp", JSON.stringify({ lat: EXP.lat, lon: EXP.lon, km: EXP.km, v1: EXP.v1, v2: EXP.v2 }));
const expStatus = t => { const e = $("expStatus"); if (e) e.textContent = t || ""; };
const expFL = p => Math.max(0, Math.round((1 - Math.pow(p / 101325, 0.190284)) * 145366.45 / 100));   // Pa -> flygniva (standardatmosfar)

// rutan i rutnatet (index), mitten = EXP.lat/lon
function expOmrade() {
  const r = ruta(EXP.lat, EXP.lon); if (!r) return null;
  const h = Math.round(EXP.km / 2 / 2.5);
  const y0 = Math.max(0, r.iy - h), y1 = Math.min(LCC.ny - 1, r.iy + h), x0 = Math.max(0, r.ix - h), x1 = Math.min(LCC.nx - 1, r.ix + h);
  return { y0, y1, x0, x1, ny: y1 - y0 + 1, nx: x1 - x0 + 1, s: 1 };
}
// hybridkoefficienterna (en gang per korning)
async function expAB() {
  if (EXP.ab && EXP.ab.dtg === M0F.dtg) return EXP.ab;
  const r = await hamta(BAS + FIL(M0F.dtg) + ".ascii?" + enc("ap,b")); if (r.st !== 200) throw new Error("ap/b svar " + r.st);
  const d = tolka(r.txt); if (!d.ap || !d.b) throw new Error("ap/b saknas");
  EXP.ab = { dtg: M0F.dtg, ap: d.ap, b: d.b }; return EXP.ab;
}
async function expVar(vn, rum, n) {
  const fraga = enc(vn + rum);
  let res = await hamta(BAS + FIL(M0F.dtg) + ".dods?" + fraga, true, true), raa = null;
  if (res.st === 200 && res.buf && typeof lasDods === "function") raa = lasDods(res.buf, n);
  if (!raa) { res = await hamta(BAS + FIL(M0F.dtg) + ".ascii?" + fraga); if (res.st !== 200) throw new Error("svar " + res.st); raa = tolka(res.txt)[vn]; }
  if (!raa || raa.length < n) throw new Error("oväntat svar"); return raa;
}
// tryck pa nivaerna och lagrens tjocklek (Pa) for en kolumn
function expTryck(ab, ps) {
  const p = new Float64Array(EXP_NIV), dp = new Float64Array(EXP_NIV);
  for (let k = 0; k < EXP_NIV; k++) p[k] = ab.ap[k] + ab.b[k] * ps;
  for (let k = 0; k < EXP_NIV; k++) { const ovre = k === 0 ? 0 : (p[k - 1] + p[k]) / 2, nedre = k === EXP_NIV - 1 ? ps : (p[k] + p[k + 1]) / 2; dp[k] = Math.max(0, nedre - ovre); }
  return { p, dp };
}
// graupel i rutan for timme t -> integrerad mangd och max per kolumn
async function expHamta(t) {
  const o = expOmrade(); if (!o) throw new Error("punkten ligger utanför MEPS");
  const nyckel = [M0F.dtg, t, o.y0, o.y1, o.x0, o.x1].join(":"); if (EXP.cache.has(nyckel)) return EXP.cache.get(nyckel);
  const ab = await expAB(), yx = "[" + o.y0 + ":" + o.y1 + "][" + o.x0 + ":" + o.x1 + "]", n = o.ny * o.nx;
  const rum = "[" + t + "][0:" + (EXP_NIV - 1) + "]" + yx, N = n * EXP_NIV;
  // graupel, temperatur, is, molnvatten och vertikalvind pa alla nivaer (5 x ca 1 MB for 150 km)
  const [q, T, qi, qc, W, ps] = await Promise.all([
    expVar("mass_fraction_of_graupel_in_air_ml", rum, N), expVar("air_temperature_ml", rum, N), expVar("mass_fraction_of_cloud_ice_in_air_ml", rum, N),
    expVar("mass_fraction_of_cloud_condensed_water_in_air_ml", rum, N), expVar("upward_air_velocity_ml", rum, N), expVar("surface_air_pressure", "[" + t + "][0]" + yx, n)]);
  const F = {}; for (const k in EXP_FALT) F[k] = new Float32Array(n).fill(NaN);
  const mxP = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!isFinite(ps[i])) continue;
    const { p, dp } = expTryck(ab, ps[i]); let s = 0, m = 0, mp = NaN, mT = NaN, ld = 0, sf = 0, wm = 0, gfx = NaN;
    for (let k = 0; k < EXP_NIV; k++) {
      const j = k * n + i, g = q[j], tc = T[j] - 273.15, w = W[j], ms = dp[k] / EXP_G;
      if (isFinite(w) && w > wm) wm = w;
      if (k > 0 && isFinite(tc)) { const ta = T[j - n] - 273.15; if ((ta + 15) * (tc + 15) <= 0 && ta !== tc) { const f = (-15 - ta) / (tc - ta);   // -15 grader mellan nivaerna k-1 och k
        const gg = q[j - n] + (g - q[j - n]) * f, ww = W[j - n] + (w - W[j - n]) * f; if (isFinite(gg) && isFinite(ww)) gfx = Math.max(isFinite(gfx) ? gfx : 0, Math.max(0, ww) * gg * 1000); } }
      if (!isFinite(g) || g <= 0) continue;
      s += g * ms; if (g > m) { m = g; mp = p[k]; mT = tc; }
      if (tc <= -10 && tc >= -25) { ld += g * ms; if ((qi[j] > 1e-6) && (qc[j] > 1e-5)) sf += g * ms; }   // is > 0,001 g/kg och underkylt vatten > 0,01 g/kg
    }
    F.vig[i] = s; F.max[i] = m * 1000; mxP[i] = mp; F.ladd[i] = ld; F.samf[i] = sf; F.tmax[i] = m * 1000 >= 0.01 ? mT : NaN; F.gfx[i] = gfx; F.wmax[i] = wm;
  }
  const ut = { o, F, mxP, t, vig: F.vig, mx: F.max }; EXP.cache.set(nyckel, ut); if (EXP.cache.size > 30) EXP.cache.delete(EXP.cache.keys().next().value);
  return ut;
}

// ---------------- ritning ----------------
function expKlass(K, w) { let k = -1; for (let i = 0; i < K.length; i++) if (w >= K[i]) k = i; return k; }
function expBild(d, o, K, FG) {
  const cv = document.createElement("canvas"); cv.width = o.nx; cv.height = o.ny;
  const cx = cv.getContext("2d"), img = cx.createImageData(o.nx, o.ny), px = img.data;
  const F = (FG || EXP_FARG).map(c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
  for (let y = 0; y < o.ny; y++) for (let x = 0; x < o.nx; x++) {
    const w = d[y * o.nx + x], k = isFinite(w) ? expKlass(K, w) : -1; if (k < 0) continue;
    const i = ((o.ny - 1 - y) * o.nx + x) * 4; px[i] = F[k][0]; px[i + 1] = F[k][1]; px[i + 2] = F[k][2]; px[i + 3] = 235;
  }
  cx.putImageData(img, 0, 0); return skarpaRutor(cv);
}
// en liten karta: falt + kust/granser (kopierade fran stora kartan) + vald punkt
function expKarta(svgId, d, K, enh, namn, FG) {
  const S = $(svgId), o = EXP.o; if (!S || !o) return;
  const X0 = o.x0 - 0.5, Y0 = KY - 1 - o.y1 - 0.5; S.setAttribute("viewBox", X0 + " " + Y0 + " " + o.nx + " " + o.ny); S.textContent = "";
  for (const p of document.querySelectorAll("#kGeo path.land, #kGeo path.sjo")) S.appendChild(el("path", { d: p.getAttribute("d"), fill: p.classList.contains("sjo") ? "var(--hav)" : "var(--land)", "fill-rule": "evenodd", stroke: "none" }));
  S.appendChild(el("image", { href: expBild(d, o, K, FG), x: X0, y: Y0, width: o.nx, height: o.ny, preserveAspectRatio: "none", style: "image-rendering:pixelated" }));
  for (const p of document.querySelectorAll("#kKust path")) S.appendChild(el("path", { d: p.getAttribute("d"), fill: "none", stroke: p.classList.contains("ograns") ? "#9b3f3f" : "#4b5f5b",
    "stroke-width": p.classList.contains("osjo") ? 0.6 : 1, "stroke-dasharray": p.classList.contains("ograns") ? "5 3" : null, "vector-effect": "non-scaling-stroke" }));
  // orter och flygplatser i rutan
  for (const p of PUNKTER) { const r = ruta(p[2], p[3]); if (!r || r.iy < o.y0 || r.iy > o.y1 || r.ix < o.x0 || r.ix > o.x1) continue;
    S.appendChild(el("circle", { cx: r.ix, cy: KY - 1 - r.iy, r: 0.9, fill: "#111" }));
    S.appendChild(el("text", { x: r.ix + 1.4, y: KY - 1 - r.iy + 0.9, "font-size": 2.8, fill: "#111", stroke: "#fff", "stroke-width": 0.6, "paint-order": "stroke" }, p[1])); }
  if (EXP.punkt) S.appendChild(el("path", { d: "M" + (EXP.punkt.ix - 2) + " " + (KY - 1 - EXP.punkt.iy) + "h4M" + EXP.punkt.ix + " " + (KY - 1 - EXP.punkt.iy - 2) + "v4", stroke: "#dc2626", "stroke-width": 2, "vector-effect": "non-scaling-stroke" }));
  // legend
  const L = $(svgId + "L"); if (L) { L.innerHTML = "<b>" + namn + "</b> "; K.forEach((k, i) => L.insertAdjacentHTML("beforeend", '<span><i style="background:' + (FG || EXP_FARG)[i] + '"></i>' + (FG && i === 0 ? "< " + String(K[1]).replace(".", ",") : "≥ " + String(k).replace(".", ",")) + "</span>")); L.insertAdjacentHTML("beforeend", " <span class='dim'>" + enh + "</span>"); }
}
function expRita() {
  if (lage !== "exp" || !EXP.data) return;
  EXP.o = EXP.data.o;
  for (const [id, v] of [["expSvg1", EXP.v1], ["expSvg2", EXP.v2]]) { const f = EXP_FALT[v] || EXP_FALT.vig; expKarta(id, EXP.data.F[v] || EXP.data.vig, f.K, f.enh, f.namn, f.F); }
  // ram pa stora kartan
  const g = $("kExp"); if (g) { g.textContent = ""; const o = EXP.o; g.appendChild(el("rect", { x: o.x0 - 0.5, y: KY - 1 - o.y1 - 0.5, width: o.nx, height: o.ny, fill: "none", stroke: "#7c3aed", "stroke-width": 2, "stroke-dasharray": "6 3", "vector-effect": "non-scaling-stroke" })); }
  // sammanfattning
  let mv = 0, mm = 0; for (let i = 0; i < EXP.data.vig.length; i++) { if (EXP.data.vig[i] > mv) mv = EXP.data.vig[i]; if (EXP.data.mx[i] > mm) mm = EXP.data.mx[i]; }
  $("expSam").textContent = "Störst i rutan: " + mv.toFixed(2).replace(".", ",") + " kg/m² integrerat, " + mm.toFixed(2).replace(".", ",") + " g/kg som max.";
}
function expTidText(t) { if (!M0F.t0) return "+" + t; const d = new Date(M0F.t0 + t * 3600e3); return VECKODAG[d.getUTCDay()] + " " + p2(d.getUTCHours()) + "Z (+" + t + ")"; }
async function expUppdatera() {
  if (lage !== "exp") return;
  if (!await m0Korning()) { expStatus("Hittade ingen körning."); return; }
  if (EXP.t === null) EXP.t = Math.max(0, Math.min(M0F.nt - 1, Math.round((Date.now() - M0F.t0) / 3600e3)));
  EXP.t = Math.max(0, Math.min(M0F.nt - 1, EXP.t));
  $("expTid").textContent = expTidText(EXP.t); $("expReglage").max = M0F.nt - 1; $("expReglage").value = EXP.t;
  $("expKorn").textContent = M0F.dtg + " (MEPS medlem 0, 2,5 km, 65 modellnivåer)";
  const nr = ++EXP.hamtar, t0 = performance.now();
  expStatus("Hämtar graupel på alla nivåer …");
  try {
    const d = await expHamta(EXP.t); if (nr !== EXP.hamtar) return;
    EXP.data = d; expRita(); expStatus("Klart på " + ((performance.now() - t0) / 1000).toFixed(1) + " s (" + d.o.nx + " × " + d.o.ny + " rutor).");
    if (EXP.punkt) expProfil(EXP.punkt);
    if (EXP.t + 1 < M0F.nt) setTimeout(() => { if (nr === EXP.hamtar) expHamta(EXP.t + 1).catch(() => {}); }, 400);   // nasta timme i forvag
  } catch (e) { if (nr === EXP.hamtar) expStatus("Kunde inte hämta (" + e.message + ")."); }
}

// ---------------- kolumnens profil (klick i en liten karta) ----------------
async function expProfil(pt) {
  EXP.punkt = pt; expRita();
  const box = $("expProfil"); box.hidden = false; $("expProfilTitel").textContent = "Kolumnen i " + (platsNamn(pt.lat, pt.lon) || "") + " – " + expTidText(EXP.t) + " · hämtar …";
  try {
    const ab = await expAB(), yx = "[" + pt.iy + "][" + pt.ix + "]", rum = "[" + EXP.t + "][0:" + (EXP_NIV - 1) + "]" + yx;
    const V = { gr: "mass_fraction_of_graupel_in_air_ml", sn: "mass_fraction_of_snow_in_air_ml", is: "mass_fraction_of_cloud_ice_in_air_ml", lw: "mass_fraction_of_cloud_condensed_water_in_air_ml", ta: "air_temperature_ml", w: "upward_air_velocity_ml" };
    const fraga = Object.values(V).map(v => v + rum).join(",") + ",surface_air_pressure[" + EXP.t + "][0]" + yx;
    const r = await hamta(BAS + FIL(M0F.dtg) + ".ascii?" + enc(fraga)); if (r.st !== 200) throw new Error("svar " + r.st);
    const d = tolka(r.txt), ps = d.surface_air_pressure && d.surface_air_pressure[0]; if (!isFinite(ps)) throw new Error("inget marktryck");
    const { p, dp } = expTryck(ab, ps), K = {}; for (const k in V) K[k] = d[V[k]] || [];
    expRitaProfil(pt, p, dp, K);
  } catch (e) { $("expProfilTitel").textContent = "Kolumnen: kunde inte hämta (" + e.message + ")."; }
}
function expRitaProfil(pt, p, dp, K) {
  const S = $("expProfilSvg"), W = 460, H = 380, VM = 52, HM = 46, TP = 12, BP = 34; S.setAttribute("viewBox", "0 0 " + W + " " + H); S.textContent = "";
  const pTopp = 200e2, pBott = Math.max(...p) + 500, yP = pp => TP + (Math.log(pp) - Math.log(pTopp)) / (Math.log(pBott) - Math.log(pTopp)) * (H - TP - BP);
  const serier = [["gr", "Graupel", "#7c3aed", 2.4], ["sn", "Snö", "#2563eb", 1.6], ["is", "Is", "#06b6d4", 1.4], ["lw", "Molnvatten", "#16a34a", 1.6]];
  let mx = 0; for (const [k] of serier) for (let i = 0; i < EXP_NIV; i++) if (p[i] >= pTopp && K[k][i] > 0) mx = Math.max(mx, K[k][i] * 1000);
  // 22/11: fast skala 0-1 g/kg (sa man far kansla for vad som ar mycket); bara om nagot ar storre vaxer den (1 -> 2 -> 4 -> 8)
  let skala = 1; while (mx > skala && skala < 64) skala *= 2; const utokad = skala > 1;
  mx = skala * 1.1; const xQ = v => VM + v / mx * (W - VM - HM);
  const tMin = -50, tMax = 15, xT = tc => VM + (tc - tMin) / (tMax - tMin) * (W - VM - HM);
  const c = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || "#888";
  // axlar och flygnivaer
  for (const fl of [0, 50, 100, 150, 200, 250, 300, 350]) { const pp = 101325 * Math.pow(1 - fl * 100 / 145366.45, 1 / 0.190284); if (pp < pTopp || pp > pBott) continue;
    S.appendChild(el("line", { x1: VM, x2: W - HM, y1: yP(pp), y2: yP(pp), stroke: c("--grid"), "stroke-width": 0.6 }));
    S.appendChild(el("text", { x: VM - 4, y: yP(pp) + 3, "font-size": 10, "text-anchor": "end", fill: c("--dim") }, "FL" + String(fl).padStart(3, "0"))); }
  S.appendChild(el("line", { x1: VM, x2: VM, y1: TP, y2: H - BP, stroke: c("--fg") })); S.appendChild(el("line", { x1: VM, x2: W - HM, y1: H - BP, y2: H - BP, stroke: c("--fg") }));
  for (let i = 0; i <= 4; i++) { const v = mx / 1.1 * i / 4; S.appendChild(el("text", { x: xQ(v), y: H - BP + 13, "font-size": 10, "text-anchor": "middle", fill: c("--dim") }, v.toFixed(v < 0.1 ? 3 : 2).replace(".", ","))); }
  S.appendChild(el("text", { x: (VM + W - HM) / 2, y: H - 6, "font-size": 10.5, "text-anchor": "middle", fill: utokad ? "#b45309" : c("--fg") }, "halt g/kg" + (utokad ? " – OBS skalan utökad till " + skala : "") + " (temperatur: övre skala, °C)"));
  for (const tc of [-40, -20, -10, 0, 10]) S.appendChild(el("text", { x: xT(tc), y: TP - 2, "font-size": 9.5, "text-anchor": "middle", fill: "#dc2626" }, String(tc)));
  // 0, -10 och -25 grader: nivaerna dar temperaturen passerar (23/11: -25 tillagd + svagt band -10..-25 = laddningszonen)
  const tc = K.ta.map(v => v - 273.15);
  const passage = gr => { const u = []; for (let k = 1; k < EXP_NIV; k++) { const a = tc[k - 1], b = tc[k];
    if (!(isFinite(a) && isFinite(b)) || (a - gr) * (b - gr) > 0 || a === b) continue; u.push(p[k - 1] + (p[k] - p[k - 1]) * (gr - a) / (b - a)); } return u; };
  { const p10 = passage(-10), p25 = passage(-25);
    if (p10.length && p25.length) { const pa = Math.max(...p10), pb = Math.max(...p25);   // lagsta passagen (hogst tryck) av var och en
      if (pb < pa) { const y1 = yP(Math.max(pb, pTopp)), y2 = yP(Math.min(pa, pBott));
        if (pa >= pTopp) { S.appendChild(el("rect", { x: VM, y: y1, width: W - VM - HM, height: Math.max(0, y2 - y1), fill: "#7c3aed", opacity: 0.08 }));
          S.appendChild(el("text", { x: VM + 4, y: y1 + 11, "font-size": 9.5, fill: "#7c3aed" }, "laddningszon −10 till −25 °C")); } } } }
  for (const [gr, f] of [[0, "#dc2626"], [-10, "#f97316"], [-25, "#7c3aed"]]) for (const pp of passage(gr)) {
    if (pp < pTopp) continue;
    S.appendChild(el("line", { x1: VM, x2: W - HM, y1: yP(pp), y2: yP(pp), stroke: f, "stroke-width": 1, "stroke-dasharray": "4 3" }));
    S.appendChild(el("text", { x: W - HM + 3, y: yP(pp) + 3, "font-size": 9.5, fill: f }, gr + " °C"));
  }
  // temperaturen
  let dd = ""; for (let k = 0; k < EXP_NIV; k++) if (p[k] >= pTopp && isFinite(tc[k])) dd += (dd ? "L" : "M") + xT(Math.max(tMin, Math.min(tMax, tc[k]))).toFixed(1) + " " + yP(p[k]).toFixed(1);
  S.appendChild(el("path", { d: dd, fill: "none", stroke: "#dc2626", "stroke-width": 1.2, opacity: 0.6 }));
  // halterna (molnvatten under 0 grader = underkylt, streckat)
  for (const [k, , f, w] of serier) { let d = ""; for (let i = 0; i < EXP_NIV; i++) { const v = K[k][i]; if (p[i] < pTopp || !isFinite(v)) continue; d += (d ? "L" : "M") + xQ(Math.max(0, v * 1000)).toFixed(1) + " " + yP(p[i]).toFixed(1); }
    S.appendChild(el("path", { d, fill: "none", stroke: f, "stroke-width": w })); }
  // varden pa nivaerna (tips)
  for (let i = 0; i < EXP_NIV; i++) { if (p[i] < pTopp) continue; const r = el("rect", { x: VM, y: yP(p[i]) - 2, width: W - VM - HM, height: 4, fill: "transparent" });
    const ti = el("title"); ti.textContent = "Nivå " + i + ", " + (p[i] / 100).toFixed(0) + " hPa ≈ FL" + String(expFL(p[i])).padStart(3, "0") + ", T " + (isFinite(tc[i]) ? tc[i].toFixed(1) : "–") + " °C\n" +
      serier.map(([k, n]) => n + " " + (isFinite(K[k][i]) ? (K[k][i] * 1000).toFixed(3) : "–") + " g/kg").join(", ") + (K.w && isFinite(K.w[i]) ? "\nUppvind " + K.w[i].toFixed(2) + " m/s" : ""); r.appendChild(ti); S.appendChild(r); }
  // uppvinden som gra stapel vid hogerkanten (skala 0-5 m/s, 30 px)
  if (K.w) for (let i = 0; i < EXP_NIV; i++) { const w = K.w[i]; if (p[i] < pTopp || !isFinite(w) || Math.abs(w) < 0.05) continue;
    S.appendChild(el("rect", { x: w > 0 ? W - HM + 36 : W - HM + 36 - Math.min(30, -w * 6), y: yP(p[i]) - 1.5, width: Math.min(30, Math.abs(w) * 6), height: 3, fill: w > 0 ? "#6b7280" : "#cbd5e1" })); }
  S.appendChild(el("text", { x: W - HM + 36, y: H - BP + 13, "font-size": 9, "text-anchor": "middle", fill: c("--dim") }, "w"));
  // summor
  let vg = 0, vs = 0, vl = 0, vu = 0; for (let i = 0; i < EXP_NIV; i++) { const m = dp[i] / EXP_G; vg += (K.gr[i] || 0) * m; vs += (K.sn[i] || 0) * m; vl += (K.lw[i] || 0) * m; if (tc[i] < 0) vu += (K.lw[i] || 0) * m; }
  $("expProfilTitel").textContent = "Kolumnen i " + (platsNamn(pt.lat, pt.lon) || "") + " – " + expTidText(EXP.t) + " · medlem 0";
  $("expProfilSum").innerHTML = serier.map(([, n, f]) => '<span><i style="background:' + f + '"></i>' + n + "</span>").join(" ") + '<span><i style="background:#dc2626;opacity:.6"></i>Temperatur</span><br>' +
    "Integrerat: graupel " + vg.toFixed(3).replace(".", ",") + " kg/m², snö " + vs.toFixed(3).replace(".", ",") + " kg/m², molnvatten " + vl.toFixed(3).replace(".", ",") + " kg/m² (varav underkylt " + vu.toFixed(3).replace(".", ",") + ").";
}
// klick och tips i de sma kartorna
function expKartPunkt(S, ev) {
  const o = EXP.o; if (!o) return null; const r = S.getBoundingClientRect();
  const ix = o.x0 + Math.floor((ev.clientX - r.left) / r.width * o.nx), iyF = Math.floor((ev.clientY - r.top) / r.height * o.ny), iy = o.y1 - iyF;
  if (ix < o.x0 || ix > o.x1 || iy < o.y0 || iy > o.y1) return null;
  const ll = franRuta(ix, iy); return { ix, iy, lat: ll.lat, lon: ll.lon, i: (iy - o.y0) * o.nx + (ix - o.x0) };
}

// ---------------- flik och klick ----------------
function expLage(nytt) {
  const pa = nytt === "exp"; $("vyExp").hidden = !pa; $("expRuta").hidden = !pa; $("flikExp").setAttribute("aria-selected", String(pa));
  if (!pa) { const g = $("kExp"); if (g) g.textContent = ""; return; }
  expUppdatera();
}
function expKartKlick(lat, lon) { EXP.lat = lat; EXP.lon = lon; EXP.punkt = null; $("expProfil").hidden = true; expSpara(); expUppdatera(); }
(function expInit() {
  if (!$("expStorlek")) return;
  const st = $("expStorlek"); for (const [v, t] of EXP_STORLEK) st.add(new Option(t, v)); st.value = EXP.km;
  for (const [id, k] of [["expVal1", "v1"], ["expVal2", "v2"]]) { const s_ = $(id); for (const v in EXP_FALT) s_.add(new Option(EXP_FALT[v].namn, v)); s_.value = EXP[k];
    s_.addEventListener("change", () => { EXP[k] = s_.value; expSpara(); expRita(); }); }
  st.addEventListener("change", () => { EXP.km = +st.value; expSpara(); expUppdatera(); });
  const steg = d => { if (!M0F.nt) return; EXP.t = Math.max(0, Math.min(M0F.nt - 1, (EXP.t || 0) + d)); expUppdatera(); };
  $("expBak").addEventListener("click", () => steg(-1)); $("expFram").addEventListener("click", () => steg(1));
  let tim = 0; $("expReglage").addEventListener("input", () => { EXP.t = +$("expReglage").value; $("expTid").textContent = expTidText(EXP.t); clearTimeout(tim); tim = setTimeout(expUppdatera, 250); });
  for (const id of ["expSvg1", "expSvg2"]) {
    const S = $(id);
    S.addEventListener("click", ev => { const pt = expKartPunkt(S, ev); if (pt) expProfil(pt); });
    S.addEventListener("mousemove", ev => { const pt = expKartPunkt(S, ev), D = EXP.data; if (!pt || !D) { $("kTips").hidden = true; return; }
      const p = D.mxP[pt.i], f = (k, d) => isFinite(D.F[k][pt.i]) ? D.F[k][pt.i].toFixed(d).replace(".", ",") : "–";
      visaKTips("Integrerat " + f("vig", 3) + " kg/m², i laddningszonen " + f("ladd", 3) + " (med is + underkylt vatten " + f("samf", 3) + ")\nMax " + f("max", 3) + " g/kg" + (isFinite(p) ? " på ca FL" + String(expFL(p)).padStart(3, "0") + ", " + f("tmax", 1) + " °C" : "") +
        "\nUppvind × graupel vid −15 °C: " + f("gfx", 3) + "\nMax uppvind " + f("wmax", 1) + " m/s\nKlicka för kolumnens profil", ev.clientX + 14, ev.clientY + 14); });
    S.addEventListener("mouseleave", () => { $("kTips").hidden = true; });
  }
  document.addEventListener("keydown", ev => { if (lage !== "exp" || ev.altKey || ev.ctrlKey || ev.metaKey) return; const t = ev.target.tagName; if (t === "INPUT" || t === "SELECT" || t === "TEXTAREA") return;
    if (ev.key === "ArrowLeft") { steg(-1); ev.preventDefault(); } else if (ev.key === "ArrowRight") { steg(1); ev.preventDefault(); } });
})();
