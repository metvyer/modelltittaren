"use strict";
// ===================================================================
//  SANNOLIKHETSKARTOR FRAN MEPS-ENSEMBLEN (30 medlemmar)
//  Fil: meps_lagged_6_h_subset_2_5km_<DTG>.ncml, [tid=62][1][medlem=30][y][x]
//  Ett omrade kostar ungefar lika mycket servertid som en punkt (utsnittstest 16/11),
//  det som vaxer ar datamangden. Data sparas i webblasarens databas (IndexedDB): de tva senaste
//  korningarna, hogst 2 GB / 20 % av webblasarens utrymme (minst anvant tas bort forst).
// ===================================================================
const ENS_FIL = dtg => "meps_lagged_6_h_subset_2_5km_" + dtg + ".ncml";
const ENS_MEDL = 30, ENS_TIDER = 62, ENS_BIT = 13;
// NYTT 19/11 kvall (testkorning G): medlem 15-29 i en ensemblefil = medlem 0-14 i filen 3 h tidigare (samma
// ordning, samma varden vid samma giltighetstid). Bara 0-14 ar nya. Finns forra korningens omrade sparat
// hamtas darfor bara 0-14 (+ de medlemmar dar forra filen saknade data) och resten kopieras, forskjutet 3 h.
const ENS_NYA = 15, ENS_LAGG_H = 3;
const DET_FIL = dtg => "meps_det_2_5km_" + dtg + ".ncml";   // medlem 0:s sikt/molnbas (saknas i ensemblefilen)   // hogst 13 timmar per anrop (t.ex. +0 till +12) = 390 kartfalt
const ENS_GRANS_MB = 200;                            // hard grans per hamtning (21/11: 150 -> 200, hela forhamtade rutan behover ca 175)
const MAX_KM_25 = 400;                               // 2,5 km bara for omraden upp till 400 x 400 km
const AUTO_MAX_MB = 100;                             // automatisk hamtning vid stegning bara under detta
const ENS_MAX_MB_ANROP = { txt: 40, bin: 150 };      // hogst per anrop (thredds: text ca 50 MB, binart ca 500 MB)
const ENS_BYTE = { txt: 9, bin: 4 };                 // ungefar sa manga byte per varde
const ENS_MAX_VARDEN = 200e6;                        // hard sparr per hamtning (skyddar webblasaren och met.no)
let ensFormat = "bin";                               // binart (.dods) forst, text (.ascii) som reserv
// Parametrar. villkor ">=" eller "<". agg = hur timmarna i perioden slas ihop per medlem.
const PPARAM = {
  // Lagring: heltal (kod) * steg i visningsenheten. 8 bitar for byvind (1 kt, 0-254), annars 16 bitar.
  by:   { namn: "Byvind", var: "wind_speed_of_gust", enhet: "kt", konv: v => v * KT, villkor: "≥", agg: "max", std: 32, snabb: [25, 27, 32, 35, 45, 50], bitar: 8, steg: 1 },
  nb:   { namn: "Nederbörd, summa i perioden", var: "precipitation_amount_acc", enhet: "mm", konv: v => v, villkor: "≥", agg: "summa", std: 5, snabb: [1, 5, 10, 20, 40], bitar: 16, steg: 0.1 },
  sikt: { namn: "Sikt", var: "visibility_in_air", enhet: "m", konv: v => v, villkor: "<", agg: "min", std: 1500, snabb: [10000, 5000, 3000, 2000, 1500, 1000, 800, 500, 300, 100], bitar: 8,
          tabell: trappSkala([[0, 200, 10], [225, 500, 25], [550, 1000, 50], [1100, 5000, 100], [5200, 10000, 200], [11000, 75000, 1000]]) },
  bas:  { namn: "Molnbas", var: "cloud_base_altitude", enhet: "ft", konv: v => v * FOT, villkor: "<", agg: "min", std: 1000, snabb: [1500, 1000, 500, 400, 300, 200, 100], bitar: 8,
          tabell: trappSkala([[0, 200, 10], [250, 1000, 50], [1100, 5000, 100], [5500, 20000, 500], [25000, 25000, 1]]) },   // 25000 = "over 20 000 ft"
  // NYTT 20/11: fler falt ur ensemblefilen (meps_lagged_6_h_subset). Molnmangd i oktas (andel 0-1 -> x 8; skulle
  // met.no leverera procent raknas det om). Laga/medel/hoga = modellens egna molnslag (AROME-definition, ej kontrollerad).
  lag:   { namn: "Låga moln (modellens låga molnslag)", var: "low_type_cloud_area_fraction", enhet: "/8", konv: oktas, villkor: "≥", agg: "max", std: 5, snabb: [1, 3, 5, 7, 8], bitar: 8, steg: 0.1 },
  medel: { namn: "Medelhöga moln", var: "medium_type_cloud_area_fraction", enhet: "/8", konv: oktas, villkor: "≥", agg: "max", std: 5, snabb: [1, 3, 5, 7, 8], bitar: 8, steg: 0.1 },
  hog:   { namn: "Höga moln", var: "high_type_cloud_area_fraction", enhet: "/8", konv: oktas, villkor: "≥", agg: "max", std: 5, snabb: [1, 3, 5, 7, 8], bitar: 8, steg: 0.1 },
  tot:   { namn: "Total molnmängd", var: "cloud_area_fraction", enhet: "/8", konv: oktas, villkor: "≥", agg: "max", std: 7, snabb: [1, 3, 5, 7, 8], bitar: 8, steg: 0.1 },
  dimma: { namn: "Dimma (modellens dimandel)", var: "fog_area_fraction", enhet: "%", konv: v => Math.min(100, (v > 1.5 ? v : v * 100)), villkor: "≥", agg: "max", std: 50, snabb: [10, 30, 50, 70, 90], bitar: 8, steg: 1 },
  // 20/11 kvall (test P): 0-gradersnivan finns BARA for medlem 0 i ensemblefilen - sidan visar da medlem 0 automatiskt
  noll:  { namn: "0-gradersnivå", var: "altitude_of_0_degree_isotherm", enhet: "ft", konv: v => v * FOT, villkor: "<", agg: "min", std: 2000, snabb: [5000, 3000, 2000, 1000, 500], bitar: 8,
           tabell: trappSkala([[0, 1000, 50], [1100, 5000, 100], [5500, 15000, 500], [16000, 20000, 1000]]) },
  sno:   { namn: "Snöfall, summa i perioden (vatten)", var: "snowfall_amount_acc", enhet: "mm", konv: v => v, villkor: "≥", agg: "summa", std: 2, snabb: [0.5, 1, 2, 5, 10], bitar: 16, steg: 0.1 },
  // NYTT 20/11: medelvind 10 m (gitterriktad, m/s) - bara for riskpanelens sidvind, visas inte i parameterlistan
  u10:   { namn: "Vind 10 m (x)", var: "x_wind_10m", enhet: "m/s", konv: v => v, villkor: "≥", agg: "max", std: 0, snabb: [], bitar: 8, steg: 1, dold: true },
  v10:   { namn: "Vind 10 m (y)", var: "y_wind_10m", enhet: "m/s", konv: v => v, villkor: "≥", agg: "max", std: 0, snabb: [], bitar: 8, steg: 1, dold: true },
  // 20/11 kvall: yttemperatur (air_temperature_0m = modellens marktemperatur/hudtemperatur, alla 30 medlemmar enligt test P)
  t0:    { namn: "Yttemperatur (0 m)", var: "air_temperature_0m", enhet: "°C", konv: v => v - 273.15, villkor: "<", agg: "min", std: 0, snabb: [2, 0, -2, -5, -10], bitar: 8,
           tabell: trappSkala([[-50, 40, 1]]) },
  // 20/11 kvall (test P): havsytans temperatur heter SFX_SST (SURFEX), finns for alla 30 medlemmar; saknas over land
  sst:   { namn: "Havsytans temperatur", var: "SFX_SST", enhet: "°C", konv: v => v - 273.15, villkor: "≥", agg: "max", std: 6, snabb: [0, 2, 4, 6, 8, 10], bitar: 8,
           tabell: trappSkala([[-5, 35, 1]]) },
  t2:    { namn: "Temperatur 2 m", var: "air_temperature_2m", enhet: "°C", konv: v => v - 273.15, villkor: "<", agg: "min", std: 0, snabb: [5, 2, 0, -5, -10, -20], bitar: 8,
           tabell: trappSkala([[-50, 40, 1]]) },
  // 21/11 (matprov S): relativ fukt 2 m finns for alla 30 medlemmar - anvands for daggpunkten (rimfrost) i kombinationerna
  rh:    { namn: "Relativ fukt 2 m", var: "relative_humidity_2m", enhet: "%", konv: v => Math.min(100, v > 1.5 ? v : v * 100), villkor: "≥", agg: "max", std: 95, snabb: [70, 80, 90, 95, 100], bitar: 8, steg: 1 }
};
// NYTT 21/11 kvall: rutfargerna forstoras i canvasen (varje ruta = flera pixlar, utan utjamning) innan de blir
// <image> - Safari m.fl. struntar i image-rendering:pixelated pa SVG-bilder och suddar ut rutorna nar man zoomar.
function skarpaRutor(cv) {
  const f = Math.max(1, Math.min(8, Math.floor(2400 / Math.max(cv.width, cv.height)))); if (f === 1) return cv.toDataURL();
  const c2 = document.createElement("canvas"); c2.width = cv.width * f; c2.height = cv.height * f;
  const g = c2.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(cv, 0, 0, c2.width, c2.height); return c2.toDataURL();
}
function oktas(v) { return Math.min(8, (v > 1.5 ? v / 100 : v) * 8); }
// Olinjar skala for 1 byte (Jakobs forslag 16/11): fint steg dar trosklarna finns, grovt dar det inte spelar roll.
// [fran, till, steg] -> lista med alla tillatna varden. Koden ar platsen i listan.
function trappSkala(delar) { const ut = []; for (const [a, b, s] of delar) for (let v = a; v <= b + 1e-9; v += s) ut.push(Math.round(v)); return ut; }
// Kompakt lagring: varde i visningsenhet -> heltal. Hogsta koden betyder "saknas".
const SAKN = { 8: 255, 16: 65535 };
const nyKod = (pa, n) => pa.bitar === 8 ? new Uint8Array(n).fill(255) : new Uint16Array(n).fill(65535);
function koda(pa, ut, i, raa) {
  if (!isFinite(raa) && pa.saknasSom === undefined) return;   // fyllnadsvarde -> saknas (koden ar redan "saknas")
  const v = isFinite(raa) ? pa.konv(raa) : pa.saknasSom;
  if (pa.tabell) {   // narmast LAGRE varde i tabellen (binarsokning) – da blir "<" troskel exakt for trosklar som ligger i tabellen
    const T = pa.tabell; let lo = 0, hi = T.length - 1;
    if (v >= T[hi]) { ut[i] = hi; return; } if (v <= T[0]) { ut[i] = 0; return; }
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= v) lo = m; else hi = m; }
    ut[i] = lo; return;
  }
  const k = Math.round(v / pa.steg); ut[i] = Math.max(0, Math.min(SAKN[pa.bitar] - 1, k));
}
// Sannolikhetsklasser (%) och farger
const PKLASS = [[5, "#fde68a"], [10, "#fbbf24"], [30, "#f97316"], [50, "#dc2626"], [70, "#9f1239"], [90, "#581c87"]];
// NYTT 19/11: "Visa" = sannolikhet, eller sjalva vardet (medel / hogsta / lagsta av medlemmarna, eller en medlem).
// Vardet ar per medlem samma som anvands for sannolikheten: hogsta (byvind), summa (nederbord) eller lagsta
// (sikt, molnbas) i perioden. Fargklasser per parameter i visningsenheten; for sikt/bas ar LAGRE varre.
// 19/11 em: byvind och nederbord fick lagre klasser (blatt) - en dag med svag vind blev kartan annars tom i vardelaget.
const VKLASS = {
  by:   [10, 15, 20, 25, 32, 35, 45, 50],
  nb:   [0.1, 0.5, 1, 5, 10, 20, 40],
  sikt: [10000, 5000, 3000, 1500, 800, 300],
  bas:  [1500, 1000, 500, 300, 200, 100],
  t0: [5, 2, 0, -5, -10, -20],
  sst: [0, 2, 4, 6, 8, 10, 12, 15],
  lag: [1, 3, 5, 7], medel: [1, 3, 5, 7], hog: [1, 3, 5, 7], tot: [1, 3, 5, 7],
  dimma: [10, 30, 50, 70, 90],
  noll: [5000, 3000, 2000, 1000, 500],
  sno: [0.1, 0.5, 1, 2, 5, 10],
  t2: [5, 2, 0, -5, -10, -20],
};
const VFARG_ALLA = ["#dbeafe", "#93c5fd", "#fde68a", "#fbbf24", "#f97316", "#dc2626", "#9f1239", "#581c87"];
// 22/11: nederbord (och regn) i gront - ljust = lite, morkt = mycket, allra mest lila. Anvands aven av Karta m0.
const PAL_NB = ["#dcfce7", "#bbf7d0", "#86efac", "#22c55e", "#15803d", "#14532d", "#a21caf"];
// 22/11 kvall: snofall likadant men i blatt (ljust = lite, morkt = mycket, mest = lila)
const PAL_SNO = ["#e0f2fe", "#bae6fd", "#7dd3fc", "#38bdf8", "#0284c7", "#1e3a8a", "#a21caf"];
const VPAL = { nb: PAL_NB, sno: PAL_SNO };
const vfarg = v => { const p = VPAL[v] || VFARG_ALLA; return p.slice(Math.max(0, p.length - VKLASS[v].length)); };   // farger for parameterns klasser (de morkaste sist)
const visaLage = () => ($("pVisa") && $("pVisa").value) || "sannolikhet";
// NYTT 20/11 kvall: vilka medlemmar som raknas - alla 30, de 15 nya (0-14 = senaste korningen) eller de 15 gamla
// (15-29 = korningen 3 h tidigare). Galler kartan, tipsrutan, meteogrammet och riskpanelen.
const MEDL_URVAL = { alla: [...Array(30).keys()], nya: [...Array(15).keys()], gamla: [...Array(15).keys()].map(m => m + 15) };
const medlemmar = () => MEDL_URVAL[($("pMedl") && $("pMedl").value) || "alla"] || MEDL_URVAL.alla;
const iUrval = m => { const u = ($("pMedl") && $("pMedl").value) || "alla"; return u === "alla" || (u === "nya" ? m < 15 : m >= 15); };
// "medlem 7 i 12Z" - medlem m i den eftersläpande filen dtg: 0-14 = dtg, 15-29 = dtg - 3 h (medlem m-15)
// 20/11 sen kvall: utan klockslag (det forvaxlades med giltighetstiden) - bara medlem och vilken korning
function medlemText(m, dtg) { return "medlem " + m + (m >= 15 ? " (förra körningen)" : " (senaste körningen)"); }
// Varde i punkten p for vald visning, eller NaN
function visaVarde(agg, n, p, visa) {
  if (/^m\d+$/.test(visa)) return agg[+visa.slice(1) * n + p];
  let s = 0, c = 0, mx = -Infinity, mn = Infinity;
  for (let m = 0; m < ENS_MEDL; m++) { if (!iUrval(m)) continue; const w = agg[m * n + p]; if (!isFinite(w)) continue; s += w; c++; if (w > mx) mx = w; if (w < mn) mn = w; }
  if (!c) return NaN;
  return visa === "medel" ? s / c : visa === "max" ? mx : mn;
}
// Fargindex 0-5 for ett varde, -1 = ingen farg
function vardeKlass(v, w) {
  const K = VKLASS[v], lagreVarre = PPARAM[v].villkor === "<"; let k = -1;
  if (!isFinite(w)) return -1;
  for (let i = 0; i < K.length; i++) if (lagreVarre ? w < K[i] : w >= K[i]) k = i;
  return k;
}
const VISA_NAMN = { sannolikhet: "Sannolikhet", medel: "Medel av medlemmarna", max: "Högsta medlem", min: "Lägsta medlem" };
const visaNamn = vs => VISA_NAMN[vs] || "Medlem " + vs.slice(1);

