// Modelltittaren - DELA VY (NYTT 21/11)
// Knappen "Dela" sparar det man tittar på (flik, punkt, parameter, tröskel, tid, område, zoom, körning ...) i
// mellanserverns databas och ger en kort länk …/#v=<id>. Ingen bild och inga data sparas - bara inställningarna,
// så den som öppnar länken ser samma karta "levande" (hovra, meteogram, zooma) och hämtar data själv
// (oftast ur mellanserverns cache eftersom delaren just hämtat samma sak).
// Levande: så länge ägaren har "Sänd ändringar" på skickas varje ändring (högst var 3:e s). Den som tittar frågar
// var 15:e sekund och följer med. Rör tittaren själv kartan/valen pausas följandet ("Följ igen").
// Ägarnyckeln ligger bara i ägarens webbläsare (mt:delning). Inga namn eller meddelanden sparas.

const DELA_URL = "https://modelltittaren.metvyer.workers.dev/dela";
const DELA_SKICKA_MS = 3000, DELA_FOLJ_MS = 15000, DELA_KOLL_MS = 1000;
const DELA = { agare: null, sander: false, senastSkickat: "", skickadTid: 0, skickar: false,
               folj: null, foljer: false, andrad: 0, tillampar: false, fel: "" };

// ---------- Vad som sparas ----------
function vyFanga() {
  const r = x => Math.round(x * 10) / 10;
  const v = { l: fav ? "f" : lage, vb: [r(vb.x), r(vb.y), r(vb.w)], lat: $("lat").value, lon: $("lon").value, pk: $("punkt").value,
              sf: siffLage, flyg: visaFlyg };
  if (lage === "p") {
    Object.assign(v, { dtg: P.dtg, pp: $("pParam").value, pv: $("pVisa").value, pm: $("pMedl").value, tr: $("pTrosk").value,
      fr: $("pFran").value, ti: $("pTill").value, st: $("pStorlek").value, up: $("pUppl").value, dt: $("pDt").value,
      iso: visaIso, isoP: isoProbVal(), isoV: isoValen($("pParam").value), m0l: visaM0Linje });
  } else if (lage === "th") {
    Object.assign(v, { dtg: M && M.dtg || null, topp: $("topp").value, vind: vindLage, m0: M0F.pa, m0v: M0F.v, m0t: M0F.t,
      skew: skewT !== null && !$("skewRuta").hidden ? skewT : null });
  }
  return v;
}

const valj = (id, varde, handelse) => {   // satt ett val och lat sidans egen kod reagera (som om man valt sjalv)
  const e = $(id); if (varde === undefined || varde === null || e.value === String(varde)) return false;
  e.value = String(varde); if (e.value !== String(varde)) return false;
  e.dispatchEvent(new Event(handelse || "change")); return true;
};
const knapp = (id, pa) => $(id).setAttribute("aria-pressed", String(!!pa));

async function vyTillampa(v) {
  DELA.tillampar = true;
  try {
    const flik = v.l === "f" ? "f" : v.l;
    if (flik !== (fav ? "f" : lage)) bytLage(flik);
    // punkt (tid-hojd) / omradets mitt (sannolikhet)
    const nyPunkt = $("lat").value !== v.lat || $("lon").value !== v.lon;
    $("punkt").value = v.pk; if (!$("punkt").value) $("punkt").value = "egen";
    $("lat").value = v.lat; $("lon").value = v.lon;
    if (v.flyg !== undefined && v.flyg !== visaFlyg) $("visaFlyg").click();
    if (v.sf !== undefined && v.sf !== siffLage) { siffLage = v.sf; sattSiffKnapp(); }
    if (lage === "p") {
      if (!fav) {
        if (v.dtg && v.dtg !== P.dtg) { if (!valj("pKorningVal", v.dtg)) { $("pKorningVal").value = v.dtg; if ($("pKorningVal").value === v.dtg) $("pKorningVal").dispatchEvent(new Event("change")); else bytKorning(v.dtg); } }
        valj("pStorlek", v.st); valj("pUppl", v.up); valj("pDt", v.dt);
      }
      valj("pParam", v.pp); valj("pVisa", v.pv); valj("pMedl", v.pm);
      if (v.tr !== undefined && $("pTrosk").value !== v.tr) { $("pTrosk").value = v.tr; lagra("mt:pTrosk:" + $("pParam").value, v.tr); }
      if (v.isoP) lagra("mt:isoProb", JSON.stringify(v.isoP));
      if (v.isoV) lagra("mt:isoVal:" + $("pParam").value, JSON.stringify(v.isoV));
      visaIso = !!v.iso; knapp("visaIso", visaIso); visaM0Linje = !!v.m0l; knapp("m0Linje", visaM0Linje);
      $("pFran").value = v.fr; $("pTill").value = v.ti;
      sattParam(true); ritaIsoProbKnappar(); if (typeof favMarkera === "function") favMarkera();
      ritaMarkorer(); ritaOmrade(); await probVisa();
      // data som saknas: hamta (forsta forsoket gar mot mellanserverns cache - delaren har just hamtat samma sak)
      if (!fav && !P.varden && !P.upptagen) probHamta(true);
    } else if (lage === "th") {
      valj("topp", v.topp);
      if (v.vind !== undefined && v.vind !== vindLage) $(v.vind ? "lVind" : "lMoln").click();
      const nyKorning = v.dtg && (!M || M.dtg !== v.dtg);
      if (nyKorning) { $("korning").value = v.dtg; if ($("korning").value !== v.dtg) $("korning").value = "senaste"; }
      if (v.m0 !== undefined) { M0F.pa = !!v.m0; M0F.v = v.m0v || M0F.v; $("m0Param").value = M0F.v; knapp("m0Falt", M0F.pa); if (v.m0t !== null && v.m0t !== undefined) M0F.t = v.m0t; }
      ritaMarkorer();
      if (nyPunkt || nyKorning || !M || !M.stat) { valjOchHamta(); await vantaTH(); }
      m0Uppdatera();
      if (v.skew !== null && v.skew !== undefined && M && M.stat) { if (skewT !== v.skew || $("skewRuta").hidden) oppnaSkewT(v.skew); }
      else if (skewT !== null && !$("skewRuta").hidden) $("skewStang").click();
    }
    if (v.vb) satVb(v.vb[0], v.vb[1], v.vb[2]);
  } catch (e) { console.log("[dela] tillampa", e); }
  finally { setTimeout(() => { DELA.tillampar = false; }, 300); }
}
// vanta tills punkten hamtats (hogst 2 min); ar inget pa gang efter 3 s har hamtningen misslyckats eller inte startat
async function vantaTH() { for (let i = 0; i < 240 && (upptagen || ((!M || !M.stat) && i < 6)); i++) await new Promise(r => setTimeout(r, 500)); }

