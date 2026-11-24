// ===================================================================
//  SATELLIT OCH RADAR (NYTT 21/11 kvall) - flikarna "Satellit" och "Radar"
// ===================================================================
// Webblasaren hamtar bilderna SJALV direkt fran kallan (alla har CORS *) - inget gar via GitHub eller
// mellanservern. Varje bild vrids om (omprojiceras) till kartans Lambert-projektion i en canvas och lagges
// som <image> i gruppen kObs (under kust/granser, som ritas overst). Bara det som syns hamtas, i skarmens
// upplosning; zoomar/panorerar man hamtas bilderna om efter en kort paus.
//  Satellit: EUMETSAT EUMETView WMS (MTG, bild var 10:e min, blixtar var 5:e). Tiderna laser vi ur
//            namnrymdens GetCapabilities (bara MTG-lagren, litet svar).
//  Radar:    SMHI (Sverige, komposit var 5:e min, png i polarstereografisk projektion) eller met.no
//            (Norden, 1 km, var 5:e min, thredds WMS). met.no:s filer innehaller aven en prognos (nowcast)
//            ca 2 h framat - den kan spelas i loopen efter "nu" (markeras PROGNOS).
// Loop: valj langd, spela/pausa, stega. Auto: ny bild laggs till nar den finns (kollas varannan minut).
// Allt sparas i mt:obs (val per flik).

const OBS_EUM = "https://view.eumetsat.int/geoserver/";
const OBS_SAT = {
  geocolour:   { namn: "Geocolour – dag färg, natt IR + ljus", lager: "mtg_fd:rgb_geocolour", fmt: "image/jpeg" },
  truecolour:  { namn: "Truecolour (bara dag)", lager: "mtg_fd:rgb_truecolour", fmt: "image/jpeg" },
  ir105:       { namn: "IR 10,5 µm (molntoppstemperatur)", lager: "mtg_fd:ir105_hrfi", fmt: "image/png" },
  vis06:       { namn: "VIS 0,6 µm (synligt, dag)", lager: "mtg_fd:vis06_hrfi", fmt: "image/jpeg" },
  cloudtype:   { namn: "Molntyp RGB", lager: "mtg_fd:rgb_cloudtype", fmt: "image/jpeg" },
  cloudphase:  { namn: "Molnfas RGB (is/vatten)", lager: "mtg_fd:rgb_cloudphase", fmt: "image/jpeg" },
  fog:         { namn: "Dimma / låga moln RGB", lager: "mtg_fd:rgb_fog", fmt: "image/jpeg" },
  snow:        { namn: "Snö RGB (snö vs moln, dag)", lager: "mtg_fd:rgb_snow", fmt: "image/jpeg" },
  dust:        { namn: "Dust RGB (även molnfysik)", lager: "mtg_fd:rgb_dust", fmt: "image/jpeg" },
  h40b:        { namn: "Nederbörd (satellit + mikrovåg)", lager: "mtg_fd:h40b", fmt: "image/png", genom: true },
  li:          { namn: "Blixtar (LI, 5 min)", lager: "mtg_fd:li_afa", fmt: "image/png", genom: true, steg: 5 }
};
const OBS_RAD = { smhi: { namn: "SMHI – Sverige" }, metno: { namn: "met.no – Norden 1 km (+ prognos)" } };
const OBS_LANGD = [[1, "Senaste"], [6, "1 h"], [12, "2 h"], [18, "3 h"], [36, "6 h"]];
// SMHI:s kompositbild: polarstereografisk (Bessel), horn och rutstorlek ur h5-filen (prov K 21/11)
let OBS_SMHI_PROJ = null;   // satts i obsSmhiProj() nar vi vet - se nedan

let OBS = (() => { let o = {}; try { o = JSON.parse(lasa("mt:obs") || "{}"); } catch (e) {}
  return { sat: o.sat || "geocolour", rad: o.rad || "smhi", langd: o.langd || 12, opac: o.opac || 90, sper: o.sper || 0.5, paus: o.paus || 2, blixt: !!o.blixt, under: o.under || "", prognos: o.prognos !== false, auto: o.auto !== false,
    lage: null, ramar: [], i: 0, spelar: false, cache: new Map(), gen: 0, bytes: 0, senast: 0 }; })();
