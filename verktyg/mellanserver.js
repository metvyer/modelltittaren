// Modelltittaren – mellanserver (Cloudflare Worker) till thredds.met.no och aviationweather.gov
// Hämtar MEPS-data och METAR åt sidan metvyer.github.io/modelltittaren när källan inte nås direkt.
// Släpper bara igenom läsning (GET) av MEPS-filer i katalogen mepslatest och METAR, och bara från vår sida.
// Ingen nyckel, inget lösenord. Data från MET Norway (CC BY 4.0) och NOAA aviationweather.gov.
//
// NYTT 18/11: delad cache (Cloudflare Workers Caching). Laddas upp automatiskt av Cloudflare
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
const AWC = "https://aviationweather.gov/api/data/metar";
const UA = { "User-Agent": "Modelltittaren-mellanserver (github.com/metvyer/modelltittaren)" };

// Hur länge ett svar får ligga i cachen (sekunder)
const CACHE_TIDFRAGA = 60;        // "?time" = koll om körningen är klar - ändras medan körningen fylls på
const CACHE_NY_KORNING = 300;     // körning yngre än 3 h: kan fortfarande fyllas på
const CACHE_GAMMAL_KORNING = 21600; // äldre körning: ändras inte längre -> 6 h
const CACHE_LATEST = 300;         // filer utan körningstid i namnet (…_latest)
const CACHE_METAR = 120;          // METAR: 2 min

// Cachetid för en thredds-fråga: beror på frågan och körningens ålder (från filnamnet)
function cachetid(fil, fraga) {
  if (fraga === "?time") return CACHE_TIDFRAGA;
  const m = fil.match(/_(\d{4})(\d{2})(\d{2})T(\d{2})Z/);
  if (!m) return CACHE_LATEST;
  const bas = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4]);
  return Date.now() - bas < 3 * 3600e3 ? CACHE_NY_KORNING : CACHE_GAMMAL_KORNING;
}

// ---- Delen med cache: hämtar från källan ----
export class Kalla extends WorkerEntrypoint {
  async fetch(req) {
    const url = new URL(req.url);
    let kalla, tid;
    if (url.pathname === "/metar") {
      kalla = AWC + url.search; tid = CACHE_METAR;
    } else {
      const fil = url.pathname.replace(/^\/mepslatest\//, "");
      kalla = THREDDS + fil + url.search; tid = cachetid(fil, url.search);
    }
    const svar = await fetch(kalla, { headers: UA });
    const h = new Headers();
    for (const k of ["Content-Type", "Content-Length"]) { const v = svar.headers.get(k); if (v) h.set(k, v); }
    // Bara lyckade svar cachas; fel (404, 429, 500 …) ska frågas på nytt nästa gång
    h.set("Cache-Control", svar.status === 200 ? "public, max-age=" + tid : "no-store");
    return new Response(svar.body, { status: svar.status, headers: h });
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

    let vidare;
    if (url.pathname === "/metar") {
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
