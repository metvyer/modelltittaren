"use strict";
// ===================================================================
//  TAF-BEVAKNING (NYTT 21/11 natt) - fliken "TAF"
//  Forebild: Jakobs NinJo NfL-lager Bevaka_TAF_METAR (Drive). Per flygplats en tidslinjal over TAF:ens
//  giltighet, gron/gul/rod per timme efter lagsta sikt och molnbas (BKN, OVC eller VV). Samma farg oavsett
//  om det kommer fran grundprognos, BECMG, TEMPO, PROB eller FM - det samsta som kan galla den timmen.
//  METAR-prick i aktuell kategori, AMD (rod) och COR (gul) markerade, TAF-text vid hovring.
//  Tillval: sidvind i byar per bana (basta banan) som egen rad.
//  Larm: ljud, systemavisering och markering nar METAR ar samre an TAF:en eller en ny AMD kommer.
//  Data: aviationweather.gov direkt, annars via mellanservern (/taf, /metar), max 20 flygplatser per anrop.
//  TAF-tolkningen (tafTolka) ar skriven for att aven kunna anvandas av PP-snitt.
// ===================================================================

const TAF_STD = ["ESIB", "ESCF", "ESCM", "ESDF", "ESMV", "ESSA", "ESGG", "ESMS", "ESSV", "ESPA", "ESPE"];   // de 11 forhamtade
const TAF_FARG = { gron: "#16a34a", gul: "#eab308", rod: "#dc2626", ingen: "#cbd5e1" };
const TAF_GRANS_STD = { gulSikt: 5000, gulBas: 1500, rodSikt: 1500, rodBas: 500, gulSv: 15, rodSv: 25 };
const TAF_METAR_GAMMAL_MIN = 40, TAF_UTE_MIN = 10;   // 21/11: utgangen TAF visas som "TAF ute" i 10 min, sedan bort
// Giltig TAF just nu (null om ingen eller om den gick ut for mer an 10 min sedan); .ute = gick nyss ut
function tafNu(icao) { const T = TAFS.data[icao]; if (!T) return null; const nu = Date.now(); if (nu >= T.till + TAF_UTE_MIN * 60e3) return null; T.ute = nu >= T.till; return T; }   // 21/11: aldre METAR -> svart prick
const kmText = m => !isFinite(m) ? "–" : m >= 9999 ? "≥10 km" : (m / 1000).toLocaleString("sv-SE", { maximumFractionDigits: 1 }) + " km";
// 21/11: tid pa kartan - bara HH om den ar i dag eller i morgon (UTC), annars DDHH
function tafKort(ms) { const d = new Date(ms), i = new Date(); i.setUTCHours(0, 0, 0, 0); const dag = Math.floor((ms - i.getTime()) / 864e5);
  return (dag === 0 || dag === 1 ? "" : p2(d.getUTCDate())) + p2(d.getUTCHours()); }
const TAF_INTERVALL_MIN = 5, TAF_FRAM_H = 30, TAF_BAK_H = 2;   // nyhamtning; tidsaxel fran nu-2 h till nu+30 h
const TAF_AWC = "https://aviationweather.gov/api/data/", TAF_MS = "https://modelltittaren.metvyer.workers.dev/";

let TAFS = {
  lista: (() => { try { const a = JSON.parse(lasa("mt:tafLista") || "null"); if (Array.isArray(a) && a.length) return a; } catch (e) {} return TAF_STD.slice(); })(),
  gr: (() => { try { return { ...TAF_GRANS_STD, ...(JSON.parse(lasa("mt:tafGrans") || "{}")) }; } catch (e) { return { ...TAF_GRANS_STD }; } })(),
  vind: lasa("mt:tafVind") === "ja", ljud: lasa("mt:tafLjud") === "ja", avis: lasa("mt:tafAvis") === "ja",
  data: {}, metar: {}, sett: (() => { try { return JSON.parse(lasa("mt:tafSett") || "{}"); } catch (e) { return {}; } })(),
  larm: {}, hamtad: 0, pagar: false
};
const sparaTafs = () => { lagra("mt:tafLista", JSON.stringify(TAFS.lista)); lagra("mt:tafGrans", JSON.stringify(TAFS.gr)); };

