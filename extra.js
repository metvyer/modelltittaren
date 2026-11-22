// ===================================================================
//  ANDRA MODELLER I METEOGRAMMET (NYTT 21/11 kvall)
// ===================================================================
// Knapparna AIFS, MET Nordic och Nowcast ovanfor meteogrammet (fliken Sannolikhet) lagger andra kallor
// ovanpa MEPS-ensemblen for samma punkt. Webblasaren hamtar sjalv (CORS *), bara for den valda punkten.
//  AIFS      ECMWF:s AI-modell, ensemble 51 medlemmar (Open-Meteo, gratis for icke-kommersiellt bruk).
//            Ritas som gront band 10-90 % + gron streckad median.
//  MET Nordic met.no:s 1 km-produkt (MEPS efterbehandlad mot observationer, deterministisk, ca 2,5 dygn).
//            Lila linje (Open-Meteo, modell metno_nordic).
//  Nowcast   met.no nowcast (api.met.no), var 5:e minut ca 2 h framat, radar + modell. Orange linje.
//            Bara nederbordsintensiteten finns for alla steg - temperatur/vind/fukt bara for forsta (prov N).
//  AIFS har ingen byvind hos Open-Meteo (prov N); nederborden ar 6-timmarsmangder utsmetade per timme.
// Parametrar: temperatur 2 m, byvind, nederbord, total molnmangd, relativ fukt (ovriga saknas hos kallorna).
const EXTRA_VAR = {   // meteogrammets parameter -> Open-Meteo-variabel / nowcast-falt, omraknare
  t2:  { om: "temperature_2m", nc: "air_temperature", k: v => v },
  by:  { om: "wind_gusts_10m", nc: "wind_speed_of_gust", k: v => v, ncK: v => v * 1.943844 },   // Open-Meteo i knop direkt
  nb:  { om: "precipitation", nc: "precipitation_rate", k: v => v, summa: true },
  tot: { om: "cloud_cover", k: v => v * 0.08 },   // procent -> oktas
  rh:  { om: "relative_humidity_2m", nc: "relative_humidity", k: v => v }
};
const EXTRA_KALLOR = { aifs: { namn: "AIFS", farg: "#15803d" }, nordic: { namn: "MET Nordic", farg: "#7c3aed" }, nc: { namn: "Nowcast", farg: "#ea580c" } };
let EXTRA_PA = (() => { try { return JSON.parse(lasa("mt:meteoExtra") || "{}"); } catch (e) { return {}; } })();
const EXTRA_C = new Map();   // cache: kalla|var|lat|lon -> {k: tid, d: data}
const extraNyck = (k, v, lat, lon) => k + "|" + v + "|" + lat.toFixed(3) + "|" + lon.toFixed(3);

