// Modelltittaren - DELA VY (NYTT 21/11, utökad 21/11 förmiddag)
// Knappen "Dela" öppnar en rad där man kan
//  * GÅ MED i en delning: skriva dess namn, eller klicka i listan "Pågående" (bara delningar med "Visa i listan").
//  * DELA DET MAN SER: välja en av sina delningar eller skapa en ny med eget namn (…/#v=metocc) eller slumpnamn.
//    "Sänd" skickar varje ändring (flik, punkt, parameter, tröskel, tid, område, zoom, körning, ritlinjer ...) högst
//    var 1,5 s. Inga data och inga bilder sparas - bara inställningarna; tittarnas sidor hämtar data själva (oftast ur
//    mellanserverns cache eftersom delaren just hämtat samma sak).
//  * se VILKA SOM TITTAR (namnet var och en skrivit i "Ditt namn"; ingen inloggning).
// Tittaren: fast färgad ruta överst (grön = följer, orange = styr själv). Skrolla/zooma pausar inte; ändrar man ett val
// själv pausas följandet ("Följ igen"). Frågar var 3:e s medan delaren är aktiv, annars var 12:e s; dold flik frågar inte.
// Ägarnyckeln finns i ägarens webbläsare (mt:delningar). "Ägarlänk (hemlig)" = samma delning från en annan dator.
// Delningar raderas inte automatiskt - bara med "Ta bort".

const DELA_URL = "https://modelltittaren.metvyer.workers.dev/dela";
const DELA_SKICKA_MS = 1500, DELA_FOLJ_SNABB_MS = 3000, DELA_FOLJ_LUGN_MS = 12000, DELA_AKTIV_MS = 180000, DELA_KOLL_MS = 1000;
const DELA_HJARTA_MS = 30000, DELA_AGARE_MS = 10000, DELA_LISTA_MS = 20000;
const DELA = { mina: [], aktivId: null, sander: false, senastSkickat: "", skickadTid: 0, skickar: false, panel: false,
               folj: null, foljer: false, andrad: 0, tillampar: false, fel: "", tillampad: "", vbSenast: "",
               tittare: [], vem: "", delare: "", aktiva: [], lista: false, nytt: false, ledigt: null,
               sess: Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8) };
// jamforelse "har tittaren andrat nagot sjalv": utan zoom, korning och ritlinjer
const utanVb = v => { const k = { ...v }; delete k.vb; delete k.dtg; delete k.rit; return JSON.stringify(k); };