const obsSpara = () => lagra("mt:obs", JSON.stringify({ under: OBS.under, sper: OBS.sper, paus: OBS.paus, sat: OBS.sat, rad: OBS.rad, langd: OBS.langd, opac: OBS.opac, blixt: OBS.blixt, prognos: OBS.prognos, auto: OBS.auto }));
const obsTidTxt = t => { const d = new Date(t); return String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0") + "Z"; };
const obsIso = t => new Date(t).toISOString().slice(0, 19) + "Z";

// ---------------- tider ----------------
// EUMETSAT: namnrymdens capabilities ger "start/slut/PT10M" per lager
let obsEumCaps = { t: 0, tider: {} };
async function obsEumTider() {
  if (Date.now() - obsEumCaps.t < 90e3) return obsEumCaps.tider;
  const r = await fetch(OBS_EUM + "mtg_fd/wms?service=WMS&version=1.3.0&request=GetCapabilities"), x = await r.text(), tider = {};
  // 21/11 kvall (prov M): forsta forekomsten av lagrets namn, och tidsdimensionen strax efter (stilnamn kan krocka)
  for (const m of x.matchAll(/<Name>(?:mtg_fd:)?([a-z0-9_]+)<\/Name>/g)) {
    const k = "mtg_fd:" + m[1]; if (k in tider) continue;
    const d = x.slice(m.index, m.index + 6000).match(/<Dimension name="time"[^>]*>([^<]+)<\/Dimension>/); if (!d) continue;
    const del = d[1].trim().split(",").pop().split("/"); tider[k] = del.length >= 2 ? Date.parse(del[1]) : Date.parse(del[0]);
  }
  obsEumCaps = { t: Date.now(), tider }; return tider;
}
// met.no: senaste filerna i katalogen (en fil var 5:e min, varje fil = analys + 23 prognossteg)
let obsMetCat = { t: 0, filer: [] };
async function obsMetFiler() {
  if (Date.now() - obsMetCat.t < 90e3) return obsMetCat.filer;
  const x = await (await fetch("https://thredds.met.no/thredds/catalog/radarnowcasting/catalog.xml")).text();
  const filer = [...new Set([...x.matchAll(/urlPath="(radarnowcasting\/[^"]+\.(\d{8}T\d{6})Z\.nc)"/g)].map(m => m[1]))].sort();
  obsMetCat = { t: Date.now(), filer }; return filer;
}
const obsMetT = f => { const m = f.match(/\.(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z\.nc$/); return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) : NaN; };
// SMHI: bara SENASTE bilden finns som png (prov L 21/11: aldre bilder finns bara som h5, som webblasaren inte
// kan lasa utan ett stort bibliotek). Loopen byggs darfor upp medan sidan ar oppen: varje ny bild sparas i minnet.
const OBS_SMHI = "https://opendata-download-radar.smhi.se/api/version/latest/area/sweden/product/comp";
const obsSmhiArkiv = new Map();   // tid -> blob-url for bilden
// 21/11 natt: mellanservern samlar SMHI:s bilder var 5:e minut (senaste 6 h) - hela loopen direkt.
// Svarar den inte anvands det gamla sattet (bara senaste, loopen byggs medan sidan ar oppen).
async function obsSmhiLista(n) {
  try {
    const bas = MELLAN.replace(/mepslatest\/$/, ""), r = await fetch(bas + "radar/smhi/lista", { cache: "no-store" });
    if (r.ok) { const l = await r.json(); if (Array.isArray(l) && l.length) return l.slice(-n).map(t => ({ t, url: bas + "radar/smhi/" + t + ".png" })); }
  } catch (e) {}
  return obsSmhiListaSjalv(n);
}
async function obsSmhiListaSjalv(n) {
  const j = await (await fetch(OBS_SMHI + ".json", { cache: "no-store" })).json();
  const f = (j.lastFiles || []).find(x => (x.formats || []).some(y => y.key === "png"));
  if (f) { const m = String(f.valid || "").match(/(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)/), t = m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) : NaN;
    if (isFinite(t) && !obsSmhiArkiv.has(t)) { const b = await (await fetch(OBS_SMHI + "/latest.png?t=" + t, { cache: "no-store" })).blob(); obsSmhiArkiv.set(t, URL.createObjectURL(b)); OBS.bytes += b.size; } }
  return [...obsSmhiArkiv.entries()].sort((a, b) => a[0] - b[0]).slice(-n).map(([t, url]) => ({ t, url }));
}

// ---------------- vilka bilder (ramar) ----------------
// en ram = { t, prognos, nyckel, url(vy) -> {url, proj} }
async function obsRamar() {
  const n = OBS.langd;
  if (OBS.lage === "sat") {
    const L = OBS_SAT[OBS.sat], steg = (L.steg || 10) * 60e3, slut = await obsSatSlut(L);
    const ramar = []; for (let k = n - 1; k >= 0; k--) { const t = slut - k * steg; ramar.push({ t, nyckel: L.lager + "|" + t, url: vy => obsWms(OBS_EUM + "wms", L.lager, L.fmt, t, vy) }); }
    return ramar;
  }
  if (OBS.rad === "smhi") {
    const l = await obsSmhiLista(n);
    return l.map(f => ({ t: f.t, nyckel: "smhi|" + f.t, url: () => ({ url: f.url, proj: { ...obsSmhiProj(), rensa: true } }) }));
  }
  const filer = await obsMetFiler(), sist = filer.slice(-n), ramar = sist.map(f => { const t = obsMetT(f); return { t, nyckel: "met|" + t, url: vy => obsWms("https://thredds.met.no/thredds/wms/" + f, "lwe_precipitation_rate", "image/png", t, vy, true) }; });
  if (OBS.prognos && filer.length) {   // prognosen ur senaste filen: +10, +20 ... +110 min (varannan, for att spara)
    const f = filer[filer.length - 1], t0 = obsMetT(f);
    for (let m = 10; m <= 110; m += 10) { const t = t0 + m * 60e3; ramar.push({ t, prognos: true, nyckel: "metp|" + t0 + "|" + t, url: vy => obsWms("https://thredds.met.no/thredds/wms/" + f, "lwe_precipitation_rate", "image/png", t, vy, true) }); }
  }
  return ramar;
}
// senaste satellittiden for ett lager: listan hos EUMETSAT ligger ofta en bild efter (prov M) - prova nasta
const obsSatSlutC = {};
async function obsSatSlut(L) {
  const c = obsSatSlutC[L.lager]; if (c && Date.now() - c.k < 60e3) return c.t;
  const tider = await obsEumTider(), steg = (L.steg || 10) * 60e3;
  let slut = tider[L.lager] || Math.floor((Date.now() - 30 * 60e3) / steg) * steg;
  for (let f = 0; f < 3 && slut + steg < Date.now(); f++) {
    try { const r = await fetch(OBS_EUM + "wms?service=WMS&version=1.3.0&request=GetMap&layers=" + L.lager + "&styles=&crs=EPSG:4326&bbox=58,15,60,18&width=8&height=8&format=image/png&time=" + obsIso(slut + steg));
      if (r.ok && (r.headers.get("content-type") || "").startsWith("image")) slut += steg; else break; } catch (e) { break; } }
  obsSatSlutC[L.lager] = { k: Date.now(), t: slut }; return slut;
}
// WMS-adress i EPSG:4326 for det som syns (latitud forst i 1.3.0)
function obsWms(bas, lager, fmt, t, vy, metno) {
  const b = obsLatLonRuta(vy), W = Math.min(2048, Math.round(vy.W * 1.25)), H = Math.min(2048, Math.max(64, Math.round(W * (b.n - b.s) / ((b.e - b.w) * Math.cos((b.n + b.s) / 2 * Math.PI / 180)))));
  let u = bas + "?service=WMS&version=1.3.0&request=GetMap&crs=EPSG:4326&layers=" + lager + "&bbox=" + [b.s, b.w, b.n, b.e].map(v => v.toFixed(3)).join(",") +
    "&width=" + W + "&height=" + H + "&format=" + encodeURIComponent(fmt) + "&time=" + obsIso(t);
  if (fmt === "image/png") u += "&transparent=true";
  if (metno) u += "&styles=default-scalar/metnoprecipitation&colorscalerange=0.1,50&logscale=true&numcolorbands=250&belowmincolor=transparent&abovemaxcolor=extend";
  else u += "&styles=";
  return { url: u, proj: { typ: "ll", ...b } };
}
// lat/lon-granser for det som syns: kanten provas pa 24 stallen per sida
function obsLatLonRuta(vy) {
  let s = 90, n = -90, w = 180, e = -180;
  for (let k = 0; k <= 24; k++) for (const [x, y] of [[vy.x + vy.w * k / 24, vy.y], [vy.x + vy.w * k / 24, vy.y + vy.h], [vy.x, vy.y + vy.h * k / 24], [vy.x + vy.w, vy.y + vy.h * k / 24]]) {
    const ll = franRuta(x, KY - 1 - y); s = Math.min(s, ll.lat); n = Math.max(n, ll.lat); w = Math.min(w, ll.lon); e = Math.max(e, ll.lon); }
  const pl = (n - s) * 0.02, po = (e - w) * 0.02;
  return { s: Math.max(-80, s - pl), n: Math.min(85, n + pl), w: w - po, e: e + po };
}

// ---------------- SMHI-projektionen ----------------
// png/tif-bilden ar i SWEREF 99 TM (UTM zon 33, GRS80) - GeoTIFF-taggarna i latest.tif (prov L 21/11):
// ovre vanstra hornet E 126648.404 N 7771252.876, rutor 2014.958 m, 471 x 887 rutor.
function obsSmhiProj() {
  if (!OBS_SMHI_PROJ) OBS_SMHI_PROJ = { typ: "utm", a: 6378137, rf: 298.257222101, lon0: 15, k0: 0.9996, fe: 500000, x0: 126648.404, y0: 7771252.876, dx: 2014.9581656, dy: 2014.9581657 };
  return OBS_SMHI_PROJ;
}
// lat/lon -> transversal Mercator (Snyder 8-9..8-10), ger {x: ostlig, y: nordlig}
function obsTm(P, lat, lon) {
  if (!P.e2) { const f = 1 / P.rf; P.e2 = 2 * f - f * f; P.ep2 = P.e2 / (1 - P.e2); }
  const r = Math.PI / 180, ph = lat * r, e2 = P.e2, N = P.a / Math.sqrt(1 - e2 * Math.sin(ph) ** 2), T = Math.tan(ph) ** 2, C = P.ep2 * Math.cos(ph) ** 2, A = (lon - P.lon0) * r * Math.cos(ph);
  const M = P.a * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256) * ph - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * ph) + (15 * e2 * e2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * ph) - (35 * e2 ** 3 / 3072) * Math.sin(6 * ph));
  return { x: P.fe + P.k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * P.ep2) * A ** 5 / 120),
           y: P.k0 * (M + N * Math.tan(ph) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * P.ep2) * A ** 6 / 720)) };
}
// lat/lon -> projicerade x,y (Snyder 21-33/21-34, nordpol)
function obsSter(P, lat, lon) {
  if (!P.e) { const f = 1 / P.rf; P.e = Math.sqrt(2 * f - f * f); const r = Math.PI / 180, ts = Math.tan(Math.PI / 4 - P.latTs * r / 2) / Math.pow((1 - P.e * Math.sin(P.latTs * r)) / (1 + P.e * Math.sin(P.latTs * r)), P.e / 2);
    P.mc = Math.cos(P.latTs * r) / Math.sqrt(1 - P.e * P.e * Math.sin(P.latTs * r) ** 2); P.tc = ts; }
  const r = Math.PI / 180, ph = lat * r, t = Math.tan(Math.PI / 4 - ph / 2) / Math.pow((1 - P.e * Math.sin(ph)) / (1 + P.e * Math.sin(ph)), P.e / 2);
  const rho = P.a * P.mc * t / P.tc, l = (lon - P.lon0) * r;
  return { x: rho * Math.sin(l), y: -rho * Math.cos(l) };
}

