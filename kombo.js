// Modelltittaren - KOMBINERAD SANNOLIKHET (NYTT 21/11)
// Två (eller tre) fält räknas ihop PER MEDLEM och TIMME: en medlem räknas om villkoren är uppfyllda samtidigt
// någon gång i perioden. Det blir en riktig sannolikhet för kombinationen (inte två kartor ovanpå varandra).
//  * Ishalka:        nederbörd ≥ A mm/h och yttemperatur < B °C
//  * Rimfrost/frost: yttemperatur < B °C och yttemperatur under daggpunkten 2 m (daggpunkt ur temperatur + fukt 2 m)
//  * Snöfok:         snöfall ≥ A mm/h och byvind ≥ B kt
// Fukt 2 m, snöfall och nederbörd finns för alla 30 medlemmar (mätprov S 21/11).
// Hämtning: "Hämta fält" hämtar varje ingående fält i tur och ordning med sidans vanliga hämtning (cache, GitHub,
// mellanservern) - P.vOverride / P.listaOverride styr vilket fält och vilka timmar. Nederbörd/snöfall per timme =
// skillnaden mellan två ackumulerade värden, så timmen före perioden hämtas också.

const KOMBO = {
  ishalka: { namn: "Ishalka", delar: ["nb", "t0"], A: { namn: "Nederbörd ≥", enhet: "mm/h", std: 0.1 }, B: { namn: "Yttemp <", enhet: "°C", std: 0 },
    text: (A, B) => "nederbörd ≥ " + tal(A) + " mm/h och yttemperatur < " + tal(B) + " °C samtidigt",
    villkor: (h, A, B) => h.nb >= A && h.t0 < B },
  rimfrost: { namn: "Rimfrost/frost", delar: ["t0", "t2", "rh"], A: null, B: { namn: "Yttemp <", enhet: "°C", std: 0 },
    text: (A, B) => "yttemperatur < " + tal(B) + " °C och under daggpunkten (2 m)",
    villkor: (h, A, B) => h.t0 < B && h.t0 < daggpunkt(h.t2, h.rh) },
  snofok: { namn: "Snöfok", delar: ["sno", "by"], A: { namn: "Snöfall ≥", enhet: "mm/h", std: 0.3 }, B: { namn: "Byvind ≥", enhet: "kt", std: 25 },
    text: (A, B) => "snöfall ≥ " + tal(A) + " mm/h och byvind ≥ " + tal(B) + " kt samtidigt",
    villkor: (h, A, B) => h.sno >= A && h.by >= B }
};
const tal = v => String(v).replace(".", ",");
// Daggpunkt (°C) ur temperatur (°C) och relativ fukt (%) - Magnus-formeln (a = 17,62, b = 243,12 °C)
function daggpunkt(t, rh) { if (!isFinite(t) || !(rh > 0)) return NaN; const g = Math.log(Math.min(100, rh) / 100) + 17.62 * t / (243.12 + t); return 243.12 * g / (17.62 - g); }

const komboAktiv = () => { const s = $("pKombo"); return s && KOMBO[s.value] ? KOMBO[s.value] : null; };
const komboA = () => parseFloat(($("pKomboA").value || "").replace(",", "."));
const komboB = () => parseFloat(($("pKomboB").value || "").replace(",", "."));

// Timmarna perioden behöver för fältet p (summa-fält: även steget före varje timme)
function komboTimmar(p) {
  let a = +$("pFran").value, b = +$("pTill").value; if (b < a) [a, b] = [b, a];
  const dt = +$("pDt").value || 1, L = []; for (let t = a; t <= b; t++) if (t % dt === 0 || t === a) L.push(t);
  if (PPARAM[p].agg !== "summa") return L;
  return [...new Set(L.flatMap(t => t - dt >= 0 ? [t - dt, t] : [t]))].sort((x, y) => x - y);
}

// Hämta alla ingående fält i tur och ordning
async function komboHamta(auto) {
  const K = komboAktiv(); if (!K || P.upptagen) return;
  try {
    for (const p of K.delar) {
      if (stoppad && P.komboStopp) break;
      P.vOverride = p; P.listaOverride = komboTimmar(p); P.komboStopp = true;
      status("Kombination " + K.namn + ": hämtar " + PPARAM[p].namn.split(",")[0].toLowerCase() + " …", "");
      await probHamta(auto === true);
    }
  } finally { P.vOverride = null; P.listaOverride = null; P.komboStopp = false; await probVisa(); }
}

