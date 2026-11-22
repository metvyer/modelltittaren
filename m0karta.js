// Modelltittaren - FLIKEN "KARTA m0" (NYTT 21/11, ersätter knappen Kartfält m0 i tid-höjd)
// Kartfält ur det-körningen (MEPS medlem 0, samma som tid-höjd) för en vald timme över hela den förhämtade rutan
// (Sverige, Östersjön, Finland, Baltikum), var 5:e km. Ett fält i FÄRG och (valfritt) ett annat som ISOLINJER ovanpå.
// Fälten kommer ur mätprov T (21/11: alla fält i det-filen) - det som är rimligt att visa som karta, i grupper.
// Ett anrop per fält och timme (binärt .dods, ca 100 000 punkter); svaren sparas i minnet och delas via mellanserverns cache.
//
// Fältbeskrivning: var = variabel (eller [x, y] för vindstyrka, ["T", "RH"] för daggpunkt), niv = index i 2:a
// dimensionen (null = ingen sådan dimension, "p850" = tryckyta 850 hPa), diff = ackumulerat -> per timme,
// konv = till visningsenhet, klass = färggränser, lagre = lägre är "värre" (sikt, molnbas), pal = färgskala, iso = linjeavstånd.

const PAL_SEK = ["#dbeafe", "#93c5fd", "#fde68a", "#fbbf24", "#f97316", "#dc2626", "#9f1239", "#581c87"];
const PAL_TEMP = ["#312e81", "#1d4ed8", "#3b82f6", "#93c5fd", "#e0f2fe", "#fef3c7", "#fdba74", "#f97316", "#dc2626", "#7f1d1d"];
const PAL_MOLN = ["#f1f5f9", "#cbd5e1", "#94a3b8", "#64748b", "#475569", "#334155"];
const K_ = v => v - 273.15;
// 22/11: tata temperaturklasser, 1 grad fran -20 till +20 (blatt under noll, gult-rott over) - farger interpolerade
const TEMP_1 = Array.from({ length: 41 }, (_, i) => i - 20);
const PAL_TEMP1 = (() => {
  // 22/11 kvall: tydligare kring noll - egna farger for -6..+6 (blatt -> turkos -> ljusgront vid 0 -> gront -> gult),
  // interpolerat utanfor (morkblatt/lila under -6, orange -> morkrott over +6)
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const blanda = (stopp, t) => { const x = Math.max(0, Math.min(1, t)) * (stopp.length - 1), i = Math.min(stopp.length - 2, Math.floor(x)), f = x - i, a = hex(stopp[i]), b = hex(stopp[i + 1]);
    return "#" + a.map((c, j) => Math.round(c + (b[j] - c) * f).toString(16).padStart(2, "0")).join(""); };
  const NARA = { "-6": "#1d4ed8", "-5": "#2563eb", "-4": "#3b82f6", "-3": "#0ea5e9", "-2": "#38bdf8", "-1": "#7dd3fc",
    "0": "#a7f3d0", "1": "#6ee7b7", "2": "#bef264", "3": "#fde047", "4": "#facc15", "5": "#fbbf24", "6": "#f59e0b" };
  const kall = ["#4a044e", "#6b21a8", "#4338ca", "#1e40af"], varm = ["#fb923c", "#f97316", "#ea580c", "#dc2626", "#b91c1c", "#7f1d1d"];
  return TEMP_1.map(k => NARA[k] || (k < 0 ? blanda(kall, (k + 20) / 13) : blanda(varm, (k - 7) / 13)));
})();
const M0P = {
  // Nederbörd och moln
  nb:     { g: "Nederbörd och moln", namn: "Nederbörd", var: "precipitation_amount_acc", enh: "mm/h", klass: [0.1, 0.3, 1, 2, 4, 8], diff: true, pal: typeof PAL_NB !== "undefined" ? PAL_NB : undefined, konv: v => v, iso: [0.1, 1, 4] },
  regn:   { g: "Nederbörd och moln", namn: "Regn", var: "integral_of_rainfall_amount_wrt_time", enh: "mm/h", klass: [0.1, 0.3, 1, 2, 4, 8], diff: true, pal: typeof PAL_NB !== "undefined" ? PAL_NB : undefined, konv: v => v, iso: [0.1, 1] },
  sno:    { g: "Nederbörd och moln", namn: "Snöfall (snö + graupel + hagel, vatten)", var: "snowfall_amount_acc", enh: "mm/h", klass: [0.1, 0.3, 0.5, 1, 2, 4], diff: true, konv: v => v, iso: [0.1, 1] },
  graupel:{ g: "Nederbörd och moln", namn: "Graupel", var: "integral_of_graupelfall_amount_wrt_time", enh: "mm/h", klass: [0.05, 0.1, 0.3, 1], diff: true, konv: v => v, iso: [0.1] },
  tot:    { g: "Nederbörd och moln", namn: "Total molnmängd", var: "cloud_area_fraction", enh: "/8", klass: [1, 3, 5, 7, 8], pal: PAL_MOLN, konv: v => Math.min(8, (v > 1.5 ? v / 100 : v) * 8), iso: [4, 7] },
  lag:    { g: "Nederbörd och moln", namn: "Låga moln", var: "low_type_cloud_area_fraction", enh: "/8", klass: [1, 3, 5, 7, 8], pal: PAL_MOLN, konv: v => Math.min(8, (v > 1.5 ? v / 100 : v) * 8), iso: [5] },
  medel:  { g: "Nederbörd och moln", namn: "Medelhöga moln", var: "medium_type_cloud_area_fraction", enh: "/8", klass: [1, 3, 5, 7, 8], pal: PAL_MOLN, konv: v => Math.min(8, (v > 1.5 ? v / 100 : v) * 8), iso: [5] },
  hog:    { g: "Nederbörd och moln", namn: "Höga moln", var: "high_type_cloud_area_fraction", enh: "/8", klass: [1, 3, 5, 7, 8], pal: PAL_MOLN, konv: v => Math.min(8, (v > 1.5 ? v / 100 : v) * 8), iso: [5] },
  konvm:  { g: "Instabilitet och konvektion", namn: "Konvektiva moln", var: "convective_cloud_area_fraction", enh: "%", klass: [10, 30, 50, 70, 90], konv: v => v > 1.5 ? v : v * 100, iso: [50] },
  bas:    { g: "Nederbörd och moln", namn: "Molnbas", var: "cloud_base_altitude", enh: "ft", klass: [1500, 1000, 500, 300, 200], lagre: true, konv: v => v * FOT, iso: [500, 1000] },
  topp:   { g: "Nederbörd och moln", namn: "Molntopp", var: "cloud_top_altitude", enh: "ft", klass: [5000, 10000, 15000, 20000, 25000, 30000], konv: v => v * FOT, iso: [10000, 20000] },
  dimma:  { g: "Nederbörd och moln", namn: "Dimma (modellens dimandel)", var: "fog_area_fraction", enh: "%", klass: [10, 30, 50, 70, 90], konv: v => v > 1.5 ? v : v * 100, iso: [50] },
  sikt:   { g: "Nederbörd och moln", namn: "Sikt", var: "visibility_in_air", enh: "m", klass: [5000, 3000, 1500, 800, 400, 200], lagre: true, konv: v => v, iso: [1500, 5000] },
  hagel:  { g: "Instabilitet och konvektion", namn: "Hagel (diagnos)", var: "hail_diagnostic", enh: "%", klass: [5, 10, 30, 50], konv: v => v > 1.5 ? v : v * 100, iso: [10] },
  blixt:  { g: "Instabilitet och konvektion", namn: "Blixtindex", var: "lightning_index", enh: "", klass: [0.1, 0.5, 1, 2, 5], konv: v => v, iso: [1] },
  pw:     { g: "Nederbörd och moln", namn: "Utfällbart vatten", var: "lwe_thickness_of_atmosphere_mass_content_of_water_vapor", enh: "mm", klass: [5, 10, 15, 20, 25, 30, 40], konv: v => v < 1 ? v * 1000 : v, iso: [10, 20, 30] },
  // Vind
  vind:   { g: "Vind", namn: "Medelvind 10 m", var: "wind_speed", enh: "kt", klass: [10, 15, 20, 25, 30, 40], konv: v => v * KT, iso: [15, 25, 34] },
  by:     { g: "Vind", namn: "Byvind", var: "wind_speed_of_gust", enh: "kt", klass: [20, 25, 32, 40, 50, 64], konv: v => v * KT, iso: [25, 32, 45] },
  v850:   { g: "Vind", namn: "Vind 850 hPa", var: ["x_wind_pl", "y_wind_pl"], niv: "p850", enh: "kt", klass: [10, 20, 30, 40, 50, 60], konv: v => v * KT, iso: [30, 50] },
  v500:   { g: "Vind", namn: "Vind 500 hPa", var: ["x_wind_pl", "y_wind_pl"], niv: "p500", enh: "kt", klass: [20, 40, 60, 80, 100], konv: v => v * KT, iso: [50, 80] },
  v300:   { g: "Vind", namn: "Vind 300 hPa (jetström)", var: ["x_wind_pl", "y_wind_pl"], niv: "p300", enh: "kt", klass: [40, 60, 80, 100, 120, 150], konv: v => v * KT, iso: [80, 120] },
  jet:    { g: "Vind", namn: "Max vind i pelaren", var: ["x_wind_at_maximum_wind_speed_level", "y_wind_at_maximum_wind_speed_level"], enh: "kt", klass: [40, 60, 80, 100, 120, 150], konv: v => v * KT, iso: [80, 120] },
  jetniv: { g: "Vind", namn: "Höjd för max vind", var: "atmosphere_level_of_max_wind_speed", enh: "ft", klass: [10000, 20000, 25000, 30000, 35000, 40000], konv: v => v * FOT, iso: [30000] },
  // Temperatur och fukt
  t2:     { g: "Temperatur och fukt", namn: "Temperatur 2 m", var: "air_temperature_2m", enh: "°C", klass: TEMP_1, pal: PAL_TEMP1, tat: 5, konv: K_, iso: [-10, -5, 0, 5, 10, 15, 20] },
  t0:     { g: "Temperatur och fukt", namn: "Yttemperatur 0 m", var: "air_temperature_0m", enh: "°C", klass: TEMP_1, pal: PAL_TEMP1, tat: 5, konv: K_, iso: [-5, 0, 5] },
  tmax:   { g: "Temperatur och fukt", namn: "Högsta temperatur senaste timmen", var: "air_temperature_max", enh: "°C", klass: [-20, -10, -5, -2, 0, 2, 5, 10, 15, 20], pal: PAL_TEMP, konv: K_, iso: [0, 10, 20] },
  tmin:   { g: "Temperatur och fukt", namn: "Lägsta temperatur senaste timmen", var: "air_temperature_min", enh: "°C", klass: [-20, -10, -5, -2, 0, 2, 5, 10, 15, 20], pal: PAL_TEMP, konv: K_, iso: [-10, 0] },
  td:     { g: "Temperatur och fukt", namn: "Daggpunkt 2 m", var: ["air_temperature_2m", "relative_humidity_2m"], typ: "dagg", enh: "°C", klass: TEMP_1, pal: PAL_TEMP1, tat: 5, konv: v => v, iso: [-5, 0, 5, 10] },
  spread: { g: "Temperatur och fukt", namn: "Yttemp minus daggpunkt (rimfrost < 0)", var: ["air_temperature_0m", "air_temperature_2m", "relative_humidity_2m"], typ: "rimfrost", enh: "°C", klass: [-3, -2, -1, -0.5, 0], lagre: true, konv: v => v, iso: [0] },
  rh:     { g: "Temperatur och fukt", namn: "Relativ fukt 2 m", var: "relative_humidity_2m", enh: "%", klass: [50, 70, 80, 90, 95, 98], konv: v => Math.min(100, v > 1.5 ? v : v * 100), iso: [90] },
  t850:   { g: "Temperatur och fukt", namn: "Temperatur 850 hPa", var: "air_temperature_pl", niv: "p850", enh: "°C", klass: [-20, -15, -10, -5, -2, 0, 2, 5, 10, 15], pal: PAL_TEMP, konv: K_, iso: [-10, -5, 0, 5] },
  t500:   { g: "Temperatur och fukt", namn: "Temperatur 500 hPa", var: "air_temperature_pl", niv: "p500", enh: "°C", klass: [-45, -40, -35, -30, -25, -20, -15, -10, -5, 0], pal: PAL_TEMP, konv: K_, iso: [-40, -30, -20] },
  noll:   { g: "Temperatur och fukt", namn: "0-gradersnivå", var: "altitude_of_0_degree_isotherm", enh: "ft", klass: [5000, 3000, 2000, 1000, 500], lagre: true, konv: v => v * FOT, iso: [1000, 2000, 5000] },
  wbz:    { g: "Temperatur och fukt", namn: "Våttemperaturens 0-nivå", var: "altitude_of_isoTprimW_equal_0", enh: "ft", klass: [5000, 3000, 2000, 1000, 500], lagre: true, konv: v => v * FOT, iso: [1000, 2000] },
  // Tryck och höjd
  mslp:   { g: "Tryck och höjd", namn: "Lufttryck vid havsytan", var: "air_pressure_at_sea_level", enh: "hPa", klass: [970, 980, 990, 1000, 1010, 1020, 1030, 1040], konv: v => v / 100, isoSteg: 4 },
  z500:   { g: "Tryck och höjd", namn: "Höjd 500 hPa", var: "geopotential_pl", niv: "p500", enh: "dam", klass: [500, 512, 524, 536, 548, 560, 572, 584], konv: v => v / 98.0665, isoSteg: 6 },
  trop:   { g: "Tryck och höjd", namn: "Tropopaus (tryck)", var: "tropopause_air_pressure", enh: "hPa", klass: [150, 200, 250, 300, 350], lagre: true, konv: v => v / 100, iso: [200, 250, 300] },
  pbl:    { g: "Tryck och höjd", namn: "Gränsskiktets höjd", var: "atmosphere_boundary_layer_thickness", enh: "m", klass: [100, 250, 500, 1000, 1500, 2000], konv: v => v, iso: [500, 1000] },
  // Instabilitet
  cape:   { g: "Instabilitet och konvektion", namn: "CAPE", var: "specific_convective_available_potential_energy", enh: "J/kg", klass: [50, 100, 250, 500, 1000, 2000], konv: v => v, iso: [100, 500, 1000] },
  cin:    { g: "Instabilitet och konvektion", namn: "CIN", var: "atmosphere_convective_inhibition", enh: "J/kg", klass: [10, 25, 50, 100, 200], konv: v => Math.abs(v), iso: [50] },
  lcl:    { g: "Instabilitet och konvektion", namn: "Kondensationsnivå (LCL)", var: "lifting_condensation_level", enh: "ft", klass: [5000, 3000, 2000, 1000, 500], lagre: true, konv: v => v * FOT, iso: [1000, 3000] },
  lfc:    { g: "Instabilitet och konvektion", namn: "Fri konvektionsnivå (LFC)", var: "atmosphere_level_of_free_convection", enh: "ft", klass: [10000, 6000, 3000, 1500], lagre: true, konv: v => v * FOT, iso: [3000] },
  lnb:    { g: "Instabilitet och konvektion", namn: "Neutral flytkraft (LNB, ungefär molntopp)", var: "atmosphere_level_of_neutral_buoyancy", enh: "ft", klass: [10000, 15000, 20000, 25000, 30000, 35000], konv: v => v * FOT, iso: [20000, 30000] },
  // Isbildning och turbulens
  isTopp: { g: "Isbildning och turbulens", namn: "Isbildning, övre gräns", var: "atmosphere_level_of_icing_top", enh: "ft", klass: [2000, 5000, 10000, 15000, 20000], konv: v => v * FOT, iso: [10000] },
  isBott: { g: "Isbildning och turbulens", namn: "Isbildning, undre gräns", var: "atmosphere_level_of_icing_bottom", enh: "ft", klass: [500, 1000, 2000, 5000, 10000], konv: v => v * FOT, iso: [2000] },
  isMax:  { g: "Isbildning och turbulens", namn: "Nivå för kraftigast isbildning", var: "atmosphere_level_of_max_icing", enh: "ft", klass: [1000, 2000, 5000, 10000, 15000], konv: v => v * FOT, iso: [5000] },
  cat:    { g: "Isbildning och turbulens", namn: "CAT-index (max i pelaren)", var: "max_cat_index", enh: "", klass: [0.5, 1, 2, 3, 5], konv: v => v, iso: [1, 3] },
  catNiv: { g: "Isbildning och turbulens", namn: "Nivå för max CAT", var: "level_of_max_CAT_index", enh: "ft", klass: [15000, 20000, 25000, 30000, 35000, 40000], konv: v => v * FOT, iso: [30000] },
  // Mark, hav och snö
  sst:    { g: "Mark, hav och snö", namn: "Havsytans temperatur", var: "SFX_SST", niv: 0, enh: "°C", klass: [-1, 0, 2, 4, 6, 8, 10, 12, 15, 20], pal: PAL_TEMP, konv: K_, iso: [0, 5, 10] },
  sjo:    { g: "Mark, hav och snö", namn: "Temperatur i sjöar", var: "SFX_TS_WATER", niv: null, enh: "°C", klass: [-1, 0, 2, 4, 6, 8, 10, 12, 15, 20], pal: PAL_TEMP, konv: K_, iso: [0, 4] },
  is:     { g: "Mark, hav och snö", namn: "Havsis (andel)", var: "SFX_SIC", niv: 0, enh: "%", klass: [10, 30, 50, 70, 90], pal: PAL_MOLN, konv: v => v > 1.5 ? v : v * 100, iso: [50] },
  sjois:  { g: "Mark, hav och snö", namn: "Istjocklek i sjöar", var: "SFX_H_ICE", niv: null, enh: "cm", klass: [1, 5, 10, 20, 40], pal: PAL_MOLN, konv: v => v * 100, iso: [10] },
  snodj:  { g: "Mark, hav och snö", namn: "Snötäcke (vattenvärde)", var: "liquid_water_content_of_surface_snow", enh: "mm", klass: [1, 5, 10, 25, 50, 100, 200], konv: v => v, iso: [5, 50] },
  vag:    { g: "Mark, hav och snö", namn: "Vägbanans vattenförråd (modell)", var: "SFX_WS_ROAD", niv: null, enh: "", klass: [0.01, 0.1, 0.3, 1], konv: v => v, iso: [0.1] },
  // Strålning
  sol:    { g: "Strålning", namn: "Solinstrålning vid marken", var: "surface_downwelling_shortwave_flux_in_air", enh: "W/m²", klass: [50, 100, 200, 300, 400, 600], konv: v => v, iso: [200] },
  lw:     { g: "Strålning", namn: "Långvågig instrålning vid marken", var: "surface_downwelling_longwave_flux_in_air", enh: "W/m²", klass: [200, 240, 270, 300, 330, 360], konv: v => v, iso: [270] },
  olr:    { g: "Strålning", namn: "Utgående långvågig (som IR-satellit: lågt = höga kalla moln)", var: "toa_outgoing_longwave_flux", enh: "W/m²", klass: [240, 220, 200, 180, 160, 140], lagre: true, pal: PAL_MOLN.concat(["#1e293b"]), konv: v => v, iso: [180] },
};
const M0_S = 2;   // var 2:a ruta (5 km)
let M0F = { v: M0P[lasa("mt:m0Param")] ? lasa("mt:m0Param") : "nb", v2: M0P[lasa("mt:m0Linje")] ? lasa("mt:m0Linje") : "", t: null, data: null, data2: null, o: null,
            nyckel: "", nyckel2: "", hamtar: 0, dtg: null, nt: 0, t0: null, tryck: null };