// ---------------- omprojicering ----------------
// Bilden (fran kallan) -> canvas i kartans koordinater for vyn vy = {x, y, w, h, W, H}
function obsVrid(img, proj, vy) {
  const iw = img.naturalWidth, ih = img.naturalHeight; if (!iw || !ih) return null;
  const ci = document.createElement("canvas"); ci.width = iw; ci.height = ih; const gi = ci.getContext("2d", { willReadFrequently: true }); gi.drawImage(img, 0, 0);
  const src = new Uint32Array(gi.getImageData(0, 0, iw, ih).data.buffer);
  const W = vy.W, H = vy.H, co = document.createElement("canvas"); co.width = W; co.height = H;
  const go = co.getContext("2d"), ut = go.createImageData(W, H), dst = new Uint32Array(ut.data.buffer);
  // kallans pixel for en punkt (lat/lon); -1 = utanfor
  const pix = proj.typ === "ll" ? (lat, lon) => { const px = (lon - proj.w) / (proj.e - proj.w) * iw, py = (proj.n - lat) / (proj.n - proj.s) * ih; return px < 0 || py < 0 || px >= iw || py >= ih ? -1 : (py | 0) * iw + (px | 0); }
    : (lat, lon) => { const p = proj.typ === "utm" ? obsTm(proj, lat, lon) : obsSter(proj, lat, lon), px = (p.x - proj.x0) / proj.dx, py = (proj.y0 - p.y) / proj.dy; return px < 0 || py < 0 || px >= iw || py >= ih ? -1 : (py | 0) * iw + (px | 0); };
  // grovt natt (var 8:e pixel) med lat/lon, linjart emellan - snabbt och tillrackligt exakt
  const S = 8, gw = Math.ceil(W / S) + 1, gh = Math.ceil(H / S) + 1, LA = new Float64Array(gw * gh), LO = new Float64Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { const ll = franRuta(vy.x + Math.min(W, i * S) / W * vy.w, KY - 1 - (vy.y + Math.min(H, j * S) / H * vy.h)); LA[j * gw + i] = ll.lat; LO[j * gw + i] = ll.lon; }
  for (let y = 0; y < H; y++) { const j = Math.floor(y / S), fy = (y - j * S) / S;
    for (let x = 0; x < W; x++) { const i = Math.floor(x / S), fx = (x - i * S) / S, a = j * gw + i;
      const lat = (LA[a] * (1 - fx) + LA[a + 1] * fx) * (1 - fy) + (LA[a + gw] * (1 - fx) + LA[a + gw + 1] * fx) * fy;
      const lon = (LO[a] * (1 - fx) + LO[a + 1] * fx) * (1 - fy) + (LO[a + gw] * (1 - fx) + LO[a + gw + 1] * fx) * fy;
      const k = pix(lat, lon); if (k >= 0) { const v = src[k]; if (!proj.rensa || ((v >>> 24) > 200 && !((v & 255) === ((v >>> 8) & 255) && (v & 255) === ((v >>> 16) & 255)))) dst[y * W + x] = v;   /* SMHI: bort med svart/gratt (bakgrund, logga) */ } } }
  go.putImageData(ut, 0, 0);
  return co;
}
// andel pixlar med innehall (for att kanna igen en tom bild = tiden finns inte an)
function obsInnehall(c) { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0, m = 0;
  for (let i = 0; i < d.length; i += 64) { m++; if (d[i + 3] > 0 && (d[i] + d[i + 1] + d[i + 2]) > 30) n++; } return m ? n / m : 0; }