// ---------- Databas (IndexedDB) med reserv i minnet ----------
const DB = (() => {
  const minne = new Map(); let dbp = null;
  const oppna = () => dbp || (dbp = new Promise((ok, fel) => {
    try {
      try { for (const g of ["modelltittaren", "modelltittaren-kod"]) indexedDB.deleteDatabase(g); } catch (e) {}   // aldre lagringsformat
      const r = indexedDB.open("modelltittaren-kod2", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("ens");
      r.onsuccess = () => ok(r.result); r.onerror = () => fel(r.error);
    } catch (e) { fel(e); }
  }));
  const tx = (mode, f) => oppna().then(db => new Promise((ok, fel) => {
    const t = db.transaction("ens", mode), req = f(t.objectStore("ens"));
    t.oncomplete = () => ok(req ? req.result : undefined); t.onerror = () => fel(t.error); t.onabort = () => fel(t.error);
  }));
  return {
    get: k => tx("readonly", s => s.get(k)).catch(() => minne.get(k)),
    put: (k, v) => tx("readwrite", s => s.put(v, k)).catch(() => { minne.set(k, v); }),
    del: k => tx("readwrite", s => s.delete(k)).catch(() => { minne.delete(k); })
  };
})();

// ---------- Tillstand ----------
let visaOmr = lasa("mt:visaOmr") !== "nej";   // ramar runt hamtade omraden
let visaIso = lasa("mt:visaIso") === "ja";
let visaM0Linje = lasa("mt:m0Linje") === "ja";   // 20/11 kvall: medlem 0:s troskellinje over sannolikhetsfaltet      // isolinjer (NYTT 19/11), av som standard
// Isolinjer: sannolikhet 30/70 %; vardelage: fasta nivaer per parameter + troskeln. Olika utseende per niva.
// 20/11 kvall: isolinjer i sannolikhetslaget valjs fritt bland 10-90 % (av/pa-knappar, sparas i mt:isoProb)
const ISO_PROB_ALLA = [10, 20, 30, 40, 50, 60, 70, 80, 90];
function isoProbVal() { try { const a = JSON.parse(lasa("mt:isoProb") || "null"); if (Array.isArray(a)) return a.filter(x => ISO_PROB_ALLA.includes(x)).sort((a, b) => a - b); } catch (e) {} return [30, 70]; }
function isoProbNivaer() {
  const val = isoProbVal();
  return val.map((x, i) => ({ v: x / 100, namn: x + " %", ...ISO_STIL[isoStilIndex(i, val.length)] }));
}
function ritaIsoProbKnappar() {
  const c = $("pIsoProb"); if (!c) return; c.textContent = ""; const val = isoProbVal();
  for (const x of ISO_PROB_ALLA) { const b = document.createElement("button"); b.textContent = x; b.setAttribute("aria-pressed", String(val.includes(x)));
    b.addEventListener("click", () => { const nu = isoProbVal(), i = nu.indexOf(x); if (i >= 0) nu.splice(i, 1); else nu.push(x); lagra("mt:isoProb", JSON.stringify(nu));
      if (nu.length && !visaIso) { visaIso = true; lagra("mt:visaIso", "ja"); $("visaIso").setAttribute("aria-pressed", "true"); }
      ritaIsoProbKnappar(); probVisa(); });
    c.append(b); }
  $("pIsoProbFalt").hidden = visaLage() !== "sannolikhet";
}
// 19/11 kvall (Jakob): fasta isolinjer aven for sikt (3/2/1 km) och molnbas (1200/400 ft). Grovre linje = varre.
const ISO_VARDE = { by: [{ v: 32, streck: "6 3", bredd: 1.9 }, { v: 45, streck: "", bredd: 2.6 }],
  sikt: [{ v: 3000, streck: "6 3", bredd: 1.5 }, { v: 2000, streck: "3 2", bredd: 2 }, { v: 1000, streck: "", bredd: 2.6 }],
  bas: [{ v: 1200, streck: "6 3", bredd: 1.9 }, { v: 400, streck: "", bredd: 2.6 }] };
const ISO_FARG = "#111827", ISO_TROSK = { streck: "1.5 3", bredd: 2.2 };
// Marching squares: linjesegment dar falt (ny x nx, rad 0 = sodra) passerar niva. Kartkoordinater via o.
function isoSegment(f, o, niva) {
  let d = "";
  const X = ix => o.x0 + ix * o.s, Y = iy => KY - 1 - (o.y0 + iy * o.s);
  const ip = (a, b) => (niva - a) / (b - a);
  for (let y = 0; y < o.ny - 1; y++) for (let x = 0; x < o.nx - 1; x++) {
    const a = f[y * o.nx + x], b = f[y * o.nx + x + 1], c = f[(y + 1) * o.nx + x + 1], e = f[(y + 1) * o.nx + x];
    if (!isFinite(a) || !isFinite(b) || !isFinite(c) || !isFinite(e)) continue;
    const k = (a >= niva ? 1 : 0) | (b >= niva ? 2 : 0) | (c >= niva ? 4 : 0) | (e >= niva ? 8 : 0);
    if (k === 0 || k === 15) continue;
    // kantpunkter: s = sodra (a-b), o = ostra (b-c), n = norra (e-c), v = vastra (a-e)
    const P_ = {
      s: () => [X(x + ip(a, b)), Y(y)], o: () => [X(x + 1), Y(y + ip(b, c))],
      n: () => [X(x + ip(e, c)), Y(y + 1)], v: () => [X(x), Y(y + ip(a, e))] };
    const par = { 1: ["s", "v"], 2: ["s", "o"], 3: ["v", "o"], 4: ["o", "n"], 5: ["s", "o", "n", "v"], 6: ["s", "n"], 7: ["v", "n"],
      8: ["v", "n"], 9: ["s", "n"], 10: ["s", "v", "o", "n"], 11: ["o", "n"], 12: ["v", "o"], 13: ["s", "o"], 14: ["s", "v"] }[k];
    for (let i = 0; i < par.length; i += 2) { const p1 = P_[par[i]](), p2 = P_[par[i + 1]]();
      d += "M" + p1[0].toFixed(2) + " " + p1[1].toFixed(2) + "L" + p2[0].toFixed(2) + " " + p2[1].toFixed(2); }
  }
  return d;
}
const P = { senast: null, ny: false, finns: new Set(), dtg: null, tid: [], omr: null, data: new Map(), index: [], upptagen: false, varden: null };
// index: [{ dtg, v, s, y0, y1, x0, x1, tider: [t...] }] – vilka omraden och timmar som finns sparade

// ---------- Lagring: de tva senaste korningarna, tak for disk och arbetsminne ----------
// Disk (IndexedDB): bara de SPARA_KORNINGAR senaste korningarna som har data (oavsett alder -
// vid avbrott raderas alltsa inget). Over taket tas det minst nyligen anvanda omradet bort.
// Taket = det lagsta av LAGER_MAX_MB och LAGER_ANDEL av det webblasaren tillater (annars LAGER_STD_MB).
// Arbetsminne: hogst MINNE_MAX_MB; det som slapps ligger kvar pa disken och lases in igen vid behov.
const SPARA_KORNINGAR = 2;
const LAGER_STD_MB = 500, LAGER_MAX_MB = 2048, LAGER_ANDEL = 0.2, MINNE_MAX_MB = 300;
let lagerTak = LAGER_STD_MB * 1048576;
async function bestamLagerTak() {
  try { const u = await navigator.storage.estimate(); if (u && u.quota > 0) lagerTak = Math.min(LAGER_MAX_MB * 1048576, u.quota * LAGER_ANDEL); } catch (e) {}
}
const storlekE = e => e.tider.length * ENS_MEDL * ((e.y1 - e.y0) / e.s + 1) * ((e.x1 - e.x0) / e.s + 1) * PPARAM[e.v].bitar / 8;
const lagerSumma = () => P.index.reduce((s, e) => s + storlekE(e), 0);
function taBortE(e) {
  for (const t of e.tider) { const k = nyckelE(e, t); DB.del(k); minneTaBort(k); }
  P.index = P.index.filter(x => x !== e);
}
// skydd = omradet som hamtas just nu (tas aldrig bort)
async function stadaLager(skydd) {
  const dtgs = [...new Set(P.index.map(e => e.dtg))].sort().reverse();
  const behall = new Set(dtgs.slice(0, SPARA_KORNINGAR)); if (P.dtg) behall.add(P.dtg);
  let andrat = false;
  for (const e of [...P.index]) if (!behall.has(e.dtg) && e !== skydd) { taBortE(e); andrat = true; }
  let sum = lagerSumma();
  while (sum > lagerTak) {
    const kand = P.index.filter(e => e !== skydd).sort((a, b) => (a.anv || 0) - (b.anv || 0));
    if (!kand.length) break;
    sum -= storlekE(kand[0]); taBortE(kand[0]); andrat = true;
  }
  if (andrat) await DB.put("index", P.index);
  visaLager();
}
function visaLager() {
  const el = $("pLager"); if (!el) return;
  const mb = lagerSumma() / 1048576;
  el.textContent = "Sparat i webbläsaren: " + (mb < 10 ? mb.toFixed(1) : Math.round(mb)) + " av " + Math.round(lagerTak / 1048576) +
    " MB. De två senaste körningarna sparas; blir det fullt tas det minst använda området bort först.";
}
// Arbetsminnet (P.data): senast anvant sist i ordningen, aldst slapps forst
let minneByte = 0;
function minneTaBort(k) { const a = P.data.get(k); if (a) { P.data.delete(k); minneByte -= a.byteLength; } }
function minneSatt(k, arr) {
  minneTaBort(k); P.data.set(k, arr); minneByte += arr.byteLength;
  for (const [k2, a2] of P.data) {
    if (minneByte <= MINNE_MAX_MB * 1048576) break;
    if (k2 === k) continue;
    P.data.delete(k2); minneByte -= a2.byteLength;
  }
}
function minneHamta(k) { const a = P.data.get(k); if (a) { P.data.delete(k); P.data.set(k, a); } return a; }

async function laddaIndex() {
  P.index = (await DB.get("index")) || [];
  await bestamLagerTak();
  await stadaLager(null);
}
const nyckelE = (e, t) => [e.dtg, e.v, e.s, e.y0, e.y1, e.x0, e.x1, t].join(":");
// 20/11 kvall: ett hamtat omrade med FINARE upplosning (t.ex. 5 km nar man ber om 10 km) duger ocksa - det
// som redan finns visas, och inget hamtas i onodan. Kraver att rutnaten ligger i fas (alltid med snappningen).
const innehaller = (e, o) => e.dtg === o.dtg && e.v === o.v && e.s <= o.s && o.s % e.s === 0 && (o.y0 - e.y0) % e.s === 0 && (o.x0 - e.x0) % e.s === 0 &&
  e.y0 <= o.y0 && e.y1 >= o.y1 && e.x0 <= o.x0 && e.x1 >= o.x1;

// ---------- Omrade ----------
// Omradet lasas till ett fast rutnat (index delbara med steget), sa att ett mindre omrade
// inuti ett hamtat alltid traffar samma punkter och kan visas utan ny hamtning.
// NYTT 20/11: "Sverige" = den forhamtade Sverigerutan (GitHub, se forhamta.py SV) - samma rektangel for alla
// 20/11: utokad till hela Ostersjon (soderut till ca 54° N, Finska viken). Rutan tas fran GitHubs index.json
// nar den finns (gamla korningar har den mindre rutan), annars SV_RUTA.
const SV_RUTA = { y0: 0, y1: 856, x0: 280, x1: 800 };   // 20/11 sen kvall: x0 312 -> 280 (ca 80 km vasterut, Skagen/Skagerrak)   // 20/11 kvall: till MEPS sydkant (~51° N), hela Finland, Baltikum
function svRektangel(s, B) { B = B || (SVIDX && SVIDX.y0 !== undefined ? SVIDX : SV_RUTA);
  return { y0: B.y0, y1: B.y0 + Math.floor((B.y1 - B.y0) / s) * s, x0: B.x0, x1: B.x0 + Math.floor((B.x1 - B.x0) / s) * s }; }
function berakna() {
  const lat = parseFloat($("lat").value.replace(",", ".")), lon = parseFloat($("lon").value.replace(",", "."));
  if ($("pStorlek").value === "sv") {
    const s = Math.max(2, +$("pUppl").value), r = svRektangel(s);
    return { v: P.vOverride || $("pParam").value, s, ...r, ny: (r.y1 - r.y0) / s + 1, nx: (r.x1 - r.x0) / s + 1, lat: isFinite(lat) ? lat : 62, lon: isFinite(lon) ? lon : 16 };
  }
  if (!isFinite(lat) || !isFinite(lon)) return null;
  const f = rutaF(lat, lon), s = +$("pUppl").value, halv = +$("pStorlek").value / 2 / 2.5;
  const fyll = (c, max) => { let a = Math.floor(Math.max(0, c - halv) / s) * s, b = a + Math.ceil(2 * halv / s) * s;
    while (b > max) b -= s; if (b - a < 2 * halv - s) a = Math.max(0, b - Math.ceil(2 * halv / s) * s); return [a, b]; };
  const [y0, y1] = fyll(f.fy, LCC.ny - 1), [x0, x1] = fyll(f.fx, LCC.nx - 1);
  if (y1 < y0 || x1 < x0) return null;
  return { v: P.vOverride || $("pParam").value, s, y0, y1, x0, x1, ny: (y1 - y0) / s + 1, nx: (x1 - x0) / s + 1, lat, lon };
}
function ritaOmrade() {
  const g = $("kOmr"); g.textContent = ""; if (lage !== "p") return;
  const o = berakna(); if (!o) return;
  const r = (e, stil) => g.appendChild(el("rect", { x: e.x0 - e.s / 2, y: KY - 1 - e.y1 - e.s / 2, width: e.x1 - e.x0 + e.s, height: e.y1 - e.y0 + e.s,
    fill: "none", "vector-effect": "non-scaling-stroke", style: stil }));
  // NYTT 19/11 natt: snabba omraden (i mellanserverns cache) - gronstreckade
  if (visaSnabb && P.dtg) { const sett = new Set();
    for (const rr of regOmr(P.dtg, o.v, o.s)) { const k = [rr.y0, rr.y1, rr.x0, rr.x1].join(":"); if (sett.has(k)) continue; sett.add(k);
      const t = el("rect", { x: rr.x0 - rr.s / 2, y: KY - 1 - rr.y1 - rr.s / 2, width: rr.x1 - rr.x0 + rr.s, height: rr.y1 - rr.y0 + rr.s, fill: "var(--mkhamt)", "fill-opacity": 0.13, stroke: "var(--mkhamt)", "stroke-width": 1.5, "vector-effect": "non-scaling-stroke" });
      const tt = el("title"); tt.textContent = "Snabbhämtat: finns i mellanserverns cache (" + PPARAM[o.v].namn.split(",")[0].toLowerCase() + ", " + (o.s * 2.5).toLocaleString("sv-SE") + " km)"; t.appendChild(tt); g.appendChild(t); } }
  // NYTT 20/11: Sverigeoversikten pa GitHub = alltid snabbt (gront) for byvind/sikt/molnbas, 5/10/20 km, +0..+36
  if (visaSnabb && P.dtg && SVIDX && SVIDX.dtg === P.dtg && SVIDX.v.includes(o.v) && o.s % SVIDX.s === 0) {
    const t = el("rect", { x: SVIDX.x0 - SVIDX.s / 2, y: KY - 1 - SVIDX.y1 - SVIDX.s / 2, width: SVIDX.x1 - SVIDX.x0 + SVIDX.s, height: SVIDX.y1 - SVIDX.y0 + SVIDX.s,
      fill: "var(--mkhamt)", "fill-opacity": 0.07, stroke: "var(--mkhamt)", "stroke-width": 1.5, "stroke-dasharray": "8 4", "vector-effect": "non-scaling-stroke" });
    const tt = el("title"); tt.textContent = "Förhämtat (GitHub): " + PPARAM[o.v].namn.split(",")[0].toLowerCase() + ", +0 till +" + Math.max(...SVIDX.tider) + " h, 5/10/20 km – laddas direkt utan met.no"; t.appendChild(tt); g.appendChild(t); }
  // sparade omraden for samma parameter och korning (tunt, prickat)
  if (visaOmr) for (const e of P.index) if (P.dtg && e.dtg === P.dtg && e.v === o.v) r(e, "stroke:var(--dim);stroke-width:1;stroke-dasharray:2 3");
  r(o, "stroke:var(--acc);stroke-width:2;stroke-dasharray:6 4");
  $("pOmrade").textContent = Math.round((o.y1 - o.y0) * 2.5 + o.s * 2.5) + " × " + Math.round((o.x1 - o.x0) * 2.5 + o.s * 2.5) + " km, " + o.ny * o.nx + " punkter (var " + (o.s * 2.5).toLocaleString("sv-SE") + " km), mitt " + o.lat.toFixed(2) + "N " + o.lon.toFixed(2) + "E";
}

// Zooma kartan sa att omradet syns med lite marginal (bara om det ar litet i bild eller utanfor)
function zoomaTillOmrade(o) {
  const w = (o.x1 - o.x0 + o.s) * 1.8, h = (o.y1 - o.y0 + o.s) * 1.8, cx = (o.x0 + o.x1) / 2, cy = KY - 1 - (o.y0 + o.y1) / 2;
  const asp = typeof kartAspekt === "function" ? kartAspekt() : KY / KX, bredd = Math.max(w, h / asp), utanfor = cx < vb.x || cx > vb.x + vb.w || cy < vb.y || cy > vb.y + vb.h;
  if (utanfor || bredd < vb.w * 0.5) satVb(cx - bredd / 2, cy - bredd * asp / 2, bredd);
}

// ---------- Korning ----------
// Senaste kompletta ensemblekorning (letar bakat var 3:e timme, slutar vid den senast kanda).
async function sokEnsKorning() {
  const d = new Date(); d.setUTCMinutes(0, 0, 0); d.setUTCHours(d.getUTCHours() - d.getUTCHours() % 3);
  let kontakt = false;
  for (let i = 0; i <= 6; i++) {
    const dtg = dtgText(new Date(d.getTime() - i * 3 * 3600e3));
    if (P.senast && dtgDatum(dtg) <= dtgDatum(P.senast)) return P.senast;
    status("Letar senaste ensemblekörning " + dtg + " …");
    if (await ensFinns(dtg)) { P.ny = !!P.senast; P.senast = dtg; lagra("mt:ensSenast", dtg); nyKorningInfo(); return dtg; }
    if (P.svar.st !== 0) kontakt = true;
    else if (!kontakt && i >= 1) break;   // tva forsok utan nagon kontakt alls -> servern nas inte, sluta leta
  }
  if (!P.senast && !kontakt) throw new Error(varforEj(""));
  return P.senast;
}
// Finns korningen komplett pa servern? Svaret sparas under besoket.
const ENS_KOLL_S = 12;
async function ensFinns(dtg) {
  if (P.finns.has(dtg)) return true;
  // 20/11 kvall: max 12 s - en korning som haller pa att skrivas kan fa thredds att tanka i over 100 s
  // (det kostade 1 min 50 s fore en hamtning 20/11 16:11). Inget svar = raknas som "finns inte an".
  const r = await hamta(BAS + ENS_FIL(dtg) + ".ascii?time", false, false, ENS_KOLL_S);
  const m = r.st === 200 ? r.txt.match(/\ntime\[(\d+)\]/) : null;
  P.svar = { st: r.st, n: m ? +m[1] : 0 };   // for felmeddelandet
  if (m && +m[1] >= ENS_TIDER) { P.finns.add(dtg); return true; }
  return false;
}
// Varfor en korning inte kunde anvandas, i klartext
function varforEj(dtg) {
  const s = P.svar || { st: 0, n: 0 };
  if (s.st === 0) return "Ingen kontakt med thredds.met.no (nätet, eller servern svarar inte just nu). Försök igen om en stund.";
  if (s.st === 200) return "Körningen " + dtg + " är inte klar än (" + s.n + " av " + ENS_TIDER + " timmar finns). Välj en tidigare körning eller vänta.";
  if (s.st === 404) return "Körningen " + dtg + " finns inte på servern (inte publicerad än, eller redan borttagen).";
  return "Körningen " + dtg + " gick inte att läsa (svar " + s.st + ").";
}
// Byter aktiv korning och behaller samma KLOCKSLAG for Fran/Till (inte samma prognostimme).
function bytKorning(nyDtg) {
  if (!nyDtg || nyDtg === P.dtg) { P.dtg = nyDtg || P.dtg; fyllTider(); return; }
  const gam = P.dtg, flytt = gam ? (dtgDatum(gam) - dtgDatum(nyDtg)) / 3600e3 : 0, kl = v => Math.max(0, Math.min(ENS_TIDER - 1, v + flytt));
  const a = +$("pFran").value + 0, b = +$("pTill").value + 0;
  P.dtg = nyDtg; fyllTider(); $("pFran").value = kl(a); $("pTill").value = kl(b);
}
// Korningslistan: "senaste" plus korningarna det senaste dygnet (var 3:e timme).
function korningsListaP() {
  const sel = $("pKorningVal"), val = sel.value || lasa("mt:pKorningVal") || "senaste";
  const d = new Date(); d.setUTCMinutes(0, 0, 0); d.setUTCHours(d.getUTCHours() - d.getUTCHours() % 3);
  sel.innerHTML = ""; sel.add(new Option("senaste", "senaste"));
  for (let i = 0; i <= 8; i++) { const s = dtgText(new Date(d.getTime() - i * 3 * 3600e3)); sel.add(new Option(s, s)); }
  sel.value = val; if (!sel.value) sel.value = "senaste";
}
// Vilken korning ska anvandas nu? (hamtar listan over korningar fran servern vid behov)
async function aktivKorning() {
  const val = $("pKorningVal").value;
  if (val === "senaste") { const s = await sokEnsKorning(); if (s) bytKorning(s); return s; }
  if (!await ensFinns(val)) throw new Error(varforEj(val));
  bytKorning(val); return val;
}
function tidText(t) {
  if (!P.dtg) return "+" + t;
  const d = new Date(dtgDatum(P.dtg).getTime() + t * 3600e3);
  return VECKODAG[d.getUTCDay()] + " " + p2(d.getUTCHours()) + "Z";   // 20/11 kvall: utan ledtid nar korningen ar kand
}
function fyllTider() {
  const f = $("pFran"), t = $("pTill"), fv = f.value, tv = t.value;
  f.innerHTML = ""; t.innerHTML = "";
  for (let i = 0; i < ENS_TIDER; i++) { f.add(new Option(tidText(i), i)); t.add(new Option(tidText(i), i)); }
  f.value = fv || "0"; t.value = tv || f.value;   // 21/11 natt: standard = en timme (perioden dras ut i tidslinjen)
  const k = $("pKorning"); k.textContent = P.dtg ? P.dtg + " (30 medlemmar, +0 till +" + (ENS_TIDER - 1) + " h) " : "–";
  if (P.dtg && $("pKorningVal").value !== "senaste") k.insertAdjacentHTML("beforeend", '<span class="vald">– vald körning</span>');
  else if (P.dtg && P.ny) k.insertAdjacentHTML("beforeend", '<span class="ny">– NY KÖRNING</span>');
}

// ---------- Hamta ----------
function saknadeTimmar(o, lista) {
  return lista.filter(t => !P.index.some(e => innehaller(e, { ...o, dtg: P.dtg }) && e.tider.includes(t)));
}
// Timmarna som anvands for perioden. Tidsupplosning 3 eller 6 h: bara timmar delbara med steget
// (00, 03, 06 ... UTC relativt korningen). Nederbord (summa) behover bara start och slut.
// 21/11 natt: vad "Hamta falt" hamtar - vald period, eller fler timmar framat fran periodens start (valet pHamtVal).
// Automatisk hamtning (nar man stegar/drar) hamtar bara det som behovs for perioden.
function hamtLista(auto) {
  const per = periodTimmar().lista, v = $("pHamtVal") ? $("pHamtVal").value : "per";
  if (auto || v === "per" || P.listaOverride) return per;
  let a = +$("pFran").value, b = +$("pTill").value; if (b < a) [a, b] = [b, a];
  const pa = PPARAM[$("pParam").value], dt = +$("pDt").value || 1;
  const fran = v === "alla" ? 0 : a, till = v === "alla" ? ENS_TIDER - 1 : Math.min(ENS_TIDER - 1, Math.max(b, a + +v));
  const ut = new Set(per); for (let t = pa.agg === "summa" ? Math.max(0, fran - 1) : fran; t <= till; t++) if (pa.agg === "summa" || t % dt === 0 || t === till) ut.add(t);
  return [...ut].sort((x, y) => x - y);
}
function periodTimmar() {
  let a = +$("pFran").value, b = +$("pTill").value; if (b < a) [a, b] = [b, a];
  if (P.listaOverride) return { a, b, fran: a, lista: P.listaOverride, dt: +$("pDt").value };   // 21/11: kombinationer (kombo.js)
  const pa = PPARAM[$("pParam").value], dt = +$("pDt").value;
  const fran = pa.agg === "summa" && a > 0 ? a - 1 : a;   // nederbord: summan = ack(b) - ack(a-1)
  let lista;
  if (pa.agg === "summa") lista = fran < b ? [fran, b] : [b];
  else { lista = []; for (let t = a; t <= b; t++) if (t % dt === 0) lista.push(t); if (!lista.length) lista = [a]; }
  return { a, b, fran, lista, dt };
}
// NYTT 19/11 kvall - FASTA BLOCK (delad cache i mellanservern):
//  * Omradet som hamtas "snapps" ut till jamna rutor om ENS_SNAPP gitterpunkter (i vald upplosning). Tva kolleger som
//    klickar nara varandra (inom ca 20 km vid 2,5 km) staller da exakt samma fraga -> Cloudflare svarar ur cachen.
//    Lite overhamtning (hogst ENS_SNAPP-1 punkter per sida), men aldrig fler anrop an forut.
//  * Tiden hamtas i fasta block +0-12, +12-24, +24-36 ... (13 timmar, var 3:e/6:e timme om det ar valt).
//    Nederbord behover bara start och slut och hamtas timme for timme.
//  * Medlemmarna hamtas i tva halvor: 0-14 och 15-29. Finns forra korningens data sparad (15-29 = 0-14 dar,
//    3 h forskjutet) hoppas andra halvan over.

// ===================================================================
//  REGISTRET - "snabbt i mellanserverns cache" (NYTT 19/11 natt)
//  Mellanservern bokfor varje lyckad hamtning fran thredds (D1 cachereg). Sidan laser listan och:
//   * visar omradena som gronstreckade rutor pa kartan (knappen Snabba),
//   * hamtar ALLA cachade omraden som overlappar ditt (exakt samma fraga -> svaret ur cachen, ingen thredds),
//     syr ihop dem till ditt omrade om de tacker det, annars visas de och knappen "Hamta resten" tar
//     hela ditt omrade fran thredds i ett anrop.
//  Medlem 15-29 kan ocksa komma ur forra korningens cachade medlem 0-14 (3 h forskjutet).
// ===================================================================
let REG = { t: 0, nyckel: "", rader: [] }, visaSnabb = lasa("mt:visaSnabb") !== "nej", visaRest = false;
async function hamtaRegister(tvinga) {
  if (!P.dtg) return [];
  const dtgF = dtgText(new Date(dtgDatum(P.dtg).getTime() - ENS_LAGG_H * 3600e3)), nyckel = P.dtg + "," + dtgF;
  if (!tvinga && REG.nyckel === nyckel && Date.now() - REG.t < 60e3) return REG.rader;
  // 21/11: max 10 s - svarar registret inte hoppar vi over snabbfasen i stallet for att vanta
  try { const c = new AbortController(), tm = setTimeout(() => c.abort(), 10000);
    const r = await fetch(REG_URL + "?dtg=" + nyckel, { cache: "no-store", signal: c.signal }); clearTimeout(tm); if (r.ok) REG = { t: Date.now(), nyckel, rader: await r.json() }; } catch (e) {}
  return REG.rader;
}
// cachade omraden for vald parameter/upplosning i korningen dtg (en rad per anrop)
function regOmr(dtg, v, sGrid) { const va = PPARAM[v].var; return REG.rader.filter(r => r.typ === "omr" && r.dtg === dtg && r.var === va && r.s === sGrid && /\.dods$/.test(r.fil)); }
const regDelar = new Map();   // fraga -> Promise<{rad, data: Map(t -> Float32Array [m][y][x] for m0..m1)}>
function hamtaRegRad(r) {
  const k = r.fil + r.fraga; if (regDelar.has(k)) return regDelar.get(k);
  const pr = (async () => {
    const nt = Math.floor((r.t1 - r.t0) / r.st) + 1, nm = r.m1 - r.m0 + 1, ny = (r.y1 - r.y0) / r.s + 1, nx = (r.x1 - r.x0) / r.s + 1, n = ny * nx;
    // 21/11: cachade bitar far max 20 s och byter aldrig vag - svarar de inte hamtas omradet som vanligt i stallet
    const res = await hamta(BAS + r.fil + r.fraga, false, true, 20);
    const v = res.st === 200 && res.buf ? lasDods(res.buf, nt * nm * n) : null; if (!v) return null;
    const data = new Map(); for (let k2 = 0; k2 < nt; k2++) data.set(r.t0 + k2 * r.st, v.subarray(k2 * nm * n, (k2 + 1) * nm * n));
    return { rad: r, data, cache: res.cache, kb: res.buf.byteLength / 1024 };
  })();
  regDelar.set(k, pr); pr.then(x => { if (!x) regDelar.delete(k); });
  return pr;
}
const overlappar = (a, b) => a.y0 <= b.y1 && b.y0 <= a.y1 && a.x0 <= b.x1 && b.x0 <= a.x1;
// Snabbfasen: returnerar { antal, tackt (0-1), kb } - antal cachade bitar som lades in
// 22/11: nedrakning medan cachen kollas - registret far max 10 s och varje cachad bit max 20 s, sa vi vet ett tak
function snabbTick() {
  const kvar = Math.max(0, Math.ceil((P.snabbSlut - Date.now()) / 1000));
  status("Kollar om området redan finns i mellanserverns cache" + (P.snabbN ? " – bit " + Math.min(P.snabbI, P.snabbN) + " av " + P.snabbN : " – registret") + " · högst " + kvar + " s kvar …");
}
async function snabbFas(o, oH, sakn, pa) {
  if (!visaSnabb || VAG !== "mellan" || !sakn.length) return { antal: 0, tackt: 0, kb: 0, traff: 0 };
  P.snabbN = 0; P.snabbI = 0; P.snabbSlut = Date.now() + 10000; snabbTick();
  const tick = setInterval(snabbTick, 1000);
  try { return await snabbFasInre(o, oH, sakn, pa); } finally { clearInterval(tick); P.snabbN = 0; }
}
async function snabbFasInre(o, oH, sakn, pa) {
  const ut = { antal: 0, tackt: 0, kb: 0, traff: 0 };
  await hamtaRegister(true);
  const dtgF = dtgText(new Date(dtgDatum(o.dtg).getTime() - ENS_LAGG_H * 3600e3)), ms = SAKN[pa.bitar];
  const nya = regOmr(o.dtg, o.v, o.s), gamla = regOmr(dtgF, o.v, o.s);
  // en "bit" = ett rektangel+tidsblock i nya korningen (medlemshalvorna slas ihop)
  const bitar = new Map();
  for (const r of nya) { if (!overlappar(r, oH) || !sakn.some(t => t >= r.t0 && t <= r.t1 && (t - r.t0) % r.st === 0)) continue;
    const k = [r.y0, r.y1, r.x0, r.x1, r.t0, r.t1, r.st].join(":"); if (!bitar.has(k)) bitar.set(k, []); bitar.get(k).push(r); }
  P.snabbN = bitar.size; P.snabbSlut = Date.now() + bitar.size * 20000;
  for (const [, rader] of bitar) {
    P.snabbI++; P.snabbSlut = Math.min(P.snabbSlut, Date.now() + (P.snabbN - P.snabbI + 1) * 20000);
    const b = rader[0], e0 = { dtg: o.dtg, v: o.v, s: o.s, y0: b.y0, y1: b.y1, x0: b.x0, x1: b.x1 };
    const ny = (b.y1 - b.y0) / b.s + 1, nx = (b.x1 - b.x0) / b.s + 1, n = ny * nx;
    if ((b.t1 - b.t0 + 1) * ENS_MEDL * n * ENS_BYTE[ensFormat] / 1048576 > ENS_GRANS_MB) continue;   // for stor bit
    const tider = []; for (let t = b.t0; t <= b.t1; t += b.st) if (!P.index.some(x => innehaller(x, { ...e0, ny, nx }) && x.tider.includes(t))) tider.push(t);
    if (!tider.length) continue;
    const delar = (await Promise.all(rader.map(hamtaRegRad))).filter(Boolean);
    // medlem m vid timme t: ur nya korningens rad, annars forra korningens medlem m-15 vid t+3 (samma rektangel)
    const kodat = new Map(); let komplett = true;
    for (const t of tider) {
      const arr = nyKod(pa, ENS_MEDL * n); kodat.set(t, arr);
      for (let m = 0; m < ENS_MEDL && komplett; m++) {
        let kalla = null, mi = 0;
        for (const d of delar) if (m >= d.rad.m0 && m <= d.rad.m1 && d.data.has(t)) { kalla = d.data.get(t); mi = m - d.rad.m0; break; }
        if (!kalla && m >= ENS_NYA) {
          const lokal = await timData({ ...e0, dtg: dtgF, ny, nx }, t + ENS_LAGG_H);
          if (lokal) { arr.set(lokal.subarray((m - ENS_NYA) * n, (m - ENS_NYA + 1) * n), m * n); continue; }
          const g = gamla.find(r => r.y0 === b.y0 && r.y1 === b.y1 && r.x0 === b.x0 && r.x1 === b.x1 && m - ENS_NYA >= r.m0 && m - ENS_NYA <= r.m1 && t + ENS_LAGG_H >= r.t0 && t + ENS_LAGG_H <= r.t1 && (t + ENS_LAGG_H - r.t0) % r.st === 0);
          const gd = g ? await hamtaRegRad(g) : null;
          if (gd && gd.data.has(t + ENS_LAGG_H)) { kalla = gd.data.get(t + ENS_LAGG_H); mi = m - ENS_NYA - g.m0; }
        }
        if (!kalla) { komplett = false; break; }
        for (let i = 0; i < n; i++) koda(pa, arr, m * n + i, kalla[mi * n + i]);
      }
      if (!komplett) break;
    }
    if (!komplett) continue;
    // medlem 0:s sikt/molnbas saknas i ensemblefilen -> samma det-fraga som den forsta hamtningen stallde (ligger i cachen)
    if (o.v === "sikt" || o.v === "bas") {
      let tom = true; for (const [, arr] of kodat) { for (let i = 0; i < n; i++) if (arr[i] !== ms) { tom = false; break; } if (!tom) break; }
      if (tom) try {
        const fr = enc(pa.var + "[" + b.t0 + ":" + b.st + ":" + b.t1 + "][0][" + b.y0 + ":" + b.s + ":" + b.y1 + "][" + b.x0 + ":" + b.s + ":" + b.x1 + "]");
        const nt = Math.floor((b.t1 - b.t0) / b.st) + 1, res = await hamta(BAS + DET_FIL(o.dtg) + ".dods?" + fr, false, true);
        const v = res.st === 200 && res.buf ? lasDods(res.buf, nt * n) : null;
        if (v) { ut.kb += res.buf.byteLength / 1024; for (const [t, arr] of kodat) { const k = (t - b.t0) / b.st; for (let i = 0; i < n; i++) koda(pa, arr, i, v[k * n + i]); } }
      } catch (x) {}
    }
    for (const d of delar) { ut.kb += d.kb; if (d.cache === "HIT") ut.traff++; }
    let e = P.index.find(x => x.dtg === o.dtg && x.v === o.v && x.s === o.s && x.y0 === b.y0 && x.y1 === b.y1 && x.x0 === b.x0 && x.x1 === b.x1);
    if (!e) { e = { ...e0, tider: [] }; P.index.push(e); }
    for (const [t, arr] of kodat) { await DB.put(nyckelE(e, t), arr); minneSatt(nyckelE(e, t), arr); if (!e.tider.includes(t)) e.tider.push(t); }
    e.anv = Date.now(); ut.antal++;
  }
  if (!ut.antal) return ut;
  // sy ihop till ditt (snappade) omrade for de timmar dar bitarna tacker allt
  const n = oH.ny * oH.nx; let fyllda = 0, mojliga = 0;
  let eH = P.index.find(x => x.dtg === o.dtg && x.v === o.v && x.s === o.s && x.y0 === oH.y0 && x.y1 === oH.y1 && x.x0 === oH.x0 && x.x1 === oH.x1);
  for (const t of sakn) {
    const arr = nyKod(pa, ENS_MEDL * n), fylld = new Uint8Array(n);
    for (const e of P.index) {
      if (e.dtg !== o.dtg || e.v !== o.v || e.s !== o.s || !e.tider.includes(t) || !overlappar(e, oH) || e === eH) continue;
      const eny = (e.y1 - e.y0) / e.s + 1, enx = (e.x1 - e.x0) / e.s + 1, d = await timData({ ...e, ny: eny, nx: enx }, t); if (!d) continue;
      const ya = Math.max(e.y0, oH.y0), yb = Math.min(e.y1, oH.y1), xa = Math.max(e.x0, oH.x0), xb = Math.min(e.x1, oH.x1);
      for (let y = ya; y <= yb; y += o.s) for (let x = xa; x <= xb; x += o.s) {
        const iH = ((y - oH.y0) / o.s) * oH.nx + (x - oH.x0) / o.s, iE = ((y - e.y0) / e.s) * enx + (x - e.x0) / e.s;
        if (fylld[iH]) continue; fylld[iH] = 1;
        for (let m = 0; m < ENS_MEDL; m++) arr[m * n + iH] = d[m * eny * enx + iE];
      }
    }
    let c = 0; for (let i = 0; i < n; i++) c += fylld[i]; fyllda += c; mojliga += n;
    if (c === n) { if (!eH) { eH = { dtg: o.dtg, v: o.v, s: o.s, y0: oH.y0, y1: oH.y1, x0: oH.x0, x1: oH.x1, tider: [] }; P.index.push(eH); }
      await DB.put(nyckelE(eH, t), arr); minneSatt(nyckelE(eH, t), arr); if (!eH.tider.includes(t)) eH.tider.push(t); }
  }
  ut.tackt = mojliga ? fyllda / mojliga : 0;
  await DB.put("index", P.index);
  return ut;
}

// ===================================================================
//  SVERIGEOVERSIKTEN fran GitHub (NYTT 20/11): forhamtat/ens/index.json + <DTG>/<v>_<t>.bin.gz
//  Byvind, sikt och molnbas, 5 km, +0..+36, alla 30 medlemmar, samma kodning som sidan. Ligger ditt
//  omrade inom Sverigerutan (och upplosningen ar 5, 10 eller 20 km) tas timmarna harifran - ingen thredds.
//  Hela Sverigerutan laggs in, sa kartan visar hela landet.
// ===================================================================
let SVIDX = null, SVT = 0;
async function svIndex() {
  if (SVIDX !== null && Date.now() - SVT < 300e3) return SVIDX;
  try { const r = await fetch("forhamtat/ens/index.json", { cache: "no-store" }); SVIDX = r.ok ? await r.json() : false; } catch (e) { SVIDX = false; }
  SVT = Date.now(); nyKorningInfo(); return SVIDX;
}
// NYTT 21/11: skylt nar en ny korning finns hos met.no men den forhamtade oversikten pa GitHub annu ar fran forra.
// Da hamtas nya korningens falt fran met.no (segare), och just medan korningen skrivs kan thredds hanga en stund.
function nyKorningInfo() {
  const e = $("nyKorning"); if (!e) return;
  const ny = P.senast, gh = SVIDX && SVIDX.dtg;
  if (!ny || !gh || dtgDatum(ny) <= dtgDatum(gh)) { e.hidden = true; return; }
  e.hidden = false;
  e.textContent = "Ny körning " + ny.slice(9, 12) + " har kommit hos met.no. Den förhämtade översikten (Favoriter, snabba Sverigefält) är från " + gh.slice(9, 12) +
    " och uppdateras nu på GitHub – det brukar ta 10–45 min. Under tiden hämtas nya körningens fält från met.no och kan gå segare; just när en körning skrivs kan thredds dessutom hänga en stund (sidan försöker då igen). Du kan välja körning " + gh.slice(9, 12) + " under Körning för att få det förhämtade direkt.";
}
setInterval(() => { if (SVIDX && P.senast && dtgDatum(P.senast) > dtgDatum(SVIDX.dtg)) { SVT = 0; svIndex(); } }, 120e3);   // titta efter ny GitHub-korning
async function svFil(dtg, v, t) {
  try { const r = await fetch("forhamtat/ens/" + dtg + "/" + v + "_" + t + ".bin.gz"); if (!r.ok) return null;
    const gz = await r.arrayBuffer(), ds = new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip"));
    const d = new Uint8Array(await new Response(ds).arrayBuffer()); d.gzKb = gz.byteLength / 1024; return d; } catch (e) { return null; }
}
async function svFas(o, sakn) {
  const idx = await svIndex(); if (!idx || idx.dtg !== o.dtg || !idx.v.includes(o.v) || o.s % idx.s) return { antal: 0 };
  const r = svRektangel(o.s, idx);
  // 20/11 kvall: som snabbfasen - overlappar omradet rutan bara delvis tas den delen harifran (andelen = tackt)
  if (o.y1 < r.y0 || o.y0 > r.y1 || o.x1 < r.x0 || o.x0 > r.x1) return { antal: 0 };
  const delvis = o.y0 < r.y0 || o.y1 > r.y1 || o.x0 < r.x0 || o.x1 > r.x1;
  const tackt = ((Math.min(o.y1, r.y1) - Math.max(o.y0, r.y0)) / o.s + 1) * ((Math.min(o.x1, r.x1) - Math.max(o.x0, r.x0)) / o.s + 1) / (o.ny * o.nx);
  const e0 = P.index.find(x => x.dtg === o.dtg && x.v === o.v && x.s === o.s && x.y0 === r.y0 && x.y1 === r.y1 && x.x0 === r.x0 && x.x1 === r.x1);
  const tider = sakn.filter(t => idx.tider.includes(t) && !(e0 && e0.tider.includes(t))); if (!tider.length) return { antal: 0, delvis, tackt };
  const k = o.s / idx.s, NY = (idx.y1 - idx.y0) / idx.s + 1, NX = (idx.x1 - idx.x0) / idx.s + 1, ny = (r.y1 - r.y0) / o.s + 1, nx = (r.x1 - r.x0) / o.s + 1;
  let e = P.index.find(x => x.dtg === o.dtg && x.v === o.v && x.s === o.s && x.y0 === r.y0 && x.y1 === r.y1 && x.x0 === r.x0 && x.x1 === r.x1);
  if (!e) { e = { dtg: o.dtg, v: o.v, s: o.s, ...r, tider: [] }; P.index.push(e); }
  let antal = 0, kb = 0;
  for (const t of tider) {
    status("Hämtar den förhämtade översikten från GitHub: +" + t + " h …");
    const d = await svFil(o.dtg, o.v, t); if (!d || d.length < ENS_MEDL * NY * NX) continue;
    kb += d.gzKb || 0;
    let arr = d;
    if (k > 1) { arr = new Uint8Array(ENS_MEDL * ny * nx);
      for (let m = 0; m < ENS_MEDL; m++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) arr[(m * ny + y) * nx + x] = d[(m * NY + y * k) * NX + x * k]; }
    else arr = d.subarray(0, ENS_MEDL * NY * NX);
    await DB.put(nyckelE(e, t), arr); minneSatt(nyckelE(e, t), arr); if (!e.tider.includes(t)) e.tider.push(t); antal++;
  }
  e.anv = Date.now(); await DB.put("index", P.index); await stadaLager(e);
  return { antal, kb, delvis, tackt };
}
// NYTT 20/11: autoladdning fran Sverigeoversikten (GitHub) nar kartan ar tom for vald period - inget fran met.no.
// Provas en gang per kombination (korning, parameter, omrade, upplosning, period).
let svAutoSenast = "", svAutoPagar = false;
async function svAuto() {
  if (lage !== "p" || P.upptagen || svAutoPagar) return;
  svAutoPagar = true;
  try {
    const idx = await svIndex(); if (!idx || !idx.v.includes($("pParam").value)) return;
    // nytt fonster/inkognito: ingen korning kand an -> leta senaste (ett litet anrop), sa Sverigeoversikten kan visas direkt
    if (!P.dtg && $("pKorningVal").value === "senaste") { try { await aktivKorning(); } catch (e) { return; } }
    if (!P.dtg || idx.dtg !== P.dtg) return;
    const o0 = berakna(); if (!o0) return;
    const o = { ...o0, dtg: P.dtg }, { lista } = periodTimmar(), nyckel = [o.dtg, o.v, o.s, o.y0, o.y1, o.x0, o.x1, lista.join(",")].join(":");
    if (nyckel === svAutoSenast) return; svAutoSenast = nyckel;
    const sakn = saknadeTimmar(o, lista); if (!sakn.length) return;
    const r = await svFas(o, sakn);
    if (r.antal) { await probVisa(); ritaOmrade(); status("Hämtat från den förhämtade översikten (GitHub) – " + r.antal + " timmar, " + Math.round(r.kb || 0) + " kB, inget från met.no." +
      (r.delvis ? " Den täcker " + Math.round(r.tackt * 100) + " % av ditt område – tryck Hämta fält för resten från met.no." : ""), ""); }
  } catch (e) {} finally { svAutoPagar = false; }
}
// ===================================================================
//  SIFFROR PA KARTAN (NYTT 20/11 kvall, inspiration: NinJo-bilden "Inspiration falt" i Drive)
//  Lage 0 = av, 1 = siffror ovanpa fargerna, 2 = bara siffror. Inzoomat star vardet i varje rutpunkt; langre ut
//  delas faltet i block och blockets extremvarde (max, eller min for "<"-parametrar) skrivs ut - sa syns
//  topparna alltid. Galler sannolikhetsfaltet (lage p) och kartfaltet for medlem 0 (tid-hojd).
// ===================================================================
let siffLage = +(lasa("mt:siffror") || 0) || 0;
const SIFF_NAMN = ["Siffror: av", "Siffror: på", "Bara siffror"], SIFF_PX = 24;
function sattSiffKnapp() { const k = $("siffror"); if (!k) return; k.textContent = SIFF_NAMN[siffLage]; k.setAttribute("aria-pressed", String(siffLage > 0)); $("karta").classList.toggle("baraSiffror", siffLage === 2); }
function ritaSiffror() {
  const g = $("kSiff"); if (!g) return; g.textContent = ""; if (!siffLage) return;
  let kallor = [];
  if (lage === "p") kallor = P.siffKalla || [];
  else if (lage === "m0" && typeof M0F !== "undefined" && M0F.o && M0F.data) kallor = [{ o: M0F.o, d: M0F.data, proc: false, lagre: !!M0P[M0F.v].lagre, enh: M0P[M0F.v].enh }];
  const rekt = $("karta").getBoundingClientRect(); if (!rekt.width) return;
  const ppu = rekt.width / vb.w, fs = 10.5 / ppu; let antal = 0;
  const fmt = (v, k) => k.proc ? String(Math.round(v * 100)) : (k.enh === "ft" || k.enh === "m" || Math.abs(v) >= 10) ? String(Math.round(v)) : v.toFixed(1).replace(".", ",");
  for (const k of kallor) {
    const o = k.o, d = k.d; if (!o || !d) continue;
    const steg = Math.max(1, Math.ceil(SIFF_PX / (o.s * ppu)));
    const yMin = Math.max(0, Math.floor((KY - 1 - (vb.y + vb.h) - o.y0) / o.s)), yMax = Math.min(o.ny - 1, Math.ceil((KY - 1 - vb.y - o.y0) / o.s));
    const xMin = Math.max(0, Math.floor((vb.x - o.x0) / o.s)), xMax = Math.min(o.nx - 1, Math.ceil((vb.x + vb.w - o.x0) / o.s));
    const by0 = Math.floor(yMin / steg) * steg, bx0 = Math.floor(xMin / steg) * steg;
    for (let by = by0; by <= yMax; by += steg) for (let bx = bx0; bx <= xMax; bx += steg) {
      let bi = -1, bv = NaN;
      for (let y = by; y < Math.min(o.ny, by + steg); y++) for (let x = bx; x < Math.min(o.nx, bx + steg); x++) {
        const v = d[y * o.nx + x]; if (!isFinite(v)) continue;
        if (bi < 0 || (k.lagre ? v < bv : v > bv)) { bi = y * o.nx + x; bv = v; } }
      if (bi < 0 || (k.proc && bv < 0.05)) continue;
      const y = Math.floor(bi / o.nx), x = bi % o.nx;
      g.appendChild(el("text", { x: o.x0 + x * o.s, y: KY - 1 - (o.y0 + y * o.s), "font-size": fs * (steg > 1 ? 1.1 : 1), "font-weight": steg > 1 ? 700 : 500, "text-anchor": "middle", "dominant-baseline": "central",
        fill: "#111827", stroke: "#ffffff", "stroke-width": fs / 3.5, "paint-order": "stroke", "pointer-events": "none" }, fmt(bv, k)));
      if (++antal > 4000) return;
    }
  }
}
const ENS_SNAPP = 8, ENS_TBLOCK = 12;
async function probHamta(auto, utanSnabb) {
  auto = auto === true; utanSnabb = utanSnabb === true;
  if (P.upptagen) return;
  const o0 = berakna(); if (!o0) { status("Klicka på kartan eller ange lat/lon för områdets mitt.", "fel"); return; }
  P.fragar = false; P.upptagen = true; stoppad = false; $("pHamta").disabled = true; $("pStopp").disabled = false;
  const t0 = performance.now(); let kb = 0; const tider = []; let cacheTraff = 0, anrop = 0;
  try {
    if (!await aktivKorning()) throw new Error("Hittade ingen komplett ensemblekörning de senaste 18 timmarna. Senaste försöket: " + varforEj(""));
    const o = { ...o0, dtg: P.dtg }; ritaOmrade(); if (!auto) zoomaTillOmrade(o);
    const pa = PPARAM[o.v], lista = hamtLista(auto); let sakn = saknadeTimmar(o, lista);
    // snappat hamtomrade
    const snapp = (a, b, max) => { const g = ENS_SNAPP * o.s, maxA = Math.floor(max / o.s) * o.s;
      let lo = Math.floor(a / g) * g, hi = Math.ceil((b + o.s) / g) * g - o.s; if (hi > maxA) hi = maxA; return [lo, hi]; };
    const [hy0, hy1] = snapp(o.y0, o.y1, LCC.ny - 1), [hx0, hx1] = snapp(o.x0, o.x1, LCC.nx - 1);
    const oH = { ...o, y0: hy0, y1: hy1, x0: hx0, x1: hx1, ny: (hy1 - hy0) / o.s + 1, nx: (hx1 - hx0) / o.s + 1 }, n = oH.ny * oH.nx;
    // Sverigeoversikten fran GitHub (forhamtad) - forst av allt
    if (sakn.length && pa.agg !== "summa") {
      const sv = await svFas(o, sakn);
      if (sv.antal) { sakn = saknadeTimmar(o, lista); kb += sv.kb; await probVisa(); ritaOmrade();
        if (!sakn.length) { status("Klart: från den förhämtade översikten (GitHub, " + sv.antal + " timmar, " + (sv.kb / 1024).toFixed(1) + " MB, " + ((performance.now() - t0) / 1000).toFixed(0) + " s) – ingen hämtning från met.no."); return; } }
      // 20/11 kvall: delvis utanfor rutan -> visa det som finns och fraga (som snabbfasen). Galler aven om
      // rutan redan var laddad (autoladdningen) - forsta trycket fragar, Hamta resten gar till met.no.
      if (sv.delvis && !utanSnabb && !P.vOverride && SVIDX && sakn.every(t => SVIDX.tider.includes(t))) {   // 22/11: inte under kombinationshamtning visaRest = true; $("pRest").hidden = false;
        status("Visar den förhämtade översikten (GitHub) – den täcker " + Math.round(sv.tackt * 100) + " % av ditt område. Flytta eller krympa ramen in i den gröna rutan, eller tryck Hämta resten för hela ditt område från met.no.", "");
        P.fragar = true; return; }
    }
    // snabbfasen: cachade omraden fran mellanservern (registret)
    if (!utanSnabb && sakn.length) {
      const sf = await snabbFas(o, oH, sakn, pa);
      // 22/11: tacker cachen nastan inget (0 %) eller hamtar vi en kombination (Favoriternas vinterknappar) - fraga inte, hamta vidare
      if (sf.antal && (P.vOverride || sf.tackt < 0.02)) { sakn = saknadeTimmar(o, lista); kb += sf.kb; }
      else if (sf.antal) {
        sakn = saknadeTimmar(o, lista); visaRest = sakn.length > 0; $("pRest").hidden = !visaRest;
        kb += sf.kb; await probVisa(); ritaOmrade();
        if (!sakn.length) { status("Klart: allt fanns i mellanserverns cache (" + sf.antal + " områden, " + (sf.kb / 1024).toFixed(1) + " MB, " + ((performance.now() - t0) / 1000).toFixed(0) + " s) – ingen hämtning från met.no."); return; }
        status("Visar snabbhämtade områden ur mellanserverns cache (" + sf.antal + " st) – de täcker " + Math.round(sf.tackt * 100) + " % av ditt område. Flytta eller krympa ramen in i det gröna, eller tryck Hämta resten för hela ditt område från met.no.", "");
        P.fragar = true; return;
      }
    }
    visaRest = false; $("pRest").hidden = true;
    // tidsblock
    const dt = +$("pDt").value || 1, block = new Map();
    for (const t of sakn) {
      if (pa.agg === "summa") { block.set("t" + t, [t, t, 1]); continue; }
      // block b = timmarna 12b..12b+12 (13 timmar - slutet delas med nasta block, sa att standardperioden +0..+12 ryms i ett)
      const st = t % dt === 0 ? dt : 1; let b = Math.floor(t / ENS_TBLOCK);
      if (t % ENS_TBLOCK === 0 && b > 0 && block.has((b - 1) + ":" + st)) b--;
      let a = b * ENS_TBLOCK; while (a % st) a++;
      let z = Math.min(b * ENS_TBLOCK + ENS_TBLOCK, ENS_TIDER - 1); while (z % st) z--;
      block.set(b + ":" + st, [a, z, st]);
    }
    const grupper = [...block.values()].sort((x, y) => x[0] - y[0]);
    const tim = g => { const u = []; for (let t = g[0]; t <= g[1]; t += g[2]) u.push(t); return u; };
    const antT = grupper.reduce((s_, g) => s_ + tim(g).length, 0);
    const antV = antT * ENS_MEDL * n, mb = antV * ENS_BYTE[ensFormat] / 1048576;
    if (antV > ENS_MAX_VARDEN) { status("För stort: " + Math.round(antV / 1e6) + " miljoner värden får inte plats i webbläsaren. Välj glesare upplösning, mindre område, kortare period eller var 3:e timme.", "fel"); P.fragar = true; return; }
    // Sparrar mot mycket stora uttag (skyddar met.no, mellanservern och webblasaren)
    if (o.s === 1 && Math.max(o.nx, o.ny) * 2.5 > MAX_KM_25 + 2.5) { status("2,5 km går bara för områden upp till " + MAX_KM_25 + " × " + MAX_KM_25 + " km. Välj 5 km eller ett mindre område.", "fel"); P.fragar = true; return; }
    if (mb > ENS_GRANS_MB) { status("För stort uttag: ca " + Math.round(mb) + " MB (gräns " + ENS_GRANS_MB + " MB per hämtning). Välj glesare upplösning, mindre område, kortare period eller var 3:e timme.", "fel"); P.fragar = true; return; }
    if (auto && mb > AUTO_MAX_MB) { status("Stort uttag (ca " + Math.round(mb) + " MB) hämtas inte automatiskt – tryck Hämta fält.", ""); P.fragar = true; return; }
    // forra korningen (3 h aldre) for medlem 15-29
    const dtgF = dtgText(new Date(dtgDatum(o.dtg).getTime() - ENS_LAGG_H * 3600e3)), oF = { ...oH, dtg: dtgF }, ms = SAKN[pa.bitar];
    const gamlaTimme = async t => {   // forra korningens data for timme t+3, eller null (saknas / medlem 0 tom)
      if (t + ENS_LAGG_H > ENS_TIDER - 1) return null; const d = await timData(oF, t + ENS_LAGG_H); if (!d) return null;
      for (let i = 0; i < n; i++) if (d[i] !== ms) return d; return null;
    };
    let e = P.index.find(x => x.dtg === o.dtg && x.v === o.v && x.s === o.s && x.y0 === oH.y0 && x.y1 === oH.y1 && x.x0 === oH.x0 && x.x1 === oH.x1);
    if (!e && grupper.length) { e = { dtg: o.dtg, v: o.v, s: o.s, y0: oH.y0, y1: oH.y1, x0: oH.x0, x1: oH.x1, tider: [] }; P.index.push(e); }
    let ateranvant = 0, detM0 = false;
    // ett anrop (eventuellt i rad-band) for timmarna i g och medlemmarna ma..mb, avkodat in i ut[k]
    const hamtaDel = async (g, ma, mb_, ut) => {
      const [g0, g1, st] = g, nt = (g1 - g0) / st + 1, nm = mb_ - ma + 1;
      const radPerBand = Math.max(1, Math.floor(ENS_MAX_MB_ANROP[ensFormat] * 1048576 / (nt * nm * oH.nx * ENS_BYTE[ensFormat])));
      for (let r0 = 0; r0 < oH.ny; r0 += radPerBand) {
        const r1 = Math.min(oH.ny - 1, r0 + radPerBand - 1), nb = r1 - r0 + 1;
        const fraga = enc(pa.var + "[" + g0 + ":" + st + ":" + g1 + "][0][" + ma + ":" + mb_ + "][" + (oH.y0 + r0 * o.s) + ":" + o.s + ":" + (oH.y0 + r1 * o.s) + "][" + oH.x0 + ":" + o.s + ":" + oH.x1 + "]");
        const behov = nt * nm * nb * oH.nx, t1 = performance.now();
        let v = null; anrop++;
        if (ensFormat === "bin") {
          const res = await hamta(BAS + ENS_FIL(o.dtg) + ".dods?" + fraga, false, true);
          if (res.st === 200 && res.buf) { v = lasDods(res.buf, behov); kb += res.buf.byteLength / 1024; if (res.cache === "HIT") cacheTraff++; }
          if (!v) { ensFormat = "txt"; status("Binärt format fungerade inte (svar " + res.st + ") – hämtar som text i stället …"); }
        }
        if (!v) {
          const res = await hamta(BAS + ENS_FIL(o.dtg) + ".ascii?" + fraga);
          if (res.st !== 200) throw new Error("Hämtningen av +" + g0 + " till +" + g1 + " h misslyckades (svar " + res.st + "). Tryck Hämta fält igen för att fortsätta.");
          kb += res.txt.length / 1024; v = tolka(res.txt)[pa.var];
          if (!v || v.length < behov) throw new Error("Oväntat svar från servern (för få värden).");
        }
        tider.push(((performance.now() - t1) / 1000).toFixed(0));
        for (let k = 0; k < nt; k++) for (let m = 0; m < nm; m++) for (let y = 0; y < nb; y++) {
          const fr = ((k * nm + m) * nb + y) * oH.nx, till = ((ma + m) * oH.ny + r0 + y) * oH.nx;
          for (let x = 0; x < oH.nx; x++) koda(pa, ut[k], till + x, v[fr + x]);
        }
      }
    };
    const totDelar = grupper.length;
    for (let gi = 0; gi < grupper.length; gi++) {
      const g = grupper[gi], [g0, g1, st] = g, nt = (g1 - g0) / st + 1;
      const gamla = []; for (let k = 0; k < nt; k++) gamla.push(await gamlaTimme(g0 + k * st));
      const nGamla = gamla.filter(Boolean).length;
      visaPForlopp(gi, totDelar, g0, g1, nt, nGamla === nt ? ENS_NYA : ENS_MEDL);
      const ut = []; for (let k = 0; k < nt; k++) ut.push(nyKod(pa, ENS_MEDL * n));
      await hamtaDel(g, 0, ENS_NYA - 1, ut);
      // medlem 15-29: kopiera dar forra korningen finns, hamta resten (sammanhangande delar av blocket)
      for (let k = 0; k < nt; k++) if (gamla[k]) { for (let m = ENS_NYA; m < ENS_MEDL; m++) ut[k].set(gamla[k].subarray((m - ENS_NYA) * n, (m - ENS_NYA + 1) * n), m * n); ateranvant++; }
      for (let k = 0; k < nt; ) { if (gamla[k]) { k++; continue; } let k2 = k; while (k2 + 1 < nt && !gamla[k2 + 1]) k2++;
        if (nGamla === 0) { await hamtaDel(g, ENS_NYA, ENS_MEDL - 1, ut); break; }
        const del = [], sub = [g0 + k * st, g0 + k2 * st, st]; for (let q = k; q <= k2; q++) del.push(nyKod(pa, ENS_MEDL * n));
        await hamtaDel(sub, ENS_NYA, ENS_MEDL - 1, del);
        for (let q = k; q <= k2; q++) ut[q].set(del[q - k].subarray(ENS_NYA * n), ENS_NYA * n);
        k = k2 + 1; }
      // medlem 0:s sikt/molnbas ur det-filen (saknas i ensemblefilen)
      if (o.v === "sikt" || o.v === "bas") {
        let tom = true;
        for (let k = 0; k < nt && tom; k++) for (let i = 0; i < n; i++) if (ut[k][i] !== ms) { tom = false; break; }
        if (tom) try {
          const fr = enc(pa.var + "[" + g0 + ":" + st + ":" + g1 + "][0][" + oH.y0 + ":" + o.s + ":" + oH.y1 + "][" + oH.x0 + ":" + o.s + ":" + oH.x1 + "]");
          const res = await hamta(BAS + DET_FIL(o.dtg) + ".dods?" + fr, false, true);
          const v = res.st === 200 && res.buf ? lasDods(res.buf, nt * n) : null;
          if (v) { kb += res.buf.byteLength / 1024; detM0 = true; for (let k = 0; k < nt; k++) for (let i = 0; i < n; i++) koda(pa, ut[k], i, v[k * n + i]); }
        } catch (x) { if (stoppad) throw x; }
      }
      for (let k = 0; k < nt; k++) {
        const t = g0 + k * st, arr = ut[k];
        await DB.put(nyckelE(e, t), arr); minneSatt(nyckelE(e, t), arr); e.anv = Date.now();
        if (!e.tider.includes(t)) e.tider.push(t);
      }
      await DB.put("index", P.index);
      await stadaLager(e);
      await probVisa();
    }
    const tot = ((performance.now() - t0) / 1000).toFixed(0);
    status(tider.length ? "Klart: " + tot + " s, " + anrop + " anrop (" + tider.join(", ") + " s), " + (kb / 1024).toFixed(1) + " MB " + (ensFormat === "bin" ? "binärt" : "text") + "." +
      (cacheTraff ? " " + cacheTraff + " av " + anrop + " anrop fanns redan i mellanserverns cache (någon annan hade hämtat samma)." : "") +
      (ateranvant ? " För " + ateranvant + " timmar togs medlem 15–29 från körningen " + dtgF + " (redan sparad)." : "") +
      (detM0 ? " Medlem 0:s " + pa.namn.split(",")[0].toLowerCase() + " togs ur det-filen (saknas i ensemblefilen)." : "") : "Klart: allt fanns redan sparat (" + tot + " s).");
  } catch (err) {
    status(stoppad || err.message === "stoppad" ? "Stoppad – det som hunnit hämtas visas." : err.message, stoppad ? "" : "fel");
    if (!stoppad) P.fragar = true;   // felmeddelandet ska synas tills nagot andras
  } finally {
    P.upptagen = false; P.autoVantar = false; $("pHamta").disabled = false; $("pStopp").disabled = true; $("pForlopp").hidden = true; ritaOmrade(); await probVisa();
    setTimeout(async () => { await hamtaRegister(true); ritaOmrade(); }, 4000);   // det nyss hamtade blir gront
    if (P.autoIgen) { P.autoIgen = false; autoHamta(); }
  }
}
// Laser forsta arrayen i ett DAP2-binarsvar (.dods): DDS-text, "Data:\n", sedan XDR:
// tva 32-bitars langder och darefter flyttalen (32 bitar, storsta byte forst). Kartvektorerna efter hoppas over.
// Returnerar Float32Array (NaN = fyllnadsvarde) eller null om svaret inte ser ut som vantat.
function lasDods(buf, behov) {
  const b = new Uint8Array(buf), mark = [10, 68, 97, 116, 97, 58, 10];   // "\nData:\n"
  let p = -1;
  for (let i = 0; i + 7 <= Math.min(b.length, 200000); i++) { let ok = true; for (let k = 0; k < 7; k++) if (b[i + k] !== mark[k]) { ok = false; break; } if (ok) { p = i + 7; break; } }
  if (p < 0 || p + 8 > b.length) return null;
  const dds = new TextDecoder().decode(b.subarray(0, p));
  if (!/Float32\s+\w+\[/.test(dds)) return null;   // vi forvantar oss 32-bitars flyttal
  const dv = new DataView(buf), n = dv.getUint32(p, false);
  if (n !== dv.getUint32(p + 4, false) || n < behov || p + 8 + n * 4 > b.length) return null;
  const ut = new Float32Array(n);
  for (let i = 0, q = p + 8; i < n; i++, q += 4) { const v = dv.getFloat32(q, false); ut[i] = Math.abs(v) > 9e35 ? NaN : v; }
  return ut;
}
function visaPForlopp(i, n, g0, g1, antal, nm) {
  nm = nm || ENS_MEDL;
  $("pForlopp").hidden = false; const st = $("pStapel"); st.textContent = "";
  for (let k = 0; k < n; k++) { const d = document.createElement("div"); if (k < i) d.className = "klar"; else if (k === i) d.className = "aktiv"; st.append(d); }
  $("pForloppText").textContent = "Anrop " + (i + 1) + " av " + n + ": +" + g0 + " till +" + g1 + " h (" + antal * nm + " kartfält" + (nm < ENS_MEDL ? ", " + nm + " av " + ENS_MEDL + " medlemmar – resten från förra körningen" : "") + ")";
}

// ---------- Berakna och visa ----------
// Hamtar timme t for omradet o ur ett sparat (eventuellt storre) omrade. Returnerar Float32Array [medlem][y][x] eller null.
async function timData(o, t) {
  const e = P.index.find(x => innehaller(x, o) && x.tider.includes(t)); if (!e) return null;
  const k = nyckelE(e, t); let arr = minneHamta(k);
  if (!arr) { arr = await DB.get(k); if (!arr) return null; minneSatt(k, arr); }
  e.anv = Date.now();
  if (e.y0 === o.y0 && e.x0 === o.x0 && e.y1 === o.y1 && e.x1 === o.x1) return arr;
  const eny = (e.y1 - e.y0) / e.s + 1, enx = (e.x1 - e.x0) / e.s + 1, dy = (o.y0 - e.y0) / e.s, dx = (o.x0 - e.x0) / e.s;
  const kk = (o.s || e.s) / e.s;   // 22/11: finare sparat rutnat (t.ex. 5 km) an fragat (10 km) - ta var k:e ruta (forut antogs k = 1)
  const ut = new arr.constructor(ENS_MEDL * o.ny * o.nx);
  for (let m = 0; m < ENS_MEDL; m++) for (let y = 0; y < o.ny; y++) for (let x = 0; x < o.nx; x++)
    ut[(m * o.ny + y) * o.nx + x] = arr[(m * eny + y * kk + dy) * enx + x * kk + dx];
  return ut;
}
// Beraknar sannolikheten for ett sparat omrade e (pa dess eget rutnat). null om nagon timme saknas.
async function beraknaOmrade(e, pa, a, b, fran, trosk, lista) {
  const o = { ...e, ny: (e.y1 - e.y0) / e.s + 1, nx: (e.x1 - e.x0) / e.s + 1 }, n = o.ny * o.nx;
  const agg = new Float32Array(ENS_MEDL * n).fill(pa.agg === "max" ? -Infinity : pa.agg === "min" ? Infinity : NaN);
  if (pa.agg === "summa") {
    if (!e.tider.includes(b) || (fran < b && !e.tider.includes(fran))) return null;
    const ab = await timData(o, b), aa = fran < b ? await timData(o, fran) : null; if (!ab) return null;
    const ms = SAKN[pa.bitar];
    for (let i = 0; i < agg.length; i++) { if (ab[i] === ms || (aa && aa[i] === ms)) continue;
      agg[i] = Math.max(0, ab[i] - (aa ? aa[i] : 0)) * pa.steg; }   // ackumulerat: slut minus start
  } else {
    for (const t of lista) if (!e.tider.includes(t)) return null;
    for (const t of lista) {
      const d = await timData(o, t); if (!d) return null;
      const ms = SAKN[pa.bitar];
      const T = pa.tabell;
      for (let i = 0; i < agg.length; i++) { const k = d[i]; if (k === ms) continue; const w = T ? T[k] : k * pa.steg;
        if (pa.agg === "max" ? w > agg[i] : w < agg[i]) agg[i] = w; }
    }
  }
  // NYTT 19/11 kvall: medlem helt utan data i omradet och perioden (t.ex. medlem 0 for sikt och molnbas -
  // met.no levererar dem forst i nasta fil) raknas inte. Kravet att minst 80 % av de ovriga har data gor att
  // en molnfri period (molnbas saknas for nastan alla) inte tolkas som "data saknas".
  const harData = []; for (let m = 0; m < ENS_MEDL; m++) { let h = false; for (let p = 0; p < n; p++) if (isFinite(agg[m * n + p])) { h = true; break; } harData.push(h); }
  const antHar = harData.filter(Boolean).length, utan = antHar >= 0.8 * (ENS_MEDL - 1) ? harData.map((h, m) => h ? -1 : m).filter(m => m >= 0) : [];
  const ute = new Set(utan); for (let m = 0; m < ENS_MEDL; m++) if (!iUrval(m)) ute.add(m);   // 20/11 kvall: medlemsurval
  const nAnv = ENS_MEDL - ute.size;
  const prob = new Float32Array(n), ok = w => pa.villkor === "≥" ? w >= trosk : w < trosk;
  for (let p = 0; p < n; p++) { let c = 0; for (let m = 0; m < ENS_MEDL; m++) { if (ute.has(m)) continue; const w = agg[m * n + p]; if (isFinite(w) && ok(w)) c++; } prob[p] = c / nAnv; }
  return { o, agg, prob, utan, nAnv };
}
// Visar ALLA sparade omraden for vald parameter och korning som har hela perioden.
// Grovt rutnat ritas forst, finare ovanpa. Ramen visar vad som hamtas vid nasta Hamta fält.
// ---------- Tidslinje under kartan ----------
// En ruta per timme (+0 till +61). Farg = hamtad for omradet och parametern, ram = vald period,
// tjock vanstergrans = nytt dygn (00 UTC). Klick flyttar perioden sa att den borjar dar.
// NYTT 20/11 kvall: vald tid/period tydligt pa kartan (alltid, aven innan nagot ar hamtat)
function ritaKartTid() {
  const e = $("kartTid"); if (!e) return;
  let a = +$("pFran").value, b = +$("pTill").value; if (b < a) [a, b] = [b, a];
  if (!isFinite(a) || !P.dtg) { e.textContent = ""; return; }
  const v = $("pParam").value, pa = PPARAM[v], visa = visaLage(), d = t => new Date(dtgDatum(P.dtg).getTime() + t * 3600e3);
  const da = d(a), db = d(b), samma = da.getUTCDate() === db.getUTCDate();
  const huvud = a === b ? tidText(a) : tidText(a) + " – " + (samma ? p2(db.getUTCHours()) + "Z" : tidText(b));
  const vad = pa.namn.split(",")[0].split(" (")[0] + (visa === "sannolikhet" ? " " + pa.villkor + " " + $("pTrosk").value + " " + pa.enhet + (a === b ? "" : pa.agg === "summa" ? ", summa" : ", någon gång") : ", " + visaNamn(visa).toLowerCase());
  e.textContent = huvud; const sm = document.createElement("small"); sm.textContent = vad + " · körning " + P.dtg.slice(9, 12); e.appendChild(sm);
}
function ritaTidslinje() {
  ritaKartTid();
  const el = $("tidslinje"), et = $("tidsEtiketter"); if (!el) return;
  const o = berakna(); let a = +$("pFran").value, b = +$("pTill").value; if (b < a) [a, b] = [b, a];
  // vald tid/period skriven ovanfor markeringen
  const tv = $("tidsVald");
  if (tv) { tv.textContent = ""; if (P.dtg) { const sp = document.createElement("span"); sp.style.left = ((a + b + 1) / 2 / ENS_TIDER * 100) + "%";
    sp.textContent = a === b ? tidText(a) : tidText(a) + " – " + p2(new Date(dtgDatum(P.dtg).getTime() + b * 3600e3).getUTCHours()) + "Z";
    tv.appendChild(sp); requestAnimationFrame(() => { const r = sp.getBoundingClientRect(), R = tv.getBoundingClientRect(); if (r.left < R.left) sp.style.transform = "translateX(" + (-50 + (R.left - r.left) / r.width * 100) + "%)"; else if (r.right > R.right) sp.style.transform = "translateX(" + (-50 - (r.right - R.right) / r.width * 100) + "%)"; }); } }
  const har = new Set();
  if (o && P.dtg) for (const e of P.index) if (innehaller(e, { ...o, dtg: P.dtg })) e.tider.forEach(t => har.add(t));
  const bas = P.dtg ? dtgDatum(P.dtg).getTime() : null;
  el.textContent = ""; et.textContent = "";
  for (let t = 0; t < ENS_TIDER; t++) {
    const sp = document.createElement("span"); sp.dataset.t = t; sp.title = tidText(t) + (har.has(t) ? " – hämtad" : " – ej hämtad");
    if (har.has(t)) sp.classList.add("har");
    if (t >= a && t <= b) sp.classList.add("per");
    if (t === a) sp.classList.add("ka"); if (t === b) sp.classList.add("kb");   /* 21/11 natt: handtag */
    if (bas !== null) {
      const d = new Date(bas + t * 3600e3);
      if (t > 0 && d.getUTCHours() === 0) sp.classList.add("dygn");
      // forsta etiketten bara om nasta dygnsgrans ar en bit bort (annars krockar texterna)
      if ((t === 0 && d.getUTCHours() <= 16) || (t > 0 && d.getUTCHours() === 0)) {
        const l = document.createElement("span"); l.style.left = (t / ENS_TIDER * 100) + "%";
        l.textContent = VECKODAG[d.getUTCDay()] + (t === 0 ? " " + p2(d.getUTCHours()) + "Z" : ""); et.append(l);
      } else if (d.getUTCHours() === 12 && t > 3) {   // 20/11 kvall: "12" mitt pa dygnet
        const l = document.createElement("span"); l.className = "tim"; l.style.left = (t / ENS_TIDER * 100) + "%"; l.textContent = "12Z"; et.append(l);
      }
    }
    el.append(sp);
  }
}
// 21/11 natt (Jakob): perioden valjs i tidslinjen. Klick pa en timme = bara den timmen. Dra = perioden dras ut
// fran timmen man borjade pa (at bada hall). Tar man i periodens kant (handtagen) flyttas bara den kanten.
let tlDrag = null;
function tidslinjeTimme(ev) {
  const el = $("tidslinje"), r = el.getBoundingClientRect();
  return Math.max(0, Math.min(ENS_TIDER - 1, Math.floor((ev.clientX - r.left) / r.width * ENS_TIDER)));
}
function tidslinjeSatt(a, b, klar) {
  if (b < a) [a, b] = [b, a]; if (+$("pFran").value === a && +$("pTill").value === b && !klar) return;
  $("pFran").value = a; $("pTill").value = b;
  if (klar) { probVisa(); autoHamta(); } else { ritaTidslinje(); }
}
function tidslinjeNer(ev) {
  if (ev.button !== undefined && ev.button !== 0) return;
  const t = tidslinjeTimme(ev); let a = +$("pFran").value, b = +$("pTill").value; if (b < a) [a, b] = [b, a];
  // ankaret = den ande som ligger still
  let ankare;
  if (a !== b && t === a) ankare = b; else if (a !== b && t === b) ankare = a; else ankare = t;
  tlDrag = { ankare, start: t, flyttad: false };
  $("tidslinje").setPointerCapture && $("tidslinje").setPointerCapture(ev.pointerId);
  if (ankare === t) tidslinjeSatt(t, t, false);
  ev.preventDefault();
}
function tidslinjeDra(ev) { if (!tlDrag) return; const t = tidslinjeTimme(ev); if (t !== tlDrag.start) tlDrag.flyttad = true; tidslinjeSatt(tlDrag.ankare, t, false); }
function tidslinjeUpp(ev) { if (!tlDrag) return; const t = tidslinjeTimme(ev); const d = tlDrag; tlDrag = null; tidslinjeSatt(d.ankare, d.flyttad || d.ankare !== d.start ? t : d.start, true); }

// NYTT 22/11: skylt i kartan nar faltet ar inlast men inget nar troskeln/farggransen (annars ser kartan ut som om inget hamtats)
function kartTomSkylt(text) { const e = $("kartTom"); if (!e) return; e.textContent = text || ""; e.hidden = !text; }
const tomVarde = (w, pa) => (pa.enhet === "m" || pa.enhet === "ft" ? Math.round(w) : Math.round(w * 10) / 10).toLocaleString("sv-SE") + " " + pa.enhet;
async function probVisa() {
  const g = $("kProb"); ritaPForklaring(); ritaTidslinje(); kartTomSkylt("");
  // meteogrammet foljer med: annan parameter/korning -> hamta om, annars rita om (period, troskel)
  if (P.meteo) { if (P.meteo.v !== $("pParam").value || P.meteo.dtg !== P.dtg) visaMeteogram(); else ritaMeteogram(); }
  const rensa = () => { g.textContent = ""; P.varden = null; $("pSam").textContent = ""; };
  if (lage !== "p" || !P.dtg) { rensa(); if (lage === "p") svAuto(); return; }
  if (typeof komboAktiv === "function" && komboAktiv()) return komboVisa(g, rensa);   // 21/11: kombinerad sannolikhet
  const v = $("pParam").value, pa = PPARAM[v], { a, b, fran, lista, dt } = periodTimmar(), trosk = parseFloat($("pTrosk").value.replace(",", "."));
  if (!isFinite(trosk)) { rensa(); return; }
  const kand = P.index.filter(e => e.dtg === P.dtg && e.v === v).sort((x, y) => y.s - x.s);
  const vis = []; let pmax = 0;
  for (const e of kand) { const r = await beraknaOmrade(e, pa, a, b, fran, trosk, lista); if (r) vis.push(r); }
  // 20/11 kvall: har bara medlem 0 varden (ovriga saknas) -> visa medlem 0 i stallet for sannolikhet
  if (!probVisa.inre) P.m0Auto = false;
  if (vis.length && visaLage() === "sannolikhet") { const u = new Set(vis.flatMap(r => r.utan || [])); if (u.size >= ENS_MEDL - 1 && !u.has(0)) {
    $("pVisa").value = "m0"; P.m0Auto = true; probVisa.inre = true; try { return await probVisa(); } finally { probVisa.inre = false; } } }
  // Under automatisk hamtning vid stegning visas den gamla bilden tills den nya perioden finns.
  if (!vis.length && (P.upptagen || P.autoVantar)) return;
  rensa();
  // Varje omrade ritas som EN bild (en pixel per punkt) i stallet for tusentals rutor –
  // annars blir kartan seg att zooma och dra med stora omraden.
  const rgb = PKLASS.map(([gr, c]) => [gr, parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
  const vrgb = vfarg($("pParam").value).map(c => [0, parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
  const visa = visaLage(); let vext = null, ritade = 0;   // varde-lage: extremvardet i bilden (for sammanfattningen); ritade = antal fargade rutor
  for (const r of vis) {
    const { o, prob } = r, n = o.ny * o.nx;
    const cv = document.createElement("canvas"); cv.width = o.nx; cv.height = o.ny;
    const cx = cv.getContext("2d"), img = cx.createImageData(o.nx, o.ny), px = img.data;
    if (visa !== "sannolikhet") r.val = new Float32Array(n);
    for (let y = 0; y < o.ny; y++) for (let x = 0; x < o.nx; x++) {
      const p = prob[y * o.nx + x]; if (p > pmax) pmax = p;
      let f;
      if (visa === "sannolikhet") { const pr = p * 100; if (pr < rgb[0][0]) continue; f = rgb[0]; for (const k of rgb) if (pr >= k[0]) f = k; }
      else {
        const w = visaVarde(r.agg, n, y * o.nx + x, visa); r.val[y * o.nx + x] = w;
        if (isFinite(w) && (vext === null || (pa.villkor === "<" ? w < vext : w > vext))) vext = w;
        const k = vardeKlass(v, w); if (k < 0) continue; f = vrgb[k];
      }
      const i = ((o.ny - 1 - y) * o.nx + x) * 4;   // bildens rad 0 = norra kanten
      px[i] = f[1]; px[i + 1] = f[2]; px[i + 2] = f[3]; px[i + 3] = 255; ritade++;
    }
    cx.putImageData(img, 0, 0);
    g.appendChild(el("image", { href: skarpaRutor(cv), x: o.x0 - o.s / 2, y: KY - 1 - o.y1 - o.s / 2, width: o.nx * o.s, height: o.ny * o.s,
      preserveAspectRatio: "none", style: "image-rendering:pixelated;image-rendering:crisp-edges" }));
  }
  if (vis.length && !ritade) {
    // extremvardet i nagon medlem (hela perioden) - visar hur langt fran troskeln faltet ligger
    let ext = null; const lag = pa.villkor === "<";
    for (const r of vis) for (const w of r.agg) if (isFinite(w) && (ext === null || (lag ? w < ext : w > ext))) ext = w;
    const pn = pa.namn.split(",")[0].toLowerCase();
    kartTomSkylt(visa === "sannolikhet"
      ? "Fältet är inläst – ingen ruta når " + PKLASS[0][0] + " % för " + pn + " " + pa.villkor + " " + trosk.toLocaleString("sv-SE") + " " + pa.enhet + ". Högsta sannolikhet " + Math.round(pmax * 100) + " %" +
        (ext !== null ? ", " + (lag ? "lägsta" : "högsta") + " " + pn + " i någon medlem " + tomVarde(ext, pa) : "") + ". Prova en " + (lag ? "högre" : "lägre") + " tröskel."
      : "Fältet är inläst – inga värden i färgskalan för " + pn + "." + (vext !== null ? " " + (lag ? "Lägsta" : "Högsta") + ": " + tomVarde(vext, pa) + "." : ""));
  }
  // NYTT 20/11 kvall: medlem 0:s linje for troskeln ovanpa sannolikheten (bla) - ligger den langt fran de roda
  // omradena skiljer sig medlem 0 fran ensemblen
  if (visaM0Linje && visa === "sannolikhet" && isFinite(trosk)) for (const r of vis) {
    const n = r.o.ny * r.o.nx, f0 = r.agg.subarray(0, n); if (!f0.some(isFinite)) continue;
    const d = isoSegment(f0, r.o, trosk); if (!d) continue;
    g.appendChild(el("path", { d, fill: "none", stroke: "#ffffff", "stroke-width": 5, "vector-effect": "non-scaling-stroke", "stroke-linecap": "round", opacity: 0.8 }));
    g.appendChild(el("path", { d, fill: "none", stroke: "#1d4ed8", "stroke-width": 2.6, "vector-effect": "non-scaling-stroke", "stroke-linecap": "round" }));
    isoEtiketter(g, d, "m0");
  }
  // NYTT 20/11 kvall: kalla for siffrorna pa kartan (sannolikhet i %, annars vardet)
  P.siffKalla = vis.map(r => ({ o: r.o, d: visa === "sannolikhet" ? r.prob : r.val, proc: visa === "sannolikhet", lagre: visa !== "sannolikhet" && pa.villkor === "<", enh: visa === "sannolikhet" ? "%" : pa.enhet }));
  setTimeout(ritaSiffror, 0);
  // isolinjer ovanpa fargerna
  if (visaIso) for (const r of vis) {
    const nivaer = visa === "sannolikhet" ? isoProbNivaer().map(n => ({ ...n, f: r.prob }))
      : [...isoNivaerVarde(v).map(n => ({ ...n, f: r.val })), ...(isFinite(trosk) && !isoValen(v).includes(trosk) ? [{ v: trosk, ...ISO_TROSK, f: r.val }] : [])];
    for (const n of nivaer) {
      // sikt/bas: lagre ar varre -> linjen ar densamma, nivan ar bara ett varde
      const d = isoSegment(n.f, r.o, n.v); if (!d) continue;
      // NYTT 20/11: tydligare - ljus kant under linjen, sedan linjen, sedan vardet utskrivet pa linjen
      g.appendChild(el("path", { d, fill: "none", stroke: c_isoKant(), "stroke-width": n.bredd + 2.6, "vector-effect": "non-scaling-stroke", "stroke-linecap": "round", opacity: 0.85 }));
      g.appendChild(el("path", { d, fill: "none", stroke: c_iso(), "stroke-width": n.bredd + 0.4, "stroke-dasharray": n.streck, "vector-effect": "non-scaling-stroke", "stroke-linecap": n.streck ? "butt" : "round" }));
      isoEtiketter(g, d, n.namn ? n.namn.replace(" %", "") : String(n.v).replace(".", ","));
    }
  }
  P.varden = vis.length ? { vis: vis.slice().reverse(), pa, visa } : null;   // finast forst for hovring
  const o0 = berakna(), aktuell = o0 && vis.some(r => innehaller(r.o, { ...o0, dtg: P.dtg }));
  if (!vis.length) { svAuto();
    if (fav) { const mx = SVIDX && SVIDX.tider ? Math.max(...SVIDX.tider) : 36; status(b > mx ? "Förhämtat finns till +" + mx + " h – välj en tidigare period (eller använd fliken Sannolikhet)." : "Laddar från den förhämtade översikten …", ""); return; }
    if (!P.upptagen && !P.fragar) status(kand.length ? "Perioden är inte hämtad – tryck Hämta fält." : "Inget hämtat för " + pa.namn.split(",")[0].toLowerCase() + " i den här körningen – tryck Hämta fält.", ""); return; }
  const utan = [...new Set(vis.flatMap(r => r.utan || []))].sort((x, y) => x - y);
  if (P.m0Auto) setTimeout(() => { const e = $("pStatus"); if (e && !/bara medlem 0/.test(e.textContent)) e.textContent += " Parametern har bara värden för medlem 0 – visar medlem 0."; }, 0);
  const utanText = utan.length ? " " + (utan.length === 1 ? "Medlem " + utan[0] + " saknar" : "Medlemmarna " + utan.join(", ") + " saknar") + " " + pa.namn.split(",")[0].toLowerCase() + " i datat och räknas inte (" + (ENS_MEDL - utan.length) + " medlemmar)." : "";
  if (/^m\d+$/.test(visa) && utan.includes(+visa.slice(1))) {
    $("pSam").textContent = "Medlem " + visa.slice(1) + " saknar " + pa.namn.split(",")[0].toLowerCase() + " i datat för den här körningen – kartan blir tom. (met.no levererar sikt och molnbas för den nyaste medlemmen 0 först i nästa körning, där den heter medlem 15.)";
    return;
  }
  if (visa !== "sannolikhet") {
    const aggT = { max: "högsta", min: "lägsta", summa: "summa" }[pa.agg];
    $("pSam").textContent = visaNamn(visa) + ": " + pa.namn.split(",")[0].toLowerCase() + ", " + aggT + " i perioden " + tidText(a) + " – " + tidText(b) +
      (pa.agg !== "summa" && dt > 1 && b > a ? " (var " + dt + ":e timme)" : "") + ". " + (pa.villkor === "<" ? "Lägsta" : "Högsta") + " värde i bilden: " +
      (vext === null ? "–" : (pa.enhet === "m" || pa.enhet === "ft" ? Math.round(vext) : vext.toFixed(1)).toLocaleString("sv-SE") + " " + pa.enhet) + "." + (aktuell ? "" : " Ramen är inte hämtad med vald upplösning – tryck Hämta fält.") + utanText;
    return;
  }
  $("pSam").textContent = pa.namn + " " + pa.villkor + " " + trosk.toLocaleString("sv-SE") + " " + pa.enhet + (pa.agg === "summa" ? "" : " någon gång") + " " + tidText(a) + " – " + tidText(b) + (pa.agg !== "summa" && dt > 1 && b > a ? " (var " + dt + ":e timme)" : "") +
    ". Högsta sannolikhet: " + Math.round(pmax * 100) + " %." + (aktuell ? "" : " Ramen (ditt valda område) är inte hämtad med vald upplösning – tryck Hämta fält.") + utanText;
}

const c_iso = () => (matchMedia("(prefers-color-scheme: dark)").matches ? "#f3f4f6" : ISO_FARG);
const c_isoKant = () => (matchMedia("(prefers-color-scheme: dark)").matches ? "#111827" : "#ffffff");
// NYTT 20/11: vardet skrivet pa isolinjen, glest (minst en sjattedels kartbredd mellan etiketterna).
// Textstorleken foljer kartans zoom (skalaIsoEtiketter anropas fran satVb i index.html).
const isoFs = () => (typeof vb !== "undefined" ? vb.w : 949) / 62;   // 22/11: mindre (var /45)
function isoEtiketter(g, d, text) {
  const seg = [...d.matchAll(/M([-\d.]+) ([-\d.]+)L([-\d.]+) ([-\d.]+)/g)].map(m => [(+m[1] + +m[3]) / 2, (+m[2] + +m[4]) / 2]);
  const avst = (typeof vb !== "undefined" ? vb.w : 949) / 3.5, satta = [];   // 22/11: glesare (var /6)
  for (let i = 0; i < seg.length && satta.length < 40; i += 3) { const [x, y] = seg[i];
    if (satta.some(([a, b]) => Math.hypot(a - x, b - y) < avst)) continue; satta.push([x, y]);
    g.appendChild(el("text", { x, y, class: "isoEtikett", "font-size": isoFs(), "font-weight": 700, "text-anchor": "middle", "dominant-baseline": "central",
      fill: c_iso(), stroke: c_isoKant(), "stroke-width": isoFs() / 4, "paint-order": "stroke" }, text)); }
}
function skalaIsoEtiketter() { const fs = isoFs(); document.querySelectorAll(".isoEtikett").forEach(t => { t.setAttribute("font-size", fs); t.setAttribute("stroke-width", fs / 4); }); }
// liten linjebild for forklaringen
function isoForkl(f, streck, bredd, text) {
  const sp = document.createElement("span"), sv = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  sv.setAttribute("width", 26); sv.setAttribute("height", 10); sv.style.verticalAlign = "middle"; sv.style.marginRight = "4px";
  const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
  for (const [k, w] of Object.entries({ x1: 1, x2: 25, y1: 5, y2: 5, stroke: c_iso(), "stroke-width": bredd, "stroke-dasharray": streck })) l.setAttribute(k, w);
  sv.append(l); sp.append(sv, text); f.append(sp);
}
function ritaIsoForkl(f) {
  if (!visaIso) return;
  const v = $("pParam").value, pa = PPARAM[v], tr = parseFloat($("pTrosk").value.replace(",", "."));
  if (visaLage() === "sannolikhet") for (const n of isoProbNivaer()) isoForkl(f, n.streck, n.bredd, "isolinje " + n.namn);
  else { for (const n of isoNivaerVarde(v)) isoForkl(f, n.streck, n.bredd, n.v.toLocaleString("sv-SE") + " " + pa.enhet);
    if (isFinite(tr) && !isoValen(v).includes(tr)) isoForkl(f, ISO_TROSK.streck, ISO_TROSK.bredd, "egen " + tr.toLocaleString("sv-SE") + " " + pa.enhet); }
}
function ritaPForklaring() {
  const f = $("pForkl"); f.textContent = ""; ritaIsoForkl(f);
  if (visaM0Linje && visaLage() === "sannolikhet") { const sp = document.createElement("span"); sp.innerHTML = '<svg width="26" height="10" style="vertical-align:middle;margin-right:4px"><line x1="1" x2="25" y1="5" y2="5" stroke="#1d4ed8" stroke-width="2.6"/></svg>medlem 0 vid tröskeln'; f.append(sp); }
  if (visaLage() !== "sannolikhet") {
    const v = $("pParam").value, pa = PPARAM[v], K = VKLASS[v], lv = pa.villkor === "<";
    const ft = w => w.toLocaleString("sv-SE");
    K.forEach((g, i) => { const n = K[i + 1], sp = document.createElement("span"), r = document.createElement("i");
      r.className = "pruta"; r.style.background = vfarg(v)[i];
      sp.append(r, lv ? (n !== undefined ? ft(n) + "–" + ft(g) : "< " + ft(g)) + " " + pa.enhet : (n !== undefined ? ft(g) + "–" + ft(n) : "≥ " + ft(g)) + " " + pa.enhet); f.append(sp); });
    return;
  }
  PKLASS.forEach(([g, c], i) => { const n = PKLASS[i + 1], sp = document.createElement("span"), r = document.createElement("i");
    r.className = "pruta"; r.style.background = c; sp.append(r, n ? g + "–" + n[0] + " %" : "≥ " + g + " %"); f.append(sp); });
}
const MMM_FARG = { min: "#2563eb", max: "#dc2626" };
function mmmHtml(mn, md, mx, rund, enhet) {
  return '<span style="color:' + MMM_FARG.min + '">min ' + rund(mn) + '</span> · <b>median ' + rund(md) + '</b> · <span style="color:' + MMM_FARG.max + '">max ' + rund(mx) + "</span> " + enhet;
}
function median(a) { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; }
function probTips(e) {
  const V = P.varden; if (!V) { $("kTips").hidden = true; return; }
  if (V.kombo) return komboTips(e);
  const p = kartPunkt(e), fy = KY - 1 - p.y;
  for (const r of V.vis) {
    const o = r.o, y = Math.round((fy - o.y0) / o.s), x = Math.round((p.x - o.x0) / o.s);
    if (y < 0 || y >= o.ny || x < 0 || x >= o.nx) continue;
    const i = y * o.nx + x, n = o.ny * o.nx, med = [], mm = [];
    for (let m = 0; m < ENS_MEDL; m++) { if (!iUrval(m)) continue; const w = r.agg[m * n + i]; if (isFinite(w)) { med.push(w); mm.push(m); } }
    const ll = franRuta(o.x0 + x * o.s, o.y0 + y * o.s), plats = "\n" + ll.lat.toFixed(2) + "N " + ll.lon.toFixed(2) + "E (rutnät " + (o.s * 2.5).toLocaleString("sv-SE") + " km)";
    if (!med.length) { visaKTips("Ingen medlem har värde här (t.ex. inget moln)" + plats, e.clientX + 14, e.clientY + 14); return; }
    const rund = v => V.pa.enhet === "m" || V.pa.enhet === "ft" ? Math.round(v / 10) * 10 : v.toFixed(1);
    const aggNamn = { max: "högsta", min: "lägsta", summa: "summa" }[V.pa.agg];
    const vRad = V.visa !== "sannolikhet" && r.val ? visaNamn(V.visa) + ": " + (isFinite(r.val[i]) ? rund(r.val[i]) + " " + V.pa.enhet : "inget värde") + "\n" : "";
    // 20/11 kvall: min (bla), median (fet), max (rod) + vilken korning/medlem som ger min och max
    const iMax = med.indexOf(Math.max(...med)), iMin = med.indexOf(Math.min(...med)), urv = medlemmar().length;
    const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    visaKTips(esc(vRad) + "Sannolikhet " + Math.round(r.prob[i] * 100) + " % (" + Math.round(r.prob[i] * (r.nAnv || urv)) + " av " + (r.nAnv || urv) + ")\n" +
      esc(V.pa.namn.split(",")[0]) + ", " + aggNamn + " i perioden per medlem:\n" + mmmHtml(med[iMin], median(med), med[iMax], rund, V.pa.enhet) +
      "\n<span class=\"dim\">max " + medlemText(mm[iMax], P.dtg) + " · min " + medlemText(mm[iMin], P.dtg) + "</span>" +
      (med.length < urv ? "\n(" + (urv - med.length) + " medlemmar utan värde)" : "") + esc(plats), e.clientX + 14, e.clientY + 14, true);
    return;
  }
  $("kTips").hidden = true;
}

// ---------- Meteogram for en punkt (NYTT 19/11) ----------
// Knappen "Meteogram har": hela korningen (+0..+61) for vald parameter i vald punkt, alla 30 medlemmar.
// En liten fraga (30 x 62 varden) -> sparas i minnet och via mellanserverns cache. Ritar per timme en lada
// (bred 25-75 %, smal 10-90 % av medlemmarna), median, streck min-max, medlem 0 som linje, troskeln och vald period skuggad.
// Nederbord visas ackumulerad fran +0.
const METEO_TAK = { by: null, nb: null, sikt: 10000, bas: 5000, lag: 8, medel: 8, hog: 8, tot: 8, dimma: 100, noll: 10000 };   // y-axelns tak (m / ft) for sikt och bas
const meteoCache = new Map();
async function meteoHamta(dtg, v, iy, ix) {
  const k = [dtg, v, iy, ix].join(":"); if (meteoCache.has(k)) return meteoCache.get(k);
  const pa = PPARAM[v];
  const fraga = enc(pa.var + "[0:1:" + (ENS_TIDER - 1) + "][0][0:" + (ENS_MEDL - 1) + "][" + iy + "][" + ix + "]");
  const res = await hamta(BAS + ENS_FIL(dtg) + ".ascii?" + fraga);
  if (res.st !== 200) throw new Error("Servern svarade " + res.st);
  const raa = tolka(res.txt)[pa.var]; if (!raa || raa.length < ENS_TIDER * ENS_MEDL) throw new Error("Oväntat svar");
  const d = new Float32Array(ENS_TIDER * ENS_MEDL);   // [t][m], i visningsenhet
  for (let i = 0; i < d.length; i++) d[i] = isFinite(raa[i]) ? pa.konv(raa[i]) : pa.saknasSom !== undefined ? pa.saknasSom : NaN;
  // NYTT 19/11 kvall: medlem 0 saknar sikt/molnbas i ensemblefilen -> ur det-filen (samma korning)
  if ((v === "sikt" || v === "bas") && !Array.from({ length: ENS_TIDER }, (_, t) => d[t * ENS_MEDL]).some(isFinite)) try {
    const r2 = await hamta(BAS + DET_FIL(dtg) + ".ascii?" + enc(pa.var + "[0:1:" + (ENS_TIDER - 1) + "][0][" + iy + "][" + ix + "]"));
    const w = r2.st === 200 ? tolka(r2.txt)[pa.var] : null;
    if (w && w.length >= ENS_TIDER) for (let t = 0; t < ENS_TIDER; t++) d[t * ENS_MEDL] = isFinite(w[t]) ? pa.konv(w[t]) : NaN;
  } catch (x) {}
  meteoCache.set(k, d); return d;
}
function kvantil(s, q) { if (!s.length) return NaN; const p = (s.length - 1) * q, a = Math.floor(p), b = Math.ceil(p); return s[a] + (s[b] - s[a]) * (p - a); }
async function visaMeteogram() {
  const lat = parseFloat($("lat").value.replace(",", ".")), lon = parseFloat($("lon").value.replace(",", "."));
  const r = isFinite(lat) && isFinite(lon) ? ruta(lat, lon) : null, info = $("pMeteoInfo");
  if (!r) { info.textContent = "Välj en punkt inom MEPS-området först (klicka i kartan)."; return; }
  if (!P.dtg) { info.textContent = "Ingen körning vald än."; return; }
  const v = $("pParam").value, pa = PPARAM[v], dtg = P.dtg;
  // 22/11: samma meteogram hamtas redan - starta inte ett till (probVisa anropas manga ganger medan falt laddas)
  const nyckel = [dtg, v, r.iy, r.ix].join(":"); if (P.meteoLaddar === nyckel) return; P.meteoLaddar = nyckel;
  // 22/11: annan parameter/korning - slack det gamla meteogrammet och visa att det nya laddas (orange)
  const R = $("pMeteoRuta"), pnamn = pa.namn.split(",")[0].toLowerCase();
  if (P.meteo && !R.hidden) { R.classList.add("meteoLaddar"); R.dataset.laddar = "Laddar meteogram för " + pnamn + " …"; }
  info.textContent = "Laddar meteogram för " + pnamn + " …"; info.className = "stVant"; $("pMeteo").disabled = true;
  let d; const t0 = performance.now();
  try { d = await meteoHamta(dtg, v, r.iy, r.ix); }
  catch (e) { if (P.meteoLaddar !== nyckel) return; info.textContent = "Meteogrammet gick inte att hämta (" + e.message + ")."; info.className = "fel"; $("pMeteo").disabled = false; R.classList.remove("meteoLaddar"); P.meteoLaddar = null; return; }
  if (P.meteoLaddar !== nyckel) return;   // en nyare hamtning (annan parameter) har startat - den ritar
  P.meteoLaddar = null; R.classList.remove("meteoLaddar");
  $("pMeteo").disabled = false;
  info.textContent = "Klart på " + ((performance.now() - t0) / 1000).toFixed(1) + " s."; info.className = "stOk";
  if (!P.meteo || P.meteo.dtg !== dtg) P.meteoStart = 0;   // ny korning -> ackumuleringen borjar om fran +0
  P.meteo = { dtg, v, iy: r.iy, ix: r.ix, d, lat, lon };
  ritaMeteogram();
  // 22/11: syns inte meteogrammet (expanderat under allt, eller liten skarm) - skrolla dit nar det ar klart
  { const R = $("pMeteoRuta"), q = R.getBoundingClientRect(); if (q.top > innerHeight - 80 || q.bottom < 60) R.scrollIntoView({ behavior: "smooth", block: "start" }); }
  // NYTT 20/11 kvall: vindriktning varje timme (byvind) och METAR-observationer (flygplatser) - ritas nar de kommit
  const M1 = P.meteo;
  if (typeof extraHamta === "function") extraHamta(M1);   // 21/11 kvall: AIFS / MET Nordic / nowcast om de ar pa
  if (v === "by") try { M1.u = await meteoHamta(dtg, "u10", r.iy, r.ix); M1.w = await meteoHamta(dtg, "v10", r.iy, r.ix); if (P.meteo === M1) ritaMeteogram(); } catch (e) {}
  // 22/11: METAR-status bredvid knappen (varfor METAR inte syns), som for de andra kallorna
  const mInfo = t => { const e = $("pMeteoMetarInfo"); if (e && P.meteo === M1) e.textContent = t ? "METAR: " + t : ""; };
  if (!["by", "sikt", "bas", "t2"].includes(v)) mInfo("finns inte för " + PPARAM[v].namn.toLowerCase().split(",")[0]);
  else if (typeof narmasteICAO === "function") try {
    const icao = narmasteICAO(lat, lon), tim = Math.min(72, Math.ceil((Date.now() - dtgDatum(dtg).getTime()) / 3600e3) + 1);
    if (!icao) mInfo("ingen flygplats med METAR inom " + METAR_AVST + " km från punkten");
    else if (tim <= 0) mInfo("körningen har inte börjat än – inga observationer");
    else { mInfo("hämtas från " + icao + " …"); const obs = await hamtaMetar(icao, tim);
      if (P.meteo === M1) { if (obs && obs.length) { M1.icao = icao; M1.obs = obs; mInfo(icao + ", " + obs.length + " obs"); ritaMeteogram(); } else mInfo(obs ? "inga observationer från " + icao + " under körningens tid" : "kunde inte hämtas från " + icao); } }
  } catch (e) { mInfo("kunde inte hämtas (" + (e.message || e) + ")"); }
}
// NYTT 19/11 em: nederbord i meteogrammet kan visas som
//   ack = ackumulerat fran en starttimme (dra startlinjen, klicka pa tidsaxeln, dubbelklick = +0)
//   h1  = per timme (timmen som slutar vid tidpunkten)
//   h3/h6 = per 3 resp. 6 h i fasta block som slutar 00/03/06... resp. 00/06/12/18 UTC (TAF-/prognosperioder)
// Allt raknas ur samma hamtade data (precipitation_amount_acc), inget nytt hamtas.
const NB_LAGE_NAMN = { ack: "Ackumulerat från start", h1: "Per timme", h3: "Per 3 h (00, 03, 06 … UTC)", h6: "Per 6 h (00, 06, 12, 18 UTC)" };
let nbLage = NB_LAGE_NAMN[lasa("mt:meteoNb")] ? lasa("mt:meteoNb") : "ack";
let meteoGeo = null;   // senaste ritningens matt (for att dra startlinjen)
(function metarKnapp() {
  const b = $("pMeteoMetar"); if (!b) return; b.setAttribute("aria-pressed", String(lasa("mt:meteoMetar") !== "av"));
  b.addEventListener("click", () => { const pa = lasa("mt:meteoMetar") === "av"; lagra("mt:meteoMetar", pa ? "pa" : "av"); b.setAttribute("aria-pressed", String(pa)); if (P.meteo) ritaMeteogram(); });
})();
function meteoAxelFlytta() { const ax = $("meteoAxel"), sk = document.querySelector(".meteoskroll"); if (ax && sk) ax.setAttribute("transform", "translate(" + sk.scrollLeft + ",0)"); }
// 21/11: Expandera - meteogrammet flyttas under allt annat, hela sidans bredd (och tillbaka)
function meteoExpandera() {
  const r = $("pMeteoRuta"), stor = !r.classList.contains("meteoStor"), k = $("pMeteoStor");
  if (stor) $("meteoNedre").appendChild(r); else document.querySelector("#vyP .meteo").appendChild(r);
  r.classList.toggle("meteoStor", stor); k.textContent = stor ? "⤡ Tillbaka" : "⤢ Expandera"; lagra("mt:meteoStor", stor ? "ja" : "nej");
  if (stor) r.scrollIntoView({ behavior: "smooth", block: "nearest" });
  ritaMeteogram();
}
function ritaMeteogram() {
  const M0 = P.meteo, ruta_ = $("pMeteoRuta"); if (!M0) { ruta_.hidden = true; return; }
  const css = getComputedStyle(document.documentElement), c = n => css.getPropertyValue(n).trim();
  const pa = PPARAM[M0.v], nb = pa.agg === "summa", nt = ENS_TIDER, nm = ENS_MEDL;
  $("pMeteoNbRad").hidden = !nb;
  const lage = nb ? nbLage : null;
  const start = Math.min(nt - 2, Math.max(0, P.meteoStart || 0));
  const raa = (t, m) => { if (!iUrval(m)) return NaN; const w = M0.d[t * nm + m]; return isFinite(w) ? w : NaN; };   // 20/11 kvall: medlemsurval
  const bas = dtgDatum(M0.dtg).getTime(), timUTC = t => new Date(bas + t * 3600e3).getUTCHours();
  // Staplar: kolumnerna t0..t1 och ett varde per medlem
  const poster = [];
  if (!nb) for (let t = 0; t < nt; t++) poster.push({ t0: t, t1: t, v: Float32Array.from({ length: nm }, (_, m) => raa(t, m)) });
  else if (lage === "ack") { for (let t = start; t < nt; t++) poster.push({ t0: t, t1: t, v: Float32Array.from({ length: nm }, (_, m) => Math.max(0, raa(t, m) - raa(start, m))) }); }
  else {
    const N = lage === "h1" ? 1 : lage === "h3" ? 3 : 6;
    for (let t = N; t < nt; t++) if (N === 1 || timUTC(t) % N === 0)
      poster.push({ t0: t - N + 1, t1: t, v: Float32Array.from({ length: nm }, (_, m) => Math.max(0, raa(t, m) - raa(t - N, m))) });
  }
  const tak = METEO_TAK[M0.v];
  let ymax = 0, ymin = 0; for (const p of poster) for (const w of p.v) if (isFinite(w)) { ymax = Math.max(ymax, tak ? Math.min(w, tak) : w); ymin = Math.min(ymin, w); }
  // 21/11 kvall: andra modeller (AIFS, MET Nordic, nowcast) - extra.js - tas med i skalan
  const EX = typeof extraSerier === "function" ? extraSerier(M0, nb ? lage : null, start, bas, nt) : [];
  for (const w of typeof extraVarden === "function" ? extraVarden(EX) : []) if (isFinite(w)) { ymax = Math.max(ymax, tak ? Math.min(w, tak) : w); ymin = Math.min(ymin, w); }
  const trosk = parseFloat($("pTrosk").value.replace(",", "."));
  const visaTrosk = isFinite(trosk) && !nb;
  if (visaTrosk) { ymax = Math.max(ymax, trosk); ymin = Math.min(ymin, trosk); }
  // jamna steg pa y-axeln (1, 2, 2,5 eller 5 x 10^n). NYTT 20/11: negativa varden (temperatur) -> axeln borjar under 0
  const spann = (tak || Math.max(1, ymax * 1.05)) - ymin * 1.05;
  const steg = (() => { const r = spann / 5, e = 10 ** Math.floor(Math.log10(r)); for (const f of [1, 2, 2.5, 5, 10]) if (f * e >= r) return f * e; })();
  ymax = Math.ceil((tak || Math.max(1, ymax * 1.05)) / steg) * steg; ymin = Math.floor(ymin * 1.05 / steg) * steg;
  const nSteg = Math.round((ymax - ymin) / steg);
  const visaMetar = lasa("mt:meteoMetar") !== "av";   /* 21/11 kvall: knappen METAR (pa som standard) */
  const harObsVind = visaMetar && M0.v === "by" && M0.obs && M0.obs.some(o => isFinite(o.dd));
  const harVind = M0.v === "by" && M0.u && M0.w, KOL = 14, VM = 46, H = 210, TOPP = 10, UNDER = 34 + (harVind ? 22 : 0) + (harObsVind ? 16 : 0), B = nt * KOL, W = VM + B + 8;
  meteoGeo = { KOL, VM, nt, TOPP, H };
  const y = w => TOPP + H - (Math.max(ymin, Math.min(w, ymax)) - ymin) / (ymax - ymin) * H;
  const svg = $("pMeteoSvg"); svg.textContent = ""; svg.setAttribute("width", W); svg.setAttribute("height", TOPP + H + UNDER);
  const g = (n, a, t) => svg.appendChild(el(n, a, t));
  // vald period
  let a = +$("pFran").value, b = +$("pTill").value; if (b < a) [a, b] = [b, a];
  g("rect", { x: VM + a * KOL, y: TOPP, width: (b - a + 1) * KOL, height: H, fill: "#1f6feb", opacity: 0.08 });
  // ackumulerat: gratt fore starten
  if (lage === "ack" && start > 0) g("rect", { x: VM, y: TOPP, width: start * KOL, height: H, fill: c("--dim"), opacity: 0.15 });
  // y-axel med 5 steg
  for (let i = 0; i <= nSteg; i++) { const w = ymin + steg * i, yy = y(w);
    g("line", { x1: VM, x2: VM + B, y1: yy, y2: yy, stroke: c("--line"), "stroke-width": 0.7 });
    g("text", { x: VM - 4, y: yy + 3, "font-size": 9.5, "text-anchor": "end", fill: c("--dim") }, (pa.enhet === "m" || pa.enhet === "ft" ? Math.round(w) : +w.toFixed(1)).toLocaleString("sv-SE")); }
  g("text", { x: 4, y: TOPP + 8, "font-size": 9.5, fill: c("--dim") }, pa.enhet);
  // 21/11: fast y-axel - en kopia av skalan som foljer med nar man skrollar i sidled (laggs overst nar ritningen ar klar)
  { const ax = el("g", { id: "meteoAxel" });
    ax.appendChild(el("rect", { x: 0, y: 0, width: VM - 1, height: TOPP + H + 4, fill: c("--panel") || "#fff", opacity: 0.94 }));
    for (let i = 0; i <= nSteg; i++) { const w = ymin + steg * i; ax.appendChild(el("text", { x: VM - 4, y: y(w) + 3, "font-size": 9.5, "text-anchor": "end", fill: c("--dim") }, (pa.enhet === "m" || pa.enhet === "ft" ? Math.round(w) : +w.toFixed(1)).toLocaleString("sv-SE"))); }
    ax.appendChild(el("text", { x: 4, y: TOPP + 8, "font-size": 9.5, fill: c("--dim") }, pa.enhet));
    ax.appendChild(el("line", { x1: VM - 1, x2: VM - 1, y1: TOPP, y2: TOPP + H, stroke: c("--line") }));
    setTimeout(() => { svg.appendChild(ax); meteoAxelFlytta(); }, 0); }
  // tidsaxel: dygnsgranser och var 6:e timme
  for (let t = 0; t < nt; t++) { const dd = new Date(bas + t * 3600e3), h = dd.getUTCHours(), x = VM + t * KOL;
    if (h === 0 && t > 0) g("line", { x1: x, x2: x, y1: TOPP, y2: TOPP + H + 4, stroke: c("--dim"), "stroke-width": 0.8 });
    if (h % 6 === 0) g("text", { x: x + KOL / 2, y: TOPP + H + 13, "font-size": 9.5, "text-anchor": "middle", fill: c("--dim") }, p2(h));
    if (h === 0 || t === 0) g("text", { x: x + 2, y: TOPP + H + 27, "font-size": 9.5, fill: c("--fg") }, VECKODAG[dd.getUTCDay()] + " " + dd.getUTCDate() + "/" + (dd.getUTCMonth() + 1)); }
  // ladorna (en per stapel; 3/6 h-staplar ar bredare)
  const lada = "#7aa7e0", visa = visaLage(), vm = /^m\d+$/.test(visa) ? +visa.slice(1) : null;
  const mitt = p => VM + (p.t0 + p.t1 + 1) / 2 * KOL, bredd = p => (p.t1 - p.t0 + 1) * KOL;
  const periodText = p => p.t0 === p.t1 && lage !== "h1" ? tidText(p.t1) : p2(timUTC(p.t0 - 1 < 0 ? 0 : p.t0 - 1)) + "–" + p2(timUTC(p.t1)) + "Z (+" + (p.t0 - 1) + " till +" + p.t1 + ")";
  for (const p of poster) {
    const s = Array.from(p.v).filter(isFinite).sort((u, w) => u - w); if (!s.length) continue;
    const x = mitt(p), bb = bredd(p), q10 = kvantil(s, 0.1), q25 = kvantil(s, 0.25), q50 = kvantil(s, 0.5), q75 = kvantil(s, 0.75), q90 = kvantil(s, 0.9);
    g("line", { x1: x, x2: x, y1: y(s[0]), y2: y(s[s.length - 1]), stroke: lada, "stroke-width": 1 });
    // smal lada 10-90 %, bred lada 25-75 % ovanpa
    g("rect", { x: x - bb * 0.18, y: y(q90), width: bb * 0.36, height: Math.max(1, y(q10) - y(q90)), fill: "#a9c6ec" });
    g("rect", { x: x - bb * 0.38, y: y(q75), width: bb * 0.76, height: Math.max(1, y(q25) - y(q75)), fill: lada });
    g("line", { x1: x - bb * 0.38, x2: x + bb * 0.38, y1: y(q50), y2: y(q50), stroke: "#1b3a6b", "stroke-width": 1.6 });
    // 20/11 kvall: egen tipsruta med farger (min bla, median fet, max rod) och vilken korning/medlem som ger min och max
    let mMin = -1, mMax = -1; for (let m = 0; m < nm; m++) { const w = p.v[m]; if (!isFinite(w)) continue; if (mMin < 0 || w < p.v[mMin]) mMin = m; if (mMax < 0 || w > p.v[mMax]) mMax = m; }
    const f1 = w => w.toFixed(1).replace(".", ",");
    const html = periodText(p) + "\n" + mmmHtml(s[0], q50, s[s.length - 1], f1, pa.enhet) + "\n<span class=\"dim\">10 % " + f1(q10) + " · 25 % " + f1(q25) + " · 75 % " + f1(q75) + " · 90 % " + f1(q90) + "</span>" +
      "\n<span class=\"dim\">max " + medlemText(mMax, M0.dtg) + " · min " + medlemText(mMin, M0.dtg) + "</span>" +
      (visaTrosk ? "\n" + s.filter(w => pa.villkor === "≥" ? w >= trosk : w < trosk).length + " av " + s.length + " " + pa.villkor + " " + trosk + " " + pa.enhet : "") +
      (nb ? "\n" + s.filter(w => w >= 0.1).length + " av " + s.length + " medlemmar ≥ 0,1 mm" : "");
    const hit = el("rect", { x: VM + p.t0 * KOL, y: TOPP, width: bb, height: H, fill: "transparent" });
    hit.addEventListener("mousemove", ev => visaKTips(html, ev.clientX + 14, ev.clientY + 14, true));
    hit.addEventListener("mouseleave", () => { $("kTips").hidden = true; });
    svg.appendChild(hit);
  }
  // linjer: medlem 0 (rod) och ev. vald medlem (svart)
  const linje = (m, farg, br, streck) => { let dd = ""; for (const p of poster) { const w = p.v[m]; if (isFinite(w)) dd += (dd ? "L" : "M") + mitt(p) + " " + y(w); }
    if (dd) g("path", { d: dd, fill: "none", stroke: farg, "stroke-width": br, "stroke-dasharray": streck || "" }); };
  linje(0, "#d62828", 1.6);
  if (vm !== null && vm !== 0) linje(vm, c("--fg"), 1.4, "4 2");
  if (EX.length) extraRita(svg, EX, h => VM + (h + 0.5) * KOL, y, h => { const d = new Date(bas + h * 3600e3); return p2(d.getUTCHours()) + ":" + p2(d.getUTCMinutes()) + "Z"; });
  if (visaTrosk) { g("line", { x1: VM, x2: VM + B, y1: y(trosk), y2: y(trosk), stroke: "#f97316", "stroke-width": 1.4, "stroke-dasharray": "6 3" });
    g("text", { x: VM + B - 2, y: y(trosk) - 3, "font-size": 9.5, "text-anchor": "end", fill: "#c2410c" }, "tröskel " + trosk.toLocaleString("sv-SE") + " " + pa.enhet); }
  // NYTT 20/11 kvall: METAR-observationer (svarta prickar) for passerade timmar, narmaste flygplats
  let obsAntal = 0;
  if (visaMetar && M0.obs && !nb) for (const o of M0.obs) {
    const h = (o.t - bas) / 3600e3; if (h < -0.5 || h > nt - 0.5) continue;
    let w = NaN, ihalig = false, txt = "";
    if (M0.v === "by") { if (isFinite(o.gg)) w = o.gg; else if (isFinite(o.ff)) { w = o.ff; ihalig = true; txt = " (ingen by – medelvind)"; } }
    else if (M0.v === "sikt") w = isFinite(o.sikt) ? Math.min(o.sikt >= 9999 ? 10000 : o.sikt, 10000) : NaN;
    else if (M0.v === "bas") { const l = o.lager.filter(x => x.kat >= 2).map(x => x.ft); if (o.vv !== null) l.push(o.vv); w = l.length ? Math.min(...l) : o.inga || o.lager.length ? (tak || 5000) : NaN; if (!l.length && isFinite(w)) txt = " (inga moln SCT+)"; }
    else if (M0.v === "t2") w = o.tc;
    if (!isFinite(w)) continue; obsAntal++;
    const cx_ = VM + (h + 0.5) * KOL, pt = el("circle", { cx: cx_, cy: y(w), r: 3.2, fill: ihalig ? "none" : "#111", stroke: "#111", "stroke-width": 1.4 });
    const ti = el("title"); ti.textContent = "METAR " + M0.icao + " " + p2(new Date(o.t).getUTCHours()) + ":" + p2(new Date(o.t).getUTCMinutes()) + "Z: " + (pa.enhet === "m" || pa.enhet === "ft" ? Math.round(w) : w) + " " + pa.enhet + txt + "\n" + o.raw;
    pt.appendChild(ti); svg.appendChild(pt);
  }
  // NYTT 20/11 kvall: vindriktning varje timme (byvind) - ensemblens medelriktning ur u/v 10 m, pilen blekare ju
  // mer medlemmarna ar oense (langden av medelvektorn av enhetsvektorerna)
  if (harVind) {
    const yv = TOPP + H + 34 + 10, lon = isFinite(M0.lon) ? M0.lon : 15, th = LCC.n * (lon - 15) * LCC.rad, cs = Math.cos(th), sn = Math.sin(th);
    g("text", { x: 4, y: yv + 4, "font-size": 9.5, fill: c("--dim") }, "riktn.");
    for (let t = 0; t < nt; t++) {
      let sx = 0, sy = 0, k = 0;
      for (let m = 0; m < nm; m++) { if (!iUrval(m)) continue; const u = M0.u[t * nm + m], w = M0.w[t * nm + m]; if (!isFinite(u) || !isFinite(w)) continue;
        const ue = u * cs + w * sn, ve = -u * sn + w * cs, f = Math.hypot(ue, ve); if (f < 0.1) continue; sx += ue / f; sy += ve / f; k++; }
      if (!k) continue;
      const R = Math.hypot(sx, sy) / k, rikt = (Math.atan2(-sx, -sy) * 180 / Math.PI + 360) % 360;   // varifran vinden blaser
      const x = VM + t * KOL + KOL / 2, gp = el("g", { transform: "translate(" + x + " " + yv + ") rotate(" + (rikt + 180) + ")", opacity: Math.max(0.2, R) });
      gp.appendChild(el("line", { x1: 0, y1: 5, x2: 0, y2: -5, stroke: c("--fg"), "stroke-width": 1.3 }));
      gp.appendChild(el("path", { d: "M -2.8 -2 L 0 -6 L 2.8 -2 Z", fill: c("--fg") }));
      const ti = el("title"); ti.textContent = tidText(t) + ": vind från " + String(Math.round(rikt)).padStart(3, "0") + "° (ensemblens medelriktning, 10 m), samstämmighet " + Math.round(R * 100) + " %"; gp.appendChild(ti);
      svg.appendChild(gp);
    }
  }
  // 20/11 kvall: observerad vindriktning ur METAR (rod pil, raden under modellens), for passerade timmar
  if (harObsVind) {
    const yo = TOPP + H + 34 + (harVind ? 22 : 0) + 6;
    g("text", { x: 4, y: yo + 4, "font-size": 9.5, fill: "#b91c1c" }, "METAR");
    for (const o of M0.obs) {
      if (!isFinite(o.dd)) continue; const h = (o.t - bas) / 3600e3; if (h < -0.5 || h > nt - 0.5) continue;
      const x = VM + (h + 0.5) * KOL, gp = el("g", { transform: "translate(" + x + " " + yo + ") rotate(" + (o.dd + 180) + ")" });
      gp.appendChild(el("line", { x1: 0, y1: 5, x2: 0, y2: -5, stroke: "#b91c1c", "stroke-width": 1.5 }));
      gp.appendChild(el("path", { d: "M -2.8 -2 L 0 -6 L 2.8 -2 Z", fill: "#b91c1c" }));
      const ti = el("title"); ti.textContent = "METAR " + M0.icao + " " + p2(new Date(o.t).getUTCHours()) + ":" + p2(new Date(o.t).getUTCMinutes()) + "Z: vind från " + String(o.dd).padStart(3, "0") + "° " + o.ff + (isFinite(o.gg) ? "G" + o.gg : "") + " kt"; gp.appendChild(ti);
      svg.appendChild(gp);
    }
  }
  // startlinjen for ackumulering (dras med mus/finger; handtaget har touch-action: none)
  if (lage === "ack") {
    const xs = VM + start * KOL + KOL / 2;
    g("line", { x1: xs, x2: xs, y1: TOPP, y2: TOPP + H, stroke: "#0f766e", "stroke-width": 2 });
    const hand = el("g", { class: "meteohandtag", "data-handtag": "1" });
    hand.appendChild(el("rect", { x: xs - 9, y: TOPP, width: 18, height: 18, rx: 4, fill: "#0f766e" }));
    hand.appendChild(el("text", { x: xs, y: TOPP + 13, "font-size": 11, "text-anchor": "middle", fill: "#fff" }, "⇔"));
    const ti = el("title"); ti.textContent = "Dra för att välja var ackumuleringen börjar (dubbelklick = +0)"; hand.appendChild(ti);
    svg.appendChild(hand);
    g("text", { x: xs + 12, y: TOPP + 13, "font-size": 10, fill: "#0f766e" }, "start " + tidText(start));
  }
  const lageText = !nb ? "" : lage === "ack" ? " (ackumulerad från " + tidText(start) + ")" : lage === "h1" ? " (per timme)" : lage === "h3" ? " (per 3 h)" : " (per 6 h)";
  $("pMeteoTitel").textContent = "Meteogram " + pa.namn.split(",")[0].toLowerCase() + lageText + " – " + (typeof platsNamn === "function" && /\(/.test(platsNamn(M0.lat, M0.lon)) ? platsNamn(M0.lat, M0.lon) + ", " : "") + M0.lat.toFixed(2) + "N " + M0.lon.toFixed(2) + "E, körning " + M0.dtg;
  $("pMeteoForkl").textContent = "Bred låda = 25–75 % av medlemmarna, smal låda = 10–90 %, mörkt streck = median, tunt streck = min–max. Röd linje = medlem 0" +
    (vm !== null && vm !== 0 ? ", svart streckad = medlem " + vm : "") + (visaTrosk ? ", orange = tröskel" : "") + ". Blå skuggning = vald period. Håll musen över en stapel för värden." +
    (lage === "ack" ? " Grön linje = start för ackumuleringen: dra i handtaget eller klicka på tidsaxeln, dubbelklicka för +0." : "") +
    (lage === "h3" || lage === "h6" ? " Varje stapel = summan i blocket (fasta UTC-block, ofullständigt första block hoppas över)." : "") +
    (METEO_TAK[M0.v] ? " Skalan slutar vid " + METEO_TAK[M0.v].toLocaleString("sv-SE") + " " + pa.enhet + "." : "") +
    (obsAntal ? " Svarta prickar = METAR " + M0.icao + (M0.v === "by" ? " (ihålig = medelvind, ingen by rapporterad)" : M0.v === "bas" ? " (lägsta SCT/BKN/OVC/VV)" : "") + "." : "") +
    (harVind ? " Pilarna = vindriktning 10 m (ensemblens medel), blekare = medlemmarna oense." : "") + (harObsVind ? " Röda pilar = observerad vindriktning (METAR)." : "") +
    (typeof extraForkl === "function" ? extraForkl(EX) : "") +
    (medlemmar().length < ENS_MEDL ? " Bara " + ($("pMedl").value === "nya" ? "de 15 nya medlemmarna (0–14)" : "de 15 gamla medlemmarna (15–29, förra körningen)") + "." : "");
  ruta_.hidden = false;
}
// Dra startlinjen (eller klicka pa tidsaxeln under diagrammet) - lyssnarna sitter pa svg-elementet, som finns kvar mellan ritningarna
function meteoDragInit() {
  const svg = $("pMeteoSvg"); let drar = false;
  const timme = e => { const G = meteoGeo, r = svg.getBoundingClientRect(); return Math.min(G.nt - 2, Math.max(0, Math.floor((e.clientX - r.left - G.VM) / G.KOL))); };
  const satt = t => { if (t !== (P.meteoStart || 0)) { P.meteoStart = t; ritaMeteogram(); } };
  const aktiv = () => P.meteo && meteoGeo && PPARAM[P.meteo.v].agg === "summa" && nbLage === "ack";
  svg.addEventListener("pointerdown", e => {
    if (!aktiv()) return;
    const r = svg.getBoundingClientRect(), yy = e.clientY - r.top, G = meteoGeo;
    const paHandtag = e.target.closest && e.target.closest("[data-handtag]"), paAxel = yy > G.TOPP + G.H;
    if (!paHandtag && !paAxel) return;
    drar = true; try { svg.setPointerCapture(e.pointerId); } catch (x) {}
    e.preventDefault(); satt(timme(e));
  });
  svg.addEventListener("pointermove", e => { if (drar) { e.preventDefault(); satt(timme(e)); } });
  const slut = () => { drar = false; };
  svg.addEventListener("pointerup", slut); svg.addEventListener("pointercancel", slut);
  svg.addEventListener("dblclick", () => { if (aktiv()) satt(0); });
}

// Automatisk hamtning nar man stegar: vantar 0,5 s efter sista klicket, hamtar bara det som saknas.
// Pagar redan en hamtning tas nasta steg nar den ar klar.
let autoTimer = null;
function autoHamta() {
  if (!$("pAuto").checked || fav) return;   // Favoriter hamtar aldrig fran met.no
  clearTimeout(autoTimer); P.autoVantar = true;
  autoTimer = setTimeout(() => {
    if (P.upptagen) { P.autoIgen = true; return; }
    if (typeof komboAktiv === "function" && komboAktiv()) { P.autoVantar = false; komboHamta(true); return; }
    const o0 = berakna(); if (!o0 || !P.dtg) { P.autoVantar = false; probVisa(); return; }
    if (!saknadeTimmar({ ...o0, dtg: P.dtg }, periodTimmar().lista).length) { P.autoVantar = false; probVisa(); return; }
    probHamta(true);
  }, 500);
}

// Den troskel som ett inskrivet varde i praktiken motsvarar, givet hur vardena lagras:
// "≥" med jamna steg: uppat till narmaste steg (31,6 kt -> 32 kt).
// "<" med tabell (avrundat nedat vid lagring): uppat till narmaste tabellvarde (1 450 m -> 1 500 m).
function effektivTrosk(pa, t) {
  if (pa.tabell) { const T = pa.tabell; for (const v of T) if (v >= t - 1e-9) return v; return T[T.length - 1]; }
  return Math.round(Math.ceil(t / pa.steg - 1e-9) * pa.steg * 1000) / 1000;
}
function stegText(pa, v) {
  if (!pa.tabell) return pa.steg.toLocaleString("sv-SE") + " " + pa.enhet;
  const T = pa.tabell, i = T.indexOf(v), d = i > 0 ? T[i] - T[i - 1] : T[1] - T[0];
  return d.toLocaleString("sv-SE") + " " + pa.enhet + " här";
}

// ---------- Kontroller ----------
// NYTT 20/11 kvall: i VARDELAGET (Visa = medel/max/min/enskild medlem) ar snabbvalen av/pa-knappar for isolinjer -
// alla, ingen, en eller nagra. Valen sparas per parameter (mt:isoVal:<param>). Egen troskel ger alltid en extra linje.
// I sannolikhetslaget valjer snabbvalen troskeln som forut.
function isoValen(v) {
  try { const a = JSON.parse(lasa("mt:isoVal:" + v) || "null"); if (Array.isArray(a)) return a.filter(x => PPARAM[v].snabb.includes(x)); } catch (e) {}
  return (ISO_VARDE[v] || []).map(n => n.v).filter(x => PPARAM[v].snabb.includes(x));
}
// 22/11: tunnare overst (den gamla "2 2"/3 blev parlor med rundade andar) - grovsta nu hel 2,7
const ISO_STIL = [{ streck: "6 3", bredd: 1.5 }, { streck: "3 2", bredd: 1.8 }, { streck: "", bredd: 2.1 }, { streck: "10 3 2 3", bredd: 2.2 }, { streck: "8 3", bredd: 2.4 }, { streck: "", bredd: 2.7 }];
// stil for linje i av n: 2 linjer -> den hogsta far mittenstilen (som nar det finns tre)
const isoStilIndex = (i, n) => Math.min(ISO_STIL.length - 1, Math.round(i * (n === 2 ? 3 : ISO_STIL.length - 1) / Math.max(1, n - 1)));
// Valda isolinjer med stil: lindrigast forst (tunn, streckad), varst sist (tjock, hel)
function isoNivaerVarde(v) {
  const pa = PPARAM[v], val = isoValen(v).slice().sort((a, b) => pa.villkor === "<" ? b - a : a - b);
  return val.map((x, i) => ({ v: x, ...ISO_STIL[isoStilIndex(i, val.length)] }));
}
function sattParam(behallTrosk) {
  const v = $("pParam").value, pa = PPARAM[v], vardelage = visaLage() !== "sannolikhet";
  $("pEnhet").textContent = pa.enhet; $("pTroskEtikett").textContent = vardelage ? "Egen linje (" + pa.villkor + ")" : "Tröskel (" + pa.villkor + ")";
  if (!behallTrosk) $("pTrosk").value = pa.std;
  const c = $("pChips"); c.textContent = "";
  c.title = vardelage ? "Isolinjer: tänd eller släck varje värde (alla, ingen, en eller några)" : "Välj tröskel";
  const val = isoValen(v);
  for (const x of pa.snabb) { const b = document.createElement("button"); b.textContent = x.toLocaleString("sv-SE");
    b.setAttribute("aria-pressed", String(vardelage ? val.includes(x) : +$("pTrosk").value === x));
    b.addEventListener("click", () => {
      if (vardelage) {
        const nu = isoValen(v), i = nu.indexOf(x); if (i >= 0) nu.splice(i, 1); else nu.push(x); lagra("mt:isoVal:" + v, JSON.stringify(nu));
        if (nu.length && !visaIso) { visaIso = true; lagra("mt:visaIso", "ja"); $("visaIso").setAttribute("aria-pressed", "true"); }
      } else { $("pTrosk").value = x; lagra("mt:pTrosk:" + v, String(x)); }
      sattParam(true); probVisa(); });
    c.append(b); }
}
function probOmradeAndrat() { P.fragar = false; ritaOmrade(); probVisa().then(() => { if (!P.varden && !P.upptagen) status("Tryck Hämta fält för att hämta området.", ""); }); }
// NYTT 20/11 kvall: FAVORITER. Samma karta och data som sannolikhetsvyn (lage "p"), men last till den forhamtade
// Sverigerutan (5 km, GitHub-korningen) med fardiga knappar. Inget hamtas fran met.no i den har fliken.
// Sannolikhetsvyns egna val sparas nar man gar in och aterstalls nar man gar ut.
const FAV_KNAPPAR = { by: [27, 32, 45], sikt: [5000, 3000, 2000, 1000], bas: [1200, 500, 400, 300, 200] };
let fav = false, favSpar = null;
const FAV_FALT = ["pKorningVal", "pParam", "pVisa", "pTrosk", "pStorlek", "pUppl", "pDt", "pFran", "pTill", "pSteg", "pKombo", "pKomboA", "pKomboB"];
// 21/11: vintergruppen - kombinerad sannolikhet, hamtas fran met.no nar man trycker (inte forhamtat)
const FAV_VINTER = [["snofok", "Snödrev"], ["ishalka", "Ishalka"], ["rimfrost", "Rimfrost/frost"]];
function favVinter(k) {
  // 22/11: Favoriter galler hela Sverige - kombinationerna hamtas fran met.no (3 falt x 30 medlemmar), sa i 10 km
  // (5 km for hela Sverige blir for stort, ca 400 MB for en halv dag). Perioden = den valda i tidslinjen.
  if (+$("pUppl").value < 4) { $("pUppl").value = "4"; $("pUppl").dispatchEvent(new Event("change")); }
  komboVal(k); favMarkera();
  // 22/11: P.komboTom i stallet for !P.varden, och vanta tills en pagaende hamtning (bytet till 10 km startar en) ar klar
  // - annars gjorde forsta trycket ingenting.
  ritaOmrade(); P.komboTom = true;
  probVisa().then(async () => { for (let i = 0; i < 240 && P.upptagen; i++) await new Promise(r => setTimeout(r, 500));
    if ($("pKombo").value !== k) return; await probVisa(); if (P.komboTom) komboHamta(false); });
}
function favKnappar() {
  const vb_ = $("favVinter"); vb_.textContent = "";
  for (const [k, n] of FAV_VINTER) { const b = document.createElement("button"); b.className = "sek liten"; b.dataset.k = k; b.textContent = n;
    setTimeout(() => { if (typeof KOMBO !== "undefined" && KOMBO[k]) b.title = KOMBO[k].text(KOMBO[k].A ? KOMBO[k].A.std : 0, KOMBO[k].B.std) + " – hämtas från met.no när du trycker"; }, 0); b.addEventListener("click", () => favVinter(k)); vb_.appendChild(b); }
  for (const [v, id] of [["by", "favBy"], ["sikt", "favSikt"], ["bas", "favBas"]]) {
    const box = $(id); box.textContent = "";
    for (const g of FAV_KNAPPAR[v]) { const b = document.createElement("button"); b.className = "sek liten"; b.dataset.v = v; b.dataset.g = g;
      b.textContent = g.toLocaleString("sv-SE") + " " + PPARAM[v].enhet; b.addEventListener("click", () => favVal(v, g)); box.appendChild(b); }
  }
}
function favMarkera() {   // 22/11: bara EN knapp blå - vinterknappen när en kombination är vald, annars tröskelknappen
  const kb = $("pKombo") ? $("pKombo").value : "";
  document.querySelectorAll("#favPanel button[data-v]").forEach(b => b.setAttribute("aria-pressed", String(!kb && b.dataset.v === $("pParam").value && +b.dataset.g === parseFloat($("pTrosk").value.replace(",", ".")))));
  document.querySelectorAll("#favVinter button").forEach(b => b.setAttribute("aria-pressed", String(!!kb && b.dataset.k === kb)));
}
function favVal(v, g) {
  if (typeof komboVal === "function" && $("pKombo").value) komboVal("");   // 21/11: vanlig favorit = ingen kombination
  const sel = $("pParam"); if (sel.value !== v) { sel.value = v; sel.dispatchEvent(new Event("change")); }
  $("pTrosk").value = g; lagra("mt:pTrosk:" + v, String(g)); lagra("mt:favVal", v + ":" + g); sattParam(true); favMarkera(); probVisa();
}
async function favIn() {
  favSpar = {}; for (const id of FAV_FALT) favSpar[id] = $(id).value;
  const idx = await svIndex();
  const sk = $("favSkylt");
  if (!idx || !idx.dtg) { sk.textContent = "Den förhämtade översikten finns inte just nu – använd fliken Sannolikhet."; return; }
  const kl = idx.skapad ? new Date(idx.skapad) : null;
  sk.innerHTML = "<b>Förhämtat – laddas direkt, inget hämtas från met.no.</b> Byvind, sikt och molnbas ur MEPS-ensemblen (30 medlemmar), 5 km, +0 till +" + Math.max(...idx.tider) +
    " h, för Sverige, Östersjön, Finland och Baltikum. Körning " + idx.dtg + (kl && !isNaN(kl) ? " (klar " + kl.getUTCHours().toString().padStart(2, "0") + ":" + kl.getUTCMinutes().toString().padStart(2, "0") + "Z)" : "") +
    ". Välj en tröskel nedan eller skriv en egen i rutan Tröskel. Klicka på kartan för meteogram i en punkt.";
  $("pStorlek").value = "sv"; $("pUppl").value = String(idx.s); $("pVisa").value = "sannolikhet"; $("pDt").value = "1";
  if ([...$("pKorningVal").options].some(o => o.value === idx.dtg)) $("pKorningVal").value = idx.dtg;
  bytKorning(idx.dtg);
  // 20/11 kvall: i Favoriter ar Fran = Till (en timme) varje gang man gar in - aktuell timme, steg 1 h
  const nu = Math.max(0, Math.min(Math.max(...idx.tider), Math.round((Date.now() - dtgDatum(idx.dtg).getTime()) / 3600e3)));
  $("pFran").value = nu; $("pTill").value = nu; $("pSteg").value = "1";
  const [v, g] = (lasa("mt:favVal") || "by:27").split(":");
  if (idx.v.includes(v)) favVal(v, +g); else favVal("by", 27);
  ritaOmrade(); probVisa();
}
function favUt() {
  if (!favSpar) return;
  try { favUtInre(); } catch (e) { favSpar = null; }
}
function favUtInre() {
  $("pKorningVal").value = favSpar.pKorningVal; const kv = $("pKorningVal").value; bytKorning(kv === "senaste" ? P.senast : kv);
  for (const id of FAV_FALT) if (favSpar[id] !== undefined) $(id).value = favSpar[id];   // efter korningsbytet (som annars flyttar perioden)
  favSpar = null; sattParam(true); if (typeof komboSynka === "function") komboSynka();
}
function bytLage(nytt) {
  if (nytt !== (fav ? "f" : lage) && typeof visaTestskylt === "function") visaTestskylt();   // testskylt vid flikbyte (19/11 kvall)
  const varFav = fav; fav = nytt === "f"; if (fav) nytt = "p";
  if (varFav && !fav) favUt();
  lage = nytt; document.body.classList.toggle("p", nytt === "p"); document.body.classList.toggle("fav", fav); document.body.classList.toggle("taf", nytt === "taf"); document.body.classList.toggle("m0", nytt === "m0"); document.body.classList.toggle("exp", nytt === "exp"); document.body.classList.toggle("sat", nytt === "sat"); document.body.classList.toggle("rad", nytt === "rad"); document.body.classList.toggle("obs", nytt === "sat" || nytt === "rad");
  $("flikTH").setAttribute("aria-selected", String(nytt === "th")); $("flikP").setAttribute("aria-selected", String(nytt === "p" && !fav)); $("flikF").setAttribute("aria-selected", String(fav));
  $("flikTAF").setAttribute("aria-selected", String(nytt === "taf")); $("flikSat").setAttribute("aria-selected", String(nytt === "sat")); $("flikRad").setAttribute("aria-selected", String(nytt === "rad")); $("vyObs").hidden = nytt !== "sat" && nytt !== "rad"; $("flikM0").setAttribute("aria-selected", String(nytt === "m0"));
  $("vyTH").hidden = nytt !== "th"; $("vyP").hidden = nytt !== "p"; $("vyTAF").hidden = nytt !== "taf"; $("vyM0").hidden = nytt !== "m0";
  $("underrubrik").textContent = nytt === "exp" ? "Experiment · graupel i hela kolumnen (MEPS medlem 0, 2,5 km)" : nytt === "sat" ? "Satellit · MTG (EUMETSAT), var 10:e minut" : nytt === "rad" ? "Radar · SMHI eller met.no, var 5:e minut (met.no med prognos)" : nytt === "m0" ? "Karta m0 · AROME 2,5 km (MEPS medlem 0), fält i färg + linjer" : nytt === "taf" ? "TAF-bevakning · grön/gul/röd per timme, METAR och larm" : fav ? "Favoriter · förhämtad ensemble, laddas direkt" : nytt === "p" ? "Sannolikhet · MEPS-ensemblen 2,5 km (30 medlemmar)" : "Tid-höjd · AROME 2,5 km (MEPS medlem 0)";
  if (nytt === "taf" && typeof tafIn === "function") setTimeout(tafIn, 0);
  if (typeof obsLage === "function") setTimeout(() => obsLage(nytt), 0);   // 21/11 kvall
  if (typeof expLage === "function") setTimeout(() => expLage(nytt), 0);   // 22/11: Experiment
  if (typeof m0Rita === "function") { if (nytt === "m0") setTimeout(m0In, 0); else $("kM0").textContent = ""; }
  if (typeof satVb === "function" && typeof vb !== "undefined" && vb) setTimeout(() => satVb(vb.x, vb.y, vb.w), 0);   // 21/11: kartans granser byts (Europa i TAF)
  lagra("mt:lageVy", fav ? "f" : nytt); $("kTips").hidden = true;
  if (fav && !varFav) favIn();
  setTimeout(ritaSiffror, 50);
  ritaMarkorer(); ritaOmrade(); probVisa();
  if (nytt === "p") { hamtaRegister().then(ritaOmrade); svIndex().then(() => { ritaOmrade(); probVisa(); }); }
}
(async function startaP() {
  const sel = $("pParam");
  for (const k in PPARAM) if (!PPARAM[k].dold) sel.add(new Option(PPARAM[k].namn, k));
  sel.value = lasa("mt:pParam") || "by"; if (!sel.value) sel.value = "by";
  // Visa: sannolikhet / medel / hogsta / lagsta / enskild medlem
  const vs = $("pVisa");
  for (const k of ["sannolikhet", "medel", "max", "min"]) vs.add(new Option(VISA_NAMN[k], k));
  // NYTT 19/11 kvall: 0-14 ar nya i korningen, 15-29 ar samma som 0-14 i korningen 3 h tidigare
  const og = document.createElement("optgroup"); og.label = "Nya medlemmar (senaste 3 h)";
  for (let m = 0; m < ENS_NYA; m++) og.appendChild(new Option("Medlem " + m + (m === 0 ? " (nyaste)" : ""), "m" + m));
  const og2 = document.createElement("optgroup"); og2.label = "Från förra körningen (3 h äldre)";
  for (let m = ENS_NYA; m < ENS_MEDL; m++) og2.appendChild(new Option("Medlem " + m + " (= " + (m - ENS_NYA) + " i förra)", "m" + m));
  vs.append(og, og2);
  vs.value = lasa("mt:pVisa") || "sannolikhet"; if (!vs.value) vs.value = "sannolikhet";
  // 20/11 kvall: medlemsurval
  $("pMedl").value = lasa("mt:pMedl") || "alla"; if (!$("pMedl").value) $("pMedl").value = "alla";
  $("pMedl").addEventListener("change", () => { lagra("mt:pMedl", $("pMedl").value); probVisa(); if (P.meteo) ritaMeteogram(); if (typeof M !== "undefined" && M && M.stat && typeof rita === "function") rita(); });
  // 19/11 em: troskeln ar alltid installbar - i vardelaget styr den troskel-isolinjen (och meteogrammet)
  const troskAv = () => { $("pTrosk").disabled = false; };
  troskAv();
  vs.addEventListener("change", () => { lagra("mt:pVisa", vs.value); troskAv(); sattParam(true); ritaIsoProbKnappar(); probVisa(); if (P.meteo) ritaMeteogram(); });
  ritaIsoProbKnappar();
  $("pMeteo").addEventListener("click", visaMeteogram);
  // NYTT 19/11 em: nederbordslage i meteogrammet + dragbar startlinje
  const nbs = $("pMeteoNb");
  for (const k in NB_LAGE_NAMN) nbs.add(new Option(NB_LAGE_NAMN[k], k));
  nbs.value = nbLage;
  nbs.addEventListener("change", () => { nbLage = nbs.value; lagra("mt:meteoNb", nbLage); if (P.meteo) ritaMeteogram(); });
  meteoDragInit();
  document.querySelector(".meteoskroll").addEventListener("scroll", meteoAxelFlytta);
  $("pMeteoStor").addEventListener("click", meteoExpandera);
  if (lasa("mt:meteoStor") === "ja") setTimeout(meteoExpandera, 0);
  $("pMeteoStang").addEventListener("click", () => { P.meteo = null; $("pMeteoRuta").hidden = true; $("pMeteoInfo").textContent = ""; });
  sattParam(); const st = lasa("mt:pTrosk:" + sel.value); if (st) { $("pTrosk").value = st; sattParam(true); }
  $("pStorlek").value = lasa("mt:pStorlek") || "150"; $("pUppl").value = lasa("mt:pUppl") || "2";
  P.senast = lasa("mt:ensSenast"); if (P.senast && Date.now() - dtgDatum(P.senast).getTime() > 864e5) P.senast = null;
  korningsListaP();
  const kv = $("pKorningVal").value; P.dtg = kv === "senaste" ? P.senast : kv;
  $("pKorningVal").addEventListener("change", async () => {
    lagra("mt:pKorningVal", $("pKorningVal").value); P.fragar = false;
    const kv = $("pKorningVal").value;
    if (kv !== "senaste") bytKorning(kv);
    else if (P.senast) bytKorning(P.senast);
    else { P.dtg = null; fyllTider(); }   // ingen kand senaste korning an - visa inte en gammal vald
    ritaOmrade(); await probVisa();
    // 19/11 em: vald korning som inte ar hamtad -> hamtas direkt om automatisk hamtning ar pa
    if (!P.varden && !P.upptagen) { status("Körningen " + (P.dtg || kv) + " är inte hämtad här än – tryck Hämta fält.", ""); autoHamta(); }
  });
  fyllTider();
  sel.addEventListener("change", () => { P.fragar = false; lagra("mt:pParam", sel.value); const st = lasa("mt:pTrosk:" + sel.value); $("pTrosk").value = st || PPARAM[sel.value].std; sattParam(true); ritaOmrade(); probVisa(); });
  $("pTrosk").addEventListener("input", () => { lagra("mt:pTrosk:" + sel.value, $("pTrosk").value); sattParam(true); probVisa(); });
  // Nar man ar klar (Enter eller lamnar rutan) andras troskeln till det varde den i praktiken blir.
  $("pTrosk").addEventListener("change", () => {
    const pa = PPARAM[sel.value], t = parseFloat($("pTrosk").value.replace(",", ".")); if (!isFinite(t)) return;
    const e = effektivTrosk(pa, t);
    if (Math.abs(e - t) > 1e-9) { $("pTrosk").value = e; lagra("mt:pTrosk:" + sel.value, String(e)); sattParam(true); probVisa();
      status("Tröskeln blev " + e.toLocaleString("sv-SE") + " " + pa.enhet + " – värdena sparas i steg om " + stegText(pa, e) + ", så " + t.toLocaleString("sv-SE") + " ger samma resultat som " + e.toLocaleString("sv-SE") + ".", ""); }
  });
  // Fran efter Till -> Till flyttas till samma timme. Till fore Fran -> Fran flyttas till samma timme.
  $("pFran").addEventListener("change", () => { if (+$("pFran").value > +$("pTill").value) $("pTill").value = $("pFran").value; probVisa(); });
  $("pTill").addEventListener("change", () => { if (+$("pTill").value < +$("pFran").value) $("pFran").value = $("pTill").value; probVisa(); });
  $("pEnTimme").addEventListener("click", () => { $("pTill").value = $("pFran").value; probVisa(); autoHamta(); });   // en enda timme
  // 19/11 em (Jakob): standard 1 h per steg - da hamtas bara den nya timmen. Ny nyckel sa att gamla "per" inte ligger kvar.
  $("pSteg").value = lasa("mt:pSteg2") || "1"; $("pDt").value = lasa("mt:pDt") || "1";
  $("pSteg").addEventListener("change", () => lagra("mt:pSteg2", $("pSteg").value));
  $("pDt").addEventListener("change", () => { lagra("mt:pDt", $("pDt").value); probVisa(); });
  // Perioden flyttas med sin langd: +0 till +12 -> +12 till +24 (slutet blir nasta start).
  // En enda timme (Fran = Till) flyttas en timme i taget och forblir en enda timme.
  // Steg: "per" = periodens langd, annars valt antal timmar.
  const flytta = r => { const a = Math.min(+$("pFran").value, +$("pTill").value), L = Math.abs(+$("pTill").value - +$("pFran").value),
    sv = $("pSteg").value, steg = sv === "per" ? Math.max(1, L) : +sv, na = a + r * steg;
    if (na < 0 || na + L > ENS_TIDER - 1) return; $("pFran").value = na; $("pTill").value = na + L; probVisa(); autoHamta(); };
  $("pAuto").checked = lasa("mt:pAuto") !== "nej";
  $("pAuto").addEventListener("change", () => lagra("mt:pAuto", $("pAuto").checked ? "ja" : "nej"));
  $("pBak").addEventListener("click", () => flytta(-1)); $("pFram").addEventListener("click", () => flytta(1));
  // Tidslinjen och stegknapparna under kartan, piltangenterna (inte nar man skriver i ett falt)
  $("tBak").addEventListener("click", () => flytta(-1)); $("tFram").addEventListener("click", () => flytta(1));
  $("tidslinje").addEventListener("pointerdown", tidslinjeNer);
  $("tidslinje").addEventListener("pointermove", tidslinjeDra);
  $("tidslinje").addEventListener("pointerup", tidslinjeUpp);
  $("tidslinje").addEventListener("pointercancel", () => { if (tlDrag) { tlDrag = null; probVisa(); } });
  $("tidslinje").title = "Klicka på en timme = bara den timmen. Dra = dra ut en period. Ta i kanterna för att ändra perioden.";
  // 21/11 natt: troskel och snabbval under kartan (samma falt, flyttade - all kod fungerar som forut)
  { const rad = $("troskRad"); for (const id of ["pTrosk", "pChips", "pIsoProb"]) { const f = $(id) && $(id).closest(".falt"); if (rad && f) rad.appendChild(f); } }
  // Hamta: vald period eller fler timmar framat (sparas)
  $("pHamtVal").value = lasa("mt:pHamtVal") || "per"; if (!$("pHamtVal").value) $("pHamtVal").value = "per";
  $("pHamtVal").addEventListener("change", () => lagra("mt:pHamtVal", $("pHamtVal").value));
  // steg 1 h (fältet Steg ar dolt)
  $("pSteg").value = "1";
  document.addEventListener("keydown", ev => {
    if (lage !== "p" || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    if (["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return;
    if (ev.key === "ArrowLeft") { ev.preventDefault(); flytta(-1); }
    else if (ev.key === "ArrowRight") { ev.preventDefault(); flytta(1); }
  });
  // 2,5 km bara upp till MAX_KM_25: valen som inte gar ihop gras ut (och ett omojligt sparat val rattas)
  const sparrUppl = () => {
    const fin = $("pUppl").value === "1", stor = $("pStorlek").value === "sv" || +$("pStorlek").value > MAX_KM_25;
    for (const op of $("pStorlek").options) op.disabled = fin && +op.value > MAX_KM_25;
    $("pUppl").querySelector('option[value="1"]').disabled = stor;
    if (fin && stor) { $("pUppl").value = "2"; lagra("mt:pUppl", "2"); }
  };
  sparrUppl();
  ["pStorlek", "pUppl"].forEach(id => $(id).addEventListener("change", () => { sparrUppl(); lagra("mt:" + id, $(id).value); probOmradeAndrat(); }));
  ["lat", "lon", "klistra"].forEach(id => $(id).addEventListener("input", () => { if (lage === "p") probOmradeAndrat(); }));
  $("punkt").addEventListener("change", () => { if (lage === "p") probOmradeAndrat(); });
  $("pHamta").addEventListener("click", () => (typeof komboAktiv === "function" && komboAktiv()) ? komboHamta(false) : probHamta());
  $("visaOmr").setAttribute("aria-pressed", String(visaOmr));
  $("visaIso").setAttribute("aria-pressed", String(visaIso));
  $("visaIso").addEventListener("click", e => { visaIso = !visaIso; lagra("mt:visaIso", visaIso ? "ja" : "nej"); e.currentTarget.setAttribute("aria-pressed", String(visaIso)); probVisa(); });
  // NYTT 19/11 natt: snabba omraden (registret) + Hamta resten
  $("visaSnabb").setAttribute("aria-pressed", String(visaSnabb));
  $("visaSnabb").addEventListener("click", e => { visaSnabb = !visaSnabb; lagra("mt:visaSnabb", visaSnabb ? "ja" : "nej"); e.currentTarget.setAttribute("aria-pressed", String(visaSnabb)); if (visaSnabb) hamtaRegister(true).then(ritaOmrade); else ritaOmrade(); });
  $("pRest").addEventListener("click", () => probHamta(false, true));
  setInterval(() => { if (lage === "p" && visaSnabb && !document.hidden) hamtaRegister().then(ritaOmrade); }, 60e3);
  $("visaOmr").addEventListener("click", e => { visaOmr = !visaOmr; lagra("mt:visaOmr", visaOmr ? "ja" : "nej"); e.currentTarget.setAttribute("aria-pressed", String(visaOmr)); ritaOmrade(); });
  $("pStopp").addEventListener("click", () => { stoppad = true; if (avbryt) avbryt.abort(); status("Stoppar …"); });
  $("flikTH").addEventListener("click", () => bytLage("th")); $("flikP").addEventListener("click", () => bytLage("p")); $("flikF").addEventListener("click", () => bytLage("f")); $("flikTAF").addEventListener("click", () => bytLage("taf")); $("flikM0").addEventListener("click", () => bytLage("m0")); $("flikSat").addEventListener("click", () => bytLage("sat")); $("flikExp").addEventListener("click", () => bytLage("exp")); $("flikRad").addEventListener("click", () => bytLage("rad"));
  favKnappar(); $("pTrosk").addEventListener("input", favMarkera);
  $("m0Linje").setAttribute("aria-pressed", String(visaM0Linje));
  $("m0Linje").addEventListener("click", e => { visaM0Linje = !visaM0Linje; lagra("mt:m0Linje", visaM0Linje ? "ja" : "nej"); e.currentTarget.setAttribute("aria-pressed", String(visaM0Linje)); probVisa(); });
  sattSiffKnapp(); $("siffror").addEventListener("click", () => { siffLage = (siffLage + 1) % 3; lagra("mt:siffror", String(siffLage)); sattSiffKnapp(); ritaSiffror(); });
  try { await laddaIndex(); } catch (e) {}
  // 20/11 kvall: nya besokare (inget sparat val) borjar i Favoriter
  const forst = lasa("mt:lageVy");
  if (forst === "p") bytLage("p"); else if (forst === "taf") bytLage("taf"); else if (forst === "m0") bytLage("m0"); else if (forst === "sat" || forst === "rad" || forst === "exp") bytLage(forst); else if (forst === "f" || !forst) bytLage("f");
})();