// 22/11: tidsgrans 30 s (Open-Meteo kan vara seg) - annars syns inget alls
async function extraJson(url) {
  const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 30000);
  try { const r = await fetch(url, { signal: ac.signal }); if (!r.ok) throw new Error("svarade " + r.status); return await r.json(); }
  catch (e) { throw new Error(e.name === "AbortError" ? "svarade inte inom 30 s" : e.message === "Failed to fetch" ? "nås inte" : e.message); }
  finally { clearTimeout(tm); }
}
// en kalla for en punkt och parameter -> { tider: [ms], medl: [[varden per tid] ...] } (nowcast/nordic: en medlem)
async function extraHamtaEn(kalla, v, lat, lon) {
  const X = EXTRA_VAR[v]; if (!X || (kalla === "nc" && !X.nc)) return null;
  const nyck = extraNyck(kalla, v, lat, lon), c = EXTRA_C.get(nyck); if (c && Date.now() - c.k < (kalla === "nc" ? 4 : 20) * 60e3) return c.d;
  let d = null; const la = lat.toFixed(4), lo = lon.toFixed(4);
  if (kalla === "aifs" || kalla === "nordic") {
    const url = kalla === "aifs"
      ? "https://ensemble-api.open-meteo.com/v1/ensemble?latitude=" + la + "&longitude=" + lo + "&hourly=" + X.om + "&models=ecmwf_aifs025&wind_speed_unit=kn&past_days=2&forecast_days=4&timeformat=unixtime"
      : "https://api.open-meteo.com/v1/forecast?latitude=" + la + "&longitude=" + lo + "&hourly=" + X.om + "&models=metno_nordic&wind_speed_unit=kn&past_days=2&forecast_days=3&timeformat=unixtime";
    const j = await extraJson(url), H = j.hourly || {};
    const nycklar = Object.keys(H).filter(k => k === X.om || k.startsWith(X.om + "_member"));
    d = { tider: (H.time || []).map(t => t * 1000), medl: nycklar.map(k => H[k].map(w => w === null ? NaN : X.k(w))) };
    if (!d.medl.some(r => r.some(isFinite))) d = { tom: "har inte " + PPARAM[v].namn.toLowerCase().split(",")[0] };   // t.ex. AIFS har ingen byvind (prov N)
  } else {
    const j = await extraJson("https://api.met.no/weatherapi/nowcast/2.0/complete?lat=" + (+la).toFixed(4) + "&lon=" + (+lo).toFixed(4));
    const ts = (j.properties && j.properties.timeseries) || [], kk = X.ncK || X.k;
    d = { tider: ts.map(t => Date.parse(t.time)), medl: [ts.map(t => { const w = t.data && t.data.instant && t.data.instant.details ? t.data.instant.details[X.nc] : undefined; return w === undefined || w === null ? NaN : kk(w); })], steg: 5 };
    // nowcast har bara nederbord framat - ovriga bara for "nu" (prov N): en enda punkt ar inte vard en linje
    if (d.medl[0].filter(isFinite).length < 3) d = { tom: "bara nederbörd framåt (övrigt bara för nu)" };
  }
  EXTRA_C.set(nyck, { k: Date.now(), d }); return d;
}
// hamta det som ar pa for meteogrammets punkt, rita om nar nagot kommit
// 22/11: status per kalla bredvid knapparna - hamtas …, klar, finns inte, fel
async function extraHamta(M1) {
  const pa = Object.keys(EXTRA_KALLOR).filter(k => EXTRA_PA[k]); if (!pa.length || !M1) { extraInfo({}); return; }
  const st = {};
  if (!EXTRA_VAR[M1.v]) { for (const k of pa) st[k] = ["fel", "finns inte för " + PPARAM[M1.v].namn.toLowerCase().split(",")[0]]; extraInfo(st); return; }
  M1.extra = M1.extra || {};
  for (const k of pa) st[k] = ["vant", "hämtas …"]; extraInfo(st);
  await Promise.all(pa.map(async k => {
    try { const d = await extraHamtaEn(k, M1.v, M1.lat, M1.lon);
      if (!d) st[k] = ["fel", "finns inte för " + PPARAM[M1.v].namn.toLowerCase().split(",")[0]];
      else if (d.tom) st[k] = ["fel", d.tom];
      else { M1.extra[k] = d; st[k] = ["ok", d.medl.length > 1 ? "klar (" + d.medl.length + " medl.)" : "klar"]; }
    } catch (e) { st[k] = ["fel", e.message]; }
    if (P.meteo === M1) { ritaMeteogram(); extraInfo(st); }
  }));
}
function extraInfo(st) {
  const e = $("pMeteoExtraInfo"); if (!e) return; e.textContent = "";
  for (const k of Object.keys(st)) { const sp = document.createElement("span"); sp.className = "xst " + st[k][0];
    sp.textContent = EXTRA_KALLOR[k].namn + ": " + st[k][1]; e.appendChild(sp); }
}

