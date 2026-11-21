// Modelltittaren - RITLINJER PÅ KARTAN (NYTT 21/11)
// "✏ Rita": klicka punkt för punkt på kartan (dra = flytta kartan som vanligt), Enter / dubbelklick / högerklick / Klar = färdig,
// Esc = avbryt. Linjen får en kort text (t.ex. "Norr om denna: snö"), färg och heldragen/streckad.
// Klicka på en linje för att ändra eller ta bort den. Linjerna sparas som lat/lon (följer kartan vid zoom),
// syns i alla kartflikar, sparas i webbläsaren (mt:ritlinjer) och följer med i Dela.
// Den som följer en delad vy ser delarens linjer (kan inte ändra dem) ovanpå sina egna.
// NYTT 21/11: DRA. Texten kan dras vart som helst (egen plats L.tp = [lat, lon]; långt från linjen visas en streckad
// hänvisningslinje; dubbelklick på texten = tillbaka till linjens mitt). Dra i en linje = flytta hela (med text).
// Vald linje: ringar på punkterna (dra = flytta punkten, högerklick = ta bort punkten) och små ringar mitt på varje
// sträcka (dra = ny punkt där). Kort klick utan att dra = välj linjen som förut.

const RIT_FARGER = { svart: "#111827", rod: "#dc2626", bla: "#2563eb", lila: "#9333ea" };
const RIT_MAX_LINJER = 30, RIT_MAX_PUNKTER = 60;
const RIT = {
  linjer: (() => { try { const a = JSON.parse(lasa("mt:ritlinjer") || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } })(),
  delade: null,        // delarens linjer nar man foljer en delad vy
  ritar: null,         // linjen som ritas just nu {p: [[lat, lon], ...], farg, streck, text}
  vald: -1,            // index for linjen som andras
  farg: lasa("mt:ritFarg") || "rod", streck: lasa("mt:ritStreck") === "ja"
};
const ritSpara = () => lagra("mt:ritlinjer", JSON.stringify(RIT.linjer));
const rund3 = x => Math.round(x * 1000) / 1000;

function ritRita() {
  const g = $("kRit"); if (!g) return; g.textContent = "";
  const r = $("karta").getBoundingClientRect(); if (!r.width) return;
  const px = v => v * vb.w / r.width;
  const enLinje = (L, i, delad) => {
    if (!L || !L.p || L.p.length < 2) return;
    const pts = L.p.map(([la, lo]) => tillKarta(la, lo)), d = pts.map(q => q.x.toFixed(2) + "," + q.y.toFixed(2)).join(" ");
    const farg = RIT_FARGER[L.farg] || RIT_FARGER.rod, vald = !delad && i === RIT.vald;
    g.appendChild(el("polyline", { points: d, fill: "none", stroke: "#fff", "stroke-width": 5.5, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round", "stroke-opacity": 0.8, "pointer-events": "none" }));
    g.appendChild(el("polyline", { points: d, fill: "none", stroke: farg, "stroke-width": vald ? 4.5 : 3, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round", "stroke-linecap": "round",
      "stroke-dasharray": L.streck ? "10 6" : "none", "pointer-events": "none" }));
    if (!delad) {   // osynlig bred linje att klicka pa
      const t = el("polyline", { points: d, fill: "none", stroke: "transparent", "stroke-width": 14, "vector-effect": "non-scaling-stroke", class: "ritlinje", "data-i": i, style: "cursor:pointer" });
      const ti = el("title"); ti.textContent = (L.text ? L.text + "\n" : "") + "Klicka för att ändra eller ta bort linjen"; t.appendChild(ti); g.appendChild(t);
    }
    if (L.text) {   // texten: egen plats (dragen) eller vid linjens mitt, lite ovanfor
      let mx, my;
      if (L.tp) { const q = tillKarta(L.tp[0], L.tp[1]); mx = q.x; my = q.y;
        const n = narmastPaLinje(pts, mx, my);   // hanvisningslinje om texten ligger en bit fran linjen
        if (n.d > px(28)) g.appendChild(el("line", { x1: mx, y1: my - px(4), x2: n.x, y2: n.y, stroke: farg, "stroke-width": 1.3, "vector-effect": "non-scaling-stroke", "stroke-dasharray": "3 3", "pointer-events": "none" })); }
      else { let tot = 0; const seg = []; for (let k = 1; k < pts.length; k++) { const s = Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y); seg.push(s); tot += s; }
        let kvar = tot / 2, k = 0; while (k < seg.length - 1 && kvar > seg[k]) { kvar -= seg[k]; k++; }
        const f = seg[k] ? kvar / seg[k] : 0; mx = pts[k].x + (pts[k + 1].x - pts[k].x) * f; my = pts[k].y + (pts[k + 1].y - pts[k].y) * f - px(10); }
      const te = el("text", { x: mx, y: my, "font-size": px(13), "font-weight": 700, "text-anchor": "middle", fill: farg, stroke: "#fff", "stroke-width": px(3.5),
        "paint-order": "stroke", "pointer-events": delad ? "none" : "all", class: delad ? "" : "rittext", "data-i": i, style: delad ? "" : "cursor:move" }, (delad ? "👁 " : "") + L.text);
      if (!delad) { const ti = el("title"); ti.textContent = "Dra texten vart du vill. Dubbelklick = tillbaka till linjens mitt."; te.appendChild(ti); }
      g.appendChild(te);
    }
    if (vald && !RIT.ritar) {   // handtag: punkterna + mitt pa varje stracka
      for (let k = 1; k < pts.length; k++) g.appendChild(el("circle", { cx: (pts[k - 1].x + pts[k].x) / 2, cy: (pts[k - 1].y + pts[k].y) / 2, r: px(3.5), fill: farg, "fill-opacity": 0.35, stroke: "#fff", "stroke-width": px(1), class: "ritmitt", "data-i": i, "data-k": k, style: "cursor:copy" }));
      pts.forEach((q, k) => g.appendChild(el("circle", { cx: q.x, cy: q.y, r: px(5.5), fill: "#fff", stroke: farg, "stroke-width": px(2.2), class: "ritpunkt", "data-i": i, "data-k": k, style: "cursor:grab" })));
    }
  };
  (RIT.delade || []).forEach((L, i) => enLinje(L, i, true));
  RIT.linjer.forEach((L, i) => enLinje(L, i, false));
  if (RIT.ritar) {   // linjen som ritas: punkter + streckad linje
    const L = RIT.ritar, pts = L.p.map(([la, lo]) => tillKarta(la, lo)), farg = RIT_FARGER[L.farg] || RIT_FARGER.rod;
    if (pts.length > 1) g.appendChild(el("polyline", { points: pts.map(q => q.x + "," + q.y).join(" "), fill: "none", stroke: farg, "stroke-width": 2.5, "vector-effect": "non-scaling-stroke", "stroke-dasharray": "4 3", "pointer-events": "none" }));
    for (const q of pts) g.appendChild(el("circle", { cx: q.x, cy: q.y, r: px(4), fill: "#fff", stroke: farg, "stroke-width": px(2), "pointer-events": "none" }));
  }
}

// narmaste punkt pa en bruten linje (kartkoordinater)
function narmastPaLinje(pts, x, y) {
  let b = { d: Infinity, x: pts[0].x, y: pts[0].y };
  for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], c = pts[k], dx = c.x - a.x, dy = c.y - a.y, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)) : 0, px_ = a.x + t * dx, py = a.y + t * dy, d = Math.hypot(x - px_, y - py);
    if (d < b.d) b = { d, x: px_, y: py }; }
  return b;
}
const tillLL = (x, y) => { const ll = franRuta(x, KY - 1 - y); return [rund3(ll.lat), rund3(ll.lon)]; };