// ---------- TAF-tolkning ----------
// Tid "ddhh" eller "ddhhmm" relativt utgivningsmanaden -> ms (UTC). ref = utgivningstid (ms).
function tafTid(dd, hh, mm, ref) {
  const r = new Date(ref); let y = r.getUTCFullYear(), mo = r.getUTCMonth();
  if (+dd < r.getUTCDate() - 15) mo++;            // over manadsskiftet
  return Date.UTC(y, mo, +dd, +hh, +(mm || 0));   // hh 24 -> nasta dag (Date.UTC hanterar det)
}
// Vader i en grupp: sikt (m), molnbas BKN+/VV (ft), vind {dd, ff, gg, vrb}
function tafVader(tok) {
  const v = {};
  for (const t of tok) {
    let m;
    if (t === "CAVOK") { v.sikt = 9999; v.bas = Infinity; }
    else if ((m = t.match(/^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)$/))) { const f = m[4] === "MPS" ? 1.943844 : 1; v.vind = { dd: m[1] === "VRB" ? NaN : +m[1], vrb: m[1] === "VRB", ff: Math.round(+m[2] * f), gg: m[3] ? Math.round(+m[3] * f) : NaN }; }
    else if (/^\d{4}$/.test(t)) v.sikt = +t;
    else if ((m = t.match(/^(\d+)SM$/))) v.sikt = Math.round(+m[1] * 1609);
    else if ((m = t.match(/^(BKN|OVC)(\d{3})/))) v.bas = Math.min(v.bas === undefined || v.bas === Infinity ? Infinity : v.bas, +m[2] * 100);
    else if ((m = t.match(/^VV(\d{3}|\/\/\/)/))) v.bas = Math.min(v.bas === undefined || v.bas === Infinity ? Infinity : v.bas, m[1] === "///" ? 0 : +m[1] * 100);
    else if (/^(FEW|SCT)\d{3}/.test(t)) { if (v.bas === undefined) v.bas = Infinity; }
    else if (t === "NSC" || t === "SKC" || t === "NCD") v.bas = Infinity;
  }
  return v;
}
// Hela TAF:en -> { icao, utg, fran, till, amd, cor, grupper: [{typ, fran, till, prob, v}] }
function tafTolka(raw) {
  const s = raw.replace(/=+\s*$/, "").replace(/\s+/g, " ").trim(), tok = s.split(" ");
  let i = 0; const ut = { raw: s, amd: false, cor: false, grupper: [] };
  if (tok[i] === "TAF") i++;
  while (tok[i] === "AMD" || tok[i] === "COR") { if (tok[i] === "AMD") ut.amd = true; else ut.cor = true; i++; }
  ut.icao = tok[i++];
  let m = (tok[i] || "").match(/^(\d{2})(\d{2})(\d{2})Z$/), ref = Date.now();
  if (m) { const n = new Date(); ref = Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - (+m[1] > n.getUTCDate() + 15 ? 1 : 0), +m[1], +m[2], +m[3]); ut.utg = ref; i++; }
  m = (tok[i] || "").match(/^(\d{2})(\d{2})\/(\d{2})(\d{2})$/);
  if (!m) return null;
  ut.fran = tafTid(m[1], m[2], 0, ref); ut.till = tafTid(m[3], m[4], 0, ref); i++;
  // dela i grupper
  let akt = { typ: "BAS", fran: ut.fran, till: ut.till, tok: [] }; const g = [akt];
  for (; i < tok.length; i++) {
    const t = tok[i];
    if (t === "BECMG" || t === "TEMPO" || /^PROB\d{2}$/.test(t) || /^FM\d{6}$/.test(t)) {
      if (/^PROB\d{2}$/.test(t) && tok[i + 1] === "TEMPO") { akt = { typ: "TEMPO", prob: +t.slice(4), tok: [] }; i++; }
      else if (/^PROB/.test(t)) akt = { typ: "PROB", prob: +t.slice(4), tok: [] };
      else if (t[0] === "F") { const d = t.slice(2); akt = { typ: "FM", fran: tafTid(d.slice(0, 2), d.slice(2, 4), d.slice(4, 6), ref), till: ut.till, tok: [] }; }
      else akt = { typ: t, tok: [] };
      if (akt.typ !== "FM" && (m = (tok[i + 1] || "").match(/^(\d{2})(\d{2})\/(\d{2})(\d{2})$/))) { akt.fran = tafTid(m[1], m[2], 0, ref); akt.till = tafTid(m[3], m[4], 0, ref); i++; }
      g.push(akt);
    } else akt.tok.push(t);
  }
  for (const x of g) { x.v = tafVader(x.tok); delete x.tok; }
  ut.grupper = g.filter(x => isFinite(x.fran) && isFinite(x.till));
  return ut;
}
// Samsta tillstandet per timme [t, t+1h): { sikt, bas, vind: [lista med mojliga vindar] }.
// Grundforloppet (BAS -> BECMG/FM) foljs; under en BECMG-period galler det samsta av fore och efter
// (vindriktningen kan svanga genom hela intervallet). TEMPO/PROB laggs ovanpa som "kan intraffa".
function tafTimmar(T) {
  const n = Math.max(0, Math.round((T.till - T.fran) / 3600e3)), ut = [];
  // grundtillstand som funktion av tid: lista av [fran, v] i ordning (BAS, FM, BECMG-slut)
  const steg = [{ fran: T.fran, v: { ...T.grupper[0].v } }], becmg = [];
  for (const g of T.grupper.slice(1)) {
    if (g.typ === "FM") steg.push({ fran: g.fran, v: { sikt: 9999, bas: Infinity, ...g.v }, ny: true });
    else if (g.typ === "BECMG") { becmg.push(g); steg.push({ fran: g.till, v: g.v }); }
  }
  steg.sort((a, b) => a.fran - b.fran);
  const grundVid = t => { let v = {}; for (const s of steg) { if (s.fran > t) break; v = s.ny ? { ...s.v } : { ...v, ...s.v }; } return v; };
  for (let h = 0; h < n; h++) {
    const t0 = T.fran + h * 3600e3, t1 = t0 + 3600e3, kand = [grundVid(t0), grundVid(t1 - 1)];
    for (const b of becmg) if (b.fran < t1 && b.till > t0) { kand.push({ ...grundVid(b.fran - 1), ...b.v }); kand.push(grundVid(b.fran - 1)); kand.push({ ...kand[0], ...b.v, svang: true }); }
    for (const g of T.grupper) if ((g.typ === "TEMPO" || g.typ === "PROB") && g.fran < t1 && g.till > t0) kand.push({ ...grundVid(t0), ...g.v });
    let sikt = Infinity, bas = Infinity; const vind = [];
    for (const k of kand) { if (isFinite(k.sikt)) sikt = Math.min(sikt, k.sikt); if (k.bas !== undefined) bas = Math.min(bas, k.bas); if (k.vind) vind.push({ ...k.vind, svang: !!k.svang }); }
    // svang: under BECMG kan riktningen ga mellan fore och efter -> markera intervallet
    ut.push({ t: t0, sikt, bas, vind });
  }
  return ut;
}
// Kategori 0 gron, 1 gul, 2 rod
function tafKat(sikt, bas) {
  const G = TAFS.gr; if (sikt < G.rodSikt || bas < G.rodBas) return 2; if (sikt < G.gulSikt || bas < G.gulBas) return 1; return 0;
}
// Sidvind (kt) for en vind mot basta banan. VRB = hela styrkan. BECMG-svang: alla riktningar mellan fore och efter.
function tafSidvind(vindar, banor, icao) {
  if (!vindar.length || !banor.length) return NaN;
  let samst = 0; const dirs = vindar.filter(v => !v.vrb && isFinite(v.dd)).map(v => v.dd);
  for (const v of vindar) {
    const f = isFinite(v.gg) ? v.gg : v.ff; if (!isFinite(f)) continue;
    let rikt = [];
    if (v.vrb) { samst = Math.max(samst, f); continue; }
    if (v.svang && dirs.length > 1) { const a = Math.min(...dirs), b = Math.max(...dirs); for (let d = a; d <= b; d += 10) rikt.push(d); } else rikt = [v.dd];
    for (const d of rikt) samst = Math.max(samst, Math.min(...banor.map(bn => f * Math.abs(Math.sin((d - bn) * Math.PI / 180)))));
  }
  return samst;
}
function metarKat(o) {
  if (!o) return -1;
  if (Date.now() - o.t > TAF_METAR_GAMMAL_MIN * 60e3) return 3;   // for gammal -> svart
  const l = o.lager.filter(x => x.kat >= 3).map(x => x.ft); if (o.vv !== null) l.push(o.vv);
  const bas = l.length ? Math.min(...l) : Infinity, sikt = isFinite(o.sikt) ? o.sikt : 9999;
  return tafKat(sikt, bas);
}

