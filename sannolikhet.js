"use strict";
// ===================================================================
//  SANNOLIKHETSKARTOR FRAN MEPS-ENSEMBLEN (30 medlemmar)
//  Fil: meps_lagged_6_h_subset_2_5km_<DTG>.ncml, [tid=62][1][medlem=30][y][x]
//  Ett omrade kostar ungefar lika mycket servertid som en punkt (utsnittstest 16/11),
//  det som vaxer ar datamangden. Data sparas i webblasarens databas (IndexedDB) ett dygn.
// ===================================================================
const ENS_FIL = dtg => "meps_lagged_6_h_subset_2_5km_" + dtg + ".ncml";
const ENS_MEDL = 30, ENS_TIDER = 62, ENS_BIT = 13;   // hogst 13 timmar per anrop (t.ex. +0 till +12) = 390 kartfalt
const ENS_GRANS_MB = 40;                             // varna over sa har mycket text att hamta
// Parametrar. villkor ">=" eller "<". agg = hur timmarna i perioden slas ihop per medlem.
const PPARAM = {
  by:   { namn: "Byvind", var: "wind_speed_of_gust", enhet: "kt", konv: v => v * KT, villkor: "≥", agg: "max", std: 32, snabb: [25, 32, 35, 45, 50] },
  nb:   { namn: "Nederbörd, summa i perioden", var: "precipitation_amount_acc", enhet: "mm", konv: v => v, villkor: "≥", agg: "summa", std: 5, snabb: [1, 5, 10, 20, 40] },
  sikt: { namn: "Sikt", var: "visibility_in_air", enhet: "m", konv: v => v, villkor: "<", agg: "min", std: 1500, snabb: [5000, 1500, 800, 300] },
  bas:  { namn: "Molnbas", var: "cloud_base_altitude", enhet: "ft", konv: v => v * FOT, villkor: "<", agg: "min", std: 1000, snabb: [1500, 1000, 500, 200] }
};
// Sannolikhetsklasser (%) och farger
const PKLASS = [[5, "#fde68a"], [10, "#fbbf24"], [30, "#f97316"], [50, "#dc2626"], [70, "#9f1239"], [90, "#581c87"]];

