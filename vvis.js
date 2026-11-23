// vvis.js - NYTT 23/11: VAGVADER (Trafikverkets VViS-stationer) pa kartan, knappen "🛣 Vägväder" + val av parameter.
// Data via mellanservern /vvis (alla stationer, senaste matningen, cache 5 min). Hamtas om var 5:e minut nar lagret ar pa.
// Observationer - galler NU, inte kartans prognostid (tiden star i hovringsrutan).
// HALKRISK (egen tolkning, enkel och genomskinlig):
//   rod    = stationen rapporterar is eller sno pa vagen, eller underkylt regn
//   orange = vagtemp <= 0 och (vagtemp <= daggpunkt [rimfrost] eller nederbord/vatten pa vagen), eller sno/snoblandat och vagtemp <= +1
//   gul    = vagtemp <= +1 och vagtemp - daggpunkt <= 1 (nara rimfrost/frysning)
//   gron   = ingen av ovanstaende, gra = saknar vagtemp
// Data ar CC0 (Trafikverket). Namn fran Trafikverket visas alltid escapade.
const VVIS_URL = "https://modelltittaren.metvyer.workers.dev/vvis";
let VV = { pa: lasa("mt:vvis") === "ja", par: lasa("mt:vvisPar") || "halka", lista: [], t: 0, tim: 0 };
const vvEsc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const VV_NB = { no: "ingen", rain: "regn", freezing_rain: "underkylt regn", snow: "snö", sleet: "snöblandat regn", yes: "nederbörd (okänd typ)" };
const VV_PAR = {
  halka: { namn: "Halkrisk", enh: "" },
  ty: { namn: "Vägtemp", enh: "°" }, tl: { namn: "Lufttemp", enh: "°" }, td: { namn: "Daggpunkt", enh: "°" },
  dy: { namn: "Vägtemp − daggpunkt", enh: "°" }, s: { namn: "Sikt", enh: " m" }, v: { namn: "Vind", enh: " m/s" },
  vb: { namn: "Byvind (max 30 min)", enh: " m/s" }, nb: { namn: "Nederbördstyp", enh: "" },
};
function vvHalka(s) {
  if (s.is || s.sn) return [3, "is/snö på vägen"];
  if (s.nb === "freezing_rain") return [3, "underkylt regn"];
  if (s.ty == null) return [-1, "saknar vägtemp"];
  const nb = s.nb && s.nb !== "no", dy = s.td != null ? s.ty - s.td : null;
  if (s.ty <= 0 && ((dy != null && dy <= 0) || nb || s.va)) return [2, dy != null && dy <= 0 ? "vägtemp ≤ daggpunkt (rimfrost)" : "minusgrader + fukt/nederbörd"];
  if (s.ty <= 1 && (s.nb === "snow" || s.nb === "sleet")) return [2, "snö/snöblandat och vägtemp ≤ +1"];
  if (s.ty <= 1 && dy != null && dy <= 1) return [1, "nära frysning/rimfrost"];
  return [0, "ingen tydlig halkrisk"];
}
const VV_HFARG = { "-1": "#9ca3af", 0: "#16a34a", 1: "#facc15", 2: "#f97316", 3: "#dc2626" };
function vvTempFarg(t) {   // blatt under noll, rott over
  if (t == null) return "#9ca3af";
  const st = [[-15, "#312e81"], [-8, "#1d4ed8"], [-3, "#3b82f6"], [0, "#93c5fd"], [0.01, "#fde68a"], [3, "#fbbf24"], [8, "#f97316"], [15, "#dc2626"]];
  for (let i = st.length - 1; i >= 0; i--) if (t >= st[i][0]) return st[i][1];
  return st[0][1];
}
function vvVarde(s, p) { return p === "dy" ? (s.ty != null && s.td != null ? +(s.ty - s.td).toFixed(1) : null) : s[p]; }
function vvFarg(s) {
  const p = VV.par, x = vvVarde(s, p);
  if (p === "halka") return VV_HFARG[vvHalka(s)[0]];
  if (p === "ty" || p === "tl" || p === "td") return vvTempFarg(x);
  if (x == null && p !== "nb") return "#9ca3af";
  if (p === "dy") return x <= 0 ? "#dc2626" : x <= 1 ? "#f97316" : x <= 3 ? "#facc15" : "#16a34a";
  if (p === "s") return x < 200 ? "#7f1d1d" : x < 1000 ? "#dc2626" : x < 3000 ? "#f97316" : x < 5000 ? "#facc15" : "#16a34a";
  if (p === "v" || p === "vb") return x >= 21 ? "#7f1d1d" : x >= 14 ? "#dc2626" : x >= 10 ? "#f97316" : x >= 6 ? "#facc15" : "#16a34a";
  if (p === "nb") return { rain: "#16a34a", freezing_rain: "#dc2626", snow: "#3b82f6", sleet: "#a855f7", yes: "#6b7280" }[s.nb] || "#e5e7eb";
  return "#9ca3af";
}
function vvText(s) {   // kort siffra i punkten (bara inzoomat)
  const p = VV.par, x = p === "halka" ? s.ty : vvVarde(s, p);
  if (p === "nb") return "";
  if (x == null) return "";
  return p === "s" ? (x >= 10000 ? "10k" : x >= 1000 ? (x / 1000).toFixed(1) + "k" : String(Math.round(x))) : String(Math.round(x));
}
async function vvHamta(tvinga) {
  if (!VV.pa) return;
  if (!tvinga && VV.lista.length && Date.now() - VV.t < 5 * 60e3) { vvRita(); return; }
  try { const r = await fetch(VVIS_URL); const js = r.ok ? await r.json() : null;
    if (Array.isArray(js)) { VV.lista = js; VV.t = Date.now(); } } catch (e) {}
  vvRita();
}
function vvRita() {
  const g = $("kVvis"); if (!g) return; g.textContent = ""; if (!VV.pa) return;
  const sk = (typeof vb !== "undefined" ? vb.w : 949) / 949, r = sk * 4.2, visaText = sk < 0.35;
  // ritordning: lagst risk/varde forst sa de viktigaste hamnar overst
  const ord = VV.lista.map((s, i) => [i, VV.par === "halka" ? vvHalka(s)[0] : 0]).sort((a, b) => a[1] - b[1]);
  for (const [i] of ord) { const s = VV.lista[i], p = tillKarta(s.lat, s.lon);
    const c = el("g", { class: "vvis", "data-i": i, transform: "translate(" + p.x.toFixed(1) + "," + p.y.toFixed(1) + ")", style: "cursor:pointer" });
    c.appendChild(el("rect", { x: -r, y: -r, width: 2 * r, height: 2 * r, rx: r * 0.3, fill: vvFarg(s), stroke: "#111827", "stroke-width": r * 0.22 }));
    const tx = visaText ? vvText(s) : "";
    if (tx) c.appendChild(el("text", { x: r * 1.3, y: r * 0.45, "font-size": r * 1.5, fill: "#111827", stroke: "#fff", "stroke-width": r * 0.35, "paint-order": "stroke" }, tx));
    g.appendChild(c); }
  const k = $("vvisKnapp"), tid = VV.lista.reduce((m, s) => s.t > m ? s.t : m, "");
  if (k) k.title = "Vägväder från Trafikverkets VViS-stationer: " + VV.lista.length + " stationer" + (tid ? ", senaste mätning " + vvTid(tid) : "") +
    ". Observationer – gäller nu, inte kartans prognostid. Hovra/tryck på en station för alla värden.";
}
function vvTid(t) { const d = new Date(t); return isNaN(d) ? "" : p2(d.getUTCHours()) + p2(d.getUTCMinutes()) + "Z " + d.getUTCDate() + "/" + (d.getUTCMonth() + 1); }
function vvFran(mal) { const m = mal && mal.closest && mal.closest(".vvis"); return m ? VV.lista[+m.dataset.i] : null; }
function vvTipsText(s) {
  const f = (x, e, d) => x == null ? "–" : (+x).toFixed(d == null ? 1 : d) + e, h = vvHalka(s);
  const alder = s.t ? (Date.now() - new Date(s.t)) / 60e3 : null;
  const rad = [
    '<b>' + vvEsc(s.n) + '</b> <span style="color:#6b7280">' + vvTid(s.t) + (alder != null && alder > 60 ? ' (' + Math.round(alder / 60) + ' h gammal)' : '') + '</span>',
    'Halkrisk: <b style="color:' + VV_HFARG[h[0]] + '">■</b> ' + h[1],
    'Vägtemp ' + f(s.ty, "°") + ' · luft ' + f(s.tl, "°") + ' · daggpunkt ' + f(s.td, "°") + (s.rh != null ? ' · RH ' + f(s.rh, " %", 0) : ''),
    'Vind ' + f(s.v, " m/s") + (s.vr != null ? ' från ' + Math.round(s.vr) + '°' : '') + (s.vb != null ? ' · byar ' + f(s.vb, " m/s") : ''),
    'Nederbörd: ' + (VV_NB[s.nb] || (s.nb ? vvEsc(s.nb) : "–")) + (s.mm != null ? ' (' + f(s.mm, " mm") + ' senaste 30 min)' : ''),
  ];
  if (s.s != null) rad.push('Sikt ' + (s.s >= 1000 ? f(s.s / 1000, " km") : f(s.s, " m", 0)));
  const yta = [s.is && "is", s.sn && "snö", s.va && "vatten"].filter(Boolean);
  if (yta.length || s.g != null) rad.push('Vägbana: ' + (yta.length ? yta.join(", ") : "–") + (s.g != null ? ' · friktion ' + f(s.g, "", 2) : ''));
  rad.push('<span style="color:#6b7280;font-size:11px">Trafikverket VViS (observation). Halkrisken är Modelltittarens enkla tolkning.</span>');
  return rad.join("\n");
}
// anropas fran kartTips och kartKlick i index.html
function vvisTips(e) {
  const s = vvFran(e.target); if (!s) return false;
  visaKTips(vvTipsText(s), e.clientX + 14, e.clientY + 14, true);
  return true;
}
function vvisKlick(e, mal) {   // tryck (mobil) = visa rutan
  const s = vvFran(mal); if (!s) return false;
  visaKTips(vvTipsText(s), (e.clientX || 20) + 14, (e.clientY || 20) + 14, true);
  return true;
}
(function vvInit() {
  const b = $("vvisKnapp"), sel = $("vvisPar"); if (!b || !sel) return;
  for (const [k, p] of Object.entries(VV_PAR)) sel.appendChild(Object.assign(document.createElement("option"), { value: k, textContent: p.namn }));
  if (!VV_PAR[VV.par]) VV.par = "halka";
  sel.value = VV.par; sel.hidden = !VV.pa;
  b.setAttribute("aria-pressed", String(VV.pa));
  b.addEventListener("click", () => { VV.pa = !VV.pa; lagra("mt:vvis", VV.pa ? "ja" : ""); b.setAttribute("aria-pressed", String(VV.pa)); sel.hidden = !VV.pa;
    if (VV.pa) vvHamta(); else vvRita(); });
  sel.addEventListener("change", () => { VV.par = sel.value; lagra("mt:vvisPar", VV.par); vvRita(); });
  setInterval(() => { if (VV.pa && !document.hidden) vvHamta(true); }, 5 * 60e3);
  const svg = $("karta");   // zoom: storlek och siffror foljer med
  if (window.MutationObserver && svg) new MutationObserver(() => { clearTimeout(VV.tim); VV.tim = setTimeout(vvRita, 300); }).observe(svg, { attributes: true, attributeFilter: ["viewBox"] });
  if (VV.pa) setTimeout(vvHamta, 1200);
})();