// Dra i linjer, punkter och text. Fangas fore kartans egen hantering (capture) sa att kartan inte flyttas.
function ritDraStart(e) {
  if (RIT.ritar || e.button > 0) return;
  const t = e.target, typ = t.classList ? ["ritpunkt", "ritmitt", "rittext", "ritlinje"].find(c => t.classList.contains(c)) : null;
  if (!typ) return;
  e.stopPropagation(); e.preventDefault();
  const i = +t.dataset.i, L = RIT.linjer[i]; if (!L) return;
  let k = t.dataset.k !== undefined ? +t.dataset.k : -1;
  const start = kartPunkt(e), sx = e.clientX, sy = e.clientY, orig = JSON.parse(JSON.stringify(L));
  let flyttat = false;
  const flytta = ev => {
    if (!flyttat && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
    if (!flyttat) { flyttat = true; RIT.vald = i; if (typ === "ritmitt") { L.p.splice(k, 0, orig.p[k]); } }
    const p = kartPunkt(ev), dx = p.x - start.x, dy = p.y - start.y;
    if (typ === "ritpunkt" || typ === "ritmitt") L.p[k] = tillLL(p.x, p.y);
    else if (typ === "rittext") L.tp = tillLL(p.x, p.y + 0);
    else {   // hela linjen (och texten om den har egen plats)
      L.p = orig.p.map(([la, lo]) => { const q = tillKarta(la, lo); return tillLL(q.x + dx, q.y + dy); });
      if (orig.tp) { const q = tillKarta(orig.tp[0], orig.tp[1]); L.tp = tillLL(q.x + dx, q.y + dy); }
    }
    ritRita();
  };
  const slut = () => {
    removeEventListener("pointermove", flytta); removeEventListener("pointerup", slut); removeEventListener("pointercancel", slut);
    if (flyttat) { ritSpara(); ritRita(); ritRad(); }
    else { RIT.vald = i; ritRita(); ritRad(); }   // kort klick = valj linjen
  };
  addEventListener("pointermove", flytta); addEventListener("pointerup", slut); addEventListener("pointercancel", slut);
}

// Anropas forst i kartKlick: true = klicket ar taget om hand har
function ritKlick(e, mal) {
  if (RIT.ritar) {
    if (RIT.ritar.p.length >= RIT_MAX_PUNKTER) return true;
    const p = kartPunkt(e), ll = franRuta(p.x, KY - 1 - p.y);
    RIT.ritar.p.push([rund3(ll.lat), rund3(ll.lon)]); ritRita(); ritRad(); return true;
  }
  const t = mal && mal.closest ? mal.closest(".ritlinje") : null;
  if (t) { RIT.vald = +t.dataset.i; ritRita(); ritRad(); return true; }
  if (RIT.vald >= 0) { RIT.vald = -1; ritRita(); ritRad(); }
  return false;
}

function ritBorja() {
  RIT.vald = -1;
  if (RIT.linjer.length >= RIT_MAX_LINJER) { ritRad("Högst " + RIT_MAX_LINJER + " linjer – ta bort någon först."); return; }
  RIT.ritar = { p: [], farg: RIT.farg, streck: RIT.streck, text: "" }; $("karta").classList.add("ritlage"); ritRad(); ritRita();
}
function ritKlar() {
  const L = RIT.ritar; RIT.ritar = null; $("karta").classList.remove("ritlage");
  if (L) { const tx = $("ritText") ? $("ritText").value.trim().slice(0, 60) : ""; L.text = tx;
    // dubbelklick ger tva klick pa samma stalle - ta bort dubbletter
    L.p = L.p.filter((q, i, a) => !i || Math.abs(q[0] - a[i - 1][0]) + Math.abs(q[1] - a[i - 1][1]) > 0.002);
    if (L.p.length >= 2) { RIT.linjer.push(L); ritSpara(); RIT.vald = RIT.linjer.length - 1; } }
  ritRita(); ritRad();
}
function ritAvbryt() { RIT.ritar = null; RIT.vald = -1; $("karta").classList.remove("ritlage"); ritRita(); ritRad(); }

// Raden under kartan: ritlage / vald linje
function ritRad(info) {
  const rad = $("ritRad"); rad.textContent = "";
  const rk = $("ritKnapp"); rk.setAttribute("aria-pressed", String(!!RIT.ritar)); rk.textContent = RIT.ritar ? "✏ Ritar … (klar)" : "✏ Rita";   // bla nar aktiv
  const L = RIT.ritar || (RIT.vald >= 0 ? RIT.linjer[RIT.vald] : null);
  if (!L && !info) { rad.hidden = true; return; }
  rad.hidden = false;
  const b = (text, f, titel, sek) => { const k = document.createElement("button"); k.className = (sek ? "sek " : "") + "liten"; k.textContent = text; if (titel) k.title = titel; k.addEventListener("click", f); rad.appendChild(k); return k; };
  const s = text => { const e = document.createElement("span"); e.textContent = text; rad.appendChild(e); return e; };
  if (info) s(info + " ");
  if (!L) { b("OK", () => ritRad(), "", true); return; }
  s(RIT.ritar ? "✏ Klicka punkter på kartan (" + L.p.length + "). Högerklick, dubbelklick, Enter eller Klar = färdig, Esc = avbryt." : "Vald linje:");
  const fs = document.createElement("select"); for (const [k, n] of [["rod", "röd"], ["bla", "blå"], ["svart", "svart"], ["lila", "lila"]]) fs.add(new Option(n, k)); fs.value = L.farg;
  fs.addEventListener("change", () => { L.farg = fs.value; RIT.farg = fs.value; lagra("mt:ritFarg", fs.value); if (!RIT.ritar) ritSpara(); ritRita(); }); rad.appendChild(fs);
  const sb = b(L.streck ? "streckad" : "heldragen", () => { L.streck = !L.streck; RIT.streck = L.streck; lagra("mt:ritStreck", L.streck ? "ja" : "nej"); if (!RIT.ritar) ritSpara(); ritRita(); sb.textContent = L.streck ? "streckad" : "heldragen"; }, "Byt mellan heldragen och streckad", true);
  const tx = document.createElement("input"); tx.id = "ritText"; tx.placeholder = "Text, t.ex. Norr om denna: snö"; tx.maxLength = 60; tx.value = L.text || ""; tx.style.width = "230px";
  tx.addEventListener("input", () => { if (!RIT.ritar) { L.text = tx.value.trim().slice(0, 60); ritSpara(); ritRita(); } });
  tx.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); if (RIT.ritar) ritKlar(); else { RIT.vald = -1; ritRita(); ritRad(); } } });
  rad.appendChild(tx);
  if (RIT.ritar) { b("Klar", ritKlar); b("Ångra punkt", () => { RIT.ritar.p.pop(); ritRita(); ritRad(); }, "Ta bort senaste punkten", true); b("Avbryt", ritAvbryt, "", true); }
  else { b("Klar", () => { RIT.vald = -1; ritRita(); ritRad(); });
    b("Ta bort linjen", () => { RIT.linjer.splice(RIT.vald, 1); RIT.vald = -1; ritSpara(); ritRita(); ritRad(); }, "", true);
    if (RIT.linjer.length > 1) b("Ta bort alla linjer", () => { RIT.linjer = []; RIT.vald = -1; ritSpara(); ritRita(); ritRad(); }, "", true); }
}