const m0Cache = new Map();
const m0Farger = v => { const p = M0P[v].pal || PAL_SEK; return p.slice(Math.max(0, p.length - M0P[v].klass.length)); };

function m0Omrade() {   // hela den forhamtade rutan (samma som Favoriter), var 5 km; annars mitten av modellomradet
  const B = typeof SVIDX !== "undefined" && SVIDX && SVIDX.y0 !== undefined ? SVIDX : { y0: 0, y1: 856, x0: 280, x1: 800 };
  const s = M0_S, y1 = B.y0 + Math.floor((B.y1 - B.y0) / s) * s, x1 = B.x0 + Math.floor((B.x1 - B.x0) / s) * s;
  return { y0: B.y0, y1, x0: B.x0, x1, s, ny: (y1 - B.y0) / s + 1, nx: (x1 - B.x0) / s + 1 };
}
// 22/11: tid och parameter uppe till vanster i kartan (som i Sannolikhet)
function m0KartTid() {
  const e = $("kartTidM0"); if (!e) return; e.textContent = "";
  if (!M0F.t0) return;
  const d = new Date(M0F.t0 + M0F.t * 3600e3); e.textContent = VECKODAG[d.getUTCDay()] + " " + p2(d.getUTCHours()) + "Z (+" + M0F.t + ")";
  const sm = document.createElement("small"), P1 = M0P[M0F.v], P2 = M0F.v2 && M0P[M0F.v2];
  sm.textContent = (P1 ? P1.namn : "") + (P2 ? " · linjer: " + P2.namn : "") + " · medlem 0" + (M0F.dtg ? " · körning " + String(M0F.dtg).slice(9, 12) : "");
  e.appendChild(sm);
}
function m0TidText(t) { if (!M0F.t0) return "+" + t; const d = new Date(M0F.t0 + t * 3600e3); return VECKODAG[d.getUTCDay()] + " " + p2(d.getUTCDate()) + "/" + (d.getUTCMonth() + 1) + " " + p2(d.getUTCHours()) + "Z (+" + t + ")"; }
const m0Status = t => { $("m0Status").textContent = t || ""; };

