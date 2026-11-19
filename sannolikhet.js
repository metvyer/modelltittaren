"use strict";
// ===================================================================
//  SANNOLIKHETSKARTOR FRAN MEPS-ENSEMBLEN (30 medlemmar)
//  Fil: meps_lagged_6_h_subset_2_5km_<DTG>.ncml, [tid=62][1][medlem=30][y][x]
//  Ett omrade kostar ungefar lika mycket servertid som en punkt (utsnittstest 16/11),
//  det som vaxer ar datamangden. Data sparas i webblasarens databas (IndexedDB): de tva senaste
//  korningarna, hogst 2 GB / 20 % av webblasarens utrymme (minst anvant tas bort forst).
// ===================================================================
const ENS_FIL = dtg => "meps_lagged_6_h_subset_2_5km_" + dtg + ".ncml";
const ENS_MEDL = 30, ENS_TIDER = 62, ENS_BIT = 13;   // hogst 13 timmar per anrop (t.ex. +0 till +12) = 390 kartfalt
const ENS_GRANS_MB = 150;                            // hard grans per hamtning (18/11: ingen "Hamta anda" langre)
const MAX_KM_25 = 400;                               // 2,5 km bara for omraden upp till 400 x 400 km
const AUTO_MAX_MB = 100;                             // automatisk hamtning vid stegning bara under detta
const ENS_MAX_MB_ANROP = { txt: 40, bin: 150 };      // hogst per anrop (thredds: text ca 50 MB, binart ca 500 MB)
const ENS_BYTE = { txt: 9, bin: 4 };                 // ungefar sa manga byte per varde
const ENS_MAX_VARDEN = 200e6;                        // hard sparr per hamtning (skyddar webblasaren och met.no)
let ensFormat = "bin";                               // binart (.dods) forst, text (.ascii) som reserv
// Parametrar. villkor ">=" eller "<". agg = hur timmarna i perioden slas ihop per medlem.
const PPARAM = {
  // Lagring: heltal (kod) * steg i visningsenheten. 8 bitar for byvind (1 kt, 0-254), annars 16 bitar.
  by:   { namn: "Byvind", var: "wind_speed_of_gust", enhet: "kt", konv: v => v * KT, villkor: "≥", agg: "max", std: 32, snabb: [25, 32, 35, 45, 50], bitar: 8, steg: 1 },
  nb:   { namn: "Nederbörd, summa i perioden", var: "precipitation_amount_acc", enhet: "mm", konv: v => v, villkor: "≥", agg: "summa", std: 5, snabb: [1, 5, 10, 20, 40], bitar: 16, steg: 0.1 },
  sikt: { namn: "Sikt", var: "visibility_in_air", enhet: "m", konv: v => v, villkor: "<", agg: "min", std: 1500, snabb: [10000, 5000, 3000, 2000, 1500, 1000, 800, 500, 300, 100], bitar: 8,
          tabell: trappSkala([[0, 200, 10], [225, 500, 25], [550, 1000, 50], [1100, 5000, 100], [5200, 10000, 200], [11000, 75000, 1000]]) },
  bas:  { namn: "Molnbas", var: "cloud_base_altitude", enhet: "ft", konv: v => v * FOT, villkor: "<", agg: "min", std: 1000, snabb: [1500, 1000, 500, 400, 300, 200, 100], bitar: 8,
          tabell: trappSkala([[0, 200, 10], [250, 1000, 50], [1100, 5000, 100], [5500, 20000, 500], [25000, 25000, 1]]) }   // 25000 = "over 20 000 ft"
};
// Olinjar skala for 1 byte (Jakobs forslag 16/11): fint steg dar trosklarna finns, grovt dar det inte spelar roll.
// [fran, till, steg] -> lista med alla tillatna varden. Koden ar platsen i listan.
function trappSkala(delar) { const ut = []; for (const [a, b, s] of delar) for (let v = a; v <= b + 1e-9; v += s) ut.push(Math.round(v)); return ut; }
// Kompakt lagring: varde i visningsenhet -> heltal. Hogsta koden betyder "saknas".
const SAKN = { 8: 255, 16: 65535 };
const nyKod = (pa, n) => pa.bitar === 8 ? new Uint8Array(n).fill(255) : new Uint16Array(n).fill(65535);
function koda(pa, ut, i, raa) {
  if (!isFinite(raa)) return;   // fyllnadsvarde -> saknas (koden ar redan "saknas")
  const v = pa.konv(raa);
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
const VKLASS = {
  by:   [20, 25, 32, 35, 45, 50],
  nb:   [0.5, 1, 5, 10, 20, 40],
  sikt: [10000, 5000, 3000, 1500, 800, 300],
  bas:  [1500, 1000, 500, 300, 200, 100],
};
const VFARG = ["#fde68a", "#fbbf24", "#f97316", "#dc2626", "#9f1239", "#581c87"];
const visaLage = () => ($("pVisa") && $("pVisa").value) || "sannolikhet";
// Varde i punkten p for vald visning, eller NaN
function visaVarde(agg, n, p, visa) {
  if (/^m\d+$/.test(visa)) return agg[+visa.slice(1) * n + p];
  let s = 0, c = 0, mx = -Infinity, mn = Infinity;
  for (let m = 0; m < ENS_MEDL; m++) { const w = agg[m * n + p]; if (!isFinite(w)) continue; s += w; c++; if (w > mx) mx = w; if (w < mn) mn = w; }
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
let visaIso = lasa("mt:visaIso") === "ja";      // isolinjer (NYTT 19/11), av som standard
// Isolinjer: sannolikhet 30/70 %; vardelage: fasta nivaer per parameter + troskeln. Olika utseende per niva.
const ISO_PROB = [{ v: 0.3, namn: "30 %", streck: "6 3", bredd: 1.9 }, { v: 0.7, namn: "70 %", streck: "", bredd: 2.6 }];
const ISO_VARDE = { by: [{ v: 27, streck: "6 3", bredd: 1.9 }, { v: 45, streck: "", bredd: 2.6 }] };
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
const innehaller = (e, o) => e.dtg === o.dtg && e.v === o.v && e.s === o.s && e.y0 <= o.y0 && e.y1 >= o.y1 && e.x0 <= o.x0 && e.x1 >= o.x1;

// ---------- Omrade ----------
// Omradet lasas till ett fast rutnat (index delbara med steget), sa att ett mindre omrade
// inuti ett hamtat alltid traffar samma punkter och kan visas utan ny hamtning.
function berakna() {
  const lat = parseFloat($("lat").value.replace(",", ".")), lon = parseFloat($("lon").value.replace(",", "."));
  if (!isFinite(lat) || !isFinite(lon)) return null;
  const f = rutaF(lat, lon), s = +$("pUppl").value, halv = +$("pStorlek").value / 2 / 2.5;
  const fyll = (c, max) => { let a = Math.floor(Math.max(0, c - halv) / s) * s, b = a + Math.ceil(2 * halv / s) * s;
    while (b > max) b -= s; if (b - a < 2 * halv - s) a = Math.max(0, b - Math.ceil(2 * halv / s) * s); return [a, b]; };
  const [y0, y1] = fyll(f.fy, LCC.ny - 1), [x0, x1] = fyll(f.fx, LCC.nx - 1);
  if (y1 < y0 || x1 < x0) return null;
  return { v: $("pParam").value, s, y0, y1, x0, x1, ny: (y1 - y0) / s + 1, nx: (x1 - x0) / s + 1, lat, lon };
}
function ritaOmrade() {
  const g = $("kOmr"); g.textContent = ""; if (lage !== "p") return;
  const o = berakna(); if (!o) return;
  const r = (e, stil) => g.appendChild(el("rect", { x: e.x0 - e.s / 2, y: KY - 1 - e.y1 - e.s / 2, width: e.x1 - e.x0 + e.s, height: e.y1 - e.y0 + e.s,
    fill: "none", "vector-effect": "non-scaling-stroke", style: stil }));
  // sparade omraden for samma parameter och korning (tunt, prickat)
  if (visaOmr) for (const e of P.index) if (P.dtg && e.dtg === P.dtg && e.v === o.v) r(e, "stroke:var(--dim);stroke-width:1;stroke-dasharray:2 3");
  r(o, "stroke:var(--acc);stroke-width:2;stroke-dasharray:6 4");
  $("pOmrade").textContent = Math.round((o.y1 - o.y0) * 2.5 + o.s * 2.5) + " × " + Math.round((o.x1 - o.x0) * 2.5 + o.s * 2.5) + " km, " + o.ny * o.nx + " punkter (var " + (o.s * 2.5).toLocaleString("sv-SE") + " km), mitt " + o.lat.toFixed(2) + "N " + o.lon.toFixed(2) + "E";
}

// Zooma kartan sa att omradet syns med lite marginal (bara om det ar litet i bild eller utanfor)
function zoomaTillOmrade(o) {
  const w = (o.x1 - o.x0 + o.s) * 1.8, h = (o.y1 - o.y0 + o.s) * 1.8, cx = (o.x0 + o.x1) / 2, cy = KY - 1 - (o.y0 + o.y1) / 2;
  const bredd = Math.max(w, h * KX / KY), utanfor = cx < vb.x || cx > vb.x + vb.w || cy < vb.y || cy > vb.y + vb.h;
  if (utanfor || bredd < vb.w * 0.5) satVb(cx - bredd / 2, cy - bredd * KY / KX / 2, bredd);
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
    if (await ensFinns(dtg)) { P.ny = !!P.senast; P.senast = dtg; lagra("mt:ensSenast", dtg); return dtg; }
    if (P.svar.st !== 0) kontakt = true;
    else if (!kontakt && i >= 1) break;   // tva forsok utan nagon kontakt alls -> servern nas inte, sluta leta
  }
  if (!P.senast && !kontakt) throw new Error(varforEj(""));
  return P.senast;
}
// Finns korningen komplett pa servern? Svaret sparas under besoket.
async function ensFinns(dtg) {
  if (P.finns.has(dtg)) return true;
  const r = await hamta(BAS + ENS_FIL(dtg) + ".ascii?time", false);
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
  return VECKODAG[d.getUTCDay()] + " " + p2(d.getUTCHours()) + "Z (+" + t + ")";
}
function fyllTider() {
  const f = $("pFran"), t = $("pTill"), fv = f.value, tv = t.value;
  f.innerHTML = ""; t.innerHTML = "";
  for (let i = 0; i < ENS_TIDER; i++) { f.add(new Option(tidText(i), i)); t.add(new Option(tidText(i), i)); }
  f.value = fv || "0"; t.value = tv || "12";
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
function periodTimmar() {
  let a = +$("pFran").value, b = +$("pTill").value; if (b < a) [a, b] = [b, a];
  const pa = PPARAM[$("pParam").value], dt = +$("pDt").value;
  const fran = pa.agg === "summa" && a > 0 ? a - 1 : a;   // nederbord: summan = ack(b) - ack(a-1)
  let lista;
  if (pa.agg === "summa") lista = fran < b ? [fran, b] : [b];
  else { lista = []; for (let t = a; t <= b; t++) if (t % dt === 0) lista.push(t); if (!lista.length) lista = [a]; }
  return { a, b, fran, lista, dt };
}
async function probHamta(auto) {
  auto = auto === true;
  if (P.upptagen) return;
  const o0 = berakna(); if (!o0) { status("Klicka på kartan eller ange lat/lon för områdets mitt.", "fel"); return; }
  P.fragar = false; P.upptagen = true; stoppad = false; $("pHamta").disabled = true; $("pStopp").disabled = false;
  const t0 = performance.now(); let kb = 0; const tider = [];
  try {
    if (!await aktivKorning()) throw new Error("Hittade ingen komplett ensemblekörning de senaste 18 timmarna. Senaste försöket: " + varforEj(""));
    const o = { ...o0, dtg: P.dtg }; ritaOmrade(); if (!auto) zoomaTillOmrade(o);
    const { lista } = periodTimmar(), sakn = saknadeTimmar(o, lista);
    const antV = sakn.length * ENS_MEDL * o.ny * o.nx, mb = antV * ENS_BYTE[ensFormat] / 1048576;
    if (antV > ENS_MAX_VARDEN) { status("För stort: " + Math.round(antV / 1e6) + " miljoner värden får inte plats i webbläsaren. Välj glesare upplösning, mindre område, kortare period eller var 3:e timme.", "fel"); P.fragar = true; return; }
    // Sparrar mot mycket stora uttag (skyddar met.no, mellanservern och webblasaren)
    if (o.s === 1 && Math.max(o.nx, o.ny) * 2.5 > MAX_KM_25 + 2.5) { status("2,5 km går bara för områden upp till " + MAX_KM_25 + " × " + MAX_KM_25 + " km. Välj 5 km eller ett mindre område.", "fel"); P.fragar = true; return; }
    if (mb > ENS_GRANS_MB) { status("För stort uttag: ca " + Math.round(mb) + " MB (gräns " + ENS_GRANS_MB + " MB per hämtning). Välj glesare upplösning, mindre område, kortare period eller var 3:e timme.", "fel"); P.fragar = true; return; }
    if (auto && mb > AUTO_MAX_MB) { status("Stort uttag (ca " + Math.round(mb) + " MB) hämtas inte automatiskt – tryck Hämta fält.", ""); P.fragar = true; return; }
    // grupper om hogst ENS_BIT sammanhangande timmar
    // grupper med jamnt steg (1, 3 eller 6 h), hogst ENS_BIT timmar per anrop
    const grupper = [];
    for (const t of sakn) {
      const g = grupper[grupper.length - 1];
      if (g) { const d = t - g[1], st = g[2] || d;
        if (d === st && (d <= 6 || sakn.length === 2) && (g[1] - g[0]) / st + 2 <= ENS_BIT) { g[2] = st; g[1] = t; continue; } }
      grupper.push([t, t, 0]);   // [forsta, sista, steg]
    }
    let e = P.index.find(x => x.dtg === o.dtg && x.v === o.v && x.s === o.s && x.y0 === o.y0 && x.y1 === o.y1 && x.x0 === o.x0 && x.x1 === o.x1);
    if (!e && grupper.length) { e = { dtg: o.dtg, v: o.v, s: o.s, y0: o.y0, y1: o.y1, x0: o.x0, x1: o.x1, tider: [] }; P.index.push(e); }
    const pa = PPARAM[o.v], n = o.ny * o.nx;
    for (let gi = 0; gi < grupper.length; gi++) {
      const [g0, g1] = grupper[gi];
      visaPForlopp(gi, grupper.length, g0, g1, (g1 - g0) / (grupper[gi][2] || 1) + 1);
      const st = grupper[gi][2] || 1, nt = (g1 - g0) / st + 1;
      // thredds svarar inte med mer an ca 50 MB text per anrop -> dela omradet i rad-band vid behov.
      // Varje band kostar servern lika mycket som hela omradet, sa banden halls sa fa som mojligt.
      const radPerBand = Math.max(1, Math.floor(ENS_MAX_MB_ANROP[ensFormat] * 1048576 / (nt * ENS_MEDL * o.nx * ENS_BYTE[ensFormat])));
      const ut = []; for (let k = 0; k < nt; k++) ut.push(nyKod(pa, ENS_MEDL * n));
      for (let r0 = 0; r0 < o.ny; r0 += radPerBand) {
        const r1 = Math.min(o.ny - 1, r0 + radPerBand - 1), nb = r1 - r0 + 1;
        if (o.ny > radPerBand) $("pForloppText").textContent = "Anrop " + (gi + 1) + " av " + grupper.length + ", band " + (r0 / radPerBand + 1) + " av " + Math.ceil(o.ny / radPerBand) + ": +" + g0 + " till +" + g1 + " h";
        const fraga = enc(pa.var + "[" + g0 + ":" + st + ":" + g1 + "][0][0:" + (ENS_MEDL - 1) + "][" + (o.y0 + r0 * o.s) + ":" + o.s + ":" + (o.y0 + r1 * o.s) + "][" + o.x0 + ":" + o.s + ":" + o.x1 + "]");
        const behov = nt * ENS_MEDL * nb * o.nx, t1 = performance.now();
        let v = null;
        if (ensFormat === "bin") {
          // Binart forst. Fungerar det inte gar sidan over till text for resten av besoket.
          const res = await hamta(BAS + ENS_FIL(o.dtg) + ".dods?" + fraga, false, true);
          if (res.st === 200 && res.buf) { v = lasDods(res.buf, behov); kb += res.buf.byteLength / 1024; }
          if (!v) { ensFormat = "txt"; status("Binärt format fungerade inte (svar " + res.st + ") – hämtar som text i stället …"); }
        }
        if (!v) {
          const res = await hamta(BAS + ENS_FIL(o.dtg) + ".ascii?" + fraga);
          if (res.st !== 200) throw new Error("Hämtningen av +" + g0 + " till +" + g1 + " h misslyckades (svar " + res.st + "). Tryck Hämta fält igen för att fortsätta.");
          kb += res.txt.length / 1024; v = tolka(res.txt)[pa.var];
          if (!v || v.length < behov) throw new Error("Oväntat svar från servern (för få värden).");
        }
        tider.push(((performance.now() - t1) / 1000).toFixed(0));
        for (let k = 0; k < nt; k++) for (let m = 0; m < ENS_MEDL; m++) for (let y = 0; y < nb; y++) {
          const fr = ((k * ENS_MEDL + m) * nb + y) * o.nx, till = (m * o.ny + r0 + y) * o.nx;
          for (let x = 0; x < o.nx; x++) koda(pa, ut[k], till + x, v[fr + x]);
        }
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
    status(tider.length ? "Klart: " + tot + " s, " + tider.length + " anrop (" + tider.join(", ") + " s), " + (kb / 1024).toFixed(1) + " MB " + (ensFormat === "bin" ? "binärt" : "text") + "." : "Klart: allt fanns redan sparat (" + tot + " s).");
  } catch (err) {
    status(stoppad || err.message === "stoppad" ? "Stoppad – det som hunnit hämtas visas." : err.message, stoppad ? "" : "fel");
    if (!stoppad) P.fragar = true;   // felmeddelandet ska synas tills nagot andras
  } finally {
    P.upptagen = false; P.autoVantar = false; $("pHamta").disabled = false; $("pStopp").disabled = true; $("pForlopp").hidden = true; ritaOmrade(); await probVisa();
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
function visaPForlopp(i, n, g0, g1, antal) {
  $("pForlopp").hidden = false; const st = $("pStapel"); st.textContent = "";
  for (let k = 0; k < n; k++) { const d = document.createElement("div"); if (k < i) d.className = "klar"; else if (k === i) d.className = "aktiv"; st.append(d); }
  $("pForloppText").textContent = "Anrop " + (i + 1) + " av " + n + ": +" + g0 + " till +" + g1 + " h (" + antal * ENS_MEDL + " kartfält)";
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
  const ut = new arr.constructor(ENS_MEDL * o.ny * o.nx);
  for (let m = 0; m < ENS_MEDL; m++) for (let y = 0; y < o.ny; y++) for (let x = 0; x < o.nx; x++)
    ut[(m * o.ny + y) * o.nx + x] = arr[(m * eny + y + dy) * enx + x + dx];
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
  const prob = new Float32Array(n), ok = w => pa.villkor === "≥" ? w >= trosk : w < trosk;
  for (let p = 0; p < n; p++) { let c = 0; for (let m = 0; m < ENS_MEDL; m++) { const w = agg[m * n + p]; if (isFinite(w) && ok(w)) c++; } prob[p] = c / ENS_MEDL; }
  return { o, agg, prob };
}
// Visar ALLA sparade omraden for vald parameter och korning som har hela perioden.
// Grovt rutnat ritas forst, finare ovanpa. Ramen visar vad som hamtas vid nasta Hamta fält.
// ---------- Tidslinje under kartan ----------
// En ruta per timme (+0 till +61). Farg = hamtad for omradet och parametern, ram = vald period,
// tjock vanstergrans = nytt dygn (00 UTC). Klick flyttar perioden sa att den borjar dar.
function ritaTidslinje() {
  const el = $("tidslinje"), et = $("tidsEtiketter"); if (!el) return;
  const o = berakna(); let a = +$("pFran").value, b = +$("pTill").value; if (b < a) [a, b] = [b, a];
  const har = new Set();
  if (o && P.dtg) for (const e of P.index) if (innehaller(e, { ...o, dtg: P.dtg })) e.tider.forEach(t => har.add(t));
  const bas = P.dtg ? dtgDatum(P.dtg).getTime() : null;
  el.textContent = ""; et.textContent = "";
  for (let t = 0; t < ENS_TIDER; t++) {
    const sp = document.createElement("span"); sp.dataset.t = t; sp.title = tidText(t) + (har.has(t) ? " – hämtad" : " – ej hämtad");
    if (har.has(t)) sp.classList.add("har");
    if (t >= a && t <= b) sp.classList.add("per");
    if (bas !== null) {
      const d = new Date(bas + t * 3600e3);
      if (t > 0 && d.getUTCHours() === 0) sp.classList.add("dygn");
      // forsta etiketten bara om nasta dygnsgrans ar en bit bort (annars krockar texterna)
      if ((t === 0 && d.getUTCHours() <= 16) || (t > 0 && d.getUTCHours() === 0)) {
        const l = document.createElement("span"); l.style.left = (t / ENS_TIDER * 100) + "%";
        l.textContent = VECKODAG[d.getUTCDay()] + (t === 0 ? " " + p2(d.getUTCHours()) + "Z" : ""); et.append(l);
      }
    }
    el.append(sp);
  }
}
function tidslinjeKlick(ev) {
  const t = +(ev.target.dataset && ev.target.dataset.t); if (!isFinite(t) || ev.target.dataset.t === undefined) return;
  const L = Math.abs(+$("pTill").value - +$("pFran").value), na = Math.min(t, ENS_TIDER - 1 - L);
  $("pFran").value = na; $("pTill").value = na + L; probVisa(); autoHamta();
}

async function probVisa() {
  const g = $("kProb"); ritaPForklaring(); ritaTidslinje();
  // meteogrammet foljer med: annan parameter/korning -> hamta om, annars rita om (period, troskel)
  if (P.meteo) { if (P.meteo.v !== $("pParam").value || P.meteo.dtg !== P.dtg) visaMeteogram(); else ritaMeteogram(); }
  const rensa = () => { g.textContent = ""; P.varden = null; $("pSam").textContent = ""; };
  if (lage !== "p" || !P.dtg) { rensa(); return; }
  const v = $("pParam").value, pa = PPARAM[v], { a, b, fran, lista, dt } = periodTimmar(), trosk = parseFloat($("pTrosk").value.replace(",", "."));
  if (!isFinite(trosk)) { rensa(); return; }
  const kand = P.index.filter(e => e.dtg === P.dtg && e.v === v).sort((x, y) => y.s - x.s);
  const vis = []; let pmax = 0;
  for (const e of kand) { const r = await beraknaOmrade(e, pa, a, b, fran, trosk, lista); if (r) vis.push(r); }
  // Under automatisk hamtning vid stegning visas den gamla bilden tills den nya perioden finns.
  if (!vis.length && (P.upptagen || P.autoVantar)) return;
  rensa();
  // Varje omrade ritas som EN bild (en pixel per punkt) i stallet for tusentals rutor –
  // annars blir kartan seg att zooma och dra med stora omraden.
  const rgb = PKLASS.map(([gr, c]) => [gr, parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
  const vrgb = VFARG.map(c => [0, parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
  const visa = visaLage(); let vext = null;   // varde-lage: extremvardet i bilden (for sammanfattningen)
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
      px[i] = f[1]; px[i + 1] = f[2]; px[i + 2] = f[3]; px[i + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    g.appendChild(el("image", { href: cv.toDataURL(), x: o.x0 - o.s / 2, y: KY - 1 - o.y1 - o.s / 2, width: o.nx * o.s, height: o.ny * o.s,
      preserveAspectRatio: "none", style: "image-rendering:pixelated;image-rendering:crisp-edges" }));
  }
  // isolinjer ovanpa fargerna
  if (visaIso) for (const r of vis) {
    const nivaer = visa === "sannolikhet" ? ISO_PROB.map(n => ({ ...n, f: r.prob }))
      : [...(ISO_VARDE[v] || []).map(n => ({ ...n, f: r.val })), ...(isFinite(trosk) ? [{ v: trosk, ...ISO_TROSK, f: r.val }] : [])];
    for (const n of nivaer) {
      // sikt/bas: lagre ar varre -> linjen ar densamma, nivan ar bara ett varde
      const d = isoSegment(n.f, r.o, n.v); if (!d) continue;
      g.appendChild(el("path", { d, fill: "none", stroke: c_iso(), "stroke-width": n.bredd, "stroke-dasharray": n.streck, "vector-effect": "non-scaling-stroke", "stroke-linecap": "round" }));
    }
  }
  P.varden = vis.length ? { vis: vis.slice().reverse(), pa, visa } : null;   // finast forst for hovring
  const o0 = berakna(), aktuell = o0 && vis.some(r => innehaller(r.o, { ...o0, dtg: P.dtg }));
  if (!vis.length) { if (!P.upptagen && !P.fragar) status(kand.length ? "Perioden är inte hämtad – tryck Hämta fält." : "Inget hämtat för " + pa.namn.split(",")[0].toLowerCase() + " i den här körningen – tryck Hämta fält.", ""); return; }
  if (visa !== "sannolikhet") {
    const aggT = { max: "högsta", min: "lägsta", summa: "summa" }[pa.agg];
    $("pSam").textContent = visaNamn(visa) + ": " + pa.namn.split(",")[0].toLowerCase() + ", " + aggT + " i perioden " + tidText(a) + " – " + tidText(b) +
      (pa.agg !== "summa" && dt > 1 && b > a ? " (var " + dt + ":e timme)" : "") + ". " + (pa.villkor === "<" ? "Lägsta" : "Högsta") + " värde i bilden: " +
      (vext === null ? "–" : (pa.enhet === "m" || pa.enhet === "ft" ? Math.round(vext) : vext.toFixed(1)).toLocaleString("sv-SE") + " " + pa.enhet) + "." + (aktuell ? "" : " Ramen är inte hämtad med vald upplösning – tryck Hämta fält.");
    return;
  }
  $("pSam").textContent = pa.namn + " " + pa.villkor + " " + trosk.toLocaleString("sv-SE") + " " + pa.enhet + (pa.agg === "summa" ? "" : " någon gång") + " " + tidText(a) + " – " + tidText(b) + (pa.agg !== "summa" && dt > 1 && b > a ? " (var " + dt + ":e timme)" : "") +
    ". Högsta sannolikhet: " + Math.round(pmax * 100) + " %." + (aktuell ? "" : " Ramen (ditt valda område) är inte hämtad med vald upplösning – tryck Hämta fält.");
}

const c_iso = () => (matchMedia("(prefers-color-scheme: dark)").matches ? "#f3f4f6" : ISO_FARG);
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
  if (visaLage() === "sannolikhet") for (const n of ISO_PROB) isoForkl(f, n.streck, n.bredd, "isolinje " + n.namn);
  else { for (const n of ISO_VARDE[v] || []) isoForkl(f, n.streck, n.bredd, n.v + " " + pa.enhet);
    if (isFinite(tr)) isoForkl(f, ISO_TROSK.streck, ISO_TROSK.bredd, "tröskel " + tr.toLocaleString("sv-SE") + " " + pa.enhet); }
}
function ritaPForklaring() {
  const f = $("pForkl"); f.textContent = ""; ritaIsoForkl(f);
  if (visaLage() !== "sannolikhet") {
    const v = $("pParam").value, pa = PPARAM[v], K = VKLASS[v], lv = pa.villkor === "<";
    const ft = w => w.toLocaleString("sv-SE");
    K.forEach((g, i) => { const n = K[i + 1], sp = document.createElement("span"), r = document.createElement("i");
      r.className = "pruta"; r.style.background = VFARG[i];
      sp.append(r, lv ? (n !== undefined ? ft(n) + "–" + ft(g) : "< " + ft(g)) + " " + pa.enhet : (n !== undefined ? ft(g) + "–" + ft(n) : "≥ " + ft(g)) + " " + pa.enhet); f.append(sp); });
    return;
  }
  PKLASS.forEach(([g, c], i) => { const n = PKLASS[i + 1], sp = document.createElement("span"), r = document.createElement("i");
    r.className = "pruta"; r.style.background = c; sp.append(r, n ? g + "–" + n[0] + " %" : "≥ " + g + " %"); f.append(sp); });
}
function median(a) { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; }
function probTips(e) {
  const V = P.varden; if (!V) { $("kTips").hidden = true; return; }
  const p = kartPunkt(e), fy = KY - 1 - p.y;
  for (const r of V.vis) {
    const o = r.o, y = Math.round((fy - o.y0) / o.s), x = Math.round((p.x - o.x0) / o.s);
    if (y < 0 || y >= o.ny || x < 0 || x >= o.nx) continue;
    const i = y * o.nx + x, n = o.ny * o.nx, med = [];
    for (let m = 0; m < ENS_MEDL; m++) { const w = r.agg[m * n + i]; if (isFinite(w)) med.push(w); }
    const ll = franRuta(o.x0 + x * o.s, o.y0 + y * o.s), plats = "\n" + ll.lat.toFixed(2) + "N " + ll.lon.toFixed(2) + "E (rutnät " + (o.s * 2.5).toLocaleString("sv-SE") + " km)";
    if (!med.length) { visaKTips("Ingen medlem har värde här (t.ex. inget moln)" + plats, e.clientX + 14, e.clientY + 14); return; }
    const rund = v => V.pa.enhet === "m" || V.pa.enhet === "ft" ? Math.round(v / 10) * 10 : v.toFixed(1);
    const aggNamn = { max: "högsta", min: "lägsta", summa: "summa" }[V.pa.agg];
    const vRad = V.visa !== "sannolikhet" && r.val ? visaNamn(V.visa) + ": " + (isFinite(r.val[i]) ? rund(r.val[i]) + " " + V.pa.enhet : "inget värde") + "\n" : "";
    visaKTips(vRad + "Sannolikhet " + Math.round(r.prob[i] * 100) + " % (" + Math.round(r.prob[i] * ENS_MEDL) + " av " + ENS_MEDL + ")\n" +
      V.pa.namn.split(",")[0] + ", " + aggNamn + " i perioden per medlem:\nmin " + rund(Math.min(...med)) + " · median " + rund(median(med)) + " · max " + rund(Math.max(...med)) + " " + V.pa.enhet +
      (med.length < ENS_MEDL ? "\n(" + (ENS_MEDL - med.length) + " medlemmar utan värde)" : "") + plats, e.clientX + 14, e.clientY + 14);
    return;
  }
  $("kTips").hidden = true;
}

// ---------- Meteogram for en punkt (NYTT 19/11) ----------
// Knappen "Meteogram har": hela korningen (+0..+61) for vald parameter i vald punkt, alla 30 medlemmar.
// En liten fraga (30 x 62 varden) -> sparas i minnet och via mellanserverns cache. Ritar per timme en lada
// (bred 25-75 %, smal 10-90 % av medlemmarna), median, streck min-max, medlem 0 som linje, troskeln och vald period skuggad.
// Nederbord visas ackumulerad fran +0.
const METEO_TAK = { by: null, nb: null, sikt: 10000, bas: 5000 };   // y-axelns tak (m / ft) for sikt och bas
const meteoCache = new Map();
async function meteoHamta(dtg, v, iy, ix) {
  const k = [dtg, v, iy, ix].join(":"); if (meteoCache.has(k)) return meteoCache.get(k);
  const pa = PPARAM[v];
  const fraga = enc(pa.var + "[0:1:" + (ENS_TIDER - 1) + "][0][0:" + (ENS_MEDL - 1) + "][" + iy + "][" + ix + "]");
  const res = await hamta(BAS + ENS_FIL(dtg) + ".ascii?" + fraga);
  if (res.st !== 200) throw new Error("Servern svarade " + res.st);
  const raa = tolka(res.txt)[pa.var]; if (!raa || raa.length < ENS_TIDER * ENS_MEDL) throw new Error("Oväntat svar");
  const d = new Float32Array(ENS_TIDER * ENS_MEDL);   // [t][m], i visningsenhet
  for (let i = 0; i < d.length; i++) d[i] = isFinite(raa[i]) ? pa.konv(raa[i]) : NaN;
  meteoCache.set(k, d); return d;
}
function kvantil(s, q) { if (!s.length) return NaN; const p = (s.length - 1) * q, a = Math.floor(p), b = Math.ceil(p); return s[a] + (s[b] - s[a]) * (p - a); }
async function visaMeteogram() {
  const lat = parseFloat($("lat").value.replace(",", ".")), lon = parseFloat($("lon").value.replace(",", "."));
  const r = isFinite(lat) && isFinite(lon) ? ruta(lat, lon) : null, info = $("pMeteoInfo");
  if (!r) { info.textContent = "Välj en punkt inom MEPS-området först (klicka i kartan)."; return; }
  if (!P.dtg) { info.textContent = "Ingen körning vald än."; return; }
  const v = $("pParam").value, pa = PPARAM[v], dtg = P.dtg;
  info.textContent = "Hämtar meteogram …"; $("pMeteo").disabled = true;
  let d; const t0 = performance.now();
  try { d = await meteoHamta(dtg, v, r.iy, r.ix); }
  catch (e) { info.textContent = "Meteogrammet gick inte att hämta (" + e.message + ")."; $("pMeteo").disabled = false; return; }
  $("pMeteo").disabled = false;
  info.textContent = "Klart på " + ((performance.now() - t0) / 1000).toFixed(1) + " s.";
  P.meteo = { dtg, v, iy: r.iy, ix: r.ix, d, lat, lon };
  ritaMeteogram();
}
function ritaMeteogram() {
  const M0 = P.meteo, ruta_ = $("pMeteoRuta"); if (!M0) { ruta_.hidden = true; return; }
  const css = getComputedStyle(document.documentElement), c = n => css.getPropertyValue(n).trim();
  const pa = PPARAM[M0.v], ack = pa.agg === "summa", nt = ENS_TIDER, nm = ENS_MEDL;
  // per timme: sorterade medlemsvarden (nederbord: ackumulerat fran +0)
  const serie = m => { const u = new Float32Array(nt); for (let t = 0; t < nt; t++) { const w = M0.d[t * nm + m]; u[t] = ack ? (isFinite(w) ? Math.max(0, w - (isFinite(M0.d[m]) ? M0.d[m] : 0)) : NaN) : w; } return u; };
  const S = Array.from({ length: nm }, (_, m) => serie(m));
  const tak = METEO_TAK[M0.v];
  let ymax = 0; for (const u of S) for (const w of u) if (isFinite(w)) ymax = Math.max(ymax, tak ? Math.min(w, tak) : w);
  const trosk = parseFloat($("pTrosk").value.replace(",", "."));
  if (isFinite(trosk) && !ack) ymax = Math.max(ymax, trosk);
  // jamna steg pa y-axeln (1, 2, 2,5 eller 5 x 10^n)
  const steg = (() => { const r = (tak || Math.max(1, ymax * 1.05)) / 5, e = 10 ** Math.floor(Math.log10(r)); for (const f of [1, 2, 2.5, 5, 10]) if (f * e >= r) return f * e; })();
  ymax = Math.ceil((tak || Math.max(1, ymax * 1.05)) / steg) * steg;
  const nSteg = Math.round(ymax / steg);
  const KOL = 14, VM = 46, H = 210, TOPP = 10, UNDER = 34, B = nt * KOL, W = VM + B + 8;
  const y = w => TOPP + H - Math.min(w, ymax) / ymax * H;
  const svg = $("pMeteoSvg"); svg.textContent = ""; svg.setAttribute("width", W); svg.setAttribute("height", TOPP + H + UNDER);
  const g = (n, a, t) => svg.appendChild(el(n, a, t));
  // vald period
  let a = +$("pFran").value, b = +$("pTill").value; if (b < a) [a, b] = [b, a];
  g("rect", { x: VM + a * KOL, y: TOPP, width: (b - a + 1) * KOL, height: H, fill: "#1f6feb", opacity: 0.08 });
  // y-axel med 5 steg
  for (let i = 0; i <= nSteg; i++) { const w = steg * i, yy = y(w);
    g("line", { x1: VM, x2: VM + B, y1: yy, y2: yy, stroke: c("--line"), "stroke-width": 0.7 });
    g("text", { x: VM - 4, y: yy + 3, "font-size": 9.5, "text-anchor": "end", fill: c("--dim") }, (pa.enhet === "m" || pa.enhet === "ft" ? Math.round(w) : +w.toFixed(1)).toLocaleString("sv-SE")); }
  g("text", { x: 4, y: TOPP + 8, "font-size": 9.5, fill: c("--dim") }, pa.enhet);
  // tidsaxel: dygnsgranser och var 6:e timme
  const bas = dtgDatum(M0.dtg).getTime();
  for (let t = 0; t < nt; t++) { const dd = new Date(bas + t * 3600e3), h = dd.getUTCHours(), x = VM + t * KOL;
    if (h === 0 && t > 0) g("line", { x1: x, x2: x, y1: TOPP, y2: TOPP + H + 4, stroke: c("--dim"), "stroke-width": 0.8 });
    if (h % 6 === 0) g("text", { x: x + KOL / 2, y: TOPP + H + 13, "font-size": 9.5, "text-anchor": "middle", fill: c("--dim") }, p2(h));
    if (h === 0 || t === 0) g("text", { x: x + 2, y: TOPP + H + 27, "font-size": 9.5, fill: c("--fg") }, VECKODAG[dd.getUTCDay()] + " " + dd.getUTCDate() + "/" + (dd.getUTCMonth() + 1)); }
  // ladorna
  const lada = "#7aa7e0", visa = visaLage(), vm = /^m\d+$/.test(visa) ? +visa.slice(1) : null;
  for (let t = 0; t < nt; t++) {
    const s = S.map(u => u[t]).filter(isFinite).sort((p, q) => p - q); if (!s.length) continue;
    const x = VM + t * KOL + KOL / 2, q10 = kvantil(s, 0.1), q25 = kvantil(s, 0.25), q50 = kvantil(s, 0.5), q75 = kvantil(s, 0.75), q90 = kvantil(s, 0.9);
    g("line", { x1: x, x2: x, y1: y(s[0]), y2: y(s[s.length - 1]), stroke: lada, "stroke-width": 1 });
    // smal lada 10-90 %, bred lada 25-75 % ovanpa
    g("rect", { x: x - KOL * 0.18, y: y(q90), width: KOL * 0.36, height: Math.max(1, y(q10) - y(q90)), fill: "#a9c6ec" });
    g("rect", { x: x - KOL * 0.38, y: y(q75), width: KOL * 0.76, height: Math.max(1, y(q25) - y(q75)), fill: lada });
    g("line", { x1: x - KOL * 0.38, x2: x + KOL * 0.38, y1: y(q50), y2: y(q50), stroke: "#1b3a6b", "stroke-width": 1.6 });
    const ti = el("title"); ti.textContent = tidText(t) + "\nmin " + s[0].toFixed(1) + " · 10 % " + q10.toFixed(1) + " · 25 % " + q25.toFixed(1) + " · median " + q50.toFixed(1) + " · 75 % " + q75.toFixed(1) + " · 90 % " + q90.toFixed(1) + " · max " + s[s.length - 1].toFixed(1) + " " + pa.enhet +
      (isFinite(trosk) && !ack ? "\n" + s.filter(w => pa.villkor === "≥" ? w >= trosk : w < trosk).length + " av " + s.length + " " + pa.villkor + " " + trosk + " " + pa.enhet : "");
    const hit = el("rect", { x: VM + t * KOL, y: TOPP, width: KOL, height: H, fill: "transparent" }); hit.appendChild(ti); svg.appendChild(hit);
  }
  // linjer: medlem 0 (rod) och ev. vald medlem (svart)
  const linje = (u, farg, bredd, streck) => { let dd = ""; for (let t = 0; t < nt; t++) if (isFinite(u[t])) dd += (dd ? "L" : "M") + (VM + t * KOL + KOL / 2) + " " + y(u[t]);
    if (dd) g("path", { d: dd, fill: "none", stroke: farg, "stroke-width": bredd, "stroke-dasharray": streck || "" }); };
  linje(S[0], "#d62828", 1.6);
  if (vm !== null && vm !== 0) linje(S[vm], c("--fg"), 1.4, "4 2");
  if (isFinite(trosk) && !ack) { g("line", { x1: VM, x2: VM + B, y1: y(trosk), y2: y(trosk), stroke: "#f97316", "stroke-width": 1.4, "stroke-dasharray": "6 3" });
    g("text", { x: VM + B - 2, y: y(trosk) - 3, "font-size": 9.5, "text-anchor": "end", fill: "#c2410c" }, "tröskel " + trosk.toLocaleString("sv-SE") + " " + pa.enhet); }
  $("pMeteoTitel").textContent = "Meteogram " + pa.namn.split(",")[0].toLowerCase() + (ack ? " (ackumulerad från +0)" : "") + " – " + M0.lat.toFixed(2) + "N " + M0.lon.toFixed(2) + "E, körning " + M0.dtg;
  $("pMeteoForkl").textContent = "Bred låda = 25–75 % av medlemmarna, smal låda = 10–90 %, mörkt streck = median, tunt streck = min–max. Röd linje = medlem 0" +
    (vm !== null && vm !== 0 ? ", svart streckad = medlem " + vm : "") + (isFinite(trosk) && !ack ? ", orange = tröskel" : "") + ". Blå skuggning = vald period. Håll musen över en timme för värden." +
    (METEO_TAK[M0.v] ? " Skalan slutar vid " + METEO_TAK[M0.v].toLocaleString("sv-SE") + " " + pa.enhet + "." : "");
  ruta_.hidden = false;
}

// Automatisk hamtning nar man stegar: vantar 0,5 s efter sista klicket, hamtar bara det som saknas.
// Pagar redan en hamtning tas nasta steg nar den ar klar.
let autoTimer = null;
function autoHamta() {
  if (!$("pAuto").checked) return;
  clearTimeout(autoTimer); P.autoVantar = true;
  autoTimer = setTimeout(() => {
    if (P.upptagen) { P.autoIgen = true; return; }
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
function sattParam(behallTrosk) {
  const pa = PPARAM[$("pParam").value];
  $("pEnhet").textContent = pa.enhet; $("pTroskEtikett").textContent = "Tröskel (" + pa.villkor + ")";
  if (!behallTrosk) $("pTrosk").value = pa.std;
  const c = $("pChips"); c.textContent = "";
  for (const v of pa.snabb) { const b = document.createElement("button"); b.textContent = v.toLocaleString("sv-SE"); b.setAttribute("aria-pressed", String(+$("pTrosk").value === v));
    b.addEventListener("click", () => { $("pTrosk").value = v; lagra("mt:pTrosk:" + $("pParam").value, String(v)); sattParam(true); probVisa(); }); c.append(b); }
}
function probOmradeAndrat() { P.fragar = false; ritaOmrade(); probVisa().then(() => { if (!P.varden && !P.upptagen) status("Tryck Hämta fält för att hämta området.", ""); }); }
function bytLage(nytt) {
  lage = nytt; document.body.classList.toggle("p", nytt === "p");
  $("flikTH").setAttribute("aria-selected", String(nytt === "th")); $("flikP").setAttribute("aria-selected", String(nytt === "p"));
  $("vyTH").hidden = nytt === "p"; $("vyP").hidden = nytt !== "p";
  $("underrubrik").textContent = nytt === "p" ? "Sannolikhet · MEPS-ensemblen 2,5 km (30 medlemmar)" : "Tid-höjd · AROME 2,5 km (MEPS medlem 0)";
  lagra("mt:lageVy", nytt); $("kTips").hidden = true;
  ritaMarkorer(); ritaOmrade(); probVisa();
}
(async function startaP() {
  const sel = $("pParam");
  for (const k in PPARAM) sel.add(new Option(PPARAM[k].namn, k));
  sel.value = lasa("mt:pParam") || "by"; if (!sel.value) sel.value = "by";
  // Visa: sannolikhet / medel / hogsta / lagsta / enskild medlem
  const vs = $("pVisa");
  for (const k of ["sannolikhet", "medel", "max", "min"]) vs.add(new Option(VISA_NAMN[k], k));
  const og = document.createElement("optgroup"); og.label = "Enskild medlem";
  for (let m = 0; m < ENS_MEDL; m++) og.appendChild(new Option("Medlem " + m, "m" + m));
  vs.appendChild(og);
  vs.value = lasa("mt:pVisa") || "sannolikhet"; if (!vs.value) vs.value = "sannolikhet";
  const troskAv = () => { $("pTrosk").disabled = vs.value !== "sannolikhet"; };
  troskAv();
  vs.addEventListener("change", () => { lagra("mt:pVisa", vs.value); troskAv(); probVisa(); if (P.meteo) ritaMeteogram(); });
  $("pMeteo").addEventListener("click", visaMeteogram);
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
    if (!P.varden && !P.upptagen) status("Tryck Hämta fält för att hämta i körningen " + (P.dtg || kv) + ".", "");
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
  $("pSteg").value = lasa("mt:pSteg") || "per"; $("pDt").value = lasa("mt:pDt") || "1";
  $("pSteg").addEventListener("change", () => lagra("mt:pSteg", $("pSteg").value));
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
  $("tidslinje").addEventListener("click", tidslinjeKlick);
  document.addEventListener("keydown", ev => {
    if (lage !== "p" || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    if (["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return;
    if (ev.key === "ArrowLeft") { ev.preventDefault(); flytta(-1); }
    else if (ev.key === "ArrowRight") { ev.preventDefault(); flytta(1); }
  });
  // 2,5 km bara upp till MAX_KM_25: valen som inte gar ihop gras ut (och ett omojligt sparat val rattas)
  const sparrUppl = () => {
    const fin = $("pUppl").value === "1", stor = +$("pStorlek").value > MAX_KM_25;
    for (const op of $("pStorlek").options) op.disabled = fin && +op.value > MAX_KM_25;
    $("pUppl").querySelector('option[value="1"]').disabled = stor;
    if (fin && stor) { $("pUppl").value = "2"; lagra("mt:pUppl", "2"); }
  };
  sparrUppl();
  ["pStorlek", "pUppl"].forEach(id => $(id).addEventListener("change", () => { sparrUppl(); lagra("mt:" + id, $(id).value); probOmradeAndrat(); }));
  ["lat", "lon", "klistra"].forEach(id => $(id).addEventListener("input", () => { if (lage === "p") probOmradeAndrat(); }));
  $("punkt").addEventListener("change", () => { if (lage === "p") probOmradeAndrat(); });
  $("pHamta").addEventListener("click", probHamta);
  $("visaOmr").setAttribute("aria-pressed", String(visaOmr));
  $("visaIso").setAttribute("aria-pressed", String(visaIso));
  $("visaIso").addEventListener("click", e => { visaIso = !visaIso; lagra("mt:visaIso", visaIso ? "ja" : "nej"); e.currentTarget.setAttribute("aria-pressed", String(visaIso)); probVisa(); });
  $("visaOmr").addEventListener("click", e => { visaOmr = !visaOmr; lagra("mt:visaOmr", visaOmr ? "ja" : "nej"); e.currentTarget.setAttribute("aria-pressed", String(visaOmr)); ritaOmrade(); });
  $("pStopp").addEventListener("click", () => { stoppad = true; if (avbryt) avbryt.abort(); status("Stoppar …"); });
  $("flikTH").addEventListener("click", () => bytLage("th")); $("flikP").addEventListener("click", () => bytLage("p"));
  try { await laddaIndex(); } catch (e) {}
  if (lasa("mt:lageVy") === "p") bytLage("p");
})();
