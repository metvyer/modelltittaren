// kam.js - NYTT 23/11: WEBBKAMEROR pa kartan (knappen "📷 Kameror"), fran Windy Webcams via mellanservern /kameror.
// Hamtar kamerorna i det synliga kartutsnittet (max 50, mest populara forst) nar kartan flyttas/zoomas (0,6 s efter sista
// rorelsen). Hovra = liten bild, namn och senaste bildtid. Klick = kamerans sida hos Windy (ny flik).
// Bildlankarna galler ca 10 min (Windys gratisniva) - darfor hamtas listan om nar man tittar igen efter en stund.
// Titlar och adresser fran Windy visas alltid escapade.
const KAM_URL = "https://modelltittaren.metvyer.workers.dev/kameror?bbox=";
let KAM = { pa: lasa("mt:kam") === "ja", lista: [], nyckel: "", t: 0, tim: 0 };
const kamEsc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function kamBbox() {   // synliga utsnittet i grader (horn + kantmitter, Lambert-rutnatet ar snett)
  if (typeof vb === "undefined") return null;
  let N = -90, S = 90, O = -180, V = 180;
  for (const fx of [0, 0.5, 1]) for (const fy of [0, 0.5, 1]) {
    const x = vb.x + fx * vb.w, y = vb.y + fy * vb.h, ll = franRuta(x, KY - 1 - y);
    if (!ll || !isFinite(ll.lat)) continue; N = Math.max(N, ll.lat); S = Math.min(S, ll.lat); O = Math.max(O, ll.lon); V = Math.min(V, ll.lon); }
  return N > S ? [N, O, S, V].map(v => +v.toFixed(2)) : null;
}
async function kamHamta() {
  if (!KAM.pa) return;
  const b = kamBbox(); if (!b) return;
  const nyck = b.map(v => Math.round(v * 2) / 2).join(",");
  if (nyck === KAM.nyckel && Date.now() - KAM.t < 8 * 60e3) { kamRita(); return; }
  try { const r = await fetch(KAM_URL + b.join(",")); const js = r.ok ? await r.json() : [];
    if (Array.isArray(js)) { KAM.lista = js; KAM.nyckel = nyck; KAM.t = Date.now(); } } catch (e) {}
  kamRita();
}
function kamRita() {
  const g = $("kKam"); if (!g) return; g.textContent = ""; if (!KAM.pa) return;
  const r = (typeof vb !== "undefined" ? vb.w : 949) / 949 * 7;
  KAM.lista.forEach((k, i) => { const p = tillKarta(k.lat, k.lon);
    const c = el("g", { class: "kam", "data-i": i, transform: "translate(" + p.x.toFixed(1) + "," + p.y.toFixed(1) + ")", style: "cursor:pointer" });
    c.appendChild(el("circle", { r, fill: "#0f172a", stroke: "#fff", "stroke-width": r * 0.25 }));
    c.appendChild(el("text", { "text-anchor": "middle", y: r * 0.38, "font-size": r * 1.05, fill: "#fff" }, "📷"));
    g.appendChild(c); });
  const k = $("kamKnapp"); if (k) k.title = "Webbkameror (Windy.com): " + KAM.lista.length + " i utsnittet (max 50, mest populära). Hovra = bild, klick = kamerans sida hos Windy.";
}
function kamFran(mal) { const m = mal && mal.closest && mal.closest(".kam"); return m ? KAM.lista[+m.dataset.i] : null; }
// anropas fran kartTips och kartKlick i index.html
function kamTips(e) {
  const k = kamFran(e.target); if (!k) return false;
  const tid = k.t ? new Date(k.t) : null;
  $("kTips").style.maxWidth = "420px";
  visaKTips('<b>' + kamEsc(k.n) + '</b>' + (tid && !isNaN(tid) ? ' <span style="color:#6b7280">' + p2(tid.getUTCHours()) + p2(tid.getUTCMinutes()) + 'Z ' + tid.getUTCDate() + '/' + (tid.getUTCMonth() + 1) + '</span>' : '') +
    (k.b && /^https:\/\//.test(k.b) ? '\n<img src="' + kamEsc(k.b) + '" style="width:400px;max-width:100%;display:block;margin-top:4px;border-radius:4px" alt="">' : '\n(ingen bild)') +
    '\n<span style="color:#6b7280;font-size:11px">Klicka för kamerans sida hos Windy.com</span>', e.clientX + 14, e.clientY + 14, true);
  return true;
}
function kamKlick(e, mal) { const k = kamFran(mal); if (!k) return false; if (/^https:\/\//.test(k.u)) window.open(k.u, "_blank", "noopener"); return true; }
(function kamInit() {
  const b = $("kamKnapp"); if (!b) return;
  b.setAttribute("aria-pressed", String(KAM.pa));
  b.addEventListener("click", () => { KAM.pa = !KAM.pa; lagra("mt:kam", KAM.pa ? "ja" : ""); b.setAttribute("aria-pressed", String(KAM.pa)); if (KAM.pa) kamHamta(); else kamRita(); });
  const svg = $("karta");
  if (window.MutationObserver && svg) new MutationObserver(() => { clearTimeout(KAM.tim); KAM.tim = setTimeout(kamHamta, 600); }).observe(svg, { attributes: true, attributeFilter: ["viewBox"] });
  if (KAM.pa) setTimeout(kamHamta, 1500);
})();