// ---------------- hamtning ----------------
function obsLaddaBild(url) {
  return new Promise((ok, fel) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => ok(im); im.onerror = () => fel(new Error("bilden kunde inte hämtas")); im.src = url; });
}
async function obsHamtaRam(r, vy) {
  const nyck = r.nyckel + "|" + vy.nyckel; if (OBS.cache.has(nyck)) return OBS.cache.get(nyck);
  const p = (async () => {
    const { url, proj } = r.url(vy), im = await obsLaddaBild(url);
    const c = obsVrid(im, proj, vy); if (!c) throw new Error("tom bild");
    const blob = await new Promise(ok => c.toBlob(ok, "image/png")); OBS.bytes += blob.size;
    return { href: URL.createObjectURL(blob), vy, tom: obsInnehall(c) < 0.002 };
  })();
  OBS.cache.set(nyck, p); p.catch(() => OBS.cache.delete(nyck));
  return p;
}
// vyn = det som syns just nu, i skarmens upplosning
function obsVy() {
  const r = $("karta").getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.max(200, Math.min(1800, Math.round(r.width * dpr)));
  const H = Math.max(200, Math.min(2200, Math.round(W * vb.h / vb.w)));
  return { x: vb.x, y: vb.y, w: vb.w, h: vb.h, W, H, nyckel: [vb.x, vb.y, vb.w, vb.h].map(v => v.toFixed(1)).join(",") + "|" + W };
}

