// bildspel.js - NYTT 24/11 (Jakob): FORBEREDDA BILDER / BILDSPEL. Spara vyer i forvag (flik, tid, zoom, ritade linjer,
// matning, anteckning) och bladdra fram dem - t.ex. under en sandning, da mottagarna far dem i realtid som vanligt.
// Varje bild sparas som en vy (vyFanga i dela.js), inte som skarmbild: skarp, gar att zooma, och med "senaste korning"
// byts datat ut mot nyaste korningen men samma GILTIGA TID (Sannolikhet/Favoriter och Karta MBR0).
// "Frys korning" = exakt som nar bilden sparades (sa lange met.no har kvar korningen, ca 1 dygn i mepslatest).
// Lagring: i webblasaren (mt:bildspel). Sander du (ar agare av en sandning) sparas bildspelet ocksa med sandningen
// i mellanservern (/dela/bilder) och foljer med agarlanken till andra datorer.
// Visa en bild: dina egna ritade linjer och matningen ERSATTS med bildens (sa att mottagarna ser dem).
const BS = { lista: (() => { try { const l = JSON.parse(lasa("mt:bildspel") || "[]"); return Array.isArray(l) ? l : []; } catch (e) { return []; } })(),
  aktiv: -1, oppen: false, synkTim: 0, synkText: "" };
