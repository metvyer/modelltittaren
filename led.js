// ===================================================================
//  LEDSKIKT (NYTT 24/11, Jakob) - fliken "Ledskikt": radiovagornas brytning i atmosfaren
// ===================================================================
// For en punkt (klick pa kartan) hamtas MEPS medlem 0 (det-korningen, 2,5 km): temperatur och specifik fukt
// pa modellnivaerna fran ca 500 hPa ner till lagsta nivan (ca 10 m), marktryck, T2m och RH2m, alla timmar.
// Per timme raknas:
//   e  = vattenangans tryck ur q och p                    (hPa)
//   N  = 77,6*P/T + 3,73e5*e/T^2                          (refraktivitet, P och e i hPa, T i K)
//   M  = N + 0,157*z                                      (modifierad refraktivitet, z i m over modellens mark)
//   z  = hypsometriskt uppat fran marken med virtuell temperatur (T2m vid marken)
// Gradienten galler for SKIKTET mellan tva nivaer (ritas som ett band, inte en punkt). dM/dz byter tecken pa
// en nivå (dar M har max/min) - darfor hamnar ledskiktens topp och bas pa nivaerna, utan pahittad precision.
// Klasser (dN/dz i N/km): sub > 0, normal 0..-79, super -79..-157, ledskikt (trapping) < -157 (= dM/dz < 0).
// Uppdelning: T-delen (temperatur + tryck) och fuktdelen ur de partiella derivatorna i skiktets mitt.
// 2 m-punkten (T2m, RH2m) ar DIAGNOSTISK (interpolerad i modellen mellan marken och lagsta nivan) - visas
// ljusare/streckad och kan stangas av. Avdunstningsledskiktet over hav (under ca 10 m) kommer i steg 2.
// Zoom: mushjul/dra/nyp i alla diagram, synkat (gemensam hojdaxel; tidsaxeln i tid-hojd). Dubbelklick = aterstall.
const LED_KLASS = [   // [ovre grans dN/dz (N/km), farg, namn]
  [-300, "#991b1b", "Starkt ledskikt (dN/dz < −300)"],
  [-157, "#f87171", "Ledskikt / trapping (dN/dz < −157, dM/dz < 0)"],
  [-79, "#fcd34d", "Superrefraktion (−157 till −79)"],
  [0, null, "Normal (−79 till 0)"],
  [1e9, "#93c5fd", "Subrefraktion (dN/dz > 0)"]];
const ledKlass = g => { for (const k of LED_KLASS) if (g < k[0]) return k; return LED_KLASS[LED_KLASS.length - 1]; };
const LED_PTOPP = 480e2;   // hamta upp till ca 480 hPa (ca 5-6 km)
let LED = (() => { let o = {}; try { o = JSON.parse(lasa("mt:led") || "{}"); } catch (e) {}
  return { lat: o.lat || 59.78, lon: o.lon || 21.37, visa: o.visa || "farg", komp: o.komp || "tot", topp: o.topp || 2000, med2: o.med2 !== false,
    t: null, z0: 0, z1: o.topp || 2000, tA: 0, tB: null, data: null, dtg: "", hamtar: 0 }; })();
const ledSpara = () => lagra("mt:led", JSON.stringify({ lat: LED.lat, lon: LED.lon, visa: LED.visa, komp: LED.komp, topp: LED.topp, med2: LED.med2 }));
const ledStatus = t => { const e = $("ledStatus"); if (e) e.textContent = t || ""; };
const ledFL = p => (1 - Math.pow(p / 101325, 0.190284)) * 145366.45 / 100;   // Pa -> flygniva (ISA)
const ledEs = tc => 6.112 * Math.exp(17.62 * tc / (243.12 + tc));             // mattnadstryck over vatten (hPa)
const ledKomma = (v, d) => isFinite(v) ? v.toFixed(d).replace(".", ",").replace("-", "−") : "–";
function ledTidText(t) { if (!M0F.t0) return "+" + t; const d = new Date(M0F.t0 + t * 3600e3); return VECKODAG[d.getUTCDay()] + " " + p2(d.getUTCDate()) + "/" + (d.getUTCMonth() + 1) + " " + p2(d.getUTCHours()) + "Z (+" + t + ")"; }