// ---------------- ritning ----------------
function obsVisa() {
  const g = $("kObs"); if (!g) return;
  const r = OBS.ramar[OBS.i]; if (!r || !OBS.lage) { g.textContent = ""; obsPrognosSkylt(null); return; }
  const v = r.bild;
  const sistObs = OBS.ramar.filter(x => !x.prognos).pop(), rel = sistObs ? Math.round((r.t - sistObs.t) / 60e3) : 0;   /* 21/11 kvall: minus-tid for aldre bilder */
  $("obsTid").textContent = obsTidTxt(r.t) + (r.prognos ? "  PROGNOS +" + rel + " min" : rel < 0 ? "  −" + -rel + " min" : "  senaste") + "  ·  " + obsSen(r.t);
  $("obsTid").classList.toggle("prognos", !!r.prognos);
  obsPrognosSkylt(r);
  $("obsReglage").max = Math.max(0, OBS.ramar.length - 1); $("obsReglage").value = OBS.i;
  if (!v) return;   // behall forra bilden tills denna ar klar
  const lag = v.lager || [];   // [bas, ev. blixtar]
  g.textContent = "";
  for (const b of [v.under, v, ...lag]) if (b && b.href) g.appendChild(el("image", { href: b.href, x: b.vy.x, y: b.vy.y, width: b.vy.w, height: b.vy.h, preserveAspectRatio: "none" }));
}
// 21/11 kvall: rod skylt i kartans hörn + rod ram nar loopen visar met.no:s prognos (fast, foljer inte zoom)
// Skylten visas for alla bilder: gra med tid och minus-tid (aldre bilder) eller "senaste", rod for prognos.
function obsPrognosSkylt(r) {
  const sk = $("obsPrognosSkylt"); if (!sk) return;
  const p = !!(r && r.prognos && OBS.lage === "rad"); document.querySelector(".kartram").classList.toggle("prognosram", p);
  if (!r || !OBS.lage) { sk.hidden = true; return; }
  const sist = OBS.ramar.filter(x => !x.prognos).pop(), rel = sist ? Math.round((r.t - sist.t) / 60e3) : 0;
  sk.hidden = false; sk.classList.toggle("obs", !p);
  sk.textContent = (p ? "PROGNOS +" + rel + " min" : rel < 0 ? "−" + -rel + " min" : "Senaste") + " · " + obsTidTxt(r.t);
}
const obsSen = t => { const m = Math.round((Date.now() - t) / 60e3); return m < 0 ? "om " + -m + " min" : m < 90 ? m + " min sedan" : Math.round(m / 6) / 10 + " h sedan"; };
function obsStatus(txt) { const s = $("obsStatus"); if (s) s.textContent = txt; }

// ---------------- laddning av loopen ----------------
async function obsLadda(nyLista) {
  if (!OBS.lage) return;
  const gen = ++OBS.gen, vy = obsVy();
  try {
    if (nyLista || !OBS.ramar.length) {
      const varSist = OBS.ramar.length && OBS.i >= OBS.ramar.filter(r => !r.prognos).length - 1, gamla = new Map(OBS.ramar.map(r => [r.nyckel, r.bild]));
      obsStatus("Hämtar lista …"); const ramar = await obsRamar(); if (gen !== OBS.gen) return;
      for (const r of ramar) r.bild = gamla.get(r.nyckel) || null;
      const sistObs = ramar.filter(r => !r.prognos).length - 1;
      OBS.ramar = ramar; if (OBS.lage === "rad") obsFyllForkl(); if (!nyLista || varSist || OBS.i > ramar.length - 1) OBS.i = Math.max(0, sistObs);
    }
    // ordning: den som visas forst, sedan nyast -> aldst, sist prognosen
    const ordn = [OBS.i, ...OBS.ramar.map((_, k) => k).filter(k => k !== OBS.i && !OBS.ramar[k].prognos).reverse(), ...OBS.ramar.map((_, k) => k).filter(k => k !== OBS.i && OBS.ramar[k].prognos)];
    let klara = 0, fel = 0; const t0 = performance.now();
    const blixt = OBS.blixt && !(OBS.lage === "sat" && OBS.sat === "li");
    // 21/11 kvall: radar ovanpa satellit - satellitbilden narmast fore radarbildens tid (prognos: senaste)
    const UL = OBS.lage === "rad" && OBS.under ? OBS_SAT[OBS.under] : null, ulSlut = UL ? await obsSatSlut(UL).catch(() => 0) : 0;
    const jobb = ordn.map(k => async () => {
      if (gen !== OBS.gen) return; const r = OBS.ramar[k];
      try {
        const b = await obsHamtaRam(r, vy); let lager = [];
        if (blixt) { const tl = Math.floor(r.t / 300e3) * 300e3, L = OBS_SAT.li;   // blixtar (LI) narmast fore bildens tid
          try { lager = [await obsHamtaRam({ nyckel: "li|" + tl, url: v => obsWms(OBS_EUM + "wms", L.lager, L.fmt, tl, v) }, vy)]; } catch (e) {} }
        let under = null;
        if (UL && ulSlut) { const tu = Math.min(ulSlut, Math.floor(r.t / 600e3) * 600e3);
          try { under = await obsHamtaRam({ nyckel: "u|" + UL.lager + "|" + tu, url: v => obsWms(OBS_EUM + "wms", UL.lager, UL.fmt, tu, v) }, vy); } catch (e) {} }
        if (gen !== OBS.gen) return;
        r.bild = { ...b, lager, under }; klara++;
        if (k === OBS.i) obsVisa();
      } catch (e) { fel++; }
      obsStatus("Bilder " + klara + "/" + OBS.ramar.length + (fel ? " (" + fel + " saknas)" : ""));
    });
    // tre at gangen
    let p = 0; await Promise.all([0, 1, 2].map(async () => { while (p < jobb.length) await jobb[p++](); }));
    if (gen !== OBS.gen) return;
    // senaste satellitbilden kan vara tom (tiden finns i listan men bilden ar inte klar) - hoppa over den
    const sist = OBS.ramar.filter(r => !r.prognos).length - 1;
    if (OBS.lage === "sat" && OBS.ramar[sist] && OBS.ramar[sist].bild && OBS.ramar[sist].bild.tom && sist > 0) { OBS.ramar.splice(sist, 1); if (OBS.i >= sist) OBS.i = sist - 1; }
    obsVisa();
    obsStatus("Klart: " + OBS.ramar.filter(r => r.bild).length + "/" + OBS.ramar.length + " bilder på " + ((performance.now() - t0) / 1000).toFixed(1) + " s" + (fel ? ", " + fel + " saknas" : ""));
  } catch (e) { if (gen === OBS.gen) obsStatus("Kunde inte hämta: " + e.message); }
}
// gamla bilder slapps nar vyn byts (annars vaxer minnet)
function obsRensaCache(behall) {
  for (const [k, p] of OBS.cache) if (!behall || !k.endsWith(behall)) { p.then(b => setTimeout(() => URL.revokeObjectURL(b.href), 30e3)).catch(() => {}); OBS.cache.delete(k); }
}