// --- serier for ritningen, i meteogrammets timmar (h = timmar efter korningens start) ---
// lage: nederbordens visning (ack/h1/h3/h6) eller null; start = ackumuleringens start (timme)
function extraSerier(M0, lage, start, bas, nt) {
  const ut = []; if (!M0.extra || !EXTRA_VAR[M0.v]) return ut;
  const summa = EXTRA_VAR[M0.v].summa;
  for (const k of Object.keys(EXTRA_KALLOR)) {
    const d = M0.extra[k]; if (!EXTRA_PA[k] || !d || !d.medl || !d.medl.length) continue;
    const K = EXTRA_KALLOR[k];
    if (k === "nc") {   // 5-minuterssteg; nederbord: intensitet mm/h -> bara i "per timme"-lage (som mm/h)
      if (summa && lage !== "h1") continue;
      const pkt = []; d.tider.forEach((t, i) => { const w = d.medl[0][i]; if (isFinite(w)) pkt.push({ h: (t - bas) / 3600e3, v: w }); });
      ut.push({ k, namn: K.namn + (summa ? " (mm/h)" : ""), farg: K.farg, pkt: pkt.filter(p => p.h > -1 && p.h < nt) }); continue;
    }
    // timvarden per medlem pa meteogrammets timmar
    const idx = new Map(d.tider.map((t, i) => [Math.round((t - bas) / 3600e3), i]));
    const varde = (m, h) => { const i = idx.get(h); return i === undefined ? NaN : d.medl[m][i]; };
    const perMedl = d.medl.map((_, m) => {
      const r = new Float64Array(nt).fill(NaN);
      for (let h = 0; h < nt; h++) {
        if (!summa) r[h] = varde(m, h);
        else if (lage === "ack") { if (h < start) continue; let s = 0, ok = true; for (let q = start + 1; q <= h; q++) { const w = varde(m, q); if (!isFinite(w)) { ok = false; break; } s += w; } r[h] = ok ? s : NaN; }
        else { const N = lage === "h1" ? 1 : lage === "h3" ? 3 : 6; const tim = new Date(bas + h * 3600e3).getUTCHours(); if (N > 1 && tim % N) continue;
          let s = 0, ok = true; for (let q = h - N + 1; q <= h; q++) { const w = varde(m, q); if (!isFinite(w)) { ok = false; break; } s += w; } r[h] = ok ? s : NaN; }
      }
      return r;
    });
    if (perMedl.length > 1) {   // ensemble -> band
      const band = [];
      for (let h = 0; h < nt; h++) { const s = perMedl.map(r => r[h]).filter(isFinite).sort((a, b) => a - b); if (s.length < 5) continue;
        band.push({ h, lo: kvantil(s, 0.1), mid: kvantil(s, 0.5), hi: kvantil(s, 0.9), n: s.length }); }
      ut.push({ k, namn: K.namn + " (" + perMedl.length + " medl.)", farg: K.farg, band });
    } else {
      const pkt = []; for (let h = 0; h < nt; h++) if (isFinite(perMedl[0][h])) pkt.push({ h, v: perMedl[0][h] });
      ut.push({ k, namn: K.namn, farg: K.farg, pkt });
    }
  }
  return ut;
}
// varden att ta med i y-skalan
function extraVarden(S) { const v = []; for (const s of S) { if (s.band) for (const b of s.band) v.push(b.lo, b.hi); if (s.pkt) for (const p of s.pkt) v.push(p.v); } return v; }
// rita serierna (x = timmens mitt)
function extraRita(svg, S, x, y, tipsTid) {
  for (const s of S) {
    if (s.band && s.band.length) {
      // bandet i sammanhangande bitar (hal dar timmar saknas)
      let bit = []; const bitar = [];
      for (const b of s.band) { if (bit.length && b.h !== bit[bit.length - 1].h + 1 && b.h - bit[bit.length - 1].h > 6) { bitar.push(bit); bit = []; } bit.push(b); }
      if (bit.length) bitar.push(bit);
      for (const bb of bitar) {
        const upp = bb.map(b => x(b.h) + " " + y(b.hi)).join("L"), ner = bb.slice().reverse().map(b => x(b.h) + " " + y(b.lo)).join("L");
        svg.appendChild(el("path", { d: "M" + upp + "L" + ner + "Z", fill: s.farg, opacity: 0.13, stroke: "none", "pointer-events": "none" }));
        svg.appendChild(el("path", { d: "M" + bb.map(b => x(b.h) + " " + y(b.mid)).join("L"), fill: "none", stroke: s.farg, "stroke-width": 1.8, "stroke-dasharray": "5 3", "pointer-events": "none" }));
      }
      for (const b of s.band) { const c_ = el("circle", { cx: x(b.h), cy: y(b.mid), r: 2.2, fill: s.farg });
        const ti = el("title"); ti.textContent = s.namn + " " + tipsTid(b.h) + ": median " + +b.mid.toFixed(1) + " (10 % " + +b.lo.toFixed(1) + ", 90 % " + +b.hi.toFixed(1) + ")"; c_.appendChild(ti); svg.appendChild(c_); }
    } else if (s.pkt && s.pkt.length) {
      let dd = "", forra = null;
      for (const p of s.pkt) { dd += (forra !== null && p.h - forra <= 1.01 ? "L" : "M") + x(p.h) + " " + y(p.v); forra = p.h; }
      svg.appendChild(el("path", { d: dd, fill: "none", stroke: s.farg, "stroke-width": s.k === "nc" ? 2.2 : 1.8, "pointer-events": "none" }));
      const steg = s.k === "nc" ? 3 : 1;   // nowcast: prick var 15:e min
      s.pkt.forEach((p, i) => { if (i % steg) return; const c_ = el("circle", { cx: x(p.h), cy: y(p.v), r: s.k === "nc" ? 2.4 : 1.8, fill: s.farg });
        const ti = el("title"); ti.textContent = s.namn + " " + tipsTid(p.h) + ": " + +p.v.toFixed(1); c_.appendChild(ti); svg.appendChild(c_); });
    }
  }
}
function extraForkl(S) { return S.length ? " " + S.map(s => s.namn + " = " + (s.band ? "grönt band 10–90 % + streckad median" : s.k === "nc" ? "orange linje (var 5:e min)" : "lila linje")).join(", ") + "." : ""; }

(function extraInit() {
  const rad = $("pMeteoExtra"); if (!rad) return;
  for (const k of Object.keys(EXTRA_KALLOR)) {
    const b = $("pMeteoX_" + k); if (!b) continue; b.setAttribute("aria-pressed", String(!!EXTRA_PA[k]));
    b.addEventListener("click", () => { EXTRA_PA[k] = !EXTRA_PA[k]; b.setAttribute("aria-pressed", String(EXTRA_PA[k])); lagra("mt:meteoExtra", JSON.stringify(EXTRA_PA));
      if (P.meteo) { ritaMeteogram(); extraHamta(P.meteo); } else extraInfo(EXTRA_PA[k] ? { [k]: ["vant", "visas när du öppnar ett meteogram"] } : {}); });
  }
})();