// ---------- Hamtning ----------
async function tafHamtaJson(typ, ids, extra) {
  for (const bas of [TAF_AWC, TAF_MS]) {
    try {
      const ctl = new AbortController(), tid = setTimeout(() => ctl.abort(), 10000);
      const r = await fetch(bas + typ + "?ids=" + ids.join(",") + "&format=json" + (extra || ""), { signal: ctl.signal }); clearTimeout(tid);
      if (r.ok) return await r.json();
    } catch (e) {}
  }
  return null;
}
async function tafUppdatera(tyst) {
  if (TAFS.pagar) return; TAFS.pagar = true;
  const st = $("tafStatus"); if (st && !tyst) st.textContent = "Hämtar TAF och METAR …";
  try {
    for (let i = 0; i < TAFS.lista.length; i += 20) {
      const ids = TAFS.lista.slice(i, i + 20);
      const [tafs, mets] = await Promise.all([tafHamtaJson("taf", ids), tafHamtaJson("metar", ids, "&hours=2")]);
      for (const icao of ids) {
        const t = (tafs || []).filter(d => d.icaoId === icao && d.rawTAF).sort((a, b) => (b.issueTime || "").localeCompare(a.issueTime || ""))[0];
        // 21/11: en TAF vars giltighet har gatt ut (t.ex. flygplatsen stangd over helgen) raknas som ingen TAF -
        // da visas bara METAR, ingen linjal
        const T = t ? tafTolka(t.rawTAF) : null;
        if (T && T.till + TAF_UTE_MIN * 60e3 > Date.now()) { T.timmar = tafTimmar(T); TAFS.data[icao] = T; }
        else if (tafs) { TAFS.data[icao] = null; TAFS.gammal = TAFS.gammal || {}; TAFS.gammal[icao] = T ? T.raw : ""; }
        const m = (mets || []).filter(d => d.icaoId === icao && d.rawOb).sort((a, b) => (b.obsTime || 0) - (a.obsTime || 0))[0];
        if (m) TAFS.metar[icao] = { t: m.obsTime * 1000, raw: m.rawOb, ...tolkaMetar(m.rawOb) }; else if (mets) TAFS.metar[icao] = null;
      }
    }
    TAFS.hamtad = Date.now();
    if (st) st.textContent = "Uppdaterat " + p2(new Date().getUTCHours()) + ":" + p2(new Date().getUTCMinutes()) + "Z – nästa om " + TAF_INTERVALL_MIN + " min.";
    tafKollaLarm();
  } catch (e) { if (st) st.textContent = "Kunde inte hämta: " + e.message; }
  finally { TAFS.pagar = false; }
  tafRita();
}

