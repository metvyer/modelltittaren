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
  const bas = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4]);
  return Date.now() - bas < 3 * 3600e3 ? CACHE_NY_KORNING : CACHE_GAMMAL_KORNING;
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
    const svar = await fetch(kalla, { headers: UA });
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
    this.ctx.waitUntil(fardig.then(() => loggaHamtning(this.env.DB, typAv(url), vadAv(url), svar.status, byte, Date.now() - start)));
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
