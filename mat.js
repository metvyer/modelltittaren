// mat.js - NYTT 22/11: MÄTA I KARTAN
// Starta: högerklick i kartan -> "📏 Mät härifrån", långt tryck (mobil), eller knappen "📏 Mät".
// Klicka punkt för punkt. Varje sträcka visar avstånd (NM och km) och kurs (rättvisande, storcirkelns startkurs),
// längst ut summan. Avsluta: högerklick, dubbelklick, Enter eller Esc. Mätningen ligger kvar tills man rensar
// (högerklick -> "Rensa mätning", eller knappen igen). Sparas i webbläsaren (mt:mat) och följer med i Dela.
// Punkterna sparas som lat/lon - följer kartan vid zoom. Avstånd: storcirkel på jordklot (R = 6371 km).
const MAT_MAX = 40;
var MAT = {   // var (inte const): dela.js fragar typeof MAT innan filen hunnit laddas
  p: (() => { try { const a = JSON.parse(lasa("mt:mat") || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } })(),
  aktiv: false, mus: null, delade: null, ignoreraKlick: false, vb: ""
};
const matSpara = () => lagra("mt:mat", JSON.stringify(MAT.p));
const matLL = e => { const p = kartPunkt(e), ll = franRuta(p.x, KY - 1 - p.y); return [Math.round(ll.lat * 1e4) / 1e4, Math.round(ll.lon * 1e4) / 1e4]; };
function matKurs(a, b) {   // startkurs (rättvisande) från a till b, grader 0-360
  const r = Math.PI / 180, f1 = a[0] * r, f2 = b[0] * r, dl = (b[1] - a[1]) * r;
  const y = Math.sin(dl) * Math.cos(f2), x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return (Math.atan2(y, x) / r + 360) % 360;
}
const matText = km => { const nm = km / 1.852, f = v => (v < 10 ? v.toFixed(1) : Math.round(v).toString()).replace(".", ",");
  return f(nm) + " NM · " + f(km) + " km"; };
const matKursText = k => String(Math.round(k) % 360).padStart(3, "0") + "°";

function matRita() {
  const g = $("kMat"); if (!g) return; g.textContent = "";
  const r = $("karta").getBoundingClientRect(); if (!r.width) return;
  const px = v => v * vb.w / r.width, fs = px(12);
  const enMatning = (pts, delad) => {
    const lista = pts.slice(); if (!delad && MAT.aktiv && MAT.mus && lista.length) lista.push(MAT.mus);
    if (!lista.length) return;
    const k = lista.map(([la, lo]) => tillKarta(la, lo));
    const d = "M" + k.map(q => q.x.toFixed(2) + " " + q.y.toFixed(2)).join("L");
    const farg = delad ? "#7c3aed" : "#0f172a";
    g.appendChild(el("path", { d, fill: "none", stroke: "#ffffff", "stroke-width": 5, "vector-effect": "non-scaling-stroke", "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0.9 }));
    g.appendChild(el("path", { d, fill: "none", stroke: farg, "stroke-width": 2, "stroke-dasharray": delad ? "6 4" : "", "vector-effect": "non-scaling-stroke", "stroke-linecap": "round", "stroke-linejoin": "round" }));
    let tot = 0;
    for (let i = 1; i < lista.length; i++) {
      const km = avstand(lista[i - 1][0], lista[i - 1][1], lista[i][0], lista[i][1]); tot += km;
      if (km < 0.05) continue;
      const a = k[i - 1], b = k[i], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      let vinkel = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI; if (vinkel > 90) vinkel -= 180; if (vinkel < -90) vinkel += 180;
      const t = el("text", { x: mx, y: my - px(5), "text-anchor": "middle", "font-size": fs, "font-weight": 700, fill: farg, stroke: "#ffffff", "stroke-width": px(3.5), "paint-order": "stroke",
        transform: "rotate(" + vinkel.toFixed(1) + " " + mx.toFixed(2) + " " + my.toFixed(2) + ")", class: "mattext" }, matText(km) + " · " + matKursText(matKurs(lista[i - 1], lista[i])));
      g.appendChild(t);
    }
    k.forEach((q, i) => g.appendChild(el("circle", { cx: q.x, cy: q.y, r: px(i === 0 ? 4.5 : 3.5), fill: i === 0 ? farg : "#ffffff", stroke: farg, "stroke-width": px(1.8) })));
    if (lista.length > 2 || (lista.length === 2 && !MAT.aktiv)) {
      const s = k[k.length - 1];
      const t = el("text", { x: s.x + px(9), y: s.y + px(4), "font-size": fs * 1.1, "font-weight": 800, fill: farg, stroke: "#ffffff", "stroke-width": px(4), "paint-order": "stroke", class: "mattext" },
        (lista.length > 2 ? "Totalt " : "") + matText(tot));
      g.appendChild(t);
    }
  };
  if (MAT.delade) enMatning(MAT.delade, true);
  enMatning(MAT.p, false);
}
function matInfo() {
  const k = $("matKnapp"); if (k) { k.setAttribute("aria-pressed", String(MAT.aktiv || MAT.p.length > 0)); k.textContent = MAT.aktiv ? "📏 Mäter – klar" : MAT.p.length ? "📏 Rensa mätning" : "📏 Mät"; }
  const t = $("matTips"); if (t) t.hidden = !MAT.aktiv;
}
function matStart(ll) { MAT.p = ll ? [ll] : []; MAT.aktiv = true; MAT.mus = null; matSpara(); matRita(); matInfo(); if (typeof delaAndrat === "function") delaAndrat(); }
function matKlar() { MAT.aktiv = false; MAT.mus = null; if (MAT.p.length < 2) MAT.p = []; matSpara(); matRita(); matInfo(); if (typeof delaAndrat === "function") delaAndrat(); }
function matRensa() { MAT.aktiv = false; MAT.mus = null; MAT.p = []; matSpara(); matRita(); matInfo(); if (typeof delaAndrat === "function") delaAndrat(); }

// anropas forst i kartKlick (index.html): under matning laggs en punkt till och inget annat hander
function matKlick(e) {
  if (MAT.ignoreraKlick) { MAT.ignoreraKlick = false; return true; }
  if (!MAT.aktiv) return false;
  if (MAT.p.length < MAT_MAX) { const ll = matLL(e), sist = MAT.p[MAT.p.length - 1];
    if (!sist || Math.abs(sist[0] - ll[0]) + Math.abs(sist[1] - ll[1]) > 1e-4) MAT.p.push(ll); }
  matSpara(); matRita(); matInfo(); if (typeof delaAndrat === "function") delaAndrat(); return true;
}

// liten meny vid hogerklick
function matMeny(e) {
  matMenyStang();
  const m = document.createElement("div"); m.className = "matmeny"; m.id = "matMeny";
  const knapp = (txt, f) => { const b = document.createElement("button"); b.className = "sek liten"; b.textContent = txt; b.addEventListener("click", ev => { ev.stopPropagation(); matMenyStang(); f(); }); m.appendChild(b); };
  const ll = matLL(e);
  knapp("📏 Mät härifrån", () => matStart(ll));
  if (MAT.p.length) knapp("✕ Rensa mätning", matRensa);
  m.style.left = e.clientX + "px"; m.style.top = e.clientY + "px"; document.body.appendChild(m);
}
function matMenyStang() { const m = $("matMeny"); if (m) m.remove(); }

(function matInit() {
  const svg = $("karta"); if (!svg) return;
  // hogerklick: under matning = klar; annars meny (men inte nar man ritar eller hogerklickar pa en ritpunkt)
  svg.addEventListener("contextmenu", e => {
    if (typeof RIT !== "undefined" && RIT.ritar) return;
    if (e.target && e.target.classList && e.target.classList.contains("ritpunkt")) return;
    e.preventDefault();
    if (MAT.aktiv) { matKlar(); return; }
    matMeny(e);
  });
  svg.addEventListener("dblclick", e => { if (!MAT.aktiv) return; e.preventDefault(); matKlar(); });
  svg.addEventListener("pointermove", e => { if (!MAT.aktiv || !MAT.p.length || e.pointerType === "touch") return; MAT.mus = matLL(e);
    if (!MAT.ram) MAT.ram = requestAnimationFrame(() => { MAT.ram = 0; matRita(); }); });
  svg.addEventListener("pointerleave", () => { if (MAT.mus) { MAT.mus = null; matRita(); } });
  // langt tryck (mobil, 0,6 s utan att rora fingret) = borja mata dar
  let lt = null;
  svg.addEventListener("pointerdown", e => {
    if (e.pointerType !== "touch" || MAT.aktiv) return;
    const x = e.clientX, y = e.clientY, ll = matLL(e);
    clearTimeout(lt && lt.t); lt = { x, y, t: setTimeout(() => { lt = null; MAT.ignoreraKlick = true; if (navigator.vibrate) try { navigator.vibrate(30); } catch (er) {} matStart(ll); }, 600) };
  });
  const avbryt = e => { if (!lt) return; if (e.type !== "pointermove" || Math.hypot(e.clientX - lt.x, e.clientY - lt.y) > 10) { clearTimeout(lt.t); lt = null; } };
  svg.addEventListener("pointermove", avbryt); svg.addEventListener("pointerup", avbryt); svg.addEventListener("pointercancel", avbryt);
  document.addEventListener("click", e => { const m = $("matMeny"); if (m && !m.contains(e.target)) matMenyStang(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { if ($("matMeny")) { matMenyStang(); return; } if (MAT.aktiv) { e.preventDefault(); matKlar(); } }
    else if (e.key === "Enter" && MAT.aktiv && !(document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) { e.preventDefault(); matKlar(); }
  });
  const k = $("matKnapp");
  if (k) k.addEventListener("click", () => { if (MAT.aktiv) matKlar(); else if (MAT.p.length) matRensa(); else matStart(null); });
  // rita om nar kartan zoomas/flyttas
  setInterval(() => { if (!MAT.p.length && !MAT.delade) return; const v = vb.x.toFixed(1) + "," + vb.y.toFixed(1) + "," + vb.w.toFixed(1) + "," + $("karta").clientWidth;
    if (v !== MAT.vb) { MAT.vb = v; matRita(); } }, 250);
  addEventListener("resize", () => setTimeout(matRita, 100));
  setTimeout(() => { matRita(); matInfo(); }, 500);
})();