// ---------- Vad som sparas ----------
function vyFanga() {
  const r = x => Math.round(x * 10) / 10;
  const v = { l: fav ? "f" : lage, vb: [r(vb.x), r(vb.y), r(vb.w)], lat: $("lat").value, lon: $("lon").value, pk: $("punkt").value,
              sf: siffLage, flyg: visaFlyg, rit: typeof RIT !== "undefined" ? RIT.linjer : [] };
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

let delaGen = 0;   // okar vid varje ny vy - pagaende "efterarbete" for en aldre vy slutar
async function vyTillampa(v) {
  DELA.tillampar = true; const gen = ++delaGen;
  try {
    // 21/11: delaren har bytt till nagot annat -> avbryt tittarens pagaende hamtning direkt (vanta inte ut den)
    const flikNu = fav ? "f" : lage, byterFlik = (v.l === "f" ? "f" : v.l) !== flikNu;
    if (typeof upptagen !== "undefined" && upptagen && (byterFlik || $("lat").value !== v.lat || $("lon").value !== v.lon || (v.dtg && M && M.dtg !== v.dtg))) {
      koad = false; stoppad = true; if (avbryt) avbryt.abort(); }
    if (P.upptagen && (byterFlik || v.pp !== $("pParam").value || v.st !== $("pStorlek").value || v.up !== $("pUppl").value || v.fr !== $("pFran").value || v.ti !== $("pTill").value || $("lat").value !== v.lat || $("lon").value !== v.lon)) {
      stoppad = true; if (avbryt) avbryt.abort(); await new Promise(r => setTimeout(r, 300)); }
    const flik = v.l === "f" ? "f" : v.l;
    if (flik !== (fav ? "f" : lage)) {
      bytLage(flik);
      // Favoriter satter sjalv tid och troskel nar fliken oppnas (efter att oversikten lasts) - vanta in det forst
      if (flik === "f") { try { await svIndex(); } catch (e) {} await new Promise(r => setTimeout(r, 400)); }
    }
    // punkt (tid-hojd) / omradets mitt (sannolikhet)
    const nyPunkt = $("lat").value !== v.lat || $("lon").value !== v.lon;
    $("punkt").value = v.pk; if (!$("punkt").value) $("punkt").value = "egen";
    $("lat").value = v.lat; $("lon").value = v.lon;
    if (v.flyg !== undefined && v.flyg !== visaFlyg) $("visaFlyg").click();
    if (typeof RIT !== "undefined") { RIT.delade = Array.isArray(v.rit) && v.rit.length ? v.rit : null; ritRita(); }
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
      const efter = () => {   // kartfalt och skew-T nar punkten finns (kors inte om en nyare vy hunnit komma)
        if (gen !== delaGen) return;
        m0Uppdatera();
        if (v.skew !== null && v.skew !== undefined && M && M.stat) { if (skewT !== v.skew || $("skewRuta").hidden) oppnaSkewT(v.skew); }
        else if (skewT !== null && !$("skewRuta").hidden) $("skewStang").click();
      };
      // 21/11: vanta INTE ut hamtningen har (da kom delarens nasta byte forst nar den var klar) - gor resten efterat
      if (nyPunkt || nyKorning || !M || !M.stat) { valjOchHamta(); vantaTH().then(efter); } else efter();
    }
    // zoomen: bara nar delaren sjalv zoomat om (annars far tittaren behalla sin egen zoom)
    const vbT = JSON.stringify(v.vb || null);
    if (v.vb && vbT !== DELA.vbSenast) satVb(v.vb[0], v.vb[1], v.vb[2]);
    DELA.vbSenast = vbT;
  } catch (e) { console.log("[dela] tillampa", e); }
  finally { setTimeout(() => { DELA.tillampar = false; DELA.tillampad = utanVb(vyFanga()); }, 1500); }
}
// vanta tills punkten hamtats (hogst 2 min); ar inget pa gang efter 3 s har hamtningen misslyckats eller inte startat
async function vantaTH() { for (let i = 0; i < 240 && (upptagen || ((!M || !M.stat) && i < 6)); i++) await new Promise(r => setTimeout(r, 500)); }