// ---------------- loop och auto ----------------
let obsSpelTimer = 0, obsAutoTimer = 0, obsVyTimer = 0;
function obsSpela(pa) {
  OBS.spelar = pa === undefined ? !OBS.spelar : pa; $("obsSpela").textContent = OBS.spelar ? "⏸" : "▶"; $("obsSpela").setAttribute("aria-pressed", String(OBS.spelar));
  clearTimeout(obsSpelTimer); if (!OBS.spelar) return;
  const steg = () => { if (!OBS.spelar) return; const n = OBS.ramar.length; if (!n) return;
    // hoppa over bilder som inte ar klara
    let k = OBS.i; for (let f = 0; f < n; f++) { k = (k + 1) % n; if (OBS.ramar[k].bild) break; }
    OBS.i = k; obsVisa(); obsSpelTimer = setTimeout(steg, k === n - 1 ? OBS.paus * 1000 : (OBS.ramar[k + 1] && OBS.ramar[k + 1].prognos && !OBS.ramar[k].prognos) ? Math.max(OBS.sper * 1000, 800) : OBS.sper * 1000); };
  obsSpelTimer = setTimeout(steg, 300);
}
function obsStega(d) { if (!OBS.ramar.length) return; obsSpela(false); OBS.i = Math.max(0, Math.min(OBS.ramar.length - 1, OBS.i + d)); obsVisa(); }
function obsAuto() { clearInterval(obsAutoTimer); if (OBS.auto && OBS.lage) obsAutoTimer = setInterval(() => { if (!document.hidden && OBS.lage) obsLadda(true); }, 120e3); }
// kallas fran satVb nar kartan flyttas/zoomas
function obsVyAndrad() { if (!OBS.lage) return; clearTimeout(obsVyTimer); obsVyTimer = setTimeout(() => { obsRensaCache(obsVy().nyckel); obsLadda(false); }, 600); }

// ---------------- Dela (21/11 kvall) ----------------
// Delarens val (kalla, loop, blixtar, prognos, satellit under, tackning) och vilken bild som visas - tiden bara nar loopen star still
function obsFanga() {
  const r = OBS.ramar[OBS.i];
  return { s: OBS.sat, r: OBS.rad, n: OBS.langd, b: OBS.blixt, p: OBS.prognos, u: OBS.under, o: OBS.opac, sp: OBS.spelar, t: OBS.spelar || !r ? null : r.t };
}
function obsTillampa(o) {
  if (!o || !OBS.lage) return;
  const knappar = () => { for (const [id, k] of [["obsBlixt", "blixt"], ["obsPrognos", "prognos"]]) $(id).setAttribute("aria-pressed", String(OBS[k])); };
  const ny = (OBS.lage === "sat" ? OBS.sat !== o.s : OBS.rad !== o.r) || OBS.langd !== o.n || OBS.prognos !== o.p;
  const bild = OBS.blixt !== o.b || OBS.under !== o.u;
  OBS.sat = o.s; OBS.rad = o.r; OBS.langd = o.n; OBS.blixt = o.b; OBS.prognos = o.p; OBS.under = o.u || "";
  if (o.o && o.o !== OBS.opac) { OBS.opac = o.o; $("obsOpac").value = o.o; $("kObs").style.opacity = o.o / 100; }
  $("obsLangd").value = OBS.langd; knappar(); obsFyllVal();
  const valjTid = () => { if (o.t) { let bi = -1, bd = 1e15; OBS.ramar.forEach((r, k) => { const d = Math.abs(r.t - o.t); if (d < bd) { bd = d; bi = k; } }); if (bi >= 0) { OBS.i = bi; obsVisa(); } } };
  if (ny) { OBS.ramar = []; OBS.i = 0; obsLadda(true).then(valjTid); }
  else { if (bild) { for (const r of OBS.ramar) r.bild = null; obsLadda(false); } valjTid(); }
  if (!!o.sp !== OBS.spelar) obsSpela(!!o.sp);
}