// Senaste kompletta det-korningen (samma sok som tid-hojd) + tryckytornas varden (en gang)
async function m0Korning() {
  if (M0F.dtg && Date.now() - (M0F.koll || 0) < 10 * 60e3) return true;
  m0Status("Letar senaste körningen …");
  const vald = $("korning") && $("korning").value !== "senaste" ? $("korning").value : null;
  let k = null;
  if (vald) { const n = await antalTider(vald); if (n) k = { dtg: vald, nt: n }; }
  if (!k) k = await sokKorning();
  if (!k) { m0Status("Hittade ingen komplett körning."); return false; }
  if (k.dtg !== M0F.dtg) { M0F.dtg = k.dtg; M0F.nt = k.nt; M0F.t0 = dtgDatum(k.dtg).getTime(); M0F.data = M0F.data2 = null; M0F.nyckel = M0F.nyckel2 = ""; }
  M0F.koll = Date.now();
  if (!M0F.tryck) { try { const r = await hamta(BAS + FIL(M0F.dtg) + ".ascii?pressure"); if (r.st === 200) { const d = tolka(r.txt); M0F.tryck = d.pressure || null; } } catch (e) {} }
  if (M0F.t === null) M0F.t = Math.max(0, Math.min(M0F.nt - 1, Math.round((Date.now() - M0F.t0) / 3600e3)));
  return true;
}
function m0NivIndex(pa) {
  if (pa.niv === null) return null;
  if (typeof pa.niv === "string" && pa.niv[0] === "p") {   // tryckyta: index ur korningens tryckvarden (hPa eller Pa)
    const mal = +pa.niv.slice(1), T = M0F.tryck; if (!T) return -1;
    let b = -1, bd = Infinity; T.forEach((p, i) => { const h = p > 2000 ? p / 100 : p, d = Math.abs(h - mal); if (d < bd) { bd = d; b = i; } }); return bd < 5 ? b : -1;
  }
  return pa.niv === undefined ? 0 : pa.niv;
}
// Ett falt for en timme: Float32Array i visningsenheten
async function m0Falt(v, t) {
  const pa = M0P[v], o = m0Omrade(), nyckel = [M0F.dtg, v, t, o.y0, o.y1, o.x0, o.x1].join(":");
  if (m0Cache.has(nyckel)) return { d: m0Cache.get(nyckel), o, nyckel };
  const ni = m0NivIndex(pa); if (ni === -1) throw new Error("tryckytan finns inte");
  const rum = (ni === null ? "" : "[" + ni + "]") + "[" + o.y0 + ":" + o.s + ":" + o.y1 + "][" + o.x0 + ":" + o.s + ":" + o.x1 + "]", n = o.ny * o.nx;
  const hamtaVar = async (vn, ta, tb) => {   // binart (.dods), annars text
    const fraga = enc(vn + "[" + ta + ":1:" + tb + "]" + rum);
    let res = await hamta(BAS + FIL(M0F.dtg) + ".dods?" + fraga, true, true), raa = null;
    if (res.st === 200 && res.buf && typeof lasDods === "function") raa = lasDods(res.buf, n * (tb - ta + 1));
    if (!raa) { res = await hamta(BAS + FIL(M0F.dtg) + ".ascii?" + fraga); if (res.st !== 200) throw new Error("svar " + res.st); raa = tolka(res.txt)[vn]; }
    if (!raa || raa.length < n) throw new Error("oväntat svar"); return raa;
  };
  const d = new Float32Array(n);
  if (pa.diff) {   // ackumulerat -> mangd senaste timmen
    const ta = Math.max(0, t - 1), raa = await hamtaVar(pa.var, ta, t);
    for (let i = 0; i < n; i++) { const a = raa[i], b = raa[raa.length > n ? n + i : i]; d[i] = t === 0 ? 0 : isFinite(a) && isFinite(b) ? Math.max(0, pa.konv(b - a)) : NaN; }
  } else if (Array.isArray(pa.var)) {
    const L = []; for (const vn of pa.var) L.push(await hamtaVar(vn, t, t));
    for (let i = 0; i < n; i++) {
      if (pa.typ === "dagg") d[i] = daggpunkt(L[0][i] - 273.15, L[1][i] > 1.5 ? L[1][i] : L[1][i] * 100);
      else if (pa.typ === "rimfrost") d[i] = (L[0][i] - 273.15) - daggpunkt(L[1][i] - 273.15, L[2][i] > 1.5 ? L[2][i] : L[2][i] * 100);
      else d[i] = isFinite(L[0][i]) && isFinite(L[1][i]) ? pa.konv(Math.hypot(L[0][i], L[1][i])) : NaN;
    }
  } else { const raa = await hamtaVar(pa.var, t, t); for (let i = 0; i < n; i++) d[i] = isFinite(raa[i]) ? pa.konv(raa[i]) : NaN; }
  m0Cache.set(nyckel, d); if (m0Cache.size > 60) m0Cache.delete(m0Cache.keys().next().value);
  return { d, o, nyckel };
}