(function ritInit() {
  $("ritKnapp").addEventListener("click", () => { if (RIT.ritar) ritKlar(); else ritBorja(); });
  $("karta").addEventListener("dblclick", e => {
    if (RIT.ritar) { e.preventDefault(); ritKlar(); return; }
    const t = e.target; if (t.classList && t.classList.contains("rittext")) { const L = RIT.linjer[+t.dataset.i]; if (L) { delete L.tp; ritSpara(); ritRita(); } }
  });
  $("karta").addEventListener("pointerdown", ritDraStart, true);   // fore kartans egen (panorering)
  $("karta").addEventListener("contextmenu", e => {   // hogerklick pa en punkt = ta bort den
    const t = e.target; if (RIT.ritar || !t.classList || !t.classList.contains("ritpunkt")) return;
    e.preventDefault(); const L = RIT.linjer[+t.dataset.i]; if (L && L.p.length > 2) { L.p.splice(+t.dataset.k, 1); ritSpara(); ritRita(); }
  });
  // 21/11: hogerklick = klar (ingen meny medan man ritar)
  $("karta").addEventListener("contextmenu", e => { if (RIT.ritar) { e.preventDefault(); ritKlar(); } });
  document.addEventListener("keydown", e => {
    if (!RIT.ritar) return;
    if (e.key === "Escape") { e.preventDefault(); ritAvbryt(); }
    else if (e.key === "Enter" && document.activeElement && document.activeElement.id !== "ritText") { e.preventDefault(); ritKlar(); }
  });
  addEventListener("resize", () => setTimeout(ritRita, 100));
  setTimeout(ritRita, 500);
})();