// ---------------- hamtning ----------------
async function ledHamta(nr) {
  const r = ruta(LED.lat, LED.lon); if (!r) throw new Error("punkten ligger utanför MEPS");
  const ab = await expAB(), nt = M0F.nt;
  let kTop = 0; for (let k = 0; k < ab.ap.length; k++) if (ab.ap[k] + ab.b[k] * 101325 >= LED_PTOPP) { kTop = Math.max(0, k - 1); break; }
  const nk = EXP_NIV - kTop, yx = "[" + r.iy + "][" + r.ix + "]", kk = "[" + kTop + ":" + (EXP_NIV - 1) + "]";
  // i bitar om 12 timmar parallellt (thredds ar langsamt pa langa tidsserier av modellnivaer)
  const BIT = 12, bitar = []; for (let a = 0; a < nt; a += BIT) bitar.push([a, Math.min(nt - 1, a + BIT - 1)]);
  let klara = 0;
  const delar = await Promise.all(bitar.map(async ([a, b]) => { const tt = "[" + a + ":" + b + "]";
    const fraga = ["air_temperature_ml" + tt + kk + yx, "specific_humidity_ml" + tt + kk + yx, "surface_air_pressure" + tt + "[0]" + yx,
      "air_temperature_2m" + tt + "[0]" + yx, "relative_humidity_2m" + tt + "[0]" + yx].join(",");
    let res = await hamta(BAS + FIL(M0F.dtg) + ".ascii?" + enc(fraga)); if (res.st !== 200) res = await hamta(BAS + FIL(M0F.dtg) + ".ascii?" + enc(fraga));
    if (res.st !== 200) throw new Error("svar " + res.st);
    const d = tolka(res.txt); if (!d.air_temperature_ml || !d.surface_air_pressure) throw new Error("oväntat svar");
    klara++; if (nr === LED.hamtar) ledLaddar(klara, bitar.length); return d; }));
  const ihop = n => { const u = []; for (const d of delar) { if (!d[n]) return null; for (const v of d[n]) u.push(v); } return Float64Array.from(u); };
  const d = { air_temperature_ml: ihop("air_temperature_ml"), specific_humidity_ml: ihop("specific_humidity_ml"), surface_air_pressure: ihop("surface_air_pressure"),
    air_temperature_2m: ihop("air_temperature_2m"), relative_humidity_2m: ihop("relative_humidity_2m") };
  const ll = franRuta(r.ix, r.iy);
  return { dtg: M0F.dtg, nt, kTop, nk, ab, iy: r.iy, ix: r.ix, glat: ll.lat, glon: ll.lon, T: d.air_temperature_ml, q: d.specific_humidity_ml, ps: d.surface_air_pressure,
    t2: d.air_temperature_2m, rh2: d.relative_humidity_2m, prof: [] };
}
// en timmes profil: punkter nerifran och upp + skikten mellan dem
function ledProfil(D, t) {
  const ps = D.ps[t]; if (!(ps > 0)) return null;
  const t2 = D.t2 ? D.t2[t] : NaN, rh2 = D.rh2 ? Math.max(0.01, Math.min(1, D.rh2[t] > 1.5 ? D.rh2[t] / 100 : D.rh2[t])) : NaN;
  const e2 = isFinite(t2) && isFinite(rh2) ? rh2 * ledEs(t2 - 273.15) : NaN, q2 = isFinite(e2) ? 0.622 * e2 / (ps / 100 - 0.378 * e2) : 0;
  const tvS = (isFinite(t2) ? t2 : D.T[t * D.nk + D.nk - 1]) * (1 + 0.608 * q2);
  const pt = [];
  if (isFinite(e2)) { const p = ps * Math.exp(-G0 * 2 / (RD * tvS)); pt.push({ z: 2, p, T: t2, e: e2, diag: true }); }
  let zf = 0, pf = ps, tvf = tvS;
  for (let k = EXP_NIV - 1; k >= D.kTop; k--) {
    const j = t * D.nk + (k - D.kTop), T = D.T[j], q = D.q ? D.q[j] : 0; if (!isFinite(T)) continue;
    const p = D.ab.ap[k] + D.ab.b[k] * ps, tv = T * (1 + 0.608 * q), z = zf + RD / G0 * (tv + tvf) / 2 * Math.log(pf / p);
    pt.push({ z, p, T, e: q * (p / 100) / (0.622 + 0.378 * q), niv: k }); zf = z; pf = p; tvf = tv;
  }
  for (const a of pt) { const P = a.p / 100; a.N = 77.6 * P / a.T + 3.73e5 * a.e / (a.T * a.T); a.M = a.N + 0.157 * a.z;
    a.Td = a.e > 0 ? (243.12 * Math.log(a.e / 6.112)) / (17.62 - Math.log(a.e / 6.112)) : NaN; a.FL = ledFL(a.p); }
  return { ps, pt };
}
// skikten for vald uppsattning punkter (med eller utan 2 m)
function ledSkikt(pr, med2) {
  const pt = med2 ? pr.pt : pr.pt.filter(a => !a.diag), sk = [];
  for (let i = 0; i + 1 < pt.length; i++) {
    const a = pt[i], b = pt[i + 1], dz = b.z - a.z; if (!(dz > 0)) continue;
    const Tm = (a.T + b.T) / 2, Pm = (a.p + b.p) / 200, em = (a.e + b.e) / 2;
    const dNdT = -77.6 * Pm / (Tm * Tm) - 2 * 3.73e5 * em / (Tm * Tm * Tm), dNdP = 77.6 / Tm, dNde = 3.73e5 / (Tm * Tm);
    const g = (b.N - a.N) / dz * 1000, gT = (dNdT * (b.T - a.T) + dNdP * (b.p - a.p) / 100) / dz * 1000, gQ = dNde * (b.e - a.e) / dz * 1000;
    sk.push({ z0: a.z, z1: b.z, g, gT, gQ, dM: g + 157, diag: !!(a.diag || b.diag) });
  }
  return { pt, sk };
}
// ledskikt: trappinglagrets topp/bas, ledskiktets bas (dar M = M i toppen), styrka och typ
function ledLedskikt(P) {
  const { pt, sk } = P, ut = [];
  for (let i = 0; i < sk.length; i++) {
    if (!(sk[i].dM < 0) || (i + 1 < sk.length && sk[i + 1].dM < 0)) continue;   // i = oversta skiktet med dM < 0
    let b = i; while (b > 0 && sk[b - 1].dM < 0) b--;
    const topp = pt[i + 1], tb = pt[b], Mt = topp.M;
    let bas = 0, ytb = true;
    for (let j = b; j > 0; j--) { if (pt[j - 1].M <= Mt) { const a = pt[j - 1], c = pt[j]; bas = a.z + (c.z - a.z) * (Mt - a.M) / (c.M - a.M); ytb = false; break; } }
    const typ = b === 0 ? "Ytledskikt" : ytb ? "Ytbaserat" : "Upplyft";
    ut.push({ typ, tz0: tb.z, tz1: topp.z, bas, topp: topp.z, dM: tb.M - Mt, d: topp.z - bas, diag: sk[b].diag && b === 0 && i === 0, FL: topp.FL });
  }
  return ut;
}
function ledBerakna(D) { D.prof = []; for (let t = 0; t < D.nt; t++) D.prof.push(ledProfil(D, t)); }

