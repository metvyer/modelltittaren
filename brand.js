// brand.js - NYTT 24/11 (Jakob): FLIKEN BRANDRISK.
// Karta (dygnsvarden, 12 UTC, ca 7 dagar) fran SMHI:s brandriskprognos (samma som SMHI:s/MCF:s brandriskkartor),
// forhamtad till R2 i 5 km (forhamta.py brand): Skogsbrandsrisk (klass ur FWI), FWI-varde, Grasbrandsrisk, Branslets
// uttorkning skog. Plus EFFIS/GWIS (ECMWF FWI, hela Europa, ~8 km, 1-10 dygn) som bild via mellanservern /effis.
// Klick pa kartan = punktens prognos fran SMHI (timme for timme ca 48 h + dygn) via mellanservern /brand/punkt.
// SMHI raknar bara over land och sjoar i Sverige och bara under sasong - utanfor sasong blir det mest "saknas".
const BR_R2 = "https://modelltittaren.metvyer.workers.dev/r2/brand/", BR_PUNKT = "https://modelltittaren.metvyer.workers.dev/brand/punkt",
  BR_EFFIS = "https://modelltittaren.metvyer.workers.dev/effis";
// klassfarger enligt SMHI/MCF (1 gron ... 5E rod)
const BR_KLASS = [null, ["#1a9641", "1 Mycket liten"], ["#a6d96a", "2 Liten"], ["#ffffbf", "3 Måttlig"], ["#fdae61", "4 Stor"], ["#f46d43", "5 Mycket stor"], ["#d7191c", "5E Extremt stor"]];
const BR_GRAS = [null, ["#e0f2fe", "Snötäckt mark"], ["#d1d5db", "Gräsbrandssäsongen slut"], ["#a6d96a", "Låg"], ["#ffffbf", "Måttlig"], ["#fdae61", "Stor"], ["#d7191c", "Mycket stor"]];
const BR_TORR = [null, ["#2b83ba", "1 Mycket blött"], ["#abdda4", "2 Blött"], ["#ffffbf", "3 Måttligt blött"], ["#fdae61", "4 Torrt"], ["#f46d43", "5 Mycket torrt"], ["#d7191c", "5E Extremt torrt"]];
const BR_FALT = {
  skog: { namn: "Skogsbrandsrisk (FWI-klass)", fil: "fwi", klass: v => v < 5 ? 1 : v < 11 ? 2 : v < 17 ? 3 : v < 22 ? 4 : v < 28 ? 5 : 6, tab: BR_KLASS },
  fwi: { namn: "FWI-värde", fil: "fwi", varde: true },
  gras: { namn: "Gräsbrandsrisk", fil: "gras", klass: v => v, tab: BR_GRAS },
  torr: { namn: "Bränsleuttorkning skog", fil: "torr", klass: v => v, tab: BR_TORR },
  effis: { namn: "EFFIS FWI – ECMWF, hela Europa", effis: true },
};
const BR_FWI_STEG = [[0, "#1a9641"], [5, "#a6d96a"], [11, "#ffffbf"], [17, "#fdae61"], [22, "#f46d43"], [28, "#d7191c"], [38, "#7f0000"], [50, "#3f007d"]];
let BR = { falt: BR_FALT[lasa("mt:brFalt")] ? lasa("mt:brFalt") : "skog", dag: 0, idx: null, data: new Map(), punkt: null, pdata: null, effisDag: 0, effisBild: null, effisNyck: "" };
const brEsc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const brDag = iso => { const d = new Date(iso); return isNaN(d) ? iso : ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"][d.getUTCDay()] + " " + d.getUTCDate() + "/" + (d.getUTCMonth() + 1); };
async function brIndex() {
  try { const r = await fetch(BR_R2 + "index.json", { cache: "no-store" }); if (r.ok) BR.idx = await r.json(); } catch (e) {}
  return BR.idx;
}
async function brFil(fil, dag) {
  const i = BR.idx; if (!i) return null; const k = i.mapp + "/" + fil + "_" + dag;
  if (BR.data.has(k)) return BR.data.get(k);
  const r = await fetch(BR_R2 + i.mapp + "/" + fil + "_" + dag + ".bin.gz"); if (!r.ok) return null;
  const u = new Uint8Array(await new Response(new Blob([await r.arrayBuffer()]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
  BR.data.set(k, u); return u;
}
function brFargFwi(v) { let f = BR_FWI_STEG[0][1]; for (const [g, c] of BR_FWI_STEG) if (v >= g) f = c; return f; }
const brRgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
async function brRita() {
  const g = $("kBrand"); if (!g) return; if (lage !== "brand") { g.textContent = ""; return; }
  const F = BR_FALT[BR.falt]; brForklaring();
  if (F.effis) { await brEffis(g); return; }
  if (!BR.idx) await brIndex();
  const i = BR.idx;
  if (!i) { g.textContent = ""; $("brInfo").textContent = "Ingen brandriskkarta hämtad än (förhämtningen kör när SMHI har en ny prognos)."; return; }
  const u = await brFil(F.fil, BR.dag); if (lage !== "brand") return;
  g.textContent = "";
  if (!u) { $("brInfo").textContent = "Kunde inte hämta kartan."; return; }
  const cv = document.createElement("canvas"); cv.width = i.nx; cv.height = i.ny;
  const cx = cv.getContext("2d"), img = cx.createImageData(i.nx, i.ny), px = img.data; let n = 0;
  for (let y = 0; y < i.ny; y++) for (let x = 0; x < i.nx; x++) { const v = u[y * i.nx + x]; if (v === 255) continue;
    let c; if (F.varde) c = brFargFwi(v); else { const k = F.klass(v), t = F.tab[k]; if (!t) continue; c = t[0]; }
    const [r_, g_, b_] = brRgb(c), q = ((i.ny - 1 - y) * i.nx + x) * 4; px[q] = r_; px[q + 1] = g_; px[q + 2] = b_; px[q + 3] = 205; n++; }
  cx.putImageData(img, 0, 0);
  const s = i.s; g.appendChild(el("image", { href: skarpaRutor(cv), x: i.x0 - s / 2, y: KY - 1 - (i.y0 + (i.ny - 1) * s) - s / 2, width: i.nx * s, height: i.ny * s,
    preserveAspectRatio: "none", style: "image-rendering:pixelated;image-rendering:crisp-edges", opacity: 0.85 }));
  $("brInfo").textContent = (n ? "" : "Inga värden – utanför brandsäsongen eller snötäckt. ") + "SMHI:s brandriskprognos (samma som SMHI:s och MCF:s kartor), dygnsvärde " + brDag(i.dagar[BR.dag]) +
    " 12 UTC, körning " + (i.ref || "").slice(0, 16).replace("T", " ") + " UTC. Visas i 5 km (SMHI räknar i 2,5 km). Klicka på kartan för punktens prognos timme för timme.";
}
async function brEffis(g) {   // ECMWF FWI fran EFFIS/GWIS som bild, omprojicerad till var karta (obsVrid i obs.js)
  const svg = $("karta"), r = svg.getBoundingClientRect(), vy = { x: vb.x, y: vb.y, w: vb.w, h: vb.h, W: Math.max(200, Math.round(r.width)), H: Math.max(200, Math.round(r.height)) };
  const b = obsLatLonRuta(vy), d = new Date(Date.now() + BR.effisDag * 864e5), tid = d.toISOString().slice(0, 10);
  const W = Math.min(2048, Math.round(vy.W * 1.25)), H = Math.min(2048, Math.max(64, Math.round(W * (b.n - b.s) / ((b.e - b.w) * Math.cos((b.n + b.s) / 2 * Math.PI / 180)))));
  const u = BR_EFFIS + "?lager=ecmwf.fwi&tid=" + tid + "&bbox=" + [b.s, b.w, b.n, b.e].map(v => v.toFixed(3)).join(",") + "&w=" + W + "&h=" + H;
  $("brInfo").textContent = "Hämtar EFFIS …";
  try { const im = await obsLaddaBild(u), c = obsVrid(im, { typ: "ll", ...b }, vy); if (lage !== "brand" || BR_FALT[BR.falt] !== BR_FALT.effis) return;
    g.textContent = ""; if (!c) throw new Error("tom bild");
    g.appendChild(el("image", { href: c.toDataURL("image/png"), x: vy.x, y: vy.y, width: vy.w, height: vy.h, preserveAspectRatio: "none", opacity: 0.8 }));
    $("brInfo").textContent = "EFFIS (Copernicus, JRC): FWI från ECMWF (~8 km), dygnsvärde " + tid + ". Hela Europa. Zoomar/flyttar du kartan – välj fältet igen för ny bild.";
  } catch (e) { $("brInfo").textContent = "EFFIS-bilden kunde inte hämtas (" + (e.message || e) + ")."; }
}
function brForklaring() {
  const f = $("brForkl"); if (!f) return; f.textContent = ""; const F = BR_FALT[BR.falt];
  const rad = (c, t) => { const s = document.createElement("span"), i = document.createElement("i"); i.className = "pruta"; i.style.background = c; s.append(i, t); f.append(s); };
  if (F.varde || F.effis) { for (let k = 0; k < BR_FWI_STEG.length; k++) rad(BR_FWI_STEG[k][1], "≥ " + BR_FWI_STEG[k][0]); if (F.effis) f.append(document.createTextNode(" (EFFIS egna färger kan avvika)")); return; }
  for (let k = 1; k < F.tab.length; k++) rad(F.tab[k][0], F.tab[k][1]);
  // dagval
  const ds = $("brDag"); ds.hidden = !!F.effis; $("brEffisDag").hidden = !F.effis;
}
// ---- punktens prognos ----
async function brPunkt(lat, lon) {
  BR.punkt = { lat, lon }; const p = $("brPunkt"); p.hidden = false; p.innerHTML = "Hämtar brandriskprognos för " + lat.toFixed(2) + ", " + lon.toFixed(2) + " …";
  try { const r = await fetch(BR_PUNKT + "?lat=" + lat.toFixed(3) + "&lon=" + lon.toFixed(3)); const j = await r.json(); if (!r.ok) throw new Error(j.fel || r.status);
    BR.pdata = j; brPunktRita(); } catch (e) { p.textContent = "Kunde inte hämta punkten: " + (e.message || e); }
}
function brCell(v, tab, txt) { const t = v !== null && v !== undefined && tab[v]; return "<td style='background:" + (t ? t[0] : "transparent") + "' title='" + brEsc(t ? t[1] : "saknas / utanför säsong") + "'>" + (txt !== undefined ? txt : t ? (tab === BR_KLASS ? ["", "1", "2", "3", "4", "5", "5E"][v] : v) : "–") + "</td>"; }
function brPunktRita() {
  const j = BR.pdata, p = $("brPunkt"); if (!j) return;
  const T = j.tim, D = j.dygn, r1 = v => v === null || v === undefined ? "–" : (Math.round(v * 10) / 10).toString().replace(".", ",");
  let h = "<div class='brrub'><b>Brandrisk " + j.lat.toFixed(2) + ", " + j.lon.toFixed(2) + "</b> <span class='dim'>SMHI, timprognos från " + (j.refH || "").slice(0, 16).replace("T", " ") + " UTC</span> <button class='sek liten' id='brStang'>✕</button></div>";
  if (T && T.t.length) {
    h += "<div class='brskroll'><table class='brtab'><tr><th>UTC</th>" + T.t.map(t => "<th>" + (new Date(t).getUTCHours() === 0 ? brDag(t).split(" ")[1] : p2(new Date(t).getUTCHours())) + "</th>").join("") + "</tr>";
    h += "<tr><th title='Skogsbrandsrisk (FWI-klass)'>Skog</th>" + T.fwiindex.map(v => brCell(v, BR_KLASS)).join("") + "</tr>";
    h += "<tr><th>FWI</th>" + T.fwi.map(v => "<td>" + r1(v) + "</td>").join("") + "</tr>";
    h += "<tr><th title='Gräsbrandsrisk'>Gräs</th>" + T.grassfire.map(v => brCell(v, BR_GRAS, v >= 3 ? ["", "", "", "L", "M", "S", "MS"][v] : v === 1 ? "❄" : v === 2 ? "–" : undefined)).join("") + "</tr>";
    h += "<tr><th>T °C</th>" + T.t2.map(v => "<td style='color:" + (v < 0 ? "#2563eb" : "#dc2626") + "'>" + (v === null ? "–" : Math.round(v)) + "</td>").join("") + "</tr>";
    h += "<tr><th>RH %</th>" + T.r.map(v => "<td>" + (v === null ? "–" : Math.round(v)) + "</td>").join("") + "</tr>";
    h += "<tr><th>Vind m/s</th>" + T.ws.map(v => "<td>" + (v === null ? "–" : Math.round(v)) + "</td>").join("") + "</tr>";
    h += "<tr><th>Nb mm</th>" + T.nb.map(v => "<td>" + (v ? r1(v) : "") + "</td>").join("") + "</tr></table></div>";
  }
  if (D && D.t.length) {
    h += "<table class='brtab brdygn'><tr><th>Dygn (12 UTC)</th>" + D.t.map(t => "<th>" + brDag(t) + "</th>").join("") + "</tr>";
    h += "<tr><th>Skogsbrandsrisk</th>" + D.fwiindex.map(v => brCell(v, BR_KLASS)).join("") + "</tr>";
    h += "<tr><th>FWI</th>" + D.fwi.map(v => "<td>" + r1(v) + "</td>").join("") + "</tr>";
    h += "<tr><th>Bränsleuttorkning</th>" + D.forestdry.map(v => brCell(v, BR_TORR, v ? ["", "1", "2", "3", "4", "5", "5E"][v] : undefined)).join("") + "</tr>";
    h += "<tr><th>Gräsbrandsrisk (max)</th>" + D.grassfire.map(v => brCell(v, BR_GRAS, v >= 3 ? ["", "", "", "Låg", "Mått.", "Stor", "M. stor"][v] : v === 1 ? "❄" : v === 2 ? "slut" : undefined)).join("") + "</tr>";
    h += "<tr><th>Nb 24 h (18–18)</th>" + D.nb.map(v => "<td>" + r1(v) + "</td>").join("") + "</tr></table>";
  }
  h += "<p class='dim xst'>Klasserna enligt SMHI/MCF. Skog: FWI <5 = 1 … ≥28 = 5E. Gräs: L/M/S/MS = låg, måttlig, stor, mycket stor; ❄ = snötäckt. Tomt/– = saknas eller utanför säsong. " +
    "Kontakta räddningstjänsten i kommunen för eldningsförbud. Data: SMHI, öppna data.</p>";
  p.innerHTML = h; $("brStang").addEventListener("click", () => { p.hidden = true; BR.punkt = null; });
}
function brandKartKlick(lat, lon) { brPunkt(lat, lon); }
function brandLage(nytt) {
  const pa = nytt === "brand"; $("vyBrand").hidden = !pa; $("flikBrand").setAttribute("aria-selected", String(pa)); document.body.classList.toggle("brand", pa);
  if (!pa) { const g = $("kBrand"); if (g) g.textContent = ""; return; }
  $("underrubrik").textContent = "Brandrisk · SMHI:s brandriskprognos (Sverige) och EFFIS (Europa)";
  brIndex().then(() => { brDagar(); brRita(); });
}
function brDagar() {
  const ds = $("brDag"), i = BR.idx; if (!ds || !i) return; const v = ds.value; ds.textContent = "";
  i.dagar.forEach((t, k) => ds.add(new Option(brDag(t) + " 12 UTC", k))); ds.value = v && +v < i.dagar.length ? v : "0"; BR.dag = +ds.value;
}
(function brInit() {
  const fs = $("brFalt"); if (!fs) return;
  for (const [k, f] of Object.entries(BR_FALT)) fs.add(new Option(f.namn, k)); fs.value = BR.falt;
  fs.addEventListener("change", () => { BR.falt = fs.value; lagra("mt:brFalt", BR.falt); brRita(); });
  $("brDag").addEventListener("change", e => { BR.dag = +e.target.value; brRita(); });
  const ed = $("brEffisDag"); for (let k = 0; k <= 9; k++) ed.add(new Option(k === 0 ? "Idag" : "+" + k + " dygn", k));
  ed.addEventListener("change", () => { BR.effisDag = +ed.value; brRita(); });
  $("flikBrand").addEventListener("click", () => bytLage("brand"));
  if (typeof lage !== "undefined" && lage === "brand") brandLage("brand");   // sidan startade i fliken
})();