const bsSpara = () => { lagra("mt:bildspel", JSON.stringify(BS.lista)); clearTimeout(BS.synkTim); BS.synkTim = setTimeout(bsSynka, 1500); };
const bsAgare = () => (typeof aktivDelning === "function" ? aktivDelning() : null);
async function bsSynka() {   // till sandningen i mellanservern (bara agaren)
  const d = bsAgare(); if (!d) return;
  try { const r = await fetch(DELA_URL + "/bilder?id=" + d.id + "&nyckel=" + d.nyckel, { method: "POST", body: JSON.stringify(BS.lista) });
    BS.synkText = r.ok ? "sparat med «" + d.id + "»" : "kunde inte spara med sändningen"; } catch (e) { BS.synkText = "kunde inte spara med sändningen"; }
  bsRad();
}
async function bsHamtaFranSandning() {   // agaren pa en ny dator: hamta och sla ihop (bilder med samma id ersatts inte)
  const d = bsAgare(); if (!d) return;
  try { const r = await fetch(DELA_URL + "/bilder?id=" + d.id + "&nyckel=" + d.nyckel); if (!r.ok) return; const j = await r.json();
    let ny = 0; for (const b of j.bilder || []) if (b && b.id && !BS.lista.some(x => x.id === b.id)) { BS.lista.push(b); ny++; }
    if (ny) { lagra("mt:bildspel", JSON.stringify(BS.lista)); BS.synkText = ny + " bild" + (ny > 1 ? "er" : "") + " hämtade från «" + d.id + "»"; bsRad(); }
  } catch (e) {}
}
// giltig tid (ms) for vyns tidssteg - sa att "senaste korning" visar samma klockslag
function bsGiltig(v) {
  if (!v.dtg) return null;
  const t0 = dtgDatum(v.dtg).getTime();
  if (v.l === "p" || v.l === "f") return { fr: t0 + (+v.fr) * 3600e3, ti: t0 + (+v.ti) * 3600e3 };
  if (v.l === "m0" && v.m0t !== null && v.m0t !== undefined) return { m0t: t0 + v.m0t * 3600e3 };
  return null;
}
function bsSparaNu(namn, frys) {
  const v = JSON.parse(JSON.stringify(vyFanga()));
  const b = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), namn: (namn || "").trim().slice(0, 40) || "Bild " + (BS.lista.length + 1),
    frys: !!frys, vy: v, giltig: bsGiltig(v), sparad: new Date().toISOString() };
  BS.lista.push(b); BS.aktiv = BS.lista.length - 1; bsSpara(); bsRad();
}
async function bsVisa(i) {
  const b = BS.lista[i]; if (!b) return; BS.aktiv = i; bsRad();
  const v = JSON.parse(JSON.stringify(b.vy));
  // ritat och matt: blir dina egna (sa att de skickas till mottagarna) - och tas bort fran vyn sa de inte ritas dubbelt
  if (typeof RIT !== "undefined") { RIT.linjer = Array.isArray(v.rit) ? v.rit : []; RIT.vald = -1; ritSpara(); }
  if (typeof MAT !== "undefined") { MAT.p = Array.isArray(v.mat) && v.mat.length > 1 ? v.mat : []; matSpara(); }
  v.rit = []; v.mat = [];
  if (!b.frys) {   // senaste korning: ingen korning i vyn, tidsstegen raknas om till samma giltiga tid
    delete v.dtg;
    const g = b.giltig, nyDtg = v.l === "m0" ? (typeof M0F !== "undefined" && M0F.dtg) : (typeof P !== "undefined" && P.dtg) || lasa("mt:senast");
    if (g && nyDtg) { const t0 = dtgDatum(nyDtg).getTime(), h = ms => Math.max(0, Math.round((ms - t0) / 3600e3));
      if (g.fr !== undefined) { v.fr = String(h(g.fr)); v.ti = String(h(g.ti)); }
      if (g.m0t !== undefined) v.m0t = h(g.m0t); }
  }
  await vyTillampa(v);
  if (typeof ritRita === "function") ritRita(); if (typeof matRita === "function") matRita(); if (typeof matInfo === "function") matInfo();
  if (typeof DELA !== "undefined") { DELA.not = b.vy.not || ""; if (typeof delaAndrat === "function") delaAndrat(); }
}
const bsEsc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function bsRad() {
  const rad = $("bildRad"), k = $("bildKnapp"); if (!rad || !k) return;
  k.setAttribute("aria-pressed", String(BS.oppen)); k.textContent = "🖼 Bilder" + (BS.lista.length ? " (" + BS.lista.length + ")" : "");
  rad.hidden = !BS.oppen; rad.textContent = ""; if (!BS.oppen) return;
  const b = (text, f, titel, sek) => { const e = document.createElement("button"); e.className = (sek ? "sek " : "") + "liten"; e.textContent = text; if (titel) e.title = titel; e.addEventListener("click", f); rad.appendChild(e); return e; };
  const sp = (t, c) => { const e = document.createElement("span"); e.textContent = t; if (c) e.className = c; rad.appendChild(e); return e; };
  const namn = document.createElement("input"); namn.placeholder = "Namn på bilden (valfritt)"; namn.maxLength = 40; namn.style.width = "170px";
  const frysL = document.createElement("label"); frysL.className = "kryss"; frysL.title = "Frys körning: bilden visar exakt samma körning som när den sparades (så länge met.no har kvar den, ca 1 dygn). Utan kryss: senaste körningen vid samma klockslag.";
  const frys = document.createElement("input"); frys.type = "checkbox"; frys.checked = lasa("mt:bsFrys") === "ja"; frys.addEventListener("change", () => lagra("mt:bsFrys", frys.checked ? "ja" : "nej"));
  frysL.append(frys, " frys körning");
  rad.appendChild(namn); rad.appendChild(frysL);
  b("+ Spara vyn som bild", () => bsSparaNu(namn.value, frys.checked), "Spara det du ser nu – flik, tid, zoom, ritade linjer, mätning och anteckning – som en bild i bildspelet");
  if (BS.lista.length) {
    b("◀", () => bsVisa(BS.aktiv <= 0 ? BS.lista.length - 1 : BS.aktiv - 1), "Föregående bild (eller tangenten Page Up)", true);
    b("▶", () => bsVisa(BS.aktiv < 0 || BS.aktiv >= BS.lista.length - 1 ? 0 : BS.aktiv + 1), "Nästa bild (eller tangenten Page Down)", true);
    const chips = document.createElement("span"); chips.className = "bschips";
    BS.lista.forEach((x, i) => { const c = document.createElement("button"); c.className = "liten" + (i === BS.aktiv ? "" : " sek"); c.textContent = (i + 1) + " " + x.namn + (x.frys ? " ❄" : "");
      c.title = "Visa bilden. Sparad " + x.sparad.slice(0, 16).replace("T", " ") + " UTC" + (x.frys ? ", fryst körning " + (x.vy.dtg || "") : ", senaste körningen vid samma klockslag");
      c.addEventListener("click", () => bsVisa(i)); chips.appendChild(c); });
    rad.appendChild(chips);
    if (BS.aktiv >= 0 && BS.lista[BS.aktiv]) { const x = BS.lista[BS.aktiv];
      b("↻ Uppdatera bild " + (BS.aktiv + 1), () => { const v = JSON.parse(JSON.stringify(vyFanga())); x.vy = v; x.giltig = bsGiltig(v); x.frys = frys.checked; if (namn.value.trim()) x.namn = namn.value.trim().slice(0, 40); x.sparad = new Date().toISOString(); bsSpara(); bsRad(); },
        "Spara över bild " + (BS.aktiv + 1) + " med det du ser nu (och nytt namn om du skrivit ett)", true);
      b("←", () => { if (BS.aktiv > 0) { BS.lista.splice(BS.aktiv - 1, 0, BS.lista.splice(BS.aktiv, 1)[0]); BS.aktiv--; bsSpara(); bsRad(); } }, "Flytta bilden ett steg åt vänster", true);
      b("→", () => { if (BS.aktiv < BS.lista.length - 1) { BS.lista.splice(BS.aktiv + 1, 0, BS.lista.splice(BS.aktiv, 1)[0]); BS.aktiv++; bsSpara(); bsRad(); } }, "Flytta bilden ett steg åt höger", true);
      const tb = b("✕", e => { const k = e.currentTarget; if (k.dataset.saker !== "1") { k.dataset.saker = "1"; k.textContent = "Ta bort bild " + (BS.aktiv + 1) + "?"; setTimeout(() => { k.dataset.saker = ""; k.textContent = "✕"; }, 4000); return; }
        BS.lista.splice(BS.aktiv, 1); BS.aktiv = Math.min(BS.aktiv, BS.lista.length - 1); bsSpara(); bsRad(); }, "Ta bort bilden (klicka två gånger)", true); }
  }
  if (BS.synkText) sp(BS.synkText, "dim");
  sp("Att visa en bild ersätter det du ritat och mätt.", "dim");
  b("Stäng", () => { BS.oppen = false; bsRad(); }, "", true);
}
(function bsInit() {
  const k = $("bildKnapp"); if (!k) return;
  k.addEventListener("click", () => { BS.oppen = !BS.oppen; bsRad(); if (BS.oppen) bsHamtaFranSandning(); });
  addEventListener("keydown", e => {   // PgUp/PgDn bladdrar nar raden ar oppen (fungerar aven med presentationsklicker)
    if (!BS.oppen || !BS.lista.length || /INPUT|SELECT|TEXTAREA/.test((document.activeElement || {}).tagName || "")) return;
    if (e.key === "PageDown") { e.preventDefault(); bsVisa(BS.aktiv < 0 || BS.aktiv >= BS.lista.length - 1 ? 0 : BS.aktiv + 1); }
    if (e.key === "PageUp") { e.preventDefault(); bsVisa(BS.aktiv <= 0 ? BS.lista.length - 1 : BS.aktiv - 1); }
  });
  bsRad();
})();