// ---------------- geometri och axlar (gemensamma for alla diagram) ----------------
function ledY(G, z) { return G.yB - (z - LED.z0) / (LED.z1 - LED.z0) * (G.yB - G.yT); }
function ledZ(G, y) { return LED.z0 + (G.yB - y) / (G.yB - G.yT) * (LED.z1 - LED.z0); }
const ledStegM = sp => { for (const s of [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000]) if (sp / s <= 9) return s; return 5000; };
const ledStegFL = sp => { for (const s of [1, 2, 5, 10, 20, 25, 50, 100]) if (sp / s <= 9) return s; return 200; };
const ledFarg = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || "#888";
// hojdaxlar: meter over modellens mark till vanster, FL (ur vald timmes tryck) till hoger
function ledAxlar(S, G, pr) {
  const fg = ledFarg("--fg"), dim = ledFarg("--dim"), grid = ledFarg("--grid");
  const sm = ledStegM(LED.z1 - LED.z0);
  for (let z = Math.ceil(LED.z0 / sm) * sm; z <= LED.z1; z += sm) { const y = ledY(G, z);
    S.appendChild(el("line", { x1: G.xL, x2: G.xR, y1: y, y2: y, stroke: grid, "stroke-width": 0.5 }));
    S.appendChild(el("text", { x: G.xL - 4, y: y + 3, "font-size": 10, "text-anchor": "end", fill: dim }, String(Math.round(z)))); }
  S.appendChild(el("text", { x: 2, y: G.yT - 10, "font-size": 9.5, fill: dim }, "m ö. mark"));
  if (pr && pr.pt.length > 1) {   // FL: hojden dar FL-vardet nas, interpolerat langs profilen
    const P = pr.pt, fl0 = ledFL(pr.ps), zFL = f => { if (f <= fl0) return 0; for (let i = 0; i + 1 < P.length; i++) if (P[i + 1].FL >= f) { const a = P[i], b = P[i + 1]; return a.z + (b.z - a.z) * (f - a.FL) / (b.FL - a.FL || 1); }
      return NaN; };
    const top = P[P.length - 1];
    const f0 = Math.max(fl0, interpFL(P, LED.z0, pr.ps)), f1 = Math.min(top.FL, interpFL(P, LED.z1, pr.ps)), st = ledStegFL(f1 - f0);
    for (let f = Math.ceil(f0 / st) * st; f <= f1; f += st) { const z = zFL(f); if (!isFinite(z)) continue; const y = ledY(G, z);
      S.appendChild(el("line", { x1: G.xR, x2: G.xR + 4, y1: y, y2: y, stroke: dim }));
      S.appendChild(el("text", { x: G.xR + 6, y: y + 3, "font-size": 10, fill: dim }, "FL" + String(Math.round(f)).padStart(3, "0"))); }
  }
  S.appendChild(el("line", { x1: G.xL, x2: G.xL, y1: G.yT, y2: G.yB, stroke: fg })); S.appendChild(el("line", { x1: G.xR, x2: G.xR, y1: G.yT, y2: G.yB, stroke: fg }));
  S.appendChild(el("line", { x1: G.xL, x2: G.xR, y1: G.yB, y2: G.yB, stroke: fg }));
}
function interpFL(P, z, ps) { if (z <= 0) return ledFL(ps); for (let i = 0; i + 1 < P.length; i++) if (P[i + 1].z >= z) { const a = P[i], b = P[i + 1]; return a.FL + (b.FL - a.FL) * (z - a.z) / (b.z - a.z || 1); } return P[P.length - 1].FL; }
function ledKlipp(S, G, id) {   // klipp ritningen till plottytan
  const defs = el("defs"), cp = el("clipPath", { id }); cp.appendChild(el("rect", { x: G.xL, y: G.yT, width: G.xR - G.xL, height: G.yB - G.yT })); defs.appendChild(cp); S.appendChild(defs);
  const g = el("g", { "clip-path": "url(#" + id + ")" }); S.appendChild(g); return g;
}