// ---------------- flikbyte ----------------
function obsLage(nytt) {
  const var_ = OBS.lage; OBS.lage = nytt === "sat" || nytt === "rad" ? nytt : null;
  if (!OBS.lage) { obsSpela(false); clearInterval(obsAutoTimer); $("kObs").textContent = ""; OBS.gen++; obsPrognosSkylt(null); return; }
  if (typeof tafLaddaEuropa === "function") tafLaddaEuropa().then(() => satVb(vb.x, vb.y, vb.w));
  obsFyllVal();
  if (var_ !== OBS.lage) { OBS.ramar = []; OBS.i = 0; $("kObs").textContent = ""; }
  obsLadda(true); obsAuto();
}
function obsFyllVal() {
  const sel = $("obsKalla"), lista = OBS.lage === "sat" ? OBS_SAT : OBS_RAD; sel.textContent = "";
  for (const k in lista) sel.add(new Option(lista[k].namn, k));
  sel.value = OBS.lage === "sat" ? OBS.sat : OBS.rad;
  $("obsKallaEtikett").textContent = OBS.lage === "sat" ? "Bild (MTG, EUMETSAT)" : "Radar";
  $("obsPrognosRad").hidden = !(OBS.lage === "rad" && OBS.rad === "metno");
  $("obsUnderRad").hidden = OBS.lage !== "rad"; $("obsUnder").value = OBS.under;
  obsFyllForkl();
}
function obsFyllForkl() {
  $("obsForkl").innerHTML = OBS.lage === "rad" ? (OBS.rad === "metno"
    ? "Nederbördsintensitet mm/h (met.no, logaritmisk skala 0,1–50). " + (obsMetCat.filer.length ? "<img alt='' src='https://thredds.met.no/thredds/wms/" + obsMetCat.filer.slice(-1)[0] + "?request=GetLegendGraphic&layer=lwe_precipitation_rate&colorbaronly=true&vertical=false&width=200&height=12&palette=metnoprecipitation&colorscalerange=0.1,50&logscale=true&numcolorbands=250' style='height:12px;vertical-align:middle' onerror='this.remove()'> 0,1 – 50 mm/h" : "")
    : "Radarreflektivitet med SMHI:s färgskala. Mellanservern sparar SMHI:s bilder var 5:e minut (senaste 6 h).")
    : OBS_SAT[OBS.sat].genom ? "Genomskinligt lager – kartan syns under." : "";
}
(function obsInit() {
  if (!$("obsKalla")) return;
  const ls = $("obsLangd"); for (const [n, t] of OBS_LANGD) ls.add(new Option(t, n)); ls.value = OBS.langd;
  $("obsKalla").addEventListener("change", e => { if (OBS.lage === "sat") OBS.sat = e.target.value; else OBS.rad = e.target.value; obsSpara(); obsFyllVal(); OBS.ramar = []; OBS.i = 0; obsLadda(true); });
  ls.addEventListener("change", () => { OBS.langd = +ls.value; obsSpara(); obsLadda(true); });
  $("obsSpela").addEventListener("click", () => obsSpela());
  $("obsBak").addEventListener("click", () => obsStega(-1)); $("obsFram").addEventListener("click", () => obsStega(1));
  $("obsNu").addEventListener("click", () => { obsSpela(false); OBS.i = Math.max(0, OBS.ramar.filter(r => !r.prognos).length - 1); obsVisa(); });
  $("obsReglage").addEventListener("input", e => { obsSpela(false); OBS.i = +e.target.value; obsVisa(); });
  const knapp = (id, nyckel, efter) => { const b = $(id); b.setAttribute("aria-pressed", String(OBS[nyckel]));
    b.addEventListener("click", () => { OBS[nyckel] = !OBS[nyckel]; b.setAttribute("aria-pressed", String(OBS[nyckel])); obsSpara(); efter(); }); };
  knapp("obsAuto", "auto", obsAuto);
  knapp("obsBlixt", "blixt", () => { for (const r of OBS.ramar) r.bild = null; obsLadda(false); });
  knapp("obsPrognos", "prognos", () => obsLadda(true));
  $("obsUnder").addEventListener("change", e => { OBS.under = e.target.value; obsSpara(); for (const r of OBS.ramar) r.bild = null; obsLadda(false); });
  const fps = $("obsFps"), pau = $("obsPaus"); fps.value = OBS.sper; pau.value = OBS.paus;   /* 21/11 kvall: loopens fart och stopp pa sista bilden */
  fps.addEventListener("change", () => { OBS.sper = +fps.value; obsSpara(); });
  pau.addEventListener("change", () => { OBS.paus = +pau.value; obsSpara(); });
  const op = $("obsOpac"); op.value = OBS.opac; $("kObs").style.opacity = OBS.opac / 100;
  op.addEventListener("input", () => { OBS.opac = +op.value; $("kObs").style.opacity = OBS.opac / 100; obsSpara(); });
  document.addEventListener("keydown", ev => {
    if (!OBS.lage || ev.altKey || ev.ctrlKey || ev.metaKey) return; const t = ev.target.tagName; if (t === "INPUT" || t === "SELECT" || t === "TEXTAREA") return;
    if (ev.key === "ArrowLeft") { obsStega(-1); ev.preventDefault(); } else if (ev.key === "ArrowRight") { obsStega(1); ev.preventDefault(); } else if (ev.key === " ") { obsSpela(); ev.preventDefault(); }
  });
})();

// ===================================================================
//  LEGEND I KARTAN (NYTT 21/11 kvall) - fliken Sannolikhet och Karta m0
// ===================================================================
// Fargrutorna fran forklaringen under kartan (pForkl / m0Forkl) visas aven inne i kartan, staende vid
// vansterkanten, hogsta vardet overst. Fast i kartramen - foljer inte med nar man zoomar eller flyttar.
// Byggs om automatiskt nar forklaringen under kartan andras (MutationObserver) eller fliken byts.
function kartLegend() {
  const L = $("kartLegend"); if (!L) return;
  const kalla = lage === "p" ? $("pForkl") : lage === "m0" ? $("m0Forkl") : null;
  const rader = kalla ? [...kalla.children].filter(sp => sp.querySelector("i")) : [];
  // 21/11 kvall: isolinjerna (linjeprov i forklaringen) och m0:s "Linjer: ..." kommer med under fargerna
  const linjer = kalla ? [...kalla.children].filter(sp => sp.querySelector("svg") || (!sp.querySelector("i") && /^Linjer:/.test(sp.textContent))) : [];
  if (!rader.length && !linjer.length) { L.hidden = true; return; }
  let rub = "";
  if (lage === "p") { const pa = PPARAM[$("pParam").value]; rub = typeof visaLage === "function" && visaLage() === "sannolikhet" ? "Sannolikhet" : pa ? pa.namn.split(",")[0] : ""; }
  else if (typeof M0P !== "undefined" && M0P[M0F.v]) rub = M0P[M0F.v].namn;
  L.textContent = ""; const b = document.createElement("b"); b.textContent = rub; L.appendChild(b);
  L.classList.toggle("tat", rader.length > 15);   // 22/11: manga klasser (temperatur per grad) - smala rader
  for (const sp of rader.slice().reverse()) {
    const d = document.createElement("div"), i = document.createElement("i"), src = sp.querySelector("i");
    i.style.background = src.style.background; d.append(i, sp.textContent.trim()); L.appendChild(d);
  }
  if (linjer.length) {
    const r = document.createElement("b"); r.textContent = "Isolinjer"; r.style.marginTop = rader.length ? "5px" : "0"; L.appendChild(r);
    for (const sp of linjer) { const d = document.createElement("div"), sv = sp.querySelector("svg");
      if (sv) { const k = sv.cloneNode(true); k.setAttribute("width", 20); k.style.margin = "0"; d.append(k); }
      d.append(sp.textContent.replace(/^Linjer:\s*/, "").trim()); L.appendChild(d); }
  }
  L.hidden = false;
  // 22/11: strax under rutan med tid och parameter (uppe till vanster), annars overst
  const kt = lage === "m0" ? $("kartTidM0") : $("kartTid"), synlig = kt && kt.textContent && getComputedStyle(kt).display !== "none";
  L.style.top = (synlig ? kt.offsetTop + kt.offsetHeight + 6 : 8) + "px";
}
(function kartLegendInit() {
  let t = 0; const omrita = () => { clearTimeout(t); t = setTimeout(kartLegend, 30); };
  const mo = new MutationObserver(omrita);
  for (const id of ["pForkl", "m0Forkl", "kartTid", "kartTidM0"]) { const e = $(id); if (e) mo.observe(e, { childList: true, subtree: true, characterData: true }); }
  new MutationObserver(omrita).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  omrita();
})();

