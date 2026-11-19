// Modelltittaren – mellanserver (Cloudflare Worker) till thredds.met.no och aviationweather.gov
// Hämtar MEPS-data och METAR åt sidan metvyer.github.io/modelltittaren när källan inte nås direkt.
// Släpper bara igenom läsning (GET) av MEPS-filer i katalogen mepslatest och METAR, och bara från vår sida.
// Ingen nyckel, inget lösenord. Data från MET Norway (CC BY 4.0) och NOAA aviationweather.gov.
//
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
const AWC = "https://aviationweather.gov/api/data/";   // + metar / taf
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
        .bind(idag(), typ, byte, status === 200 ? 0 : 1),
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
    let kalla, tid;
    if (url.pathname === "/metar" || url.pathname === "/taf") {
      kalla = AWC + url.pathname.slice(1) + url.search; tid = url.pathname === "/taf" ? CACHE_TAF : CACHE_METAR;
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
      await loggaHamtning(this.env.DB, typAv(url), vadAv(url) + feltext, svar.status, byte, Date.now() - start);
      if (svar.status === 200 && url.pathname.startsWith("/mepslatest/") && url.search !== "?time") await bokfor(this.env.DB, url.pathname.replace(/^\/mepslatest\//, ""), url.search, byte, tid);
    }));
    if (!svar.body) klar();
    return new Response(svar.body ? svar.body.pipeThrough(raknare) : null, { status: svar.status, headers: h });
  }
}

// ---- Ingången (ingen cache): kontroller + CORS ----
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const ursprung = req.headers.get("Origin") || "";
    const ok = TILLATNA_SIDOR.includes(ursprung);
    const cors = { "Access-Control-Allow-Origin": ok ? ursprung : TILLATNA_SIDOR[0], "Vary": "Origin",
                   "Access-Control-Expose-Headers": "Cf-Cache-Status" };

    if (req.method === "OPTIONS")
      return new Response(null, { headers: { ...cors, "Access-Control-Allow-Methods": "GET", "Access-Control-Max-Age": "86400" } });

    // Testsida: öppna adressen i webbläsaren för att se att mellanservern nås
    if (url.pathname === "/" || url.pathname === "")
      return new Response("Modelltittaren mellanserver OK (med cache)", { headers: { ...cors, "Content-Type": "text/plain; charset=utf-8" } });

    if (req.method !== "GET") return new Response("Bara GET", { status: 405, headers: cors });

    // Statistik: senaste 31 dagarna per typ + senaste hämtningarna från källorna
    if (url.pathname === "/statistik") {
      const ut = { dagar: [], senaste: [] };
      if (env.DB) {
        ut.dagar = (await env.DB.prepare("SELECT * FROM dag WHERE datum >= date('now', '-31 day') ORDER BY datum DESC, typ").all()).results;
        ut.senaste = (await env.DB.prepare("SELECT tid, typ, vad, status, byte, ms FROM senaste ORDER BY id DESC LIMIT 200").all()).results;
      }
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
    if (url.pathname === "/taf") {
      // TAF: /taf?ids=ESSA (1-20 ICAO-koder), senaste TAF per flygplats
      const ids = (url.searchParams.get("ids") || "").toUpperCase();
      if (!/^[A-Z0-9]{4}(,[A-Z0-9]{4}){0,19}$/.test(ids)) return new Response("Fel ids", { status: 400, headers: cors });
      if (!ok) return new Response("Bara från metvyer.github.io", { status: 403, headers: cors });
      vidare = url.origin + "/taf?ids=" + ids + "&format=json";
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

    // Räkna anropet (oavsett om cachen eller källan svarar)
    ctx.waitUntil(raknaAnrop(env.DB, typAv(new URL(vidare))));
    // Ren förfrågan utan webbläsarens huvuden -> alla kollegor delar samma cachade svar
    let svar;
    try { svar = await ctx.exports.Kalla.fetch(new Request(vidare)); }
    catch (e) { return new Response("Källan svarar inte", { status: 502, headers: cors }); }
    const hm = new Headers(svar.headers);
    for (const [k, v] of Object.entries(cors)) hm.set(k, v);
    hm.set("Cache-Control", "no-store");   // webbläsaren sparar själv i sin egen databas
    return new Response(svar.body, { status: svar.status, headers: hm });
  }
};
