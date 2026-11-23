// Modelltittaren – mellanserver (Cloudflare Worker) till thredds.met.no och aviationweather.gov
// Hämtar MEPS-data och METAR åt sidan metvyer.github.io/modelltittaren när källan inte nås direkt.
// Släpper bara igenom läsning (GET) av MEPS-filer i katalogen mepslatest och METAR, och bara från vår sida.
// Ingen nyckel, inget lösenord. Data från MET Norway (CC BY 4.0) och NOAA aviationweather.gov.
//
// NYTT 21/11: DELA VY (/dela). Sidan sparar en liten beskrivning av vad man tittar på (flik, parameter, tröskel, tid,
// område, zoom, körning - inga data, inga namn) i D1-tabellen "delning". Kollegor öppnar länken …/#v=<id> och
// följer med när ägaren ändrar (sidan frågar var 15:e sekund). Bara den som har ägarnyckeln kan ändra vyn.
// Egna namn (…/#v=metocc). Ingen automatisk radering. Tittare säger "jag är här" var 30:e s (namn de skrivit själva).
// NYTT 19/11: statistik i D1-databasen "modelltittaren-statistik" (binding DB): varje anrop räknas per dag och typ,
// och varje verklig hämtning från met.no/aviationweather (cachemiss) sparas med storlek. Visas via /statistik
// (sidan statistik.html). Inga IP-adresser eller personuppgifter sparas - bara vad som hämtades, när och hur stort.
// NYTT 18/11 kväll: /taf (senaste TAF). NYTT 18/11: delad cache (Cloudflare Workers Caching). Laddas upp automatiskt av Cloudflare
// (Workers Builds, kopplat till detta repo, mapp verktyg) – klistra INTE in koden för hand längre,
// då försvinner cache-inställningen. Inställningen finns i verktyg/wrangler.toml.
//
// Två delar:
//  * default (ingen cache): kollar avsändare och sökväg, lägger på CORS. Körs vid varje anrop.
//  * Kalla (med cache): hämtar från thredds/aviationweather och sätter Cache-Control.
//    Har någon redan frågat samma sak hämtar Cloudflare svaret ur cachen och Kalla körs inte alls,
//    så met.no får bara en fråga även om många kollegor tittar på samma flygplats.

import { WorkerEntrypoint } from "cloudflare:workers";

const TILLATNA_SIDOR = ["https://metvyer.github.io"];
const THREDDS = "https://thredds.met.no/thredds/dodsC/mepslatest/";
// Tillåtna filnamn: meps_….ncml.ascii / .ncml.dods / .nc.ascii / .nc.dods
const TILLATEN_FIL = /^\/mepslatest\/(meps_[A-Za-z0-9_]+\.(?:ncml|nc)\.(?:ascii|dods))$/;
// METAR: /metar?ids=ESSA,ESGG&hours=6 -> aviationweather.gov, bara 1-20 ICAO-koder och 1-24 timmar
const AWC = "https://aviationweather.gov/api/data/";
// NYTT 21/11: polska TAF/METAR fran IMGW:s flyg-API (/imgw?params=taf|metar|gamet|new_sigmet), cache 4 min
const IMGW = "https://aviation-api.imgw.pl/data/last?format=json&count=1&params=", CACHE_IMGW = 240;   // + metar / taf
// NYTT 22/11: SMHI:s vadervarningar (konsekvensbaserade, IBW) - /varningar (test: /varningar?test=1..5), cache 5 min
const SMHI_VARN = "https://opendata-download-warnings.smhi.se/ibww/", CACHE_VARN = 300;
// NYTT 22/11: omraden pa kartan - /omraden?k=TRA|RSTA|DNGA|CTR|TMAW|ATZ (LFV:s oppna AIP-data, WFS) eller k=SMHI
// (SMHI:s varningsomraden: sjovaderomraden + lan). Andras sallan (LFV per AIRAC) -> cache 1 dygn.
// Svaret gors om till en kompakt lista [{n,l,u,c,w,g}] med koordinater avrundade till 4 decimaler.
const LFV_WFS = "https://daim.lfv.se/geoserver/mais/wfs?service=WFS&version=2.0.0&request=GetFeature&outputFormat=application/json&typeNames=mais:";
const OMR_TYPER = ["TRA", "RSTA", "DNGA", "CTR", "TMAW", "ATZ", "ATCCS_ESOS", "ATCCS_ESMM", "SMHI"], CACHE_OMR = 86400;   // 22/11: + flygledningssektorer
const omrR4 = g => Array.isArray(g) ? (typeof g[0] === "number" ? [Math.round(g[0] * 1e4) / 1e4, Math.round(g[1] * 1e4) / 1e4] : g.map(omrR4)) : g;
const omrGeo = g => !g ? null : g.type === "Feature" ? omrGeo(g.geometry) : g.type === "GeometryCollection" ? { type: g.type, geometries: (g.geometries || []).map(omrGeo) } : { type: g.type, coordinates: omrR4(g.coordinates) };
function omrKompakt(k, js) {
  if (k === "SMHI") {
    const lista = Array.isArray(js) ? js : (Object.values(js || {}).find(Array.isArray) || []);
    return lista.filter(a => /SEA|COUNT/.test(a.code || "")).map(a => ({ n: a.sv || a.en || "", k: /SEA/.test(a.code) ? "SJO" : "LAN", g: omrGeo(a.area && (a.area.geometry || a.area)) })).filter(a => a.g);
  }
  return ((js && js.features) || []).map(f => { const p = f.properties || {};
    return { n: String(p.NAMEOFAREA || "").trim(), l: p.LOWER, u: p.UPPER, c: [p.COMMENT_1, p.COMMENT_2].filter(Boolean).join("\n"), w: p.WEF || "", g: omrGeo(f.geometry) }; }).filter(a => a.g);
}
const DELA_MAX = 20000;   // 21/11: storre (ritlinjer foljer med). Delningar raderas inte automatiskt.
const slump = (n, tecken) => { const b = crypto.getRandomValues(new Uint8Array(n)); return [...b].map(x => tecken[x % tecken.length]).join(""); };
const UA = { "User-Agent": "Modelltittaren-mellanserver (github.com/metvyer/modelltittaren)" };