// ---------------- tid-hojd ----------------
function ledRitaTH(svgId, falt, rubrik) {
  const S = $(svgId), D = LED.data; if (!S || !D) return; S.textContent = "";
  const W = 900, H = 300, G = { xL: 58, xR: W - 54, yT: 20, yB: H - 30 }; S.setAttribute("viewBox", "0 0 " + W + " " + H); S._G = G; S._typ = "th";
  const tA = LED.tA, tB = LED.tB, xT = t => G.xL + (t - tA + 0.5) / (tB - tA + 1) * (G.xR - G.xL), bw = (G.xR - G.xL) / (tB - tA + 1);
  S._xT = xT; S._tFranX = x => tA - 0.5 + (x - G.xL) / (G.xR - G.xL) * (tB - tA + 1);
  ledAxlar(S, G, D.prof[LED.t]);
  const g = ledKlipp(S, G, "klip" + svgId);
  for (let t = Math.max(0, Math.floor(tA)); t <= Math.min(D.nt - 1, Math.ceil(tB)); t++) {
    const pr = D.prof[t]; if (!pr) continue; const P = ledSkikt(pr, LED.med2), x0 = xT(t) - bw / 2;
    for (const s of P.sk) { if (s.z1 < LED.z0 || s.z0 > LED.z1) continue; const k = ledKlass(s[falt]); if (!k[1]) continue;
      const y1 = ledY(G, s.z1), y0 = ledY(G, s.z0);
      g.appendChild(el("rect", { x: x0, y: y1, width: bw + 0.3, height: Math.max(0.5, y0 - y1), fill: k[1], opacity: s.diag ? 0.45 : 0.9 })); }
    if (falt === "g") for (let i = 0; i + 1 < P.sk.length; i++) {   // skarp linje dar dM/dz byter tecken (pa nivan)
      if ((P.sk[i].dM < 0) === (P.sk[i + 1].dM < 0)) continue; const y = ledY(G, P.sk[i].z1);
      g.appendChild(el("line", { x1: x0, x2: x0 + bw, y1: y, y2: y, stroke: "#000", "stroke-width": 2 })); }
    if (falt === "g" && P.sk.length && P.sk[0].dM < 0) { const y = ledY(G, P.sk[0].z0); g.appendChild(el("line", { x1: x0, x2: x0 + bw, y1: y, y2: y, stroke: "#000", "stroke-width": 2, "stroke-dasharray": "3 2" })); }
  }
  // tidsaxel
  const dim = ledFarg("--dim"), st = (tB - tA) > 40 ? 6 : (tB - tA) > 16 ? 3 : 1;
  for (let t = Math.ceil(tA); t <= tB; t++) { if (t < 0 || t >= D.nt) continue; const dd = new Date(M0F.t0 + t * 3600e3), h = dd.getUTCHours(); if (h % st) continue;
    S.appendChild(el("line", { x1: xT(t), x2: xT(t), y1: G.yB, y2: G.yB + 4, stroke: dim }));
    S.appendChild(el("text", { x: xT(t), y: G.yB + 15, "font-size": 10, "text-anchor": "middle", fill: h === 0 ? ledFarg("--fg") : dim, "font-weight": h === 0 ? 700 : 400 }, h === 0 ? VECKODAG[dd.getUTCDay()] + " " + dd.getUTCDate() : p2(h))); }
  // vald timme
  if (LED.t >= tA - 0.5 && LED.t <= tB + 0.5) S.appendChild(el("rect", { x: xT(LED.t) - bw / 2, y: G.yT, width: bw, height: G.yB - G.yT, fill: "none", stroke: "#2563eb", "stroke-width": 1.6 }));
  S.appendChild(el("text", { x: G.xL + 60, y: 13, "font-size": 11.5, "font-weight": 700, fill: ledFarg("--fg") }, rubrik));
}