// Sannolikheten för ett sparat område e (det första fältets rutnät). null om något saknas.
async function komboOmrade(e, K, A, B) {
  const o = { ...e, ny: (e.y1 - e.y0) / e.s + 1, nx: (e.x1 - e.x0) / e.s + 1 }, n = o.ny * o.nx, N = ENS_MEDL * n;
  let a = +$("pFran").value, b = +$("pTill").value; if (b < a) [a, b] = [b, a];
  const dt = +$("pDt").value || 1, L = []; for (let t = a; t <= b; t++) if (t % dt === 0 || t === a) L.push(t);
  const traff = new Uint16Array(N), harData = new Uint8Array(ENS_MEDL);
  for (const t of L) {
    const h = {}, sakn = {};
    for (const p of K.delar) {
      const pa = PPARAM[p], ms = SAKN[pa.bitar], T = pa.tabell;
      const d = await timData({ ...o, v: p }, t); if (!d) return null;
      const v = new Float32Array(N);
      if (pa.agg === "summa") {   // mangd per timme = (ack(t) - ack(t - dt)) / dt
        const f = t - dt >= 0 ? await timData({ ...o, v: p }, t - dt) : null; if (t - dt >= 0 && !f) return null;
        for (let i = 0; i < N; i++) v[i] = d[i] === ms || (f && f[i] === ms) ? NaN : Math.max(0, d[i] - (f ? f[i] : 0)) * pa.steg / (f ? dt : 1);
      } else for (let i = 0; i < N; i++) v[i] = d[i] === ms ? NaN : T ? T[d[i]] : d[i] * pa.steg;
      h[p] = v;
    }
    const rad = {};
    for (let i = 0; i < N; i++) {
      let ok = true; for (const p of K.delar) { const w = h[p][i]; if (!isFinite(w)) { ok = false; break; } rad[p] = w; }
      if (!ok) continue;
      harData[Math.floor(i / n)] = 1;
      if (K.villkor(rad, A, B)) traff[i]++;
    }
  }
  const ute = new Set(); for (let m = 0; m < ENS_MEDL; m++) if (!iUrval(m) || !harData[m]) ute.add(m);
  const nAnv = Math.max(1, ENS_MEDL - ute.size), prob = new Float32Array(n), agg = new Float32Array(N);
  for (let i = 0; i < N; i++) agg[i] = ute.has(Math.floor(i / n)) ? NaN : traff[i];
  for (let p = 0; p < n; p++) { let c = 0; for (let m = 0; m < ENS_MEDL; m++) if (!ute.has(m) && traff[m * n + p] > 0) c++; prob[p] = c / nAnv; }
  return { o, agg, prob, utan: [...ute].filter(m => iUrval(m)), nAnv, timmar: L.length };
}