// ---------- Databas (IndexedDB) med reserv i minnet ----------
const DB = (() => {
  const minne = new Map(); let dbp = null;
  const oppna = () => dbp || (dbp = new Promise((ok, fel) => {
    try {
      const r = indexedDB.open("modelltittaren", 1);
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
const P = { dtg: null, tid: [], omr: null, data: new Map(), index: [], upptagen: false, varden: null };
// index: [{ dtg, v, s, y0, y1, x0, x1, tider: [t...] }] – vilka omraden och timmar som finns sparade

async function laddaIndex() {
  P.index = (await DB.get("index")) || [];
  const gr = Date.now() - 864e5, kvar = [];
  for (const e of P.index) {
    if (dtgDatum(e.dtg).getTime() >= gr) { kvar.push(e); continue; }
    for (const t of e.tider) DB.del(nyckelE(e, t));
  }
  if (kvar.length !== P.index.length) { P.index = kvar; await DB.put("index", P.index); }
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
  for (const e of P.index) if (P.dtg && e.dtg === P.dtg && e.v === o.v) r(e, "stroke:var(--dim);stroke-width:1;stroke-dasharray:2 3");
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
async function sokEnsKorning() {
  const d = new Date(); d.setUTCMinutes(0, 0, 0); d.setUTCHours(d.getUTCHours() - d.getUTCHours() % 3);
  for (let i = 0; i <= 6; i++) {
    const dtg = dtgText(new Date(d.getTime() - i * 3 * 3600e3));
    if (P.dtg && dtgDatum(dtg) <= dtgDatum(P.dtg)) return P.dtg;
    status("Letar senaste ensemblekörning " + dtg + " …");
    const r = await hamta(BAS + ENS_FIL(dtg) + ".ascii?time", false);
    const m = r.st === 200 ? r.txt.match(/\ntime\[(\d+)\]/) : null;
    if (m && +m[1] >= ENS_TIDER) { P.dtg = dtg; lagra("mt:ensSenast", dtg); return dtg; }
  }
  return P.dtg;
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
  $("pKorning").textContent = P.dtg ? P.dtg + " (30 medlemmar, +0 till +" + (ENS_TIDER - 1) + " h)" : "–";
}

// ---------- Hamta ----------
function saknadeTimmar(o, a, b) {
  const ut = [];
  for (let t = a; t <= b; t++) if (!P.index.some(e => innehaller(e, { ...o, dtg: P.dtg }) && e.tider.includes(t))) ut.push(t);
  return ut;
}
function periodTimmar() {
  let a = +$("pFran").value, b = +$("pTill").value; if (b < a) [a, b] = [b, a];
  const pa = PPARAM[$("pParam").value];
  return { a, b, fran: pa.agg === "summa" && a > 0 ? a - 1 : a };   // nederbord: summan = ack(b) - ack(a-1)
}
async function probHamta() {
  if (P.upptagen) return;
  const o0 = berakna(); if (!o0) { status("Klicka på kartan eller ange lat/lon för områdets mitt.", "fel"); return; }
  P.upptagen = true; stoppad = false; $("pHamta").disabled = true; $("pStopp").disabled = false;
  const t0 = performance.now(); let kb = 0; const tider = [];
  try {
    if (!await sokEnsKorning()) throw new Error("Hittade ingen komplett ensemblekörning.");
    fyllTider(); const o = { ...o0, dtg: P.dtg }; ritaOmrade(); zoomaTillOmrade(o);
    const { a, b, fran } = periodTimmar(), sakn = saknadeTimmar(o, fran, b);
    const mb = sakn.length * ENS_MEDL * o.ny * o.nx * 9 / 1048576;
    if (mb > ENS_GRANS_MB && !confirmStor(mb)) { status("Avbröt – välj mindre område, glesare upplösning eller kortare period.", ""); return; }
    // grupper om hogst ENS_BIT sammanhangande timmar
    const grupper = []; for (const t of sakn) { const g = grupper[grupper.length - 1]; if (g && t === g[1] + 1 && t - g[0] < ENS_BIT) g[1] = t; else grupper.push([t, t]); }
    let e = P.index.find(x => x.dtg === o.dtg && x.v === o.v && x.s === o.s && x.y0 === o.y0 && x.y1 === o.y1 && x.x0 === o.x0 && x.x1 === o.x1);
    if (!e && grupper.length) { e = { dtg: o.dtg, v: o.v, s: o.s, y0: o.y0, y1: o.y1, x0: o.x0, x1: o.x1, tider: [] }; P.index.push(e); }
    const pa = PPARAM[o.v], n = o.ny * o.nx;
    for (let gi = 0; gi < grupper.length; gi++) {
      const [g0, g1] = grupper[gi];
      visaPForlopp(gi, grupper.length, g0, g1, performance.now());
      const url = BAS + ENS_FIL(o.dtg) + ".ascii?" + enc(pa.var + "[" + g0 + ":" + g1 + "][0][0:" + (ENS_MEDL - 1) + "][" + o.y0 + ":" + o.s + ":" + o.y1 + "][" + o.x0 + ":" + o.s + ":" + o.x1 + "]");
      const t1 = performance.now(), res = await hamta(url);
      if (res.st !== 200) throw new Error("Hämtningen av +" + g0 + " till +" + g1 + " h misslyckades (svar " + res.st + "). Tryck Hämta fält igen för att fortsätta.");
      tider.push(((performance.now() - t1) / 1000).toFixed(0)); kb += res.txt.length / 1024;
      const v = tolka(res.txt)[pa.var]; if (!v || v.length < (g1 - g0 + 1) * ENS_MEDL * n) throw new Error("Oväntat svar från servern (för få värden).");
      for (let t = g0; t <= g1; t++) {
        const arr = Float32Array.from(v.subarray((t - g0) * ENS_MEDL * n, (t - g0 + 1) * ENS_MEDL * n));
        await DB.put(nyckelE(e, t), arr); P.data.set(nyckelE(e, t), arr);
        if (!e.tider.includes(t)) e.tider.push(t);
      }
      await DB.put("index", P.index);
      await probVisa();
    }
    const tot = ((performance.now() - t0) / 1000).toFixed(0);
    status(tider.length ? "Klart: " + tot + " s, " + tider.length + " anrop (" + tider.join(", ") + " s), " + (kb / 1024).toFixed(1) + " MB." : "Klart: allt fanns redan sparat (" + tot + " s).");
  } catch (err) {
    status(stoppad || err.message === "stoppad" ? "Stoppad – det som hunnit hämtas visas." : err.message, stoppad ? "" : "fel");
  } finally {
    P.upptagen = false; $("pHamta").disabled = false; $("pStopp").disabled = true; $("pForlopp").hidden = true; ritaOmrade(); await probVisa();
  }
}
// Vanlig fraga i en webbsida utan dialogrutor: tva klick pa Hamta inom 8 s bekraftar.
let storOK = 0;
function confirmStor(mb) {
  if (Date.now() - storOK < 8000) { storOK = 0; return true; }
  storOK = Date.now(); status("Stort uttag: ca " + Math.round(mb) + " MB text. Tryck Hämta fält igen inom 8 s för att hämta ändå.", "fel"); return false;
}
function visaPForlopp(i, n, g0, g1) {
  $("pForlopp").hidden = false; const st = $("pStapel"); st.textContent = "";
  for (let k = 0; k < n; k++) { const d = document.createElement("div"); if (k < i) d.className = "klar"; else if (k === i) d.className = "aktiv"; st.append(d); }
  $("pForloppText").textContent = "Anrop " + (i + 1) + " av " + n + ": +" + g0 + " till +" + g1 + " h (" + (g1 - g0 + 1) * ENS_MEDL + " kartfält)";
}

// ---------- Berakna och visa ----------
// Hamtar timme t for omradet o ur ett sparat (eventuellt storre) omrade. Returnerar Float32Array [medlem][y][x] eller null.
async function timData(o, t) {
  const e = P.index.find(x => innehaller(x, o) && x.tider.includes(t)); if (!e) return null;
  const k = nyckelE(e, t); let arr = P.data.get(k);
  if (!arr) { arr = await DB.get(k); if (!arr) return null; P.data.set(k, arr); }
  if (e.y0 === o.y0 && e.x0 === o.x0 && e.y1 === o.y1 && e.x1 === o.x1) return arr;
  const eny = (e.y1 - e.y0) / e.s + 1, enx = (e.x1 - e.x0) / e.s + 1, dy = (o.y0 - e.y0) / e.s, dx = (o.x0 - e.x0) / e.s;
  const ut = new Float32Array(ENS_MEDL * o.ny * o.nx);
  for (let m = 0; m < ENS_MEDL; m++) for (let y = 0; y < o.ny; y++) for (let x = 0; x < o.nx; x++)
    ut[(m * o.ny + y) * o.nx + x] = arr[(m * eny + y + dy) * enx + x + dx];
  return ut;
}
// Beraknar sannolikheten for ett sparat omrade e (pa dess eget rutnat). null om nagon timme saknas.
async function beraknaOmrade(e, pa, a, b, fran, trosk) {
  const o = { ...e, ny: (e.y1 - e.y0) / e.s + 1, nx: (e.x1 - e.x0) / e.s + 1 }, n = o.ny * o.nx;
  const agg = new Float32Array(ENS_MEDL * n).fill(pa.agg === "max" ? -Infinity : pa.agg === "min" ? Infinity : NaN);
  if (pa.agg === "summa") {
    if (!e.tider.includes(b) || (fran < b && !e.tider.includes(fran))) return null;
    const ab = await timData(o, b), aa = fran < b ? await timData(o, fran) : null; if (!ab) return null;
    for (let i = 0; i < agg.length; i++) agg[i] = pa.konv(Math.max(0, ab[i] - (aa ? aa[i] : 0)));   // ackumulerat: slut minus start
  } else {
    for (let t = a; t <= b; t++) if (!e.tider.includes(t)) return null;
    for (let t = a; t <= b; t++) {
      const d = await timData(o, t); if (!d) return null;
      for (let i = 0; i < agg.length; i++) { const v = d[i]; if (!isFinite(v)) continue; const w = pa.konv(v);
        if (pa.agg === "max" ? w > agg[i] : w < agg[i]) agg[i] = w; }
    }
  }
  const prob = new Float32Array(n), ok = w => pa.villkor === "≥" ? w >= trosk : w < trosk;
  for (let p = 0; p < n; p++) { let c = 0; for (let m = 0; m < ENS_MEDL; m++) { const w = agg[m * n + p]; if (isFinite(w) && ok(w)) c++; } prob[p] = c / ENS_MEDL; }
  return { o, agg, prob };
}
// Visar ALLA sparade omraden for vald parameter och korning som har hela perioden.
// Grovt rutnat ritas forst, finare ovanpa. Ramen visar vad som hamtas vid nasta Hamta fält.
async function probVisa() {
  const g = $("kProb"); g.textContent = ""; P.varden = null; $("pSam").textContent = ""; ritaPForklaring();
  if (lage !== "p" || !P.dtg) return;
  const v = $("pParam").value, pa = PPARAM[v], { a, b, fran } = periodTimmar(), trosk = parseFloat($("pTrosk").value.replace(",", "."));
  if (!isFinite(trosk)) return;
  const kand = P.index.filter(e => e.dtg === P.dtg && e.v === v).sort((x, y) => y.s - x.s);
  const vis = []; let pmax = 0;
  for (const e of kand) { const r = await beraknaOmrade(e, pa, a, b, fran, trosk); if (r) vis.push(r); }
  for (const { o, prob } of vis) for (let y = 0; y < o.ny; y++) for (let x = 0; x < o.nx; x++) {
    const p = prob[y * o.nx + x]; if (p > pmax) pmax = p; const pr = p * 100; if (pr < PKLASS[0][0]) continue;
    let f = PKLASS[0][1]; for (const [gr, c] of PKLASS) if (pr >= gr) f = c;
    g.appendChild(el("rect", { x: o.x0 + x * o.s - o.s / 2, y: KY - 1 - (o.y0 + y * o.s) - o.s / 2, width: o.s, height: o.s, fill: f }));
  }
  P.varden = vis.length ? { vis: vis.slice().reverse(), pa } : null;   // finast forst for hovring
  const o0 = berakna(), aktuell = o0 && vis.some(r => innehaller(r.o, { ...o0, dtg: P.dtg }));
  if (!vis.length) { if (!P.upptagen) status(kand.length ? "Perioden är inte hämtad – tryck Hämta fält." : "Inget hämtat för " + pa.namn.split(",")[0].toLowerCase() + " i den här körningen – tryck Hämta fält.", ""); return; }
  $("pSam").textContent = pa.namn + " " + pa.villkor + " " + trosk.toLocaleString("sv-SE") + " " + pa.enhet + (pa.agg === "summa" ? "" : " någon gång") + " " + tidText(a) + " – " + tidText(b) +
    ". Högsta sannolikhet: " + Math.round(pmax * 100) + " %." + (aktuell ? "" : " Ramen (ditt valda område) är inte hämtad med vald upplösning – tryck Hämta fält.");
}

function ritaPForklaring() {
  const f = $("pForkl"); f.textContent = "";
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
    visaKTips("Sannolikhet " + Math.round(r.prob[i] * 100) + " % (" + Math.round(r.prob[i] * ENS_MEDL) + " av " + ENS_MEDL + ")\n" +
      V.pa.namn.split(",")[0] + ", " + aggNamn + " i perioden per medlem:\nmin " + rund(Math.min(...med)) + " · median " + rund(median(med)) + " · max " + rund(Math.max(...med)) + " " + V.pa.enhet +
      (med.length < ENS_MEDL ? "\n(" + (ENS_MEDL - med.length) + " medlemmar utan värde)" : "") + plats, e.clientX + 14, e.clientY + 14);
    return;
  }
  $("kTips").hidden = true;
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
function probOmradeAndrat() { ritaOmrade(); probVisa().then(() => { if (!P.varden && !P.upptagen) status("Tryck Hämta fält för att hämta området.", ""); }); }
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
  sattParam(); const st = lasa("mt:pTrosk:" + sel.value); if (st) { $("pTrosk").value = st; sattParam(true); }
  $("pStorlek").value = lasa("mt:pStorlek") || "150"; $("pUppl").value = lasa("mt:pUppl") || "2";
  P.dtg = lasa("mt:ensSenast"); if (P.dtg && Date.now() - dtgDatum(P.dtg).getTime() > 864e5) P.dtg = null;
  fyllTider();
  sel.addEventListener("change", () => { lagra("mt:pParam", sel.value); const st = lasa("mt:pTrosk:" + sel.value); $("pTrosk").value = st || PPARAM[sel.value].std; sattParam(true); ritaOmrade(); probVisa(); });
  $("pTrosk").addEventListener("input", () => { lagra("mt:pTrosk:" + sel.value, $("pTrosk").value); sattParam(true); probVisa(); });
  ["pFran", "pTill"].forEach(id => $(id).addEventListener("change", () => probVisa()));
  // Perioden flyttas med sin langd: +0 till +12 -> +12 till +24 (slutet blir nasta start)
  const flytta = r => { const a = Math.min(+$("pFran").value, +$("pTill").value), L = Math.max(1, Math.abs(+$("pTill").value - +$("pFran").value)), na = a + r * L;
    if (na < 0 || na + L > ENS_TIDER - 1) return; $("pFran").value = na; $("pTill").value = na + L; probVisa(); };
  $("pBak").addEventListener("click", () => flytta(-1)); $("pFram").addEventListener("click", () => flytta(1));
  ["pStorlek", "pUppl"].forEach(id => $(id).addEventListener("change", () => { lagra("mt:" + id, $(id).value); probOmradeAndrat(); }));
  ["lat", "lon", "klistra"].forEach(id => $(id).addEventListener("input", () => { if (lage === "p") probOmradeAndrat(); }));
  $("punkt").addEventListener("change", () => { if (lage === "p") probOmradeAndrat(); });
  $("pHamta").addEventListener("click", probHamta);
  $("pStopp").addEventListener("click", () => { stoppad = true; if (avbryt) avbryt.abort(); status("Stoppar …"); });
  $("flikTH").addEventListener("click", () => bytLage("th")); $("flikP").addEventListener("click", () => bytLage("p"));
  try { await laddaIndex(); } catch (e) {}
  if (lasa("mt:lageVy") === "p") bytLage("p");
})();