// Hur länge ett svar får ligga i cachen (sekunder)
const CACHE_TIDFRAGA = 60;        // "?time" = koll om körningen är klar - ändras medan körningen fylls på
const CACHE_NY_KORNING = 300;     // körning yngre än 3 h: kan fortfarande fyllas på
const CACHE_GAMMAL_KORNING = 21600; // äldre körning: ändras inte längre -> 6 h
const CACHE_LATEST = 300;         // filer utan körningstid i namnet (…_latest)
const CACHE_METAR = 120;          // METAR: 2 min
const CACHE_TAF = 300;            // TAF: 5 min

// Cachetid för en thredds-fråga: beror på frågan och körningens ålder (från filnamnet)
function cachetid(fil, fraga) {
  if (fraga === "?time") return CACHE_TIDFRAGA;
  const m = fil.match(/_(\d{4})(\d{2})(\d{2})T(\d{2})Z/);
  if (!m) return CACHE_LATEST;
  // 19/11 kvall: sidan hamtar bara ur KOMPLETTA korningar, och ett lyckat svar for en timme andras inte -> 6 h aven
  // for nya korningar (fasta block: kollegor som tittar pa samma omrade far svaret ur cachen)
  return CACHE_GAMMAL_KORNING;
}

// ---- Statistik ----
const SPARA_SENASTE = 2000;   // så många detaljrader behålls (äldre raderas)
// Typ av anrop: tidhojd (det-filen), sannolikhet (ensemblen), koll (finns körningen?), metar, taf
function typAv(url) {
  if (url.pathname === "/metar") return "metar";
  if (url.pathname === "/taf") return "taf";
  if (url.pathname === "/imgw") return "imgw";
  if (url.pathname === "/varningar") return "varningar";
  if (url.pathname === "/omraden") return "omraden";
  if (url.search === "?time") return "koll";
  if (/meps_det/.test(url.pathname)) return "tidhojd";
  if (/meps_lagged/.test(url.pathname)) return "sannolikhet";
  return "ovrigt";
}
// Kort beskrivning: fil + variabelnamn (utan index), max 300 tecken
function vadAv(url) {
  if (url.pathname === "/metar" || url.pathname === "/taf") return url.searchParams.get("ids") || "";
  const fil = url.pathname.replace(/^\/mepslatest\//, "").replace(/\.(ascii|dods)$/, "");
  const vars = decodeURIComponent(url.search.slice(1)).replace(/\[[^\]]*\]/g, "").split(",").filter(Boolean);
  return (fil + " " + [...new Set(vars)].join(",")).slice(0, 300);
}
const idag = () => new Date().toISOString().slice(0, 10);
async function raknaAnrop(db, typ) {
  if (!db) return;
  try {
    await db.prepare("INSERT INTO dag (datum, typ, anrop) VALUES (?, ?, 1) ON CONFLICT(datum, typ) DO UPDATE SET anrop = anrop + 1")
      .bind(idag(), typ).run();
  } catch (e) {}
}
async function loggaHamtning(db, typ, vad, status, byte, ms) {
  if (!db) return;
  try {
    await db.batch([
      db.prepare("INSERT INTO dag (datum, typ, metno, byte, fel) VALUES (?, ?, 1, ?, ?) ON CONFLICT(datum, typ) DO UPDATE SET metno = metno + 1, byte = byte + excluded.byte, fel = fel + excluded.fel")
        // 20/11: 404 i "koll" (nasta korning finns inte an) och 204 (METAR: ingen observation) ar inte fel
        .bind(idag(), typ, byte, status === 200 || status === 204 || (typ === "koll" && status === 404) ? 0 : 1),
      db.prepare("INSERT INTO senaste (tid, typ, vad, status, byte, ms) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(new Date().toISOString(), typ, vad, status, byte, ms),
    ]);
    if (Math.random() < 0.02) await db.prepare("DELETE FROM senaste WHERE id <= (SELECT MAX(id) FROM senaste) - ?").bind(SPARA_SENASTE).run();
  } catch (e) {}
}

// ---- Register over det som ligger i cachen (NYTT 19/11 natt) ----
// Varje lyckad hamtning fran thredds bokfors i D1-tabellen cachereg med exakt fraga och vad den innehaller
// (omrade/timmar/medlemmar for ensemblen, punkt for tid-hojd). Sidan laser registret (/register) och kan
// da stalla exakt samma fraga -> svaret kommer ur cachen. Raden "gar ut" nar cachetiden ar slut.
// Cachen ligger per Cloudflare-datacenter och kan tommas tidigare - da blir det bara en vanlig hamtning.
const OMR_RE = /^(\w+)\[(\d+):(\d+):(\d+)\]\[0\]\[(\d+):(\d+)\]\[(\d+):(\d+):(\d+)\]\[(\d+):(\d+):(\d+)\]$/;
async function bokfor(db, fil, sok, byte, tid) {
  if (!db || !sok) return;
  const m0 = fil.match(/_(\d{8}T\d{2}Z)\.ncml/); if (!m0) return;
  const dtg = m0[1], fraga = decodeURIComponent(sok.slice(1)), forsta = fraga.split(",")[0];
  let rad = null;
  const m = /meps_lagged/.test(fil) ? forsta.match(OMR_RE) : null;
  if (m) rad = ["omr", m[1], +m[2], +m[4], +m[3], +m[5], +m[6], +m[7], +m[9], +m[10], +m[12], +m[8]];
  else if (/meps_det/.test(fil)) { const p = fraga.match(/\[(\d+)\]\[(\d+)\](?:,|$)/); if (p) rad = ["punkt", null, null, null, null, null, null, +p[1], +p[1], +p[2], +p[2], null]; }
  if (!rad) return;
  try {
    await db.prepare("INSERT OR REPLACE INTO cachereg (typ, var, t0, t1, st, m0, m1, y0, y1, x0, x1, s, dtg, fil, fraga, byte, skapad, utgar) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(...rad, dtg, fil, sok, byte, new Date().toISOString(), Date.now() + tid * 1000).run();
    if (Math.random() < 0.05) await db.prepare("DELETE FROM cachereg WHERE utgar < ?").bind(Date.now()).run();
  } catch (e) {}
}

// ---- Delen med cache: hämtar från källan ----
// Körs BARA när cachen saknar svaret -> varje körning här är en verklig hämtning från met.no/aviationweather.
export class Kalla extends WorkerEntrypoint {
  async fetch(req) {
    const url = new URL(req.url), start = Date.now();
    // NYTT 21/11 kvall: "osynligt" val i sidan - hamtningen bokfors inte i cachereg och syns inte i statistiken
    const dold = req.headers.get("X-Mt-Dold") === "1";
    let kalla, tid;
    if (url.pathname === "/metar" || url.pathname === "/taf") {
      kalla = AWC + url.pathname.slice(1) + url.search; tid = url.pathname === "/taf" ? CACHE_TAF : CACHE_METAR;
    } else if (url.pathname === "/imgw") {
      kalla = IMGW + url.searchParams.get("params"); tid = CACHE_IMGW;
    } else if (url.pathname === "/varningar") {
      const t = url.searchParams.get("test");
      kalla = SMHI_VARN + (t ? "test/test_" + t + ".json" : "api/version/1/warning.json"); tid = CACHE_VARN;
    } else if (url.pathname === "/omraden") {
      const k = url.searchParams.get("k");
      kalla = k === "SMHI" ? SMHI_VARN + "api/version/1/metadata/area.json" : LFV_WFS + k; tid = CACHE_OMR;
    } else {
      const fil = url.pathname.replace(/^\/mepslatest\//, "");
      kalla = THREDDS + fil + url.search; tid = cachetid(fil, url.search);
    }
    let svar = await fetch(kalla, { headers: UA });
    // NYTT 19/11: vid fel sparas borjan av felsvaret + vem som svarade (Server/Via) i statistiken,
    // sa vi ser om 500-felen kommer fran thredds sjalv eller nagot mellanled. Felsvar ar sma.
    let feltext = "";
    if (svar.status !== 200) {
      const txt = await svar.text().catch(() => "");
      const vem = ["Server", "Via"].map(k => svar.headers.get(k) ? k + "=" + svar.headers.get(k) : "").filter(Boolean).join(" ");
      feltext = (" || " + (vem ? vem + " | " : "") + txt.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 250);
      svar = new Response(txt, { status: svar.status, headers: svar.headers });
    }
    if (url.pathname === "/omraden" && svar.status === 200) {
      try { const js = await svar.json(); svar = new Response(JSON.stringify(omrKompakt(url.searchParams.get("k"), js)), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } }); }
      catch (e) { feltext = " || kunde inte tolka källan"; svar = new Response("Kunde inte tolka källan", { status: 502, headers: { "Content-Type": "text/plain" } }); }
    }
    const h = new Headers();
    for (const k of ["Content-Type", "Content-Length"]) { const v = svar.headers.get(k); if (v) h.set(k, v); }
    // Bara lyckade svar cachas; fel (404, 429, 500 …) ska frågas på nytt nästa gång
    h.set("Cache-Control", svar.status === 200 ? "public, max-age=" + tid : "no-store");
    // Räkna byten medan svaret strömmar igenom, logga när det är klart
    let byte = 0, klar; const fardig = new Promise(r => (klar = r));
    const raknare = new TransformStream({
      transform(bit, k) { byte += bit.byteLength; k.enqueue(bit); },
      flush() { klar(); },
    });
    this.ctx.waitUntil(fardig.then(async () => {
      await loggaHamtning(this.env.DB, typAv(url), dold ? "(osynlig hämtning)" + feltext : vadAv(url) + feltext, svar.status, byte, Date.now() - start);
      if (!dold && svar.status === 200 && url.pathname.startsWith("/mepslatest/") && url.search !== "?time") await bokfor(this.env.DB, url.pathname.replace(/^\/mepslatest\//, ""), url.search, byte, tid);
    }));
    if (!svar.body) klar();
    return new Response(svar.body ? svar.body.pipeThrough(raknare) : null, { status: svar.status, headers: h });
  }
}

// ---- Ingången (ingen cache): kontroller + CORS ----
// ---- SMHI-radarn samlas (NYTT 21/11 natt) ----
// SMHI lagger bara ut SENASTE kompositbilden oppet som png (aldre bara som h5). Var 5:e minut (cron i
// wrangler.toml) hamtar mellanservern den senaste och sparar den i D1-tabellen radar_smhi (t = bildens tid,
// ms; png = bilden). Bilder aldre an 6 h tas bort. Sidan laser /radar/smhi/lista och /radar/smhi/<t>.png
// och far darmed en hel loop direkt. Bara SMHI:s oppna data - inget om vem som tittar.
const SMHI_RADAR = "https://opendata-download-radar.smhi.se/api/version/latest/area/sweden/product/comp";
const SMHI_SPARA_H = 6;
async function smhiSamla(env) {
  if (!env.DB) return "ingen DB";
  const j = await (await fetch(SMHI_RADAR + ".json", { headers: UA })).json();
  const f = (j.lastFiles || []).find(x => (x.formats || []).some(y => y.key === "png"));
  if (!f) return "ingen png i lastFiles";
  const m = String(f.valid || "").match(/(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)/); if (!m) return "ingen tid";
  const t = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]);
  const finns = await env.DB.prepare("SELECT 1 FROM radar_smhi WHERE t = ?").bind(t).first();
  let ut = "fanns redan " + f.valid;
  if (!finns) {
    const r = await fetch(SMHI_RADAR + "/latest.png?t=" + t, { headers: UA });
    ut = "png " + r.status;
    if (r.ok) { const b = await r.arrayBuffer();
      if (b.byteLength > 1000) { await env.DB.prepare("INSERT OR IGNORE INTO radar_smhi (t, png, byte, hamtad) VALUES (?, ?, ?, ?)").bind(t, b, b.byteLength, new Date().toISOString()).run(); ut = "sparad " + f.valid + " " + b.byteLength + " B"; } }
  }
  await env.DB.prepare("DELETE FROM radar_smhi WHERE t < ?").bind(Date.now() - SMHI_SPARA_H * 3600e3).run();
  return ut;
}

// NYTT 22/11: STARTA FORHAMTNINGEN DIREKT NAR EN NY MEPS-KORNING FINNS.
// GitHubs schema ("var 10:e minut") startar i praktiken bara ca en gang i timmen. Var 5:e minut (cron) kollar vi
// om det-filen (>= 67 tider) eller ensemblefilen (>= 62 tider) for senaste 3-timmarskorningen ar klar pa met.no.
// Ar nagon av dem ny (inte redan startad, tabellen gh_start) -> workflow_dispatch av forhamta.yml.
// Nyckeln GH_NYCKEL (fine-grained, bara Actions read/write i detta repo) ligger som Secret i Cloudflare - aldrig i koden.
// /gh/status visar de senaste starterna (bara korningstider, inget hemligt).
const GH_REPO = "metvyer/modelltittaren", GH_FLODE = "forhamta.yml";
const MEPS_KOLL = [["det", d => "meps_det_2_5km_" + d + ".ncml", 67], ["ens", d => "meps_lagged_6_h_subset_2_5km_" + d + ".ncml", 62]];
const dtgAv = t => { const d = new Date(t); return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0") + "T" + String(d.getUTCHours()).padStart(2, "0") + "Z"; };
async function antalTider(fil) {
  try { const r = await fetch(THREDDS + fil + ".ascii?time", { headers: UA, cf: { cacheTtl: 0 } }); if (!r.ok) return 0;
    const m = (await r.text()).match(/(?:^|\n)time\[(\d+)\]/); return m ? +m[1] : 0; } catch (e) { return 0; }
}
async function ghForhamta(env, tvinga) {
  if (!env.GH_NYCKEL) return "ingen GH_NYCKEL";
  if (!env.DB) return "ingen DB";
  const DB = env.DB;
  await DB.prepare("CREATE TABLE IF NOT EXISTS gh_start (nyckel TEXT PRIMARY KEY, tid TEXT, status INTEGER, svar TEXT)").run();
  const nu = Date.now(), t3 = Math.floor(nu / 3600e3 / 3) * 3 * 3600e3, nya = [];
  for (const [typ, fil, krav] of MEPS_KOLL) {
    for (const t of [t3, t3 - 3 * 3600e3]) {           // senaste och forra 3-timmarskorningen
      const nyckel = typ + ":" + dtgAv(t);
      if (await DB.prepare("SELECT 1 FROM gh_start WHERE nyckel = ? AND status = 204").bind(nyckel).first()) break;   // redan startad
      if (await antalTider(fil(dtgAv(t))) >= krav) { nya.push(nyckel); break; }
    }
  }
  if (!nya.length && !tvinga) return "inget nytt";
  const senast = await DB.prepare("SELECT tid FROM gh_start WHERE status = 204 ORDER BY tid DESC LIMIT 1").first();
  if (!tvinga && senast && nu - Date.parse(senast.tid) < 4 * 60e3) return "startade nyss, väntar";
  const start = Date.now();
  const r = await fetch("https://api.github.com/repos/" + GH_REPO + "/actions/workflows/" + GH_FLODE + "/dispatches", { method: "POST",
    headers: { "Authorization": "Bearer " + env.GH_NYCKEL, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", ...UA },
    body: JSON.stringify({ ref: "main" }) });
  const svar = r.status === 204 ? "" : (await r.text()).slice(0, 200);
  const tid = new Date().toISOString();
  for (const k of (nya.length ? nya : ["manuell:" + tid])) await DB.prepare("INSERT OR REPLACE INTO gh_start (nyckel, tid, status, svar) VALUES (?, ?, ?, ?)").bind(k, tid, r.status, svar).run();
  await DB.prepare("DELETE FROM gh_start WHERE tid < ?").bind(new Date(nu - 7 * 86400e3).toISOString()).run();
  await loggaHamtning(DB, "github", "starta förhämtning " + (nya.join(", ") || "manuellt") + (svar ? " || " + svar : ""), r.status, 0, Date.now() - start);
  return (r.status === 204 ? "startade " : "FEL " + r.status + " ") + (nya.join(", ") || "manuellt") + (svar ? " " + svar : "");
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(smhiSamla(env).catch(e => console.log("smhiSamla", e)));
    ctx.waitUntil(ghForhamta(env).catch(e => console.log("ghForhamta", e)));
  },
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const ursprung = req.headers.get("Origin") || "";
    const ok = TILLATNA_SIDOR.includes(ursprung);
    const cors = { "Access-Control-Allow-Origin": ok ? ursprung : TILLATNA_SIDOR[0], "Vary": "Origin",
                   "Access-Control-Expose-Headers": "Cf-Cache-Status" };

    if (req.method === "OPTIONS")
      return new Response(null, { headers: { ...cors, "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Content-Type, X-Mt-Nyckel", "Access-Control-Max-Age": "86400" } });

    // Testsida: öppna adressen i webbläsaren för att se att mellanservern nås
    if (url.pathname === "/" || url.pathname === "")
      return new Response("Modelltittaren mellanserver OK (med cache)", { headers: { ...cors, "Content-Type": "text/plain; charset=utf-8" } });

    // NYTT 21/11: DELAD VY (se overst). Namn = id: eget (a-z, 0-9, bindestreck, 3-20 tecken) eller slump.
    //  GET  /dela?id=X[&sess=S&namn=N][&nyckel=K] -> {vy, andrad, vem, lista, tittare, agare}
    //        sess = tittaren sager "jag ar har" (skickas var 30:e s), nyckel = agaren sander (halls levande i listan)
    //  GET  /dela/aktiva                 -> delningar med "Visa i listan" vars agare sander just nu
    //  GET  /dela/ledigt?namn=X          -> {ledigt}
    //  POST /dela  {vy, namn?, lista?, vem?}             -> ny delning {id, nyckel}  (409 om namnet ar upptaget)
    //  POST /dela?id=X&nyckel=K {vy?, lista?, vem?}      -> andra;  &tabort=1 -> ta bort delningen
    //  Delningar raderas aldrig automatiskt (bara med tabort). Tittare som inte horts av pa 2 min visas inte.
    //  NYTT 21/11 - ANTECKNING (vy.not, kopieras till kolumnen anteckning for listan) och TA OVER STYRET:
    //  POST /dela/styr?id=X&sess=S {namn}  -> tittaren ber att fa styra: {nyckel} direkt om agaren kryssat "vem som helst",
    //                                         annars {vantar} (agaren ser fragan i GET med sin nyckel)
    //  POST /dela?id=X&nyckel=K {ge: "fraga" | "neka" | "tillbaka", oppen}  -> agaren lamnar over / nekar / tar tillbaka
    //  POST /dela?id=X&styrnyckel=N {vy}  -> den som styr sander;  &lamna=1 -> lamnar tillbaka
    //  Den som styr maste hora av sig (sess) minst varje minut, annars gar styret tillbaka till agaren.
    if (url.pathname.startsWith("/dela")) {
      const json = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      if (!env.DB) return json({ fel: "ingen databas" }, 500);
      const nu = Date.now(), DB = env.DB, NAMN = /^[a-z0-9][a-z0-9-]{2,19}$/;
      const id = (url.searchParams.get("id") || "").toLowerCase(), nyckel = url.searchParams.get("nyckel") || "";
      const ren = (t, n) => String(t || "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, n);
      const tittare = async i => (await DB.prepare("SELECT namn FROM tittare WHERE id = ? AND sedd > ? ORDER BY sedd DESC LIMIT 50").bind(i, nu - 120000).all()).results.map(r => r.namn || "");
      if (req.method === "GET") {
        if (url.pathname === "/dela/aktiva") {
          const r = (await DB.prepare("SELECT d.id, d.vem, d.anteckning, (SELECT COUNT(*) FROM tittare t WHERE t.id = d.id AND t.sedd > ?) AS antal FROM delning d WHERE d.lista = 1 AND d.levande > ? ORDER BY d.levande DESC LIMIT 30").bind(nu - 120000, nu - 120000).all()).results;
          return json(r);
        }
        if (url.pathname === "/dela/ledigt") {
          const n = (url.searchParams.get("namn") || "").toLowerCase();
          if (!NAMN.test(n)) return json({ ledigt: false, fel: "Namnet får bara ha a–z, 0–9 och bindestreck, 3–20 tecken." });
          return json({ ledigt: !(await DB.prepare("SELECT 1 FROM delning WHERE id = ?").bind(n).first()) });
        }
        if (!NAMN.test(id)) return json({ fel: "fel id" }, 400);
        const r = await DB.prepare("SELECT vy, andrad, skapad, vem, lista, nyckel, anteckning, oppen, styr_sess, styr_nyckel, styr_namn, fraga_sess, fraga_namn, fraga_tid FROM delning WHERE id = ?").bind(id).first();
        if (!r) return json({ fel: "finns inte" }, 404);
        const agare = !!nyckel && nyckel === r.nyckel, sess = url.searchParams.get("sess") || "";
        // den som styr har inte hort av sig pa en minut -> styret tillbaka till agaren
        if (r.styr_sess) { const t = await DB.prepare("SELECT sedd FROM tittare WHERE id = ? AND sess = ?").bind(id, r.styr_sess).first();
          if (!t || t.sedd < nu - 60000) { await DB.prepare("UPDATE delning SET styr_sess = NULL, styr_nyckel = NULL, styr_namn = NULL WHERE id = ?").bind(id).run(); r.styr_sess = null; } }
        if (agare) ctx.waitUntil(DB.prepare("UPDATE delning SET levande = ? WHERE id = ?").bind(nu, id).run());
        if (/^[a-z0-9]{8,24}$/.test(sess)) {
          await DB.prepare("INSERT INTO tittare (id, sess, namn, sedd) VALUES (?, ?, ?, ?) ON CONFLICT(id, sess) DO UPDATE SET namn = excluded.namn, sedd = excluded.sedd").bind(id, sess, ren(url.searchParams.get("namn"), 30), nu).run();
          if (Math.random() < 0.05) ctx.waitUntil(DB.prepare("DELETE FROM tittare WHERE sedd < ?").bind(nu - 600000).run());
        }
        const styr = r.styr_sess ? { namn: r.styr_namn || "", du: !!sess && sess === r.styr_sess } : null;
        if (styr && styr.du) styr.nyckel = r.styr_nyckel;   // bara till den som styr (sess ar hemlig for andra)
        const fraga = agare && r.fraga_sess && r.fraga_tid > nu - 120000 ? { namn: r.fraga_namn || "" } : null;
        const vantar = !!sess && r.fraga_sess === sess && r.fraga_tid > nu - 120000;
        return json({ vy: JSON.parse(r.vy), andrad: r.andrad, skapad: r.skapad, vem: r.vem || "", lista: !!r.lista, oppen: !!r.oppen, agare, styr, fraga, vantar, tittare: await tittare(id) });
      }
      if (req.method !== "POST") return json({ fel: "fel metod" }, 405);
      if (!ok) return json({ fel: "Bara från metvyer.github.io" }, 403);
      const text = await req.text();
      if (text.length > DELA_MAX) return json({ fel: "för stor" }, 413);
      let k = {}; if (text) { try { k = JSON.parse(text); } catch (e) { return json({ fel: "fel format" }, 400); } }
      if (k.vy !== undefined && (!k.vy || typeof k.vy !== "object")) return json({ fel: "fel format" }, 400);
      if (url.pathname === "/dela/styr") {   // tittaren ber att fa styra
        const sess = url.searchParams.get("sess") || "";
        if (!NAMN.test(id) || !/^[a-z0-9]{8,24}$/.test(sess)) return json({ fel: "fel id/sess" }, 400);
        const d = await DB.prepare("SELECT oppen, styr_sess FROM delning WHERE id = ?").bind(id).first();
        if (!d) return json({ fel: "finns inte" }, 404);
        const namn = ren(k.namn, 30);
        await DB.prepare("INSERT INTO tittare (id, sess, namn, sedd) VALUES (?, ?, ?, ?) ON CONFLICT(id, sess) DO UPDATE SET namn = excluded.namn, sedd = excluded.sedd").bind(id, sess, namn, nu).run();
        if (d.oppen) { const sn = slump(24, "abcdefghijklmnopqrstuvwxyz0123456789");
          await DB.prepare("UPDATE delning SET styr_sess = ?, styr_nyckel = ?, styr_namn = ?, fraga_sess = NULL, levande = ? WHERE id = ?").bind(sess, sn, namn, nu, id).run();
          return json({ nyckel: sn }); }
        await DB.prepare("UPDATE delning SET fraga_sess = ?, fraga_namn = ?, fraga_tid = ? WHERE id = ?").bind(sess, namn, nu, id).run();
        return json({ vantar: true });
      }
      if (!id) {   // ny delning
        if (!k.vy) return json({ fel: "fel format" }, 400);
        let nyId = (k.namn || "").toLowerCase();
        if (nyId && !NAMN.test(nyId)) return json({ fel: "Namnet får bara ha a–z, 0–9 och bindestreck, 3–20 tecken." }, 400);
        if (!nyId) nyId = slump(7, "abcdefghijkmnpqrstuvwxyz23456789");
        const ny = slump(24, "abcdefghijklmnopqrstuvwxyz0123456789");
        try { await DB.prepare("INSERT INTO delning (id, nyckel, vy, skapad, andrad, lista, vem, levande) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(nyId, ny, JSON.stringify(k.vy), nu, nu, k.lista ? 1 : 0, ren(k.vem, 30), nu).run(); }
        catch (e) { return json({ fel: "Namnet är upptaget." }, 409); }
        return json({ id: nyId, nyckel: ny, andrad: nu });
      }
      const rad = await DB.prepare("SELECT nyckel, styr_sess, styr_nyckel, fraga_sess, fraga_namn FROM delning WHERE id = ?").bind(id).first();
      if (!rad) return json({ fel: "finns inte" }, 404);
      const sn = url.searchParams.get("styrnyckel") || "";
      if (sn) {   // den som fatt styret
        if (!rad.styr_nyckel || sn !== rad.styr_nyckel) return json({ fel: "styret är inte ditt längre", styrSlut: true }, 409);
        if (url.searchParams.get("lamna") === "1") { await DB.prepare("UPDATE delning SET styr_sess = NULL, styr_nyckel = NULL, styr_namn = NULL WHERE id = ?").bind(id).run(); return json({ id, lamnat: true }); }
        if (!k.vy) return json({ fel: "fel format" }, 400);
        const vy = { ...k.vy, not: k.vy.not };
        await DB.prepare("UPDATE delning SET vy = ?, andrad = ?, anteckning = ?, levande = ? WHERE id = ?").bind(JSON.stringify(vy), nu, ren(vy.not, 120), nu, id).run();
        return json({ id, andrad: nu });
      }
      if (rad.nyckel !== nyckel) return json({ fel: "fel nyckel" }, 403);
      if (k.ge === "fraga" && rad.fraga_sess) {   // agaren lamnar over till den som fragade
        await DB.prepare("UPDATE delning SET styr_sess = fraga_sess, styr_nyckel = ?, styr_namn = fraga_namn, fraga_sess = NULL WHERE id = ?").bind(slump(24, "abcdefghijklmnopqrstuvwxyz0123456789"), id).run();
        return json({ id, overlamnat: true });
      }
      if (k.ge === "neka") { await DB.prepare("UPDATE delning SET fraga_sess = NULL WHERE id = ?").bind(id).run(); return json({ id }); }
      if (k.ge === "tillbaka") { await DB.prepare("UPDATE delning SET styr_sess = NULL, styr_nyckel = NULL, styr_namn = NULL, fraga_sess = NULL WHERE id = ?").bind(id).run(); return json({ id }); }
      if (k.vy && rad.styr_sess) return json({ fel: "någon annan styr just nu", styrAnnan: true }, 409);
      if (url.searchParams.get("tabort") === "1") {
        await DB.batch([DB.prepare("DELETE FROM delning WHERE id = ?").bind(id), DB.prepare("DELETE FROM tittare WHERE id = ?").bind(id)]);
        return json({ id, borttagen: true });
      }
      const satt = [], varden = [];
      if (k.vy) { satt.push("vy = ?", "andrad = ?", "anteckning = ?"); varden.push(JSON.stringify(k.vy), nu, ren(k.vy.not, 120)); }
      if (k.oppen !== undefined) { satt.push("oppen = ?"); varden.push(k.oppen ? 1 : 0); }
      if (k.lista !== undefined) { satt.push("lista = ?"); varden.push(k.lista ? 1 : 0); }
      if (k.vem !== undefined) { satt.push("vem = ?"); varden.push(ren(k.vem, 30)); }
      satt.push("levande = ?"); varden.push(nu);
      await DB.prepare("UPDATE delning SET " + satt.join(", ") + " WHERE id = ?").bind(...varden, id).run();
      return json({ id, andrad: nu });
    }

    if (req.method !== "GET") return new Response("Bara GET", { status: 405, headers: cors });

    // SMHI-radarn: lista med tider och bilderna (se smhiSamla)
    if (url.pathname === "/radar/smhi/lista") {
      const rad = env.DB ? (await env.DB.prepare("SELECT t FROM radar_smhi ORDER BY t").all()).results : [];
      // reserv om cron inte gatt: ar senaste bilden aldre an 7 min hamtas en ny i bakgrunden
      if (!rad.length || Date.now() - rad[rad.length - 1].t > 7 * 60e3) ctx.waitUntil(smhiSamla(env).catch(() => {}));
      return new Response(JSON.stringify(rad.map(r => r.t)), { headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" } });
    }
    if (url.pathname === "/gh/status") {
      const rad = env.DB ? (await env.DB.prepare("SELECT nyckel, tid, status FROM gh_start ORDER BY tid DESC LIMIT 20").all().catch(() => ({ results: [] }))).results : [];
      return new Response(JSON.stringify({ nyckel: !!env.GH_NYCKEL, starter: rad }), { headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (url.pathname === "/gh/koll") {      // kor kollen nu (startar bara om nagot ar nytt - samma regler som cron)
      return new Response(String(await ghForhamta(env).catch(e => "fel: " + e)), { headers: { ...cors, "Content-Type": "text/plain; charset=utf-8" } });
    }
    if (url.pathname === "/radar/smhi/samla") return new Response(String(await smhiSamla(env).catch(e => "fel: " + e)), { headers: { ...cors, "Content-Type": "text/plain; charset=utf-8" } });
    const rm = url.pathname.match(/^\/radar\/smhi\/(\d{13})\.png$/);
    if (rm) {
      const rad = env.DB ? await env.DB.prepare("SELECT png FROM radar_smhi WHERE t = ?").bind(+rm[1]).first() : null;
      if (!rad) return new Response("Finns inte", { status: 404, headers: cors });
      return new Response(new Uint8Array(rad.png), { headers: { ...cors, "Content-Type": "image/png", "Cache-Control": "public, max-age=86400, immutable" } });
    }

    // Statistik: senaste 31 dagarna per typ (oppet) + senaste hamtningarna fran kallorna.
    // NYTT 21/11 kvall: listan med VAD som hamtats (omraden/punkter = spar av var folk tittar) kraver nyckeln
    // STAT_NYCKEL (hemlighet i Cloudflare), skickad i huvudet X-Mt-Nyckel. Utan nyckel: bara dagssiffror.
    if (url.pathname === "/statistik") {
      const ut = { dagar: [], senaste: [], detaljer: false };
      const ren = x => String(x || "").replace(/[^\x21-\x7e]/g, ""), ratt = ren(env.STAT_NYCKEL), given = ren(req.headers.get("X-Mt-Nyckel"));   // mellanslag/radbrytning runt nyckeln raknas inte
      const giltig = !!ratt && given === ratt;
      if (!ratt) ut.ingenNyckel = true;
      if (env.DB) {
        ut.dagar = (await env.DB.prepare("SELECT * FROM dag WHERE datum >= date('now', '-31 day') ORDER BY datum DESC, typ").all()).results;
        if (giltig) { ut.detaljer = true; ut.senaste = (await env.DB.prepare("SELECT tid, typ, vad, status, byte, ms FROM senaste ORDER BY id DESC LIMIT 200").all()).results; }
      }
      if (req.headers.get("X-Mt-Nyckel") && !giltig) ut.felnyckel = true;
      return new Response(JSON.stringify(ut), { headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }

    // Registret: /register?dtg=20261119T15Z[,20261119T12Z] -> det som just nu ligger i cachen for de korningarna
    if (url.pathname === "/register") {
      const dtgs = (url.searchParams.get("dtg") || "").split(",").filter(d => /^\d{8}T\d{2}Z$/.test(d)).slice(0, 4);
      let rader = [];
      if (env.DB && dtgs.length) rader = (await env.DB.prepare("SELECT typ, dtg, fil, fraga, var, t0, t1, st, m0, m1, y0, y1, x0, x1, s, byte FROM cachereg WHERE utgar > ? AND dtg IN (" + dtgs.map(() => "?").join(",") + ") ORDER BY id DESC LIMIT 3000").bind(Date.now(), ...dtgs).all()).results;
      return new Response(JSON.stringify(rader), { headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }

    let vidare;
    if (url.pathname === "/omraden") {
      const k = url.searchParams.get("k") || "";
      if (!OMR_TYPER.includes(k)) return new Response("Fel k", { status: 400, headers: cors });
      if (!ok) return new Response("Bara från metvyer.github.io", { status: 403, headers: cors });
      vidare = url.origin + "/omraden?k=" + k;
    } else if (url.pathname === "/varningar") {
      const t = url.searchParams.get("test") || "";
      if (t && !/^[1-5]$/.test(t)) return new Response("Fel test", { status: 400, headers: cors });
      if (!ok) return new Response("Bara från metvyer.github.io", { status: 403, headers: cors });
      vidare = url.origin + "/varningar" + (t ? "?test=" + t : "");
    } else if (url.pathname === "/imgw") {
      const pr = url.searchParams.get("params") || "";
      if (!/^(taf|metar|gamet|new_sigmet)$/.test(pr)) return new Response("Fel params", { status: 400, headers: cors });
      if (!ok) return new Response("Bara från metvyer.github.io", { status: 403, headers: cors });
      vidare = url.origin + "/imgw?params=" + pr;
    } else if (url.pathname === "/taf") {
      // TAF: /taf?ids=ESSA (1-20 ICAO-koder), senaste TAF per flygplats
      const ids = (url.searchParams.get("ids") || "").toUpperCase();
      if (!/^[A-Z0-9]{4}(,[A-Z0-9]{4}){0,19}$/.test(ids)) return new Response("Fel ids", { status: 400, headers: cors });
      if (!ok) return new Response("Bara från metvyer.github.io", { status: 403, headers: cors });
      // 23/11: &date=YYYYMMDD_HHMM -> TAF:en som var utgiven vid den tiden (aviationweather time=issue) = foregaende TAF vid AMD.
      // Historiskt svar andras inte - samma cachetid racker.
      const dt = url.searchParams.get("date") || "";
      if (dt && !/^\d{8}_\d{4}$/.test(dt)) return new Response("Fel date", { status: 400, headers: cors });
      vidare = url.origin + "/taf?ids=" + ids + "&format=json" + (dt ? "&time=issue&date=" + dt : "");
    } else if (url.pathname === "/metar") {
      const ids = (url.searchParams.get("ids") || "").toUpperCase(), h = +(url.searchParams.get("hours") || 6);
      if (!/^[A-Z0-9]{4}(,[A-Z0-9]{4}){0,19}$/.test(ids) || !(h >= 1 && h <= 24))
        return new Response("Fel ids/hours", { status: 400, headers: cors });
      if (!ok) return new Response("Bara från metvyer.github.io", { status: 403, headers: cors });
      // Samma ordning på parametrarna varje gång -> samma cache-nyckel
      vidare = url.origin + "/metar?ids=" + ids + "&format=json&hours=" + Math.round(h);
    } else {
      if (!TILLATEN_FIL.test(url.pathname)) return new Response("Inte tillåten sökväg", { status: 403, headers: cors });
      if (!ok) return new Response("Bara från metvyer.github.io", { status: 403, headers: cors });
      vidare = url.origin + url.pathname + url.search;
    }
    // 21/11 kvall: sidans "osynliga" lage skickar mtdold=1 sist i adressen - tas bort innan cachen (samma cachenyckel)
    let dold = false;
    if (/[?&]mtdold=1$/.test(vidare)) { dold = true; vidare = vidare.replace(/[?&]mtdold=1$/, ""); }

    // Räkna anropet (oavsett om cachen eller källan svarar)
    ctx.waitUntil(raknaAnrop(env.DB, typAv(new URL(vidare))));
    // Ren förfrågan utan webbläsarens huvuden -> alla kollegor delar samma cachade svar
    let svar;
    try { svar = await ctx.exports.Kalla.fetch(new Request(vidare, dold ? { headers: { "X-Mt-Dold": "1" } } : undefined)); }
    catch (e) { return new Response("Källan svarar inte", { status: 502, headers: cors }); }
    const hm = new Headers(svar.headers);
    for (const [k, v] of Object.entries(cors)) hm.set(k, v);
    hm.set("Cache-Control", "no-store");   // webbläsaren sparar själv i sin egen databas
    return new Response(svar.body, { status: svar.status, headers: hm });
  }
};