// ---------- Larm ----------
let tafAudio = null;
function tafPip() {
  try { tafAudio = tafAudio || new (window.AudioContext || window.webkitAudioContext)();
    for (const [f, t] of [[880, 0], [660, 0.22], [880, 0.44]]) { const o = tafAudio.createOscillator(), g = tafAudio.createGain(); o.frequency.value = f; o.connect(g); g.connect(tafAudio.destination);
      g.gain.setValueAtTime(0.0001, tafAudio.currentTime + t); g.gain.exponentialRampToValueAtTime(0.25, tafAudio.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, tafAudio.currentTime + t + 0.18);
      o.start(tafAudio.currentTime + t); o.stop(tafAudio.currentTime + t + 0.2); } } catch (e) {}
}
function tafKollaLarm() {
  const nya = [];
  for (const icao of TAFS.lista) {
    const T0 = tafNu(icao), T = T0 && !T0.ute ? T0 : null, M_ = TAFS.metar[icao]; TAFS.larm[icao] = "";
    if (T && T.amd && T.utg && (!TAFS.sett[icao] || TAFS.sett[icao] < T.utg)) { TAFS.larm[icao] = "Ny AMD"; nya.push(icao + ": ny TAF AMD"); }
    if (T && M_ && T.timmar) {
      const h = T.timmar.find(x => M_.t >= x.t && M_.t < x.t + 3600e3) || T.timmar.find(x => Date.now() >= x.t && Date.now() < x.t + 3600e3);
      if (h) { const km = metarKat(M_), kt = tafKat(h.sikt, h.bas); if (km <= 2 && km > kt) { TAFS.larm[icao] = "METAR sämre än TAF"; if (TAFS.sett[icao + ":m"] !== M_.t) nya.push(icao + ": METAR sämre än TAF"); } }
    }
  }
  if (nya.length) {
    for (const icao of TAFS.lista) { const T = TAFS.data[icao], M_ = TAFS.metar[icao]; if (T && T.amd && T.utg) TAFS.sett[icao] = Math.max(TAFS.sett[icao] || 0, T.utg); if (M_ && TAFS.larm[icao] === "METAR sämre än TAF") TAFS.sett[icao + ":m"] = M_.t; }
    lagra("mt:tafSett", JSON.stringify(TAFS.sett));
    if (TAFS.ljud) tafPip();
    if (TAFS.avis && "Notification" in window && Notification.permission === "granted") { try { new Notification("TAF-bevakning", { body: nya.join("\n"), tag: "taf" }); } catch (e) {} }
  }
}