// ---------- Mellanservern ----------
async function delaFraga(metod, sok, kropp) {
  const r = await fetch(DELA_URL + (sok || ""), { method: metod, cache: "no-store", body: kropp ? JSON.stringify(kropp) : undefined,
    headers: kropp ? { "Content-Type": "text/plain" } : undefined, signal: AbortSignal.timeout(10000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.fel || ("svar " + r.status));
  return j;
}
const delaLank = id => location.origin + location.pathname + "#v=" + id;
function delaLasAgare() { try { const a = JSON.parse(lasa("mt:delning") || "null"); return a && a.id && a.nyckel ? a : null; } catch (e) { return null; } }

async function delaSkapa() {
  const v = vyFanga(), j = await delaFraga("POST", "", { vy: v });
  DELA.agare = { id: j.id, nyckel: j.nyckel }; lagra("mt:delning", JSON.stringify(DELA.agare));
  DELA.senastSkickat = JSON.stringify(v); DELA.skickadTid = Date.now(); DELA.sander = true;
}
async function delaSkicka() {
  if (!DELA.agare || !DELA.sander || DELA.skickar || DELA.tillampar || DELA.foljer) return;
  const v = vyFanga(), t = JSON.stringify(v);
  if (t === DELA.senastSkickat || Date.now() - DELA.skickadTid < DELA_SKICKA_MS) return;
  DELA.skickar = true;
  try { await delaFraga("POST", "?id=" + DELA.agare.id + "&nyckel=" + DELA.agare.nyckel, { vy: v }); DELA.senastSkickat = t; DELA.skickadTid = Date.now(); DELA.fel = ""; }
  catch (e) { DELA.fel = "Kunde inte skicka ändringen (" + e.message + ") – försöker igen."; DELA.skickadTid = Date.now(); }
  finally { DELA.skickar = false; delaRitaRad(); }
}

// ---------- Tittaren ----------
async function delaHamtaVy(forsta) {
  if (!DELA.folj || (!DELA.foljer && !forsta) || document.hidden && !forsta || DELA.tillampar) return;
  try {
    const j = await delaFraga("GET", "?id=" + DELA.folj);
    DELA.fel = "";
    if (j.andrad > DELA.andrad) { DELA.andrad = j.andrad; await vyTillampa(j.vy); }
  } catch (e) { DELA.fel = e.message === "finns inte" ? "Länken finns inte längre (delade vyer sparas 30 dagar)." : "Kunde inte hämta den delade vyn (" + e.message + ")."; if (e.message === "finns inte") DELA.foljer = false; }
  delaRitaRad();
}
// Tittaren rör sjalv kartan eller valen -> pausa foljandet
function delaEgenAtgard(ev) {
  if (!DELA.foljer || DELA.tillampar || !ev.isTrusted) return;
  const m = ev.target && ev.target.closest ? ev.target.closest(".kartpanel, .kontroller, .pkontroller, .favpanel, .flikar, #vyTH") : null;
  if (!m || (ev.target.closest && ev.target.closest("#delaRad"))) return;
  if (ev.type === "pointerdown" && ev.target.closest && ev.target.closest("#karta") && ev.button !== 0) return;
  DELA.foljer = false; delaRitaRad();
}

// ---------- Utseende ----------
function delaRitaRad() {
  const rad = $("delaRad"); rad.textContent = ""; const fel = DELA.fel;
  const b = (text, f, titel, sek) => { const k = document.createElement("button"); k.className = (sek ? "sek " : "") + "liten"; k.textContent = text; if (titel) k.title = titel; k.addEventListener("click", f); rad.appendChild(k); return k; };
  const s = (text, kl) => { const e = document.createElement("span"); e.textContent = text; if (kl) e.className = kl; rad.appendChild(e); return e; };
  if (DELA.folj) {
    rad.hidden = false;
    s(DELA.foljer ? "👁 Du följer en delad vy – den ändras när delaren ändrar (kollas var 15:e s)." : "⏸ Du styr själv – den delade vyn följs inte just nu.");
    if (DELA.foljer) b("Styr själv", () => { DELA.foljer = false; delaRitaRad(); }, "Sluta följa och titta fritt", true);
    else b("Följ igen", () => { DELA.foljer = true; DELA.andrad = 0; delaHamtaVy(true); delaRitaRad(); }, "Gå tillbaka till delarens vy och följ med igen");
    b("Lämna", () => { DELA.folj = null; DELA.foljer = false; history.replaceState(null, "", location.pathname); delaRitaRad(); }, "Sluta titta på den delade vyn", true);
  } else if (DELA.agare && DELA.panel) {
    rad.hidden = false;
    const l = document.createElement("input"); l.readOnly = true; l.value = delaLank(DELA.agare.id); l.className = "delalank"; l.addEventListener("focus", () => l.select()); rad.appendChild(l);
    b("Kopiera länk", async e => { try { await navigator.clipboard.writeText(l.value); e.target.textContent = "Kopierad ✓"; } catch (x) { l.select(); document.execCommand && document.execCommand("copy"); e.target.textContent = "Kopierad ✓"; } setTimeout(delaRitaRad, 2000); });
    if (DELA.sander) { s("● Sänder: de som har länken ser dina ändringar inom ca 15 s.", "delasand"); b("Pausa", () => { DELA.sander = false; delaRitaRad(); }, "Sluta skicka ändringar – länken visar då vyn som den är nu", true); }
    else { s("Pausad: länken visar vyn som den var när du pausade."); b("Sänd ändringar", () => { DELA.sander = true; DELA.senastSkickat = ""; DELA.skickadTid = 0; delaSkicka(); delaRitaRad(); }); }
    b("Ny länk", async () => { if (!confirm2()) return; try { await delaSkapa(); } catch (e) { DELA.fel = "Kunde inte skapa länk (" + e.message + ")."; } delaRitaRad(); }, "Skapa en ny länk (den gamla slutar uppdateras)", true);
    b("Stäng", () => { DELA.panel = false; delaRitaRad(); }, "Dölj raden (sändningen fortsätter om den är på)", true);
  } else rad.hidden = true;
  if (fel && !rad.hidden) s(" " + fel, "delafel");
  const dk = $("delaKnapp"); dk.setAttribute("aria-pressed", String(!!(DELA.agare && DELA.sander))); dk.textContent = DELA.agare && DELA.sander ? "● Delar" : "Dela";
}
function confirm2() { return true; }   // inga dialogrutor (blockerar sidan) - ny lank skapas direkt

async function delaKnappKlick() {
  if (DELA.folj) { DELA.folj = null; DELA.foljer = false; history.replaceState(null, "", location.pathname); }
  DELA.panel = true;
  if (!DELA.agare) { try { $("delaKnapp").disabled = true; await delaSkapa(); DELA.fel = ""; } catch (e) { DELA.fel = "Kunde inte skapa länk (" + e.message + ")."; } finally { $("delaKnapp").disabled = false; } }
  else if (!DELA.sander) { DELA.sander = true; DELA.senastSkickat = ""; DELA.skickadTid = 0; delaSkicka(); }
  delaRitaRad();
}

(function delaInit() {
  DELA.agare = delaLasAgare();   // en tidigare delning fran denna webblasare (sander inte forran man trycker Dela)
  $("delaKnapp").addEventListener("click", delaKnappKlick);
  ["pointerdown", "keydown", "wheel"].forEach(t => document.addEventListener(t, delaEgenAtgard, true));
  setInterval(delaSkicka, DELA_KOLL_MS);
  setInterval(() => delaHamtaVy(false), DELA_FOLJ_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && DELA.foljer) delaHamtaVy(false); });
  const m = location.hash.match(/[#&]v=([a-z0-9]{6,12})/);
  if (m) {
    DELA.folj = m[1]; DELA.foljer = true; delaRitaRad();
    // vanta tills sidan startat klart (listor fyllda, korningar kanda) innan vyn laggs pa
    let n = 0; const vanta = setInterval(() => { n++;
      if (($("pParam").options.length && $("pKorningVal").options.length && typeof bytLage === "function") || n > 40) { clearInterval(vanta); setTimeout(() => delaHamtaVy(true), 800); } }, 250);
  } else delaRitaRad();
})();
