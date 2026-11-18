// Modelltittaren – mellanserver (Cloudflare Worker) till thredds.met.no
// Hämtar MEPS-data åt sidan metvyer.github.io/modelltittaren när thredds inte nås direkt.
// Släpper bara igenom läsning (GET) av MEPS-filer i katalogen mepslatest, och bara från vår sida.
// Ingen nyckel, inget lösenord, ingen lagring. Data från MET Norway, CC BY 4.0.

const TILLATNA_SIDOR = ["https://metvyer.github.io"];
const THREDDS = "https://thredds.met.no/thredds/dodsC/mepslatest/";
// Tillåtna filnamn: meps_….ncml.ascii / .ncml.dods / .nc.ascii / .nc.dods
const TILLATEN_FIL = /^\/mepslatest\/(meps_[A-Za-z0-9_]+\.(?:ncml|nc)\.(?:ascii|dods))$/;
// METAR (18/11): /metar?ids=ESSA,ESGG&hours=6 -> aviationweather.gov, bara 1-20 ICAO-koder och 1-24 timmar
const AWC = "https://aviationweather.gov/api/data/metar";

export default {
  async fetch(req) {
    const url = new URL(req.url);
    const ursprung = req.headers.get("Origin") || "";
    const ok = TILLATNA_SIDOR.includes(ursprung);
    const cors = { "Access-Control-Allow-Origin": ok ? ursprung : TILLATNA_SIDOR[0], "Vary": "Origin" };

    if (req.method === "OPTIONS")
      return new Response(null, { headers: { ...cors, "Access-Control-Allow-Methods": "GET", "Access-Control-Max-Age": "86400" } });

    // Testsida: öppna adressen i webbläsaren för att se att mellanservern nås
    if (url.pathname === "/" || url.pathname === "")
      return new Response("Modelltittaren mellanserver OK", { headers: { ...cors, "Content-Type": "text/plain; charset=utf-8" } });

    if (req.method !== "GET") return new Response("Bara GET", { status: 405, headers: cors });

    if (url.pathname === "/metar") {
      if (!ok) return new Response("Bara från metvyer.github.io", { status: 403, headers: cors });
      const ids = (url.searchParams.get("ids") || "").toUpperCase(), h = +(url.searchParams.get("hours") || 6);
      if (!/^[A-Z0-9]{4}(,[A-Z0-9]{4}){0,19}$/.test(ids) || !(h >= 1 && h <= 24))
        return new Response("Fel ids/hours", { status: 400, headers: cors });
      const svar = await fetch(AWC + "?ids=" + ids + "&format=json&hours=" + Math.round(h), {
        headers: { "User-Agent": "Modelltittaren-mellanserver (github.com/metvyer/modelltittaren)" }
      });
      const hm = new Headers(cors);
      hm.set("Content-Type", svar.headers.get("Content-Type") || "application/json");
      hm.set("Cache-Control", "max-age=120");
      return new Response(svar.body, { status: svar.status, headers: hm });
    }
    const m = url.pathname.match(TILLATEN_FIL);
    if (!m) return new Response("Inte tillåten sökväg", { status: 403, headers: cors });
    if (!ok) return new Response("Bara från metvyer.github.io", { status: 403, headers: cors });

    const svar = await fetch(THREDDS + m[1] + url.search, {
      headers: { "User-Agent": "Modelltittaren-mellanserver (github.com/metvyer/modelltittaren)" }
    });
    const h = new Headers(cors);
    for (const k of ["Content-Type", "Content-Length"]) { const v = svar.headers.get(k); if (v) h.set(k, v); }
    h.set("Cache-Control", "no-store");
    return new Response(svar.body, { status: svar.status, headers: h });
  }
};