// ---------------- profilen (termodynamik + gradient) ----------------
function ledRitaProfil() {
  const D = LED.data, S = $("ledProfSvg"), S2 = $("ledGradSvg"); if (!D || !S) return;
  const pr = D.prof[LED.t]; S.textContent = ""; S2.textContent = "";
  const bredvid = LED.visa === "bredvid"; $("ledGradRam").hidden = !bredvid; $("ledGradRam").parentElement.classList.toggle("en", !bredvid);
  if (!pr) { S.appendChild(el("text", { x: 20, y: 30 }, "Timmen saknas.")); return; }
  const P = ledSkikt(pr, LED.med2);
  // --- termodynamiskt diagram (T och Td mot hojd) ---
  const W = 440, H = 420, G = { xL: 58, xR: W - 54, yT: 22, yB: H - 32 }; S.setAttribute("viewBox", "0 0 " + W + " " + H); S._G = G; S._typ = "prof";
  const syns = P.pt.filter(a => a.z >= LED.z0 - 1 && a.z <= LED.z1 + 1); let tmin = 1e9, tmax = -1e9;
  for (const a of (syns.length ? syns : P.pt)) { tmin = Math.min(tmin, a.T - 273.15, isFinite(a.Td) ? a.Td : 1e9); tmax = Math.max(tmax, a.T - 273.15); }
  tmin = Math.floor((tmin - 2) / 5) * 5; tmax = Math.ceil((tmax + 2) / 5) * 5; if (tmax - tmin < 10) tmax = tmin + 10;
  const xT = c => G.xL + (c - tmin) / (tmax - tmin) * (G.xR - G.xL);
  ledAxlar(S, G, pr);
  const g = ledKlipp(S, G, "klipLedProf");
  if (!bredvid) for (const s of P.sk) { const k = ledKlass(s.g); if (!k[1]) continue; const y1 = ledY(G, s.z1), y0 = ledY(G, s.z0);
    g.appendChild(el("rect", { x: G.xL, y: y1, width: G.xR - G.xL, height: Math.max(0.5, y0 - y1), fill: k[1], opacity: s.diag ? 0.3 : 0.55 })); }
  for (let i = 0; i + 1 < P.sk.length; i++) { if ((P.sk[i].dM < 0) === (P.sk[i + 1].dM < 0)) continue; const y = ledY(G, P.sk[i].z1);
    g.appendChild(el("line", { x1: G.xL, x2: G.xR, y1: y, y2: y, stroke: "#000", "stroke-width": 2 })); }
  const dim = ledFarg("--dim");
  for (let c = tmin; c <= tmax; c += (tmax - tmin > 30 ? 10 : 5)) { S.appendChild(el("text", { x: xT(c), y: G.yB + 14, "font-size": 10, "text-anchor": "middle", fill: c < 0 ? "#2563eb" : c > 0 ? "#dc2626" : dim }, String(c).replace("-", "−")));
    g.appendChild(el("line", { x1: xT(c), x2: xT(c), y1: G.yT, y2: G.yB, stroke: c === 0 ? "#2563eb" : ledFarg("--grid"), "stroke-width": c === 0 ? 0.9 : 0.4 })); }
  S.appendChild(el("text", { x: (G.xL + G.xR) / 2, y: H - 4, "font-size": 10, "text-anchor": "middle", fill: dim }, "°C – röd T, grön Td"));
  const linje = (f, farg, streck, w) => { let d = "", d2 = "";
    for (const a of P.pt) { const v = f(a); if (!isFinite(v)) continue; const s = xT(v).toFixed(1) + " " + ledY(G, a.z).toFixed(1); if (a.diag) d2 = "M" + s; else { if (d2 && !d) d2 += "L" + s; d += (d ? "L" : "M") + s; } }
    g.appendChild(el("path", { d, fill: "none", stroke: farg, "stroke-width": w, "stroke-dasharray": streck || null }));
    if (d2.includes("L")) g.appendChild(el("path", { d: d2, fill: "none", stroke: farg, "stroke-width": w, "stroke-dasharray": "2 3", opacity: 0.6 })); };
  linje(a => a.T - 273.15, "#dc2626", null, 2); linje(a => a.Td, "#16a34a", "6 3", 1.8);
  for (const a of P.pt) if (a.z >= LED.z0 && a.z <= LED.z1) g.appendChild(el("circle", { cx: xT(a.T - 273.15), cy: ledY(G, a.z), r: a.diag ? 2.6 : 1.4, fill: a.diag ? "#fff" : "#dc2626", stroke: "#dc2626", "stroke-width": a.diag ? 1 : 0 }));
  // tipsrader per skikt
  for (const s of P.sk) { if (s.z1 < LED.z0 || s.z0 > LED.z1) continue; const y1 = ledY(G, s.z1), y0 = ledY(G, s.z0);
    const r = el("rect", { x: G.xL, y: y1, width: G.xR - G.xL, height: Math.max(1, y0 - y1), fill: "transparent" }), ti = el("title");
    ti.textContent = ledTipsSkikt(s); r.appendChild(ti); g.appendChild(r); }
  S.appendChild(el("text", { x: G.xR, y: 12, "font-size": 11.5, "font-weight": 700, "text-anchor": "end", fill: ledFarg("--fg") }, ledTidText(LED.t)));
  // --- gradient + M bredvid ---
  if (bredvid) {
    const W2 = 380; S2.setAttribute("viewBox", "0 0 " + W2 + " " + H); const G2 = { xL: 14, xR: W2 - 54, yT: 22, yB: H - 32 }; S2._G = G2; S2._typ = "prof";
    const gMin = -400, gMax = 100, xG = v => G2.xL + (Math.max(gMin, Math.min(gMax, v)) - gMin) / (gMax - gMin) * (G2.xR - G2.xL);
    ledAxlar(S2, G2, pr); [...S2.querySelectorAll("text")].forEach(t => { if (+t.getAttribute("x") < G2.xL) t.remove(); });   // meter star redan till vanster om termodiagrammet
    const g2 = ledKlipp(S2, G2, "klipLedGrad");
    for (const k of [[-1e9, -157, "#f87171"], [-157, -79, "#fcd34d"], [0, 1e9, "#93c5fd"]]) g2.appendChild(el("rect", { x: xG(k[0]), y: G2.yT, width: xG(k[1]) - xG(k[0]), height: G2.yB - G2.yT, fill: k[2], opacity: 0.25 }));
    for (const v of [-300, -157, -79, 0]) { g2.appendChild(el("line", { x1: xG(v), x2: xG(v), y1: G2.yT, y2: G2.yB, stroke: v === 0 || v === -157 ? "#444" : ledFarg("--grid"), "stroke-width": 0.8 }));
      S2.appendChild(el("text", { x: xG(v), y: G2.yB + 14, "font-size": 9.5, "text-anchor": "middle", fill: dim }, String(v).replace("-", "−"))); }
    S2.appendChild(el("text", { x: (G2.xL + G2.xR) / 2, y: H - 4, "font-size": 10, "text-anchor": "middle", fill: dim }, "dN/dz N/km (−157 = dM/dz 0) · lila M"));
    const steg = (f, farg, w, op) => { let d = ""; for (const s of P.sk) { const x = xG(f(s)).toFixed(1); d += (d ? "L" : "M") + x + " " + ledY(G2, s.z0).toFixed(1) + "L" + x + " " + ledY(G2, s.z1).toFixed(1); }
      g2.appendChild(el("path", { d, fill: "none", stroke: farg, "stroke-width": w, opacity: op || 1 })); };
    if (LED.komp === "tq") { steg(s => s.gT, "#dc2626", 1.4); steg(s => s.gQ, "#2563eb", 1.4); }
    steg(s => s.g, "#111", 2);
    // M-kurvan (egen skala over synliga punkter)
    const syn = P.pt.filter(a => a.z >= LED.z0 && a.z <= LED.z1); if (syn.length > 1) { let m0 = 1e9, m1 = -1e9; for (const a of syn) { m0 = Math.min(m0, a.M); m1 = Math.max(m1, a.M); }
      const xM = m => G2.xL + 6 + (m - m0) / (m1 - m0 || 1) * (G2.xR - G2.xL - 12); let d = ""; for (const a of P.pt) d += (d ? "L" : "M") + xM(a.M).toFixed(1) + " " + ledY(G2, a.z).toFixed(1);
      g2.appendChild(el("path", { d, fill: "none", stroke: "#7c3aed", "stroke-width": 1.4, "stroke-dasharray": "5 2" }));
      S2.appendChild(el("text", { x: G2.xL + 2, y: 14, "font-size": 9.5, fill: "#7c3aed" }, "M " + Math.round(m0) + "–" + Math.round(m1))); }
    for (const s of P.sk) { if (s.z1 < LED.z0 || s.z0 > LED.z1) continue; const y1 = ledY(G2, s.z1), y0 = ledY(G2, s.z0);
      const r = el("rect", { x: G2.xL, y: y1, width: G2.xR - G2.xL, height: Math.max(1, y0 - y1), fill: "transparent" }), ti = el("title"); ti.textContent = ledTipsSkikt(s); r.appendChild(ti); g2.appendChild(r); }
  }
  // --- ledskikten i text ---
  const L = ledLedskikt(P), lt = $("ledLista");
  lt.innerHTML = L.length ? "<b>Ledskikt " + ledTidText(LED.t) + ":</b><ul>" + L.map(d => "<li>" + d.typ + ": bas " + Math.round(d.bas) + " m, topp " + Math.round(d.topp) + " m (FL" + String(Math.round(d.FL)).padStart(3, "0") + "), tjocklek " + Math.round(d.d) +
    " m, styrka ΔM " + ledKomma(d.dM, 1) + (d.diag ? " <span class='dim'>(bara mellan 2 m och lägsta nivån – diagnostiskt, osäkert)</span>" : "") + "</li>").join("") + "</ul>"
    : "<b>Inga ledskikt</b> (dM/dz < 0) " + ledTidText(LED.t) + " i modellens nivåer" + (LED.med2 ? " (2 m medräknad)" : "") + ".";
}
function ledTipsSkikt(s) {
  const k = ledKlass(s.g);
  return Math.round(s.z0) + "–" + Math.round(s.z1) + " m" + (s.diag ? " (2 m, diagnostiskt)" : "") + "\n" + k[2] + "\ndN/dz " + ledKomma(s.g, 0) + " N/km (temperatur+tryck " + ledKomma(s.gT, 0) + ", fukt " + ledKomma(s.gQ, 0) + ")\ndM/dz " + ledKomma(s.dM, 0) + " M/km";
}