async function m0Uppdatera() {
  if (lage !== "m0") return;
  $("m0Param").value = M0F.v; $("m0Linjer").value = M0F.v2;
  if (!await m0Korning()) return;
  M0F.t = Math.max(0, Math.min(M0F.nt - 1, M0F.t)); $("m0Tid").textContent = m0TidText(M0F.t); m0KartTid(); $("m0Reglage").max = M0F.nt - 1; $("m0Reglage").value = M0F.t;
  $("m0Korn").textContent = M0F.dtg + " (MEPS medlem 0, det-körningen)";
  m0Forklaring();
  const t = M0F.t, hamtnr = ++M0F.hamtar;
  m0Status("Hämtar " + M0P[M0F.v].namn.toLowerCase() + (M0F.v2 ? " och " + M0P[M0F.v2].namn.toLowerCase() : "") + " …");
  try {
    const a = await m0Falt(M0F.v, t); if (hamtnr !== M0F.hamtar) return;
    M0F.data = a.d; M0F.o = a.o; M0F.nyckel = a.nyckel; m0Rita();
    if (M0F.v2) { const b = await m0Falt(M0F.v2, t); if (hamtnr !== M0F.hamtar) return; M0F.data2 = b.d; M0F.nyckel2 = b.nyckel; } else M0F.data2 = null;
    m0Rita(); m0Status("");
    // nasta timme i forvag (sa att stegning gar fort)
    if (t + 1 < M0F.nt) setTimeout(() => { if (hamtnr === M0F.hamtar) { m0Falt(M0F.v, t + 1).catch(() => {}); if (M0F.v2) m0Falt(M0F.v2, t + 1).catch(() => {}); } }, 300);
  } catch (e) { if (hamtnr === M0F.hamtar) m0Status("Kunde inte hämta (" + e.message + ")."); }
}
function m0Rita() {
  const g = $("kM0"); g.textContent = ""; const o = M0F.o, d = M0F.data; if (lage !== "m0" || !o || !d) return;
  const pa = M0P[M0F.v], K = pa.klass, F = m0Farger(M0F.v).map(c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
  const cv = document.createElement("canvas"); cv.width = o.nx; cv.height = o.ny;
  const cx = cv.getContext("2d"), img = cx.createImageData(o.nx, o.ny), px = img.data, stigande = K[K.length - 1] > K[0];
  for (let y = 0; y < o.ny; y++) for (let x = 0; x < o.nx; x++) {
    const w = d[y * o.nx + x]; if (!isFinite(w)) continue; let k = -1;
    for (let i = 0; i < K.length; i++) if (pa.lagre ? w < K[i] : w >= K[i]) k = i;
    if (k < 0) { if ((pa.pal === PAL_TEMP || pa.pal === PAL_TEMP1) && w < K[0]) k = 0; else continue; }
    const i = ((o.ny - 1 - y) * o.nx + x) * 4; px[i] = F[k][0]; px[i + 1] = F[k][1]; px[i + 2] = F[k][2]; px[i + 3] = 210;
  }
  cx.putImageData(img, 0, 0);
  g.appendChild(el("image", { href: skarpaRutor(cv), x: o.x0 - o.s / 2, y: KY - 1 - o.y1 - o.s / 2, width: o.nx * o.s, height: o.ny * o.s,
    preserveAspectRatio: "none", style: "image-rendering:pixelated;image-rendering:crisp-edges" }));
  // isolinjer fran det andra faltet
  if (M0F.v2 && M0F.data2) {
    const p2_ = M0P[M0F.v2], f2 = M0F.data2, oo = { ...o, ny: o.ny, nx: o.nx };
    let nivaer = p2_.iso || [];
    if (p2_.isoSteg) { let mn = Infinity, mx = -Infinity; for (const w of f2) if (isFinite(w)) { if (w < mn) mn = w; if (w > mx) mx = w; }
      nivaer = []; for (let v = Math.ceil(mn / p2_.isoSteg) * p2_.isoSteg; v <= mx; v += p2_.isoSteg) nivaer.push(v); }
    for (const nv of nivaer) {
      const dd = isoSegment(f2, oo, nv); if (!dd) continue;
      const tjock = nv === 0 && p2_.enh === "°C";
      g.appendChild(el("path", { d: dd, fill: "none", stroke: c_isoKant(), "stroke-width": tjock ? 5 : 3.6, "vector-effect": "non-scaling-stroke", "stroke-linecap": "round", opacity: 0.85 }));
      g.appendChild(el("path", { d: dd, fill: "none", stroke: tjock ? "#dc2626" : c_iso(), "stroke-width": tjock ? 2.4 : 1.4, "vector-effect": "non-scaling-stroke", "stroke-linecap": "round" }));
      isoEtiketter(g, dd, String(nv).replace(".", ","));
    }
  }
  g.appendChild(el("rect", { x: o.x0 - o.s / 2, y: KY - 1 - o.y1 - o.s / 2, width: o.nx * o.s, height: o.ny * o.s, fill: "none", stroke: "var(--dim)", "stroke-width": 1, "stroke-dasharray": "4 3", "vector-effect": "non-scaling-stroke" }));
  if (typeof ritaSiffror === "function") setTimeout(ritaSiffror, 0);
}
function m0Forklaring() {
  const f = $("m0Forkl"), pa = M0P[M0F.v], fa = m0Farger(M0F.v); f.textContent = "";
  pa.klass.forEach((k, i) => { const sp = document.createElement("span"), ii = document.createElement("i"); ii.style.background = fa[i];
    sp.append(ii, pa.tat && k % pa.tat ? "" : (pa.lagre ? "< " : "≥ ") + k.toLocaleString("sv-SE") + (pa.enh ? " " + pa.enh : "")); if (pa.tat) sp.className = "tat"; f.appendChild(sp); });
  if (M0F.v2) { const sp = document.createElement("span"); sp.textContent = "Linjer: " + M0P[M0F.v2].namn.toLowerCase() + (M0P[M0F.v2].enh ? " (" + M0P[M0F.v2].enh + ")" : ""); f.appendChild(sp); }
}
function m0Tips(e) {
  const o = M0F.o, d = M0F.data; if (!o || !d) return false;
  const p = kartPunkt(e), fy = KY - 1 - p.y, y = Math.round((fy - o.y0) / o.s), x = Math.round((p.x - o.x0) / o.s);
  if (y < 0 || y >= o.ny || x < 0 || x >= o.nx) return false;
  const fmt = (w, pa) => isFinite(w) ? (pa.enh === "ft" || pa.enh === "m" || Math.abs(w) >= 100 ? Math.round(w) : w.toFixed(1).replace(".", ",")) + (pa.enh ? " " + pa.enh : "") : "–";
  const i = y * o.nx + x, pa = M0P[M0F.v];
  let t = pa.namn + ": " + (isFinite(d[i]) ? fmt(d[i], pa) : M0F.v === "bas" ? "inga moln" : "–");
  if (M0F.v2 && M0F.data2) t += "\n" + M0P[M0F.v2].namn + ": " + fmt(M0F.data2[i], M0P[M0F.v2]);
  const ll = franRuta(o.x0 + x * o.s, o.y0 + y * o.s);
  visaKTips(t + "\nMedlem 0, " + m0TidText(M0F.t) + "\n" + ll.lat.toFixed(2) + "N " + ll.lon.toFixed(2) + "E", e.clientX + 14, e.clientY + 14);
  return true;
}
function m0Stega(d) { if (M0F.t === null) return; M0F.t = Math.max(0, Math.min(M0F.nt - 1, M0F.t + d)); m0Uppdatera(); }
function m0In() { m0Uppdatera(); }

(function m0Init() {
  const fyll = (sel, medIngen) => { if (medIngen) sel.add(new Option("– inga linjer –", ""));
    const grp = {}; for (const k in M0P) { const g = M0P[k].g; if (!grp[g]) { grp[g] = document.createElement("optgroup"); grp[g].label = g; sel.appendChild(grp[g]); }
      grp[g].appendChild(new Option(M0P[k].namn + (M0P[k].enh ? " (" + M0P[k].enh + ")" : ""), k)); } };
  fyll($("m0Param"), false); fyll($("m0Linjer"), true);
  $("m0Param").value = M0F.v; $("m0Linjer").value = M0F.v2;
  $("m0Param").addEventListener("change", () => { M0F.v = $("m0Param").value; lagra("mt:m0Param", M0F.v); m0Uppdatera(); });
  $("m0Linjer").addEventListener("change", () => { M0F.v2 = $("m0Linjer").value; lagra("mt:m0Linje", M0F.v2); m0Uppdatera(); });
  $("m0Bak").addEventListener("click", () => m0Stega(-1)); $("m0Fram").addEventListener("click", () => m0Stega(1));
  $("m0Nu").addEventListener("click", () => { if (M0F.t0) { M0F.t = Math.round((Date.now() - M0F.t0) / 3600e3); m0Stega(0); } });
  let tim = 0; $("m0Reglage").addEventListener("input", () => { M0F.t = +$("m0Reglage").value; $("m0Tid").textContent = m0TidText(M0F.t); m0KartTid(); clearTimeout(tim); tim = setTimeout(m0Uppdatera, 250); });
  document.addEventListener("keydown", ev => {
    if (lage !== "m0" || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const tag = (document.activeElement && document.activeElement.tagName) || ""; if (["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return;
    if (ev.key === "ArrowLeft") { ev.preventDefault(); m0Stega(-1); } else if (ev.key === "ArrowRight") { ev.preventDefault(); m0Stega(1); }
  });
  if (lage === "m0") m0Uppdatera();
})();