// ---------- Ritning: tabell ----------
const tafAxel = () => { const nu = Date.now(), t0 = Math.floor(nu / 3600e3) * 3600e3 - TAF_BAK_H * 3600e3; return { t0, n: TAF_BAK_H + TAF_FRAM_H, nu }; };
const tafBanor = icao => { const p = PUNKTER.find(x => x[1] === icao) || FLYG.find(x => x[0] === icao); return p ? banorFor(icao, p[2] !== undefined ? p[2] : p[2], p[3]).map(b => b.sann) : []; };
function tafPlats(icao) { const p = PUNKTER.find(x => x[1] === icao); if (p) return [p[0], p[2], p[3]]; const f = FLYG.find(x => x[0] === icao); return f ? [f[1] || icao, f[2], f[3]] : [icao, NaN, NaN]; }
function tafRita() { tafRitaTabell(); tafRitaKarta(); }
// 21/11: ordning i tabellen (mt:tafOrdning)
const TAF_ORDNING = [["alfa", "Bokstavsordning (ICAO)"], ["tillagd", "Ordning de lades till"], ["ns", "Norr → söder"], ["sn", "Söder → norr"], ["vo", "Väst → öst"], ["ov", "Öst → väst"], ["samst", "Sämst först (tidigast röd, sedan gul)"]];
function tafSamstNyckel(icao) {
  const T = tafNu(icao); if (!T || T.ute || !T.timmar) return [3, 0];
  const nu = Math.floor(Date.now() / 3600e3) * 3600e3, fram = T.timmar.filter(x => x.t >= nu), kat = fram.map(x => tafKat(x.sikt, x.bas));
  const r = kat.indexOf(2); if (r >= 0) return [0, fram[r].t]; const g = kat.indexOf(1); if (g >= 0) return [1, fram[g].t]; return [2, 0];
}
function tafSorterad() {
  const o = lasa("mt:tafOrdning") || "tillagd", l = TAFS.lista.slice(), pos = i => tafPlats(i);
  if (o === "alfa") l.sort();
  else if (o === "ns" || o === "sn") l.sort((a, b) => ((pos(b)[1] || 0) - (pos(a)[1] || 0)) * (o === "ns" ? 1 : -1));
  else if (o === "vo" || o === "ov") l.sort((a, b) => ((pos(a)[2] || 0) - (pos(b)[2] || 0)) * (o === "vo" ? 1 : -1));
  else if (o === "samst") l.sort((a, b) => { const x = tafSamstNyckel(a), y = tafSamstNyckel(b); return x[0] - y[0] || x[1] - y[1] || a.localeCompare(b); });
  return l;
}
function tafRitaTabell() {
  const box = $("tafTabell"); if (!box) return; box.textContent = "";
  const A = tafAxel(), tab = document.createElement("table"); tab.className = "taftab";
  const hr = document.createElement("tr"); hr.innerHTML = "<th>Flygplats</th><th>METAR</th>";
  for (let h = 0; h < A.n; h++) { const d = new Date(A.t0 + h * 3600e3), th = document.createElement("th"); th.className = "tim" + (d.getUTCHours() === 0 ? " dygn" : "") + (A.nu >= d.getTime() && A.nu < d.getTime() + 3600e3 ? " nu" : "");
    th.textContent = d.getUTCHours() % 3 === 0 ? p2(d.getUTCHours()) : ""; th.title = VECKODAG[d.getUTCDay()] + " " + p2(d.getUTCHours()) + "Z"; hr.appendChild(th); }
  const thead = document.createElement("thead"); thead.appendChild(hr); tab.appendChild(thead);
  const tb = document.createElement("tbody");
  for (const icao of tafSorterad()) {
    const T0 = tafNu(icao), T = T0 && !T0.ute ? T0 : null, Mo = TAFS.metar[icao], [namn] = tafPlats(icao), banor = tafBanor(icao);
    for (const rad of TAFS.vind && T ? ["sv", "vind"] : ["sv"]) {
      const tr = document.createElement("tr"); if (rad === "vind") tr.className = "vindrad"; if (TAFS.larm[icao] && rad === "sv") tr.classList.add("larm");
      const c1 = document.createElement("td"); c1.className = "namn";
      if (rad === "sv") {
        c1.innerHTML = "<b>" + icao + "</b> <span class=\"dim\">" + namn + "</span>" + (T && T.amd ? ' <span class="amd">AMD</span>' : "") + (T && T.cor ? ' <span class="cor">COR</span>' : "") +
          (TAFS.larm[icao] ? ' <span class="larmtxt">⚠ ' + TAFS.larm[icao] + "</span>" : "");
        const x = document.createElement("button"); x.className = "tafx"; x.textContent = "×"; x.title = "Ta bort " + icao; x.addEventListener("click", () => tafVaxla(icao)); c1.appendChild(x);
      } else c1.innerHTML = '<span class="dim">sidvind' + (banor.length ? "" : " (inga banor)") + "</span>";
      if (rad === "sv" && !T) c1.insertAdjacentHTML("beforeend", T0 && T0.ute ? ' <span class="ute">TAF gick ut ' + p2(new Date(T0.till).getUTCHours()) + p2(new Date(T0.till).getUTCMinutes()) + "Z</span>" : ' <span class="dim">– ingen giltig TAF</span>');
      tr.appendChild(c1);
      const c2 = document.createElement("td"); c2.className = "met";
      if (rad === "sv") { const k = metarKat(Mo); c2.innerHTML = Mo ? '<span class="prick" style="background:' + [TAF_FARG.gron, TAF_FARG.gul, TAF_FARG.rod, "#111"][k] + '"></span>' + p2(new Date(Mo.t).getUTCHours()) + p2(new Date(Mo.t).getUTCMinutes()) + "Z" : '<span class="dim">–</span>';
        if (Mo) c2.title = Mo.raw + (k === 3 ? "\n(äldre än " + TAF_METAR_GAMMAL_MIN + " min – svart)" : "\nFärg efter samma gränser som TAF:en"); }
      tr.appendChild(c2);
      for (let h = 0; h < A.n; h++) {
        const t = A.t0 + h * 3600e3, td = document.createElement("td"); td.className = "cell";
        const x = T && T.timmar ? T.timmar.find(q => q.t === t) : null;
        if (x) {
          let k, txt;
          if (rad === "sv") { k = tafKat(x.sikt, x.bas); txt = "sikt " + kmText(x.sikt) + ", molnbas " + (isFinite(x.bas) ? x.bas + " ft" : "ingen BKN/OVC"); }
          else { const sv = tafSidvind(x.vind, banor, icao); k = !isFinite(sv) ? -1 : sv >= TAFS.gr.rodSv ? 2 : sv >= TAFS.gr.gulSv ? 1 : 0; txt = isFinite(sv) ? "sidvind i byar högst " + Math.round(sv) + " kt (bästa banan)" : "ingen vind/bana"; }
          td.style.background = k < 0 ? TAF_FARG.ingen : [TAF_FARG.gron, TAF_FARG.gul, TAF_FARG.rod][k];
          const d = new Date(t); td.title = icao + " " + VECKODAG[d.getUTCDay()] + " " + p2(d.getUTCHours()) + "Z: " + txt + "\n\n" + tafRader(T.raw);
        }
        if (A.nu >= t && A.nu < t + 3600e3) td.classList.add("nu");
        if (new Date(t).getUTCHours() === 0) td.classList.add("dygn");
        tr.appendChild(td);
      }
      if (rad === "sv" && !T) { tr.title = icao + ": ingen giltig TAF just nu" + (TAFS.gammal && TAFS.gammal[icao] ? " – senaste har gått ut:\n" + tafRader(TAFS.gammal[icao]) : ""); tr.classList.add("ingentaf"); }
      tb.appendChild(tr);
    }
  }
  tab.appendChild(tb); box.appendChild(tab);
}