// ---------- Mellanservern ----------
async function delaFraga(metod, sok, kropp, sokvag) {
  const r = await fetch(DELA_URL + (sokvag || "") + (sok || ""), { method: metod, cache: "no-store", body: kropp ? JSON.stringify(kropp) : undefined,
    headers: kropp ? { "Content-Type": "text/plain" } : undefined, signal: AbortSignal.timeout(10000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.fel || ("svar " + r.status)); e.status = r.status; throw e; }
  return j;
}
const delaLank = id => location.origin + location.pathname + "#v=" + id;
const minDelning = id => DELA.mina.find(d => d.id === id) || null;
const aktivDelning = () => minDelning(DELA.aktivId);
function delaSparaMina() { lagra("mt:delningar", JSON.stringify(DELA.mina)); lagra("mt:delningAktiv", DELA.aktivId || ""); }
function delaLasMina() {
  try { const a = JSON.parse(lasa("mt:delningar") || "[]"); if (Array.isArray(a)) DELA.mina = a.filter(d => d && d.id && d.nyckel); } catch (e) {}
  try { const g = JSON.parse(lasa("mt:delning") || "null"); if (g && g.id && g.nyckel && !minDelning(g.id)) DELA.mina.push(g); } catch (e) {}   // forsta versionen (en delning)
  DELA.aktivId = lasa("mt:delningAktiv") || (DELA.mina[0] && DELA.mina[0].id) || null; if (DELA.aktivId && !minDelning(DELA.aktivId)) DELA.aktivId = DELA.mina[0] ? DELA.mina[0].id : null;
  DELA.vem = lasa("mt:delaVem") || "";
}

async function delaSkapa(namn) {
  const v = vyFanga(), j = await delaFraga("POST", "", { vy: v, namn: namn || undefined, lista: DELA.lista, vem: DELA.vem });
  DELA.mina.push({ id: j.id, nyckel: j.nyckel }); DELA.aktivId = j.id; delaSparaMina();
  DELA.senastSkickat = JSON.stringify(v); DELA.skickadTid = Date.now(); DELA.sander = true; DELA.tittare = [];
}
async function delaSkicka() {
  const d = aktivDelning();
  if (!d || !DELA.sander || DELA.skickar || DELA.tillampar || DELA.foljer) return;
  const v = vyFanga(), t = JSON.stringify(v);
  if (t === DELA.senastSkickat || Date.now() - DELA.skickadTid < DELA_SKICKA_MS) return;
  DELA.skickar = true;
  try { await delaFraga("POST", "?id=" + d.id + "&nyckel=" + d.nyckel, { vy: v, vem: DELA.vem }); DELA.senastSkickat = t; DELA.skickadTid = Date.now(); DELA.fel = ""; }
  catch (e) {
    DELA.skickadTid = Date.now();
    if (e.status === 404 || e.status === 403) { DELA.sander = false; DELA.fel = "Delningen «" + d.id + "» finns inte längre (eller nyckeln stämmer inte) – skapa en ny."; DELA.mina = DELA.mina.filter(x => x !== d); DELA.aktivId = DELA.mina[0] ? DELA.mina[0].id : null; delaSparaMina(); delaBygg(); }
    else DELA.fel = "Kunde inte skicka ändringen (" + e.message + ") – försöker igen.";
  }
  finally { DELA.skickar = false; delaUppdatera(); }
}
// agaren: "jag sander" var 10:e s (haller delningen i listan "Pagaende") + hamtar vilka som tittar
async function delaAgarPuls() {
  const d = aktivDelning(); if (!d || !DELA.sander || DELA.folj || document.hidden) return;
  try { const j = await delaFraga("GET", "?id=" + d.id + "&nyckel=" + d.nyckel); DELA.tittare = j.tittare || []; DELA.lista = !!j.lista; } catch (e) {}
  delaUppdatera();
}

// ---------- Tittaren ----------
let delaHjarta = 0;
async function delaHamtaVy(forsta) {
  if (!DELA.folj || (!DELA.foljer && !forsta) || document.hidden && !forsta || DELA.tillampar) return;
  const hj = forsta || Date.now() - delaHjarta > DELA_HJARTA_MS;   // "jag ar har" var 30:e s
  try {
    const j = await delaFraga("GET", "?id=" + encodeURIComponent(DELA.folj) + (hj ? "&sess=" + DELA.sess + "&namn=" + encodeURIComponent(DELA.vem) : ""));
    if (hj) delaHjarta = Date.now();
    DELA.fel = ""; DELA.tittare = j.tittare || []; DELA.delare = j.vem || "";
    if (j.andrad > DELA.andrad) { DELA.andrad = j.andrad; await vyTillampa(j.vy); }
  } catch (e) {
    DELA.fel = e.status === 404 ? "Det finns ingen delning som heter «" + DELA.folj + "»." : "Kunde inte hämta den delade vyn (" + e.message + ").";
    if (e.status === 404) DELA.foljer = false;
  }
  delaUppdatera();
}
// Tittaren har SJALV andrat ett val (inte zoom/skroll) -> pausa foljandet. Kollas varje sekund.
function delaKollaEgen() {
  if (!DELA.folj || !DELA.foljer || DELA.tillampar || !DELA.tillampad) return;
  if (utanVb(vyFanga()) !== DELA.tillampad) { DELA.foljer = false; delaBygg(); }
}
function delaFolj(id) {
  id = String(id || "").trim().toLowerCase(); if (!id) return;
  DELA.folj = id; DELA.foljer = true; DELA.andrad = 0; DELA.vbSenast = ""; DELA.tillampad = ""; DELA.tittare = []; DELA.panel = false; DELA.sander = false;
  history.replaceState(null, "", location.pathname + "#v=" + id); delaBygg(); delaHamtaVy(true);
}
function delaLamna() {
  DELA.folj = null; DELA.foljer = false; DELA.tittare = []; history.replaceState(null, "", location.pathname);
  if (typeof RIT !== "undefined") { RIT.delade = null; ritRita(); } delaBygg();
}
async function delaHamtaAktiva() {
  if (!DELA.panel || DELA.folj || document.hidden) return;
  try { DELA.aktiva = await delaFraga("GET", "", null, "/aktiva"); } catch (e) { DELA.aktiva = []; }
  delaUppdatera();
}

// ---------- Utseende ----------
const nyEl = (tag, attr, text) => { const e = document.createElement(tag); for (const k in attr || {}) { if (k === "on") for (const h in attr.on) e.addEventListener(h, attr.on[h]); else if (k in e) e[k] = attr[k]; else e.setAttribute(k, attr[k]); } if (text !== undefined) e.textContent = text; return e; };
const knappEl = (text, f, titel, sek) => nyEl("button", { className: (sek ? "sek " : "") + "liten", title: titel || "", on: { click: f } }, text);
const tittText = () => { const n = DELA.tittare.length; if (!n) return "Ingen tittar just nu."; const namn = DELA.tittare.map(x => x || "(namnlös)"); return n + " tittar: " + namn.join(", "); };
function vemFalt() {
  const f = nyEl("input", { id: "delaVem", value: DELA.vem, placeholder: "Ditt namn", maxLength: 30, className: "delavem", title: "Ditt namn syns för den som delar och för andra som tittar. Sparas i webbläsaren." });
  f.addEventListener("input", () => { DELA.vem = f.value.trim(); lagra("mt:delaVem", DELA.vem); delaHjarta = 0; DELA.senastSkickat = ""; });
  return f;
}
// Bygger raden fran grunden (vid lagesbyte). delaUppdatera() andrar bara texter, sa inmatningsrutor tappar inte fokus.
function delaBygg() {
  const rad = $("delaRad"); rad.textContent = ""; rad.className = "delarad";
  if (DELA.folj) {
    rad.hidden = false; rad.classList.add(DELA.foljer ? "foljer" : "pausad");
    rad.append(nyEl("span", { id: "delaRubrik", className: "delanamn" }), nyEl("span", { id: "delaInfo" }));
    if (DELA.foljer) rad.append(knappEl("Styr själv", () => { DELA.foljer = false; delaBygg(); }, "Sluta följa och titta fritt", true));
    else rad.append(knappEl("Följ igen", () => { DELA.foljer = true; DELA.andrad = 0; DELA.vbSenast = ""; DELA.tillampad = ""; delaBygg(); delaHamtaVy(true); }, "Gå tillbaka till delarens vy och följ med igen"));
    rad.append(knappEl("Lämna", delaLamna, "Sluta titta på den delade vyn", true), nyEl("span", {}, "Ditt namn:"), vemFalt(), nyEl("span", { id: "delaFel", className: "delafel" }));
  } else if (DELA.panel) {
    rad.hidden = false; rad.classList.add("panel");
    // Ga med
    const r1 = nyEl("div", { className: "delarad1" }), gm = nyEl("input", { id: "delaGaMed", placeholder: "namn, t.ex. metocc", className: "delavem" });
    gm.addEventListener("keydown", e => { if (e.key === "Enter") delaFolj(gm.value); });
    r1.append(nyEl("b", {}, "Gå med:"), gm, knappEl("Gå med", () => delaFolj(gm.value), "Följ en delning med det här namnet"), nyEl("span", { id: "delaAktiva", className: "delaaktiva" }));
    // Dela det jag ser
    const r2 = nyEl("div", { className: "delarad1" }), d = aktivDelning();
    const sel = nyEl("select", { id: "delaVal", title: "Dina delningar (de som skapats i den här webbläsaren eller med ägarlänk)" });
    for (const x of DELA.mina) sel.add(new Option(x.id, x.id)); sel.add(new Option("+ ny delning …", "+"));
    sel.value = DELA.nytt || !d ? "+" : d.id;
    sel.addEventListener("change", () => { if (sel.value === "+") { DELA.nytt = true; DELA.sander = false; } else { DELA.nytt = false; DELA.aktivId = sel.value; DELA.sander = false; DELA.tittare = []; delaSparaMina(); } delaBygg(); });
    r2.append(nyEl("b", {}, "Dela det jag ser:"), sel);
    if (DELA.nytt || !d) {
      const nn = nyEl("input", { id: "delaNyttNamn", placeholder: "eget namn (tomt = slumpnamn)", maxLength: 20, className: "delavem", title: "a–z, 0–9 och bindestreck, 3–20 tecken" });
      const st = nyEl("span", { id: "delaLedigt" });
      let tim = 0;
      nn.addEventListener("input", () => { nn.value = nn.value.toLowerCase().replace(/å|ä/g, "a").replace(/ö/g, "o").replace(/[^a-z0-9-]/g, "-"); clearTimeout(tim); st.textContent = "";
        if (nn.value.length >= 3) tim = setTimeout(async () => { try { const j = await delaFraga("GET", "?namn=" + encodeURIComponent(nn.value), null, "/ledigt"); st.textContent = j.ledigt ? "✓ ledigt" : (j.fel || "✗ upptaget"); st.className = j.ledigt ? "delaok" : "delafel"; } catch (e) {} }, 400); });
      const skapa = async () => { try { await delaSkapa(nn.value.trim()); DELA.nytt = false; DELA.fel = ""; } catch (e) { DELA.fel = "Kunde inte skapa: " + e.message; } delaBygg(); };
      nn.addEventListener("keydown", e => { if (e.key === "Enter") skapa(); });
      r2.append(nn, st, knappEl("Skapa och sänd", skapa, "Skapa delningen och börja sända det du ser"));
    } else {
      const l = nyEl("input", { readOnly: true, value: delaLank(d.id), className: "delalank" }); l.addEventListener("focus", () => l.select());
      const kopiera = async (text, k) => { try { await navigator.clipboard.writeText(text); } catch (x) {} const f = k.textContent; k.textContent = "Kopierad ✓"; setTimeout(() => { k.textContent = f; }, 1800); };
      const kl = knappEl("Kopiera länk", e => kopiera(l.value, e.currentTarget), "Länken att skicka till kollegor");
      const sk = knappEl(DELA.sander ? "Pausa" : "Sänd", () => { DELA.sander = !DELA.sander; if (DELA.sander) { DELA.senastSkickat = ""; DELA.skickadTid = 0; delaSkicka(); delaAgarPuls(); } delaBygg(); },
        DELA.sander ? "Sluta skicka ändringar – länken visar vyn som den är nu" : "Skicka det du ser till dem som har länken", !DELA.sander);
      const ag = knappEl("Ägarlänk (hemlig)", e => kopiera(delaLank(d.id) + "&agare=" + d.nyckel, e.currentTarget), "Öppna den här länken en gång i en annan webbläsare/dator så kan du sända på samma delning därifrån. Dela den INTE – den som har den kan ändra vad andra ser.", true);
      const lb = nyEl("label", { className: "kryss", title: "Visa delningen i listan Pågående för alla som öppnar Dela (medan du sänder). Sidan är öppen på internet." });
      const cb = nyEl("input", { type: "checkbox", checked: DELA.lista }); cb.addEventListener("change", async () => { DELA.lista = cb.checked; try { await delaFraga("POST", "?id=" + d.id + "&nyckel=" + d.nyckel, { lista: DELA.lista }); } catch (e) { DELA.fel = "Kunde inte ändra: " + e.message; } delaUppdatera(); });
      lb.append(cb, " Visa i listan");
      const tb = knappEl("Ta bort", async e => { const k = e.currentTarget; if (k.dataset.saker !== "1") { k.dataset.saker = "1"; k.textContent = "Säker? Klicka igen"; setTimeout(() => { k.dataset.saker = ""; k.textContent = "Ta bort"; }, 4000); return; }
        try { await delaFraga("POST", "?id=" + d.id + "&nyckel=" + d.nyckel + "&tabort=1"); } catch (x) {}
        DELA.mina = DELA.mina.filter(x => x !== d); DELA.aktivId = DELA.mina[0] ? DELA.mina[0].id : null; DELA.sander = false; delaSparaMina(); delaBygg(); }, "Ta bort delningen för gott (länken slutar fungera)", true);
      r2.append(l, kl, sk, nyEl("span", { id: "delaSand", className: "delasand" }), ag, lb, tb, nyEl("span", { id: "delaTitt" }));
    }
    const r3 = nyEl("div", { className: "delarad1" });
    r3.append(nyEl("span", {}, "Ditt namn:"), vemFalt(), knappEl("Stäng", () => { DELA.panel = false; delaBygg(); }, "Dölj raden (sändningen fortsätter om den är på)", true), nyEl("span", { id: "delaFel", className: "delafel" }));
    rad.append(r1, r2, r3);
    delaHamtaAktiva();
  } else rad.hidden = true;
  delaUppdatera();
}
function delaUppdatera() {
  const t = (id, text) => { const e = $(id); if (e) e.textContent = text; };
  if (DELA.folj) {
    t("delaRubrik", (DELA.foljer ? "👁 Följer delad vy " : "⏸ Följer inte – du styr själv · ") + "«" + DELA.folj + "»" + (DELA.delare ? " (" + DELA.delare + ")" : ""));
    t("delaInfo", (DELA.foljer ? "Ändras inom några sekunder när delaren ändrar. Zooma och skrolla fritt." : "Du har ändrat något själv. Tryck Följ igen för att gå tillbaka.") + " " + tittText());
  }
  t("delaSand", DELA.sander ? "● Sänder" : "");
  t("delaTitt", DELA.sander ? tittText() : "");
  t("delaFel", DELA.fel ? " " + DELA.fel : "");
  const a = $("delaAktiva");
  if (a) { a.textContent = ""; const egna = new Set(DELA.mina.map(x => x.id)), l = DELA.aktiva.filter(x => !egna.has(x.id));
    if (l.length) { a.append(nyEl("span", {}, "Pågående: ")); for (const x of l) a.append(knappEl(x.id + (x.vem ? " – " + x.vem : "") + " · " + x.antal + " tittar", () => delaFolj(x.id), "Följ den här delningen", true)); }
    else a.append(nyEl("span", { className: "dim" }, "Inga pågående delningar i listan.")); }
  const dk = $("delaKnapp"); dk.setAttribute("aria-pressed", String(!!(aktivDelning() && DELA.sander))); dk.textContent = aktivDelning() && DELA.sander ? "● Delar «" + DELA.aktivId + "»" : DELA.folj ? "Dela (följer)" : "Dela";
}

function delaKnappKlick() {
  if (DELA.folj) delaLamna();
  DELA.panel = !DELA.panel || !!DELA.folj; delaBygg();
}

(function delaInit() {
  delaLasMina();
  $("delaKnapp").addEventListener("click", delaKnappKlick);
  setInterval(() => { delaKollaEgen(); delaSkicka(); }, DELA_KOLL_MS);
  let senastFragat = 0, senastPuls = 0, senastLista = 0;
  setInterval(() => {
    const n = Date.now(), aktiv = DELA.andrad && n - DELA.andrad < DELA_AKTIV_MS;
    if (DELA.folj && n - senastFragat >= (aktiv ? DELA_FOLJ_SNABB_MS : DELA_FOLJ_LUGN_MS)) { senastFragat = n; delaHamtaVy(false); }
    if (DELA.sander && n - senastPuls >= DELA_AGARE_MS) { senastPuls = n; delaAgarPuls(); }
    if (DELA.panel && n - senastLista >= DELA_LISTA_MS) { senastLista = n; delaHamtaAktiva(); }
  }, 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && DELA.foljer) delaHamtaVy(false); });
  const m = location.hash.match(/[#&]v=([a-z0-9-]{3,20})/), ag = location.hash.match(/[&]agare=([a-z0-9]{10,40})/);
  if (m && ag) {   // agarlank: spara agarskapet i den har webblasaren, oppna Dela-raden (inte folja)
    if (!minDelning(m[1])) DELA.mina.push({ id: m[1], nyckel: ag[1] }); else minDelning(m[1]).nyckel = ag[1];
    DELA.aktivId = m[1]; delaSparaMina(); history.replaceState(null, "", location.pathname);
    DELA.panel = true; DELA.fel = "Du äger nu «" + m[1] + "» även i den här webbläsaren. Tryck Sänd för att dela det du ser."; delaBygg();
  } else if (m) {
    DELA.folj = m[1]; DELA.foljer = true; delaBygg();
    // vanta tills sidan startat klart (listor fyllda, korningar kanda) innan vyn laggs pa
    let n = 0; const vanta = setInterval(() => { n++;
      if (($("pParam").options.length && $("pKorningVal").options.length && typeof bytLage === "function") || n > 40) { clearInterval(vanta); setTimeout(() => delaHamtaVy(true), 800); } }, 250);
  } else delaBygg();
})();