// Ritar kombinationen (anropas från probVisa när en kombination är vald)
async function komboVisa(g, rensa) {
  const K = komboAktiv(), A = komboA(), B = komboB();
  if ((K.A && !isFinite(A)) || !isFinite(B)) { rensa(); return; }
  const kand = P.index.filter(e => e.dtg === P.dtg && e.v === K.delar[0]).sort((x, y) => y.s - x.s);
  const vis = []; let pmax = 0;
  for (const e of kand) { const r = await komboOmrade(e, K, A, B); if (r) vis.push(r); }
  if (!vis.length && (P.upptagen || P.autoVantar)) return;
  rensa();
  const rgb = PKLASS.map(([gr, c]) => [gr, parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
  for (const r of vis) {
    const { o, prob } = r;
    const cv = document.createElement("canvas"); cv.width = o.nx; cv.height = o.ny;
    const cx = cv.getContext("2d"), img = cx.createImageData(o.nx, o.ny), px = img.data;
    for (let y = 0; y < o.ny; y++) for (let x = 0; x < o.nx; x++) {
      const p = prob[y * o.nx + x]; if (p > pmax) pmax = p; const pr = p * 100; if (pr < rgb[0][0]) continue;
      let f = rgb[0]; for (const k of rgb) if (pr >= k[0]) f = k;
      const i = ((o.ny - 1 - y) * o.nx + x) * 4; px[i] = f[1]; px[i + 1] = f[2]; px[i + 2] = f[3]; px[i + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    g.appendChild(el("image", { href: cv.toDataURL(), x: o.x0 - o.s / 2, y: KY - 1 - o.y1 - o.s / 2, width: o.nx * o.s, height: o.ny * o.s,
      preserveAspectRatio: "none", style: "image-rendering:pixelated;image-rendering:crisp-edges" }));
  }
  P.siffKalla = vis.map(r => ({ o: r.o, d: r.prob, proc: true, lagre: false, enh: "%" }));
  setTimeout(ritaSiffror, 0);
  if (visaIso) for (const r of vis) for (const nv of isoProbNivaer()) {
    const d = isoSegment(r.prob, r.o, nv.v); if (!d) continue;
    g.appendChild(el("path", { d, fill: "none", stroke: c_isoKant(), "stroke-width": nv.bredd + 2.6, "vector-effect": "non-scaling-stroke", "stroke-linecap": "round", opacity: 0.85 }));
    g.appendChild(el("path", { d, fill: "none", stroke: c_iso(), "stroke-width": nv.bredd + 0.4, "stroke-dasharray": nv.streck, "vector-effect": "non-scaling-stroke", "stroke-linecap": "round" }));
    isoEtiketter(g, d, nv.namn ? nv.namn.replace(" %", "") : String(nv.v));
  }
  P.varden = vis.length ? { vis: vis.slice().reverse(), pa: PPARAM[K.delar[0]], visa: "sannolikhet", kombo: K } : null;
  let a = +$("pFran").value, b = +$("pTill").value; if (b < a) [a, b] = [b, a];
  if (!vis.length) {
    if (!P.upptagen && !P.fragar) status("Kombinationen " + K.namn + " behöver " + K.delar.map(p => PPARAM[p].namn.split(",")[0].toLowerCase()).join(", ") +
      " för perioden – tryck " + (fav ? "knappen igen" : "Hämta fält") + ".", "");
    $("pSam").textContent = ""; return;
  }
  $("pSam").textContent = K.namn + ": " + K.text(A, B) + " någon gång " + tidText(a) + " – " + tidText(b) + ". Högsta sannolikhet: " + Math.round(pmax * 100) + " %. Räknat per medlem och timme.";
}

function komboTips(e) {
  const V = P.varden, K = V.kombo, p = kartPunkt(e), fy = KY - 1 - p.y;
  for (const r of V.vis) {
    const o = r.o, y = Math.round((fy - o.y0) / o.s), x = Math.round((p.x - o.x0) / o.s);
    if (y < 0 || y >= o.ny || x < 0 || x >= o.nx) continue;
    const i = y * o.nx + x, n = o.ny * o.nx; let c = 0, tim = 0;
    for (let m = 0; m < ENS_MEDL; m++) { const w = r.agg[m * n + i]; if (isFinite(w) && w > 0) { c++; tim += w; } }
    const ll = franRuta(o.x0 + x * o.s, o.y0 + y * o.s);
    visaKTips(K.namn + ": " + Math.round(r.prob[i] * 100) + " % (" + c + " av " + r.nAnv + " medlemmar)\n" + K.text(komboA(), komboB()) +
      (c ? "\nI snitt " + (tim / c).toFixed(1).replace(".", ",") + " av " + r.timmar + " timmar för de medlemmar som når det" : "") +
      "\n" + ll.lat.toFixed(2) + "N " + ll.lon.toFixed(2) + "E (rutnät " + (o.s * 2.5).toLocaleString("sv-SE") + " km)", e.clientX + 14, e.clientY + 14);
    return;
  }
  $("kTips").hidden = true;
}

// Valet och tröskelrutorna
function komboSynka() {
  const K = komboAktiv(), fA = $("pKomboAFalt"), fB = $("pKomboBFalt");
  document.body.classList.toggle("kombo", !!K);
  fA.hidden = !K || !K.A; fB.hidden = !K;
  if (K) { if (K.A) $("pKomboAEt").textContent = K.A.namn + " (" + K.A.enhet + ")"; $("pKomboBEt").textContent = K.B.namn + " (" + K.B.enhet + ")";
    if ($("pVisa").value !== "sannolikhet") { $("pVisa").value = "sannolikhet"; } }
  $("pVisa").disabled = !!K; $("pParam").disabled = !!K;
}
function komboVal(nyckel, A, B) {   // anvands av vinterknapparna i Favoriter och av Dela
  $("pKombo").value = nyckel || ""; const K = komboAktiv();
  if (K) { $("pKomboA").value = A !== undefined ? A : K.A ? K.A.std : ""; $("pKomboB").value = B !== undefined ? B : K.B.std; }
  lagra("mt:pKombo", $("pKombo").value); komboSynka();
}
(function komboInit() {
  const s = $("pKombo"); s.add(new Option("– ingen –", ""));
  for (const k in KOMBO) s.add(new Option(KOMBO[k].namn, k));
  const sp = lasa("mt:pKombo") || ""; s.value = KOMBO[sp] ? sp : "";
  const K = komboAktiv(); if (K) { $("pKomboA").value = lasa("mt:pKomboA:" + s.value) || (K.A ? K.A.std : ""); $("pKomboB").value = lasa("mt:pKomboB:" + s.value) || K.B.std; }
  komboSynka();
  s.addEventListener("change", () => { const K = komboAktiv(); lagra("mt:pKombo", s.value);
    if (K) { $("pKomboA").value = lasa("mt:pKomboA:" + s.value) || (K.A ? K.A.std : ""); $("pKomboB").value = lasa("mt:pKomboB:" + s.value) || K.B.std; }
    komboSynka(); P.fragar = false; ritaOmrade(); probVisa().then(() => { if (komboAktiv() && !P.varden) autoHamta(); }); });
  for (const id of ["pKomboA", "pKomboB"]) $(id).addEventListener("input", () => { lagra("mt:" + id + ":" + s.value, $(id).value); probVisa(); });
})();