// lila sikte pa kartan: fast storlek i skarmpixlar, vit kant (syns over de grona forhamtade punkterna)
function ledMarkor() {
  const g = $("kLed"), svg = $("karta"); if (!g) return; g.textContent = ""; if (lage !== "led") return;
  const r = ruta(LED.lat, LED.lon); if (!r) return;
  const s = vb.w / Math.max(1, svg.clientWidth), x = r.ix, y = KY - 1 - r.iy, R = 11 * s, L = 20 * s;
  const d = "M" + (x - L) + " " + y + "H" + (x - R * 0.45) + "M" + (x + R * 0.45) + " " + y + "H" + (x + L) + "M" + x + " " + (y - L) + "V" + (y - R * 0.45) + "M" + x + " " + (y + R * 0.45) + "V" + (y + L);
  for (const [f, w] of [["#fff", 6], ["#7c3aed", 3]]) { g.appendChild(el("circle", { cx: x, cy: y, r: R, fill: "none", stroke: f, "stroke-width": w, "vector-effect": "non-scaling-stroke" }));
    g.appendChild(el("path", { d, stroke: f, "stroke-width": w, "vector-effect": "non-scaling-stroke" })); }
  g.appendChild(el("circle", { cx: x, cy: y, r: 2 * s, fill: "#7c3aed", stroke: "#fff", "stroke-width": 1, "vector-effect": "non-scaling-stroke" }));
}
// ---------------- allt ----------------
function ledRita() {
  if (lage !== "led" || !LED.data) return;
  const D = LED.data; if (LED.tB === null || LED.tB > D.nt - 1) { LED.tA = 0; LED.tB = D.nt - 1; }
  if (LED.komp === "tq") { $("ledTH2").hidden = false; ledRitaTH("ledTH", "gT", "Temperaturbidrag (inkl. tryck) dN/dz"); ledRitaTH("ledTH2", "gQ", "Fuktbidrag dN/dz"); }
  else { $("ledTH2").hidden = true; ledRitaTH("ledTH", "g", "dN/dz – svart linje: dM/dz = 0 (ledskiktets topp/bas)"); }
  ledRitaProfil();
  $("ledTid").textContent = ledTidText(LED.t); $("ledReglage").max = D.nt - 1; $("ledReglage").value = LED.t;
  ledMarkor();
}
let ledRaf = 0; const ledRitaSnart = () => { if (!ledRaf) ledRaf = requestAnimationFrame(() => { ledRaf = 0; ledRita(); }); };
// laddningslage: snurra + stapel i status, gamla diagram slacks
function ledLaddar(klara, av) {
  document.body.classList.toggle("ledLaddar", klara !== null);
  const e = $("ledStatus"); if (!e) return; if (klara === null) return;
  e.innerHTML = "<span class='ledsnurr'></span> Hämtar " + (av ? klara + " av " + av + " delar (12 timmar var, alla nivåer upp till ca 5 km)" : "…") +
    (av ? " <span class='ledstapel'><i style='width:" + Math.round(klara / av * 100) + "%'></i></span>" : "");
}
async function ledUppdatera() {
  if (lage !== "led") return;
  if (!await m0Korning()) { ledStatus("Hittade ingen körning."); return; }
  $("ledKorn").textContent = M0F.dtg + " (MEPS medlem 0, 2,5 km)";
  if (LED.data && LED.data.dtg === M0F.dtg && LED.data.ry === LED.lat && LED.data.rx === LED.lon) { ledRita(); return; }
  const nyckel = M0F.dtg + ":" + LED.lat + ":" + LED.lon; if (LED.pagar === nyckel) return;   // samma hamtning pagar redan
  LED.pagar = nyckel; const nr = ++LED.hamtar, t0 = performance.now();
  $("ledPlats").textContent = (platsNamn(LED.lat, LED.lon) || "") + " " + LED.lat.toFixed(2) + ", " + LED.lon.toFixed(2);
  ledLaddar(0, Math.ceil(M0F.nt / 12));
  try {
    const D = await ledHamta(nr); if (nr !== LED.hamtar) return;
    D.ry = LED.lat; D.rx = LED.lon; ledBerakna(D); LED.data = D;
    if (LED.t === null || LED.t >= D.nt) LED.t = Math.max(0, Math.min(D.nt - 1, Math.round((Date.now() - M0F.t0) / 3600e3)));
    LED.tA = 0; LED.tB = D.nt - 1;
    $("ledPlats").textContent = (platsNamn(D.glat, D.glon) || "") + " " + D.glat.toFixed(2) + ", " + D.glon.toFixed(2);
    ledLaddar(null); ledStatus("Klart på " + ((performance.now() - t0) / 1000).toFixed(1) + " s (" + D.nt + " timmar, nivå " + D.kTop + "–64).");
    ledRita();
  } catch (e) { if (nr === LED.hamtar) { ledLaddar(null); ledStatus("Kunde inte hämta (" + e.message + ")."); } }
  finally { if (nr === LED.hamtar) LED.pagar = ""; }
}

