// konrad.js - NYTT 24/11 (Jakob): KONRAD3D - DWD:s automatiska upptackt, foljning och korttidsprognos av konvektiva
// celler (aska/skurar), ny fil var 5:e min. Knappen "⚡ KONRAD3D" i kartraden. Via mellanservern /konrad (cache 4 min).
// Ritas: cellernas polygoner (farg efter DWD:s severity 0-4), prognosspar for cellens mittpunkt (DWD:s egen prognos,
// var 5:e min upp till ca 60 min) med prickar vid +15/+30/+60, och DWD-omradets nordgrans (streckad) - norr om den
// finns aldrig nagra celler (ca 55,9 N: bara Skane/Bornholm/sodra Ostersjon i Sverige).
// Galler NU (senaste filen). I radar/satellit visas cellerna bara nar loopen star inom 10 min fran filens tid.
// Data: Deutscher Wetterdienst, CC BY 4.0.
const KONRAD_URL = "https://modelltittaren.metvyer.workers.dev/konrad";
let KD = { pa: lasa("mt:konrad") === "ja", celler: [], tid: 0, fil: "", hamtad: 0, hor: null, fel: "" };
const KD_FARG = ["#facc15", "#f97316", "#dc2626", "#c026d3", "#6b21a8"];   // severity 0..4
const kdTal = (e, sok) => { const x = e && e.querySelector(sok); if (!x) return null; const v = parseFloat(x.textContent); return isFinite(v) && v > -1e8 ? v : null; };
const kdTxt = (e, sok) => { const x = e && e.querySelector(sok); return x ? x.textContent.trim() : ""; };
function kdTolka(xml) {
  const d = new DOMParser().parseFromString(xml, "application/xml");
  const ref = kdTxt(d, "head metadata reference_time") || kdTxt(d, "cells") ;
  const tid = Date.parse(ref) || Date.parse((d.querySelector("cells") || { getAttribute: () => "" }).getAttribute("reference_time")) || 0;
  // DWD-omradets horn (lat lon) -> nordgransen
  const horn = ["upper_left_corner", "upper_right_corner", "lower_right_corner", "lower_left_corner"].map(k => kdTxt(d, "projected_area " + k).split(/\s+/).map(Number));
  const celler = [...d.querySelectorAll("cells > feature")].map(f => {
    const pol = [...f.querySelectorAll("geometry polygons_projected geodetic_coordinates polygon")].map(p => {
      const la = kdTxt(p, "latitudes").split(/\s+/).map(Number), lo = kdTxt(p, "longitudes").split(/\s+/).map(Number);
      return la.map((v, i) => [v, lo[i]]).filter(q => isFinite(q[0]) && isFinite(q[1])); }).filter(p => p.length > 2);
    const prog = [...f.querySelectorAll("forecast centroid_forecasts centroid_forecast")].map(c => ({ t: Date.parse(c.getAttribute("forecast_time")), lat: kdTal(c, "latitude"), lon: kdTal(c, "longitude"), osak: kdTal(c, "uncertainty_ellipse major_axis") }))
      .filter(c => isFinite(c.t) && c.lat !== null && c.lon !== null);
    return { id: kdTxt(f, "metadata identifier"), pol, lat: kdTal(f, "geometry centroid_3d latitude"), lon: kdTal(f, "geometry centroid_3d longitude"), prog,
      sev: kdTal(f, "intensity severity") || 0, sevd: kdTal(f, "intensity severity_decimal"), top: kdTal(f, "geometry echo_top_msl"), area: kdTal(f, "geometry covered_area"),
      dbz: kdTal(f, "intensity max_value"), vil: kdTal(f, "intensity cell_based_VIL"), fart: kdTal(f, "tracking cell_speed"), forst: kdTxt(f, "tracking reference_time_first_detection"),
      blixt: kdTal(f, "lightning lightning_rate"), regn: kdTal(f, "intensity heavy_rain_potential"), hagel: kdTal(f, "intensity hail_flag"), by: kdTal(f, "intensity maximum_estimated_wind_gust"),
      byFlagg: kdTal(f, "intensity gust_flag"), trend: kdTal(f, "intensity trends severity_trend"), meso: kdTal(f, "mesocyclone mesocyclone_severity_index"), hymec: kdTal(f, "hymec maximum_near_ground_class") };
  }).filter(c => c.pol.length || (c.lat !== null && c.lon !== null));
  return { tid, celler, horn };
}
async function kdHamta(tvinga) {
  if (!KD.pa) return;
  if (!tvinga && KD.hamtad && Date.now() - KD.hamtad < 4 * 60e3) { kdRita(); return; }
  try { const r = await fetch(KONRAD_URL, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const t = kdTolka(await r.text()); KD.celler = t.celler; KD.tid = t.tid; KD.horn = t.horn; KD.fil = r.headers.get("X-Konrad-Fil") || ""; KD.hamtad = Date.now(); KD.fel = "";
  } catch (e) { KD.fel = String(e.message || e); }
  kdRita();
}
function kdSynligNu() {   // radar/satellit: bara nar loopen star nara filens tid
  if (typeof lage === "undefined") return true;
  if ((lage === "rad" || lage === "sat") && typeof OBS !== "undefined" && OBS.ramar && OBS.ramar[OBS.i]) return Math.abs(OBS.ramar[OBS.i].t - KD.tid) <= 10 * 60e3;
  return lage !== "exp";
}
function kdRita() {
  const g = $("kKonrad"); if (!g) return; g.textContent = ""; kdKnapp(); if (!KD.pa) return;
  const svg = $("karta"), bw = svg && svg.getBoundingClientRect().width || 800, enh = (typeof vb !== "undefined" ? vb.w : 949) / bw;
  // DWD-omradets kant (streckad), interpolerad langs kanterna
  if (KD.horn && KD.horn.every(h => h.length === 2 && isFinite(h[0]))) { let d = "";
    for (let k = 0; k < 4; k++) { const a = KD.horn[k], b = KD.horn[(k + 1) % 4];
      for (let i = 0; i <= 20; i++) { const la = a[0] + (b[0] - a[0]) * i / 20, lo = a[1] + (b[1] - a[1]) * i / 20, p = tillKarta(la, lo); d += (d ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1); } }
    g.appendChild(el("path", { d: d + "Z", fill: "none", stroke: "#6b7280", "stroke-width": 1.2, "stroke-dasharray": "6 4", "vector-effect": "non-scaling-stroke", opacity: 0.8 }));
    const nv = tillKarta(KD.horn[0][0], (KD.horn[0][1] + KD.horn[1][1]) / 2);
    g.appendChild(el("text", { x: nv.x, y: nv.y - 4 * enh, "font-size": 10 * enh, "text-anchor": "middle", fill: "#6b7280", stroke: "#fff", "stroke-width": 2.5 * enh, "paint-order": "stroke" }, "KONRAD3D:s nordgräns (DWD-radar)"));
  }
  if (!kdSynligNu()) return;
  KD.celler.forEach((c, i) => {
    const fa = KD_FARG[Math.max(0, Math.min(4, Math.round(c.sev)))], cg = el("g", { class: "konrad", "data-i": i, style: "cursor:pointer" });
    for (const p of c.pol) { const d = p.map((q, k) => { const z = tillKarta(q[0], q[1]); return (k ? "L" : "M") + z.x.toFixed(1) + " " + z.y.toFixed(1); }).join("") + "Z";
      cg.appendChild(el("path", { d, fill: fa, "fill-opacity": 0.55, stroke: "#111827", "stroke-width": 1, "vector-effect": "non-scaling-stroke" })); }
    if (c.prog.length && c.lat !== null) {   // prognosspar fran mittpunkten
      const pts = [[c.lat, c.lon], ...c.prog.map(q => [q.lat, q.lon])].map(q => tillKarta(q[0], q[1]));
      cg.appendChild(el("path", { d: pts.map((z, k) => (k ? "L" : "M") + z.x.toFixed(1) + " " + z.y.toFixed(1)).join(""), fill: "none", stroke: "#111827", "stroke-width": 1.6, "vector-effect": "non-scaling-stroke" }));
      for (const m of [15, 30, 60]) { const q = c.prog.find(x => Math.round((x.t - KD.tid) / 60e3) === m); if (!q) continue; const z = tillKarta(q.lat, q.lon);
        cg.appendChild(el("circle", { cx: z.x, cy: z.y, r: 2.6 * enh, fill: "#fff", stroke: "#111827", "stroke-width": 1, "vector-effect": "non-scaling-stroke" }));
        cg.appendChild(el("text", { x: z.x + 4 * enh, y: z.y + 3 * enh, "font-size": 9 * enh, "font-weight": 700, fill: "#111827", stroke: "#fff", "stroke-width": 2.2 * enh, "paint-order": "stroke" }, "+" + m)); }
    }
    g.appendChild(cg); });
}
function kdTidTxt(t) { const d = new Date(t); return isNaN(d) ? "–" : p2(d.getUTCHours()) + p2(d.getUTCMinutes()) + "Z"; }
function kdKnapp() {
  const b = $("konradKnapp"); if (!b) return; b.setAttribute("aria-pressed", String(KD.pa));
  b.title = "KONRAD3D – DWD:s automatiskt upptäckta konvektiva celler (åska/skurar) med DWD:s egen prognos för cellens rörelse upp till ca 1 h (+15/+30/+60). " +
    "Täcker bara DWD:s radarområde: norr om ca 55,9°N (streckad gräns) finns inga celler. Gäller NU; i radar/satellit bara när loopen står nära filens tid. Data: Deutscher Wetterdienst, CC BY 4.0." +
    (KD.pa ? "\n" + (KD.fel ? "Kunde inte hämta: " + KD.fel : KD.hamtad ? KD.celler.length + " celler, " + kdTidTxt(KD.tid) + (KD.celler.length ? "" : " – inga celler just nu") : "hämtar …") : "");
}
const kdFran = mal => { const m = mal && mal.closest && mal.closest(".konrad"); return m ? KD.celler[+m.dataset.i] : null; };
function kdTipsText(c) {
  const f = (v, e, d) => v === null ? "–" : (+v).toFixed(d || 0) + e, SEV = ["0 (svag)", "1", "2", "3", "4 (kraftig)"];
  const alder = c.forst ? Math.round((KD.tid - Date.parse(c.forst)) / 60e3) : null;
  const flaggor = [c.hagel > 0 && "hagel", c.byFlagg > 0 && "kraftiga byar", c.regn !== null && c.regn >= 25 && "skyfall", c.meso > 0 && "mesocyklon"].filter(Boolean);
  return ["<b>KONRAD3D-cell " + vvEsc(c.id) + "</b> <span style='color:#6b7280'>" + kdTidTxt(KD.tid) + "</span>",
    "Intensitet (DWD severity): <b style='color:" + KD_FARG[Math.max(0, Math.min(4, Math.round(c.sev)))] + "'>■</b> " + (SEV[Math.round(c.sev)] || c.sev) + (c.trend !== null ? (c.trend > 0.05 ? " ↑" : c.trend < -0.05 ? " ↓" : " →") : ""),
    "Max " + f(c.dbz, " dBZ", 0) + " · ekotopp " + (c.top !== null ? Math.round(c.top) + " m (FL" + p3(Math.round(c.top * 3.2808 / 100)) + ")" : "–") + " · VIL " + f(c.vil, " kg/m²", 1),
    "Yta " + f(c.area, " km²") + " · fart " + (c.fart !== null ? Math.round(c.fart) + " km/h (" + Math.round(c.fart / 1.852) + " kt)" : "–") + (alder !== null ? " · följd i " + alder + " min" : ""),
    "Blixtar " + f(c.blixt, " /5 min") + " · max by (uppsk.) " + (c.by !== null ? Math.round(c.by / 3.6) + " m/s" : "–") + " · regnpotential " + f(c.regn, " mm/h", 0),
    (flaggor.length ? "<b style='color:#b91c1c'>Flaggor: " + flaggor.join(", ") + "</b>" : "Inga flaggor (hagel/byar/skyfall/mesocyklon)"),
    "<span style='color:#6b7280;font-size:11px'>Spåret = DWD:s prognos för cellens mittpunkt, prickar vid +15/+30/+60 min. Deutscher Wetterdienst, CC BY 4.0.</span>"].join("\n");
}
function konradTips(e) { const c = kdFran(e.target); if (!c) return false; visaKTips(kdTipsText(c), e.clientX + 14, e.clientY + 14, true); return true; }
function konradKlick(e, mal) { const c = kdFran(mal); if (!c) return false; visaKTips(kdTipsText(c), (e.clientX || 20) + 14, (e.clientY || 20) + 14, true); return true; }
(function kdInit() {
  const b = $("konradKnapp"); if (!b) return;
  b.addEventListener("click", () => { KD.pa = !KD.pa; lagra("mt:konrad", KD.pa ? "ja" : ""); if (KD.pa) kdHamta(); else kdRita(); });
  setInterval(() => { if (KD.pa && !document.hidden) kdHamta(true); }, 5 * 60e3);
  const svg = $("karta"); if (window.MutationObserver && svg) new MutationObserver(() => { clearTimeout(KD.hor); KD.hor = setTimeout(kdRita, 300); }).observe(svg, { attributes: true, attributeFilter: ["viewBox"] });
  new MutationObserver(() => { if (KD.pa) kdRita(); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  const ot = $("obsTid"); if (ot) new MutationObserver(() => { if (KD.pa && (lage === "rad" || lage === "sat")) kdRita(); }).observe(ot, { childList: true, characterData: true, subtree: true });
  kdKnapp(); if (KD.pa) setTimeout(kdHamta, 1500);
})();