// ---------- Ritning: karta (linjaler) ----------
function tafRitaKarta() {
  const g = $("kTaf"); if (!g) return; g.textContent = ""; if (lage !== "taf") return;
  const rekt = $("karta").getBoundingClientRect(); if (!rekt.width) return;
  const ppu = rekt.width / vb.w, px = v => v / ppu, A = tafAxel(), L = 110, H = 9, tim = L / A.n;
  for (const icao of TAFS.lista) {
    const [namn, lat, lon] = tafPlats(icao); if (!isFinite(lat)) continue;
    const T0 = tafNu(icao), T = T0 && !T0.ute ? T0 : null, k = tillKarta(lat, lon), Mo = TAFS.metar[icao], x0 = k.x + px(10), y0 = k.y - px(H / 2);
    const gp = el("g", {}); g.appendChild(gp);
    const tt = el("title"); tt.textContent = icao + " " + namn + (T ? "\n" + tafRader(T.raw) : "\ningen giltig TAF just nu" + (TAFS.gammal && TAFS.gammal[icao] ? " (senaste har gått ut:\n" + tafRader(TAFS.gammal[icao]) + ")" : "")) + (Mo ? "\n\n" + Mo.raw : ""); gp.appendChild(tt);
    // METAR-prick pa flygplatsen: samma granser som TAF:en, svart om aldre an 40 min, vit om ingen METAR
    const km = metarKat(Mo);
    gp.appendChild(el("circle", { cx: k.x, cy: k.y, r: px(5.5), fill: km < 0 ? "#fff" : [TAF_FARG.gron, TAF_FARG.gul, TAF_FARG.rod, "#111"][km], stroke: "#111", "stroke-width": px(1.2) }));
    // 21/11: AMD i rott, COR i gult/brunt pa kartan
    const lab = el("text", { x: x0, y: y0 - px(3), "font-size": px(10), "font-weight": 700, fill: "#111", stroke: "#fff", "stroke-width": px(2.5), "paint-order": "stroke" }, icao);
    if (T && T.amd) lab.appendChild(el("tspan", { fill: "#dc2626" }, " AMD"));
    if (T && T.cor) lab.appendChild(el("tspan", { fill: "#a16207" }, " COR"));
    if (TAFS.larm[icao]) lab.appendChild(el("tspan", { fill: "#dc2626" }, " ⚠"));
    gp.appendChild(lab);
    if (T0 && T0.ute) {   // nyss utgangen: kort gra streckad ruta "TAF ute HH" i 10 min
      gp.appendChild(el("rect", { x: x0, y: y0, width: px(22), height: px(H), fill: "#e5e7eb", stroke: "#6b7280", "stroke-width": px(0.8), "stroke-dasharray": px(2) + " " + px(1.5), rx: px(2) }));
      gp.appendChild(el("text", { x: x0 + px(25), y: y0 + px(H - 1.5), "font-size": px(8.5), "font-weight": 700, fill: "#6b7280", stroke: "#fff", "stroke-width": px(2), "paint-order": "stroke" }, "TAF ute " + tafKort(T0.till)));
      continue;
    }
    if (!T || !T.timmar) continue;
    const kat = T.timmar.map(x => tafKat(x.sikt, x.bas)), helgron = kat.every(x => x === 0);
    const banor = TAFS.vind ? tafBanor(icao) : [], svKat = TAFS.vind ? T.timmar.map(x => { const sv = tafSidvind(x.vind, banor, icao); return !isFinite(sv) ? -1 : sv >= TAFS.gr.rodSv ? 2 : sv >= TAFS.gr.gulSv ? 1 : 0; }) : [];
    const svHelgron = !svKat.length || svKat.every(x => x <= 0);
    const tidText = (x, txt, anchor, fet) => gp.appendChild(el("text", { x, y: y0 + px(H + (TAFS.vind ? H / 2 + 1 : 0) + 9), "font-size": px(8.5), "font-weight": fet ? 700 : 400, "text-anchor": anchor, fill: "#111", stroke: "#fff", "stroke-width": px(2), "paint-order": "stroke" }, txt));
    if (helgron && svHelgron) {   // kort gron stump, start- och sluttid efter
      gp.appendChild(el("rect", { x: x0, y: y0, width: px(22), height: px(H), fill: TAF_FARG.gron, stroke: "#111", "stroke-width": px(0.8), rx: px(2) }));
      gp.appendChild(el("text", { x: x0 + px(25), y: y0 + px(H - 1.5), "font-size": px(8.5), fill: "#111", stroke: "#fff", "stroke-width": px(2), "paint-order": "stroke" }, tafKort(T.fran) + "–" + tafKort(T.till)));
      continue;
    }
    const xAv = t => x0 + px(Math.max(0, Math.min(A.n, (t - A.t0) / 3600e3)) * tim);
    gp.appendChild(el("rect", { x: x0, y: y0, width: px(L), height: px(H), fill: "#ffffff", stroke: "#111", "stroke-width": px(0.8) }));
    const ritaRad = (kk, yy, hh) => T.timmar.forEach((x, i) => { const h = (x.t - A.t0) / 3600e3; if (h < 0 || h >= A.n || kk[i] < 0) return;
      gp.appendChild(el("rect", { x: x0 + px(h * tim), y: yy, width: px(tim) + px(0.3), height: px(hh), fill: [TAF_FARG.gron, TAF_FARG.gul, TAF_FARG.rod][kk[i]] })); });
    ritaRad(kat, y0, H);
    if (TAFS.vind) {   // 21/11: sidvind som halvtjock linjal under
      gp.appendChild(el("rect", { x: x0, y: y0 + px(H + 1), width: px(L), height: px(H / 2), fill: "#ffffff", stroke: "#111", "stroke-width": px(0.6) }));
      ritaRad(svKat, y0 + px(H + 1), H / 2);
      gp.appendChild(el("rect", { x: x0, y: y0 + px(H + 1), width: px(L), height: px(H / 2), fill: "none", stroke: "#111", "stroke-width": px(0.6) }));
    }
    const hn = (A.nu - A.t0) / 3600e3; gp.appendChild(el("line", { x1: x0 + px(hn * tim), x2: x0 + px(hn * tim), y1: y0 - px(2), y2: y0 + px(H + (TAFS.vind ? H / 2 + 1 : 0) + 2), stroke: "#111", "stroke-width": px(1.4) }));
    gp.appendChild(el("rect", { x: x0, y: y0, width: px(L), height: px(H), fill: "none", stroke: "#111", "stroke-width": px(0.8) }));
    // 21/11: sluttid alltid efter linjalen; starttid och tider for fargbyten under linjalen (hoppar over om de krockar)
    gp.appendChild(el("text", { x: x0 + px(L + 3), y: y0 + px(H - 1.5), "font-size": px(9), "font-weight": 700, fill: "#111", stroke: "#fff", "stroke-width": px(2), "paint-order": "stroke" }, tafKort(T.till)));
    const satta = [];
    const lagg = (t, fet) => { const x = xAv(t); if (satta.some(q => Math.abs(q - x) < px(15))) return; satta.push(x); tidText(x, tafKort(t), "middle", fet); };
    if (T.fran >= A.t0) lagg(T.fran, true);
    for (let i = 1; i < T.timmar.length; i++) {
      const byt = kat[i] !== kat[i - 1] || (svKat.length && svKat[i] !== svKat[i - 1]);
      if (byt && T.timmar[i].t > A.t0 && T.timmar[i].t < A.t0 + A.n * 3600e3) lagg(T.timmar[i].t, false);
    }
  }
}
function tafVaxla(icao) {
  const i = TAFS.lista.indexOf(icao); if (i >= 0) TAFS.lista.splice(i, 1); else TAFS.lista.push(icao);
  sparaTafs(); tafRita(); if (i < 0) tafUppdatera(true);
}