// ---------------- zoom (synkad) ----------------
function ledNollstall() { LED.z0 = 0; LED.z1 = LED.topp; if (LED.data) { LED.tA = 0; LED.tB = LED.data.nt - 1; } ledRitaSnart(); }
function ledBegransa() {
  const maxZ = 5500, sp = Math.max(20, Math.min(maxZ, LED.z1 - LED.z0));
  if (LED.z0 < 0) LED.z0 = 0; LED.z1 = LED.z0 + sp; if (LED.z1 > maxZ) { LED.z1 = maxZ; LED.z0 = maxZ - sp; }
  if (LED.data) { const n = LED.data.nt, ts = Math.max(3, Math.min(n, LED.tB - LED.tA)); if (LED.tA < 0) LED.tA = 0; LED.tB = LED.tA + ts; if (LED.tB > n - 1) { LED.tB = n - 1; LED.tA = Math.max(0, LED.tB - ts); } }
}
function ledZoomKoppla(S) {
  const vbP = ev => { const r = S.getBoundingClientRect(), vb = S.viewBox.baseVal; return { x: (ev.clientX - r.left) / r.width * vb.width, y: (ev.clientY - r.top) / r.height * vb.height }; };
  S.addEventListener("wheel", ev => { const G = S._G; if (!G) return; ev.preventDefault(); const p = vbP(ev), f = Math.exp(ev.deltaY * 0.0015);
    if (ev.shiftKey && S._typ === "th") { const tc = S._tFranX(p.x); LED.tA = tc - (tc - LED.tA) * f; LED.tB = tc + (LED.tB - tc) * f; }
    else { const zc = Math.max(0, ledZ(G, p.y)); LED.z0 = zc - (zc - LED.z0) * f; LED.z1 = zc + (LED.z1 - zc) * f; }
    ledBegransa(); ledRitaSnart(); }, { passive: false });
  const pek = new Map(); let start = null, drog = false;
  S.addEventListener("pointerdown", ev => { pek.set(ev.pointerId, vbP(ev)); S.setPointerCapture(ev.pointerId); drog = false;
    start = { z0: LED.z0, z1: LED.z1, tA: LED.tA, tB: LED.tB, p: vbP(ev), avst: null };
    if (pek.size === 2) { const [a, b] = [...pek.values()]; start.avst = Math.max(10, Math.abs(a.y - b.y)); start.mid = (a.y + b.y) / 2; start.avstX = Math.max(10, Math.abs(a.x - b.x)); start.midX = (a.x + b.x) / 2; } });
  S.addEventListener("pointermove", ev => { if (!pek.has(ev.pointerId) || !start) return; const G = S._G; pek.set(ev.pointerId, vbP(ev));
    if (pek.size === 2 && start.avst) { const [a, b] = [...pek.values()], f = start.avst / Math.max(10, Math.abs(a.y - b.y)), sp = (start.z1 - start.z0) * f;
      const zc = start.z0 + (G.yB - start.mid) / (G.yB - G.yT) * (start.z1 - start.z0); LED.z0 = zc - (zc - start.z0) * f; LED.z1 = LED.z0 + sp;
      if (S._typ === "th") { const fx = start.avstX / Math.max(10, Math.abs(a.x - b.x)), tc = S._tFranX(start.midX); LED.tA = tc - (tc - start.tA) * fx; LED.tB = tc + (start.tB - tc) * fx; }
      drog = true; ledBegransa(); ledRitaSnart(); return; }
    const p = vbP(ev), dy = p.y - start.p.y, dx = p.x - start.p.x; if (!drog && Math.hypot(dx, dy) < 5) return; drog = true;
    const dz = dy / (G.yB - G.yT) * (start.z1 - start.z0); LED.z0 = start.z0 + dz; LED.z1 = start.z1 + dz;
    if (S._typ === "th") { const dt = dx / (G.xR - G.xL) * (start.tB - start.tA + 1); LED.tA = start.tA - dt; LED.tB = start.tB - dt; }
    ledBegransa(); ledRitaSnart(); });
  // 24/11: tipsruta vid hovring i tid-hojd (timme, skiktet under musen, klass och bidrag)
  if (S.id === "ledTH" || S.id === "ledTH2") {
    S.addEventListener("pointermove", ev => { if (pek.size || ev.pointerType === "touch" || !LED.data || !S._G) return; const G = S._G, p = vbP(ev);
      if (p.x < G.xL || p.x > G.xR || p.y < G.yT || p.y > G.yB) { $("kTips").hidden = true; return; }
      const t = Math.round(S._tFranX(p.x)), z = ledZ(G, p.y), pr = LED.data.prof[t]; if (!pr) { $("kTips").hidden = true; return; }
      const P = ledSkikt(pr, LED.med2), sk = P.sk.find(s => z >= s.z0 && z <= s.z1);
      let txt = ledTidText(t) + "\n" + Math.round(z) + " m ≈ FL" + String(Math.round(interpFL(P.pt, z, pr.ps))).padStart(3, "0");
      if (sk) { const a = P.pt.reduce((b, c) => Math.abs(c.z - z) < Math.abs(b.z - z) ? c : b); txt += "\n" + ledTipsSkikt(sk) + "\nT " + ledKomma(a.T - 273.15, 1) + " °C, Td " + ledKomma(a.Td, 1) + " °C (nivån " + Math.round(a.z) + " m)"; }
      const L = ledLedskikt(P).filter(d => z >= d.bas - 1 && z <= d.topp + 1); for (const d of L) txt += "\n▶ " + d.typ + " " + Math.round(d.bas) + "–" + Math.round(d.topp) + " m, ΔM " + ledKomma(d.dM, 1);
      visaKTips(txt + "\nKlicka = välj timmen", ev.clientX + 14, ev.clientY + 14); });
    S.addEventListener("pointerleave", () => { $("kTips").hidden = true; });
  }
  const slut = ev => { const var1 = pek.size === 1; pek.delete(ev.pointerId);
    if (var1 && !drog && S._typ === "th" && ev.type === "pointerup" && LED.data) { const t = Math.round(S._tFranX(vbP(ev).x)); if (t >= 0 && t < LED.data.nt) { LED.t = t; ledRitaSnart(); } }
    if (!pek.size) start = null; };
  S.addEventListener("pointerup", slut); S.addEventListener("pointercancel", slut);
  S.addEventListener("dblclick", ledNollstall);
  S.style.touchAction = "none";
}