// ===================================================================
// 23/11: FORM PA RUTAN. Forst satellit/radar, 23/11 kvall ALLA flikar med karta (Jakob): body far klassen formbar
// (pa dator kan .kartram dras i hornet, CSS i index.html). Storleken sparas per flik (mt:form:<flik>, f = Favoriter;
// satellit/radar laser aven de gamla mt:obsForm:sat/rad). Med egen form far body klassen egenForm (+ obsForm i sat/rad):
// da far kartan rutans hojd och den vita panelen krymper med bilden.
// Kartans viewBox foljer rutans form av sig sjalv (ResizeObserver pa #karta i index.html).
// ===================================================================
(function obsForm() {
  const ram = document.querySelector(".kartram"); if (!ram || !window.ResizeObserver) return;
  const FLIKAR = ["th", "p", "m0", "taf", "sat", "rad", "brand", "led"];
  const flik = () => (typeof fav !== "undefined" && fav) ? "f" : lage;
  const formbar = () => FLIKAR.includes(lage) && matchMedia("(min-width: 861px)").matches;
  const nyckel = () => "mt:form:" + flik();
  const las = () => { for (const k of [nyckel(), lage === "rad" ? "mt:obsForm:rad" : lage === "sat" ? "mt:obsForm:sat" : ""]) { if (!k) continue;
    try { const f = JSON.parse(lasa(k) || "null"); if (f && f.w > 100 && f.h > 100) return f; } catch (e) {} } return null; };
  const egen = on => { document.body.classList.toggle("egenForm", on); document.body.classList.toggle("obsForm", on && document.body.classList.contains("obs"));
    const b = document.getElementById("formAter"); if (b) b.hidden = !on || document.body.classList.contains("obs"); };
  let senast = "";
  const satt = () => { const fb = formbar(); document.body.classList.toggle("formbar", fb);
    const f = fb ? las() : null, k = fb ? nyckel() : "";
    if (k === senast && (!fb || ram.style.width)) { egen(fb && !!ram.style.width); panelBredd(); return; }   // samma flik - lat dragningen vara
    senast = k;
    if (fb && f) { ram.style.width = Math.min(f.w, innerWidth - 380) + "px"; ram.style.height = f.h + "px"; }
    else { ram.style.width = ""; ram.style.height = ""; }
    egen(fb && !!f); panelBredd(); };
  // den vita panelen far samma bredd som bilden (verktygsraden radbryts) - annars blir den kvar lika bred
  const panel = document.querySelector(".kartpanel");
  const panelBredd = () => { if (!panel) return; panel.style.width = document.body.classList.contains("egenForm") && ram.style.width ? (ram.offsetWidth + 18) + "px" : ""; };
  let klar = false, tm = 0;
  new ResizeObserver(() => { if (!klar || !document.body.classList.contains("formbar") || !ram.style.width && !ram.style.height) return;
    egen(true); panelBredd();
    clearTimeout(tm); tm = setTimeout(() => lagra(nyckel(), JSON.stringify({ w: Math.round(ram.offsetWidth), h: Math.round(ram.offsetHeight) })), 300); }).observe(ram);
  // nar anvandaren drar i hornet satter webblasaren style.width/height sjalv - da sparas det ovan
  let forraFlik = "";
  new MutationObserver(() => { const k = flik(); if (k === forraFlik) return; forraFlik = k;   // bara vid flikbyte (egna klassbyten ignoreras)
    klar = false; satt(); setTimeout(() => { klar = true; }, 100); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  ram.addEventListener("pointerdown", () => { if (document.body.classList.contains("formbar")) klar = true; });
  const ater = () => { lagra(nyckel(), ""); if (lage === "sat" || lage === "rad") lagra("mt:obsForm:" + lage, ""); ram.style.width = ""; ram.style.height = ""; egen(false); panelBredd(); };
  for (const id of ["obsFormAter", "formAter"]) { const b = document.getElementById(id); if (b) b.addEventListener("click", ater); }
  addEventListener("resize", () => { if (formbar() !== document.body.classList.contains("formbar")) { senast = ""; satt(); } });
  forraFlik = flik(); satt(); setTimeout(() => { klar = true; }, 100);
})();