// ---------- Installningar ----------
function tafInit() {
  const g = TAFS.gr;
  // 21/11: sikt anges i km (0,1 = 100 m), sparas i meter
  for (const [id, k] of [["tafGulSikt", "gulSikt"], ["tafGulBas", "gulBas"], ["tafRodSikt", "rodSikt"], ["tafRodBas", "rodBas"], ["tafGulSv", "gulSv"], ["tafRodSv", "rodSv"]]) {
    const e = $(id), km = /Sikt$/.test(k); e.value = km ? g[k] / 1000 : g[k];
    e.addEventListener("change", () => { let v = parseFloat(String(e.value).replace(",", ".")); if (isFinite(v)) { if (km) v = Math.round(v * 1000); TAFS.gr[k] = v; sparaTafs(); for (const ic in TAFS.data) if (TAFS.data[ic]) {} tafKollaLarm(); tafRita(); } });
  }
  const kn = (id, nyck, flagga, efter) => { const b = $(id); b.setAttribute("aria-pressed", String(TAFS[flagga]));
    b.addEventListener("click", () => { TAFS[flagga] = !TAFS[flagga]; lagra(nyck, TAFS[flagga] ? "ja" : "nej"); b.setAttribute("aria-pressed", String(TAFS[flagga])); if (efter) efter(); tafRita(); }); };
  kn("tafVind", "mt:tafVind", "vind");
  kn("tafLjud", "mt:tafLjud", "ljud", () => { if (TAFS.ljud) tafPip(); });
  kn("tafAvis", "mt:tafAvis", "avis", () => { if (TAFS.avis && "Notification" in window && Notification.permission !== "granted") Notification.requestPermission().then(p => { if (p !== "granted") { TAFS.avis = false; lagra("mt:tafAvis", "nej"); $("tafAvis").setAttribute("aria-pressed", "false"); $("tafStatus").textContent = "Webbläsaren tillät inte aviseringar."; } }); });
  $("tafLagg").addEventListener("click", () => { const v = $("tafNy").value.trim().toUpperCase(); if (!/^[A-Z]{4}$/.test(v)) { $("tafStatus").textContent = "Skriv en ICAO-kod med fyra bokstäver."; return; } if (!TAFS.lista.includes(v)) tafVaxla(v); $("tafNy").value = ""; });
  $("tafNy").addEventListener("keydown", e => { if (e.key === "Enter") $("tafLagg").click(); });
  $("tafStd").addEventListener("click", () => { TAFS.lista = TAF_STD.slice(); sparaTafs(); tafUppdatera(); });
  $("tafNu").addEventListener("click", () => tafUppdatera());
  const ord = $("tafOrdning"); for (const [v, n] of TAF_ORDNING) ord.add(new Option(n, v)); ord.value = lasa("mt:tafOrdning") || "tillagd";
  ord.addEventListener("change", () => { lagra("mt:tafOrdning", ord.value); tafRitaTabell(); });
  // nyhamtning var 5:e minut (aven i bakgrunden, sa att larmen fungerar) - bara om listan anvants
  setInterval(() => { if (lage === "taf") tafRita(); }, 60e3);   // nu-strecket och "TAF ute" foljer klockan
  setInterval(() => { if (Date.now() - TAFS.hamtad >= TAF_INTERVALL_MIN * 60e3 && (lage === "taf" || TAFS.ljud || TAFS.avis)) tafUppdatera(true); }, 30e3);
}
function tafIn() { if (Date.now() - TAFS.hamtad > 60e3) tafUppdatera(); else tafRita(); }
tafInit();