// ---------------- flik och klick ----------------
function ledLage(nytt) {
  const pa = nytt === "led"; $("vyLed").hidden = !pa; $("ledRuta").hidden = !pa; $("flikLed").setAttribute("aria-selected", String(pa)); document.body.classList.toggle("led", pa);
  if (!pa) { const g = $("kLed"); if (g) g.textContent = ""; return; }
  $("underrubrik").textContent = "Ledskikt · refraktion ur MEPS medlem 0 (2,5 km, 65 nivåer)";
  ledMarkor(); ledUppdatera();
}
function ledKartKlick(lat, lon) { LED.lat = lat; LED.lon = lon; ledSpara(); ledMarkor(); ledUppdatera(); }
(function ledInit() {
  if (!$("ledFarg")) return;
  const knapp = (id, nyckel, varde) => { const b = $(id); const satt = () => b.setAttribute("aria-pressed", String(LED[nyckel] === varde));
    b.addEventListener("click", () => { LED[nyckel] = varde; ledSpara(); for (const x of document.querySelectorAll("[data-led='" + nyckel + "']")) x._satt(); ledRita(); }); b.dataset.led = nyckel; b._satt = satt; satt(); };
  knapp("ledFarg", "visa", "farg"); knapp("ledBredvid", "visa", "bredvid"); knapp("ledTot", "komp", "tot"); knapp("ledTQ", "komp", "tq");
  const tp = $("ledTopp"); for (const v of [1000, 2000, 3000, 5000]) tp.add(new Option(v === 5000 ? "5000 m (allt hämtat)" : v + " m", v)); tp.value = LED.topp;
  tp.addEventListener("change", () => { LED.topp = +tp.value; ledSpara(); ledNollstall(); });
  const m2 = $("led2m"); m2.checked = LED.med2; m2.addEventListener("change", () => { LED.med2 = m2.checked; ledSpara(); ledRita(); });
  $("ledAter").addEventListener("click", ledNollstall);
  const steg = d => { if (!LED.data) return; LED.t = Math.max(0, Math.min(LED.data.nt - 1, LED.t + d)); ledRitaSnart(); };
  $("ledBak").addEventListener("click", () => steg(-1)); $("ledFram").addEventListener("click", () => steg(1));
  $("ledReglage").addEventListener("input", () => { LED.t = +$("ledReglage").value; ledRitaSnart(); });
  for (const id of ["ledTH", "ledTH2", "ledProfSvg", "ledGradSvg"]) ledZoomKoppla($(id));
  document.addEventListener("keydown", ev => { if (lage !== "led" || ev.altKey || ev.ctrlKey || ev.metaKey) return; const t = ev.target.tagName; if (t === "INPUT" || t === "SELECT" || t === "TEXTAREA") return;
    if (ev.key === "ArrowLeft") { steg(-1); ev.preventDefault(); } else if (ev.key === "ArrowRight") { steg(1); ev.preventDefault(); } });
  $("flikLed").addEventListener("click", () => bytLage("led"));
  LED.z1 = LED.topp;
  if (typeof lage !== "undefined" && lage === "led") ledLage("led");
})();
