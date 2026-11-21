// ===================================================================
//  BILD ATT LADDA NER (NYTT 21/11 kvall) - knappen "📷 Bild" i TAF-fliken
// ===================================================================
// Gor en PNG av kartan, tabellen eller bada (val i rullistan bredvid knappen).
//  - Kartan: SVG:n klonas och varje elements beraknade stil (farger fran CSS-variabler, linjebredd,
//    typsnitt, dolt/synligt) skrivs in direkt i klonen, sa att bilden ser ut som pa skarmen.
//  - Tabellen: ritas om pa en canvas fran det som syns (bakgrunder, kanter, text pa sina platser).
//  - Bada: rubrik med tid (UTC) och granserna overst, sedan kartan och tabellen under.
// Allt sker i webblasaren - inget skickas nagonstans. Dubbel upplosning for skarpa bilder.
const BILD_SKALA = 2;
const BILD_STILAR = ["fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-dasharray", "stroke-opacity", "stroke-linecap", "stroke-linejoin",
  "opacity", "font-family", "font-size", "font-weight", "paint-order", "text-anchor", "dominant-baseline", "shape-rendering", "visibility"];

// --- kartan: SVG med inskrivna stilar -> Image ---
function bildKarta() {
  const svg = $("karta"), r = svg.getBoundingClientRect(), kl = svg.cloneNode(true);
  const org = [svg, ...svg.querySelectorAll("*")], kop = [kl, ...kl.querySelectorAll("*")];
  for (let i = 0; i < org.length; i++) {
    const cs = getComputedStyle(org[i]), k = kop[i];
    if (cs.display === "none") { k.setAttribute("display", "none"); continue; }
    if (org[i].tagName === "title") { k.remove(); continue; }
    let st = ""; for (const p of BILD_STILAR) { const v = cs.getPropertyValue(p); if (v) st += p + ":" + v + ";"; }
    k.setAttribute("style", st);
  }
  kl.setAttribute("width", r.width); kl.setAttribute("height", r.height); kl.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  kl.style.background = getComputedStyle(document.body).getPropertyValue("--hav") || "#d3e2ee";
  const txt = new XMLSerializer().serializeToString(kl), url = URL.createObjectURL(new Blob([txt], { type: "image/svg+xml" }));
  return new Promise((ok, fel) => { const im = new Image(); im.onload = () => { URL.revokeObjectURL(url); ok({ im, w: r.width, h: r.height }); }; im.onerror = fel; im.src = url; });
}

// --- tabellen: ritas om fran det som syns pa skarmen ---
function bildTabell(el) {
  const R = el.getBoundingClientRect(), w = Math.ceil(el.scrollWidth || R.width), h = Math.ceil(R.height);
  const c = document.createElement("canvas"); c.width = w * BILD_SKALA; c.height = h * BILD_SKALA;
  const g = c.getContext("2d"); g.scale(BILD_SKALA, BILD_SKALA);
  const bas = el.querySelector("table") || el, B = bas.getBoundingClientRect(), dx = -B.left, dy = -B.top;
  g.fillStyle = getComputedStyle(document.body).getPropertyValue("--panel") || "#fff"; g.fillRect(0, 0, w, h);
  const synlig = v => v && v !== "transparent" && !/rgba\(.*,\s*0\)$/.test(v);
  for (const e of [bas, ...bas.querySelectorAll("*")]) {
    const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden") continue;
    const q = e.getBoundingClientRect(); if (!q.width || !q.height) continue;
    const x = q.left + dx, y = q.top + dy, rad = parseFloat(cs.borderTopLeftRadius) || 0;
    const ram = (bw, col, fn) => { const b = parseFloat(bw); if (b > 0 && synlig(col)) { g.fillStyle = col; fn(b); } };
    if (synlig(cs.backgroundColor)) {
      g.fillStyle = cs.backgroundColor; g.beginPath();
      if (rad > 0 && g.roundRect) g.roundRect(x, y, q.width, q.height, Math.min(rad, q.height / 2)); else g.rect(x, y, q.width, q.height); g.fill();
    }
    ram(cs.borderLeftWidth, cs.borderLeftColor, b => g.fillRect(x, y, b, q.height));
    ram(cs.borderRightWidth, cs.borderRightColor, b => g.fillRect(x + q.width - b, y, b, q.height));
    ram(cs.borderTopWidth, cs.borderTopColor, b => g.fillRect(x, y, q.width, b));
    ram(cs.borderBottomWidth, cs.borderBottomColor, b => g.fillRect(x, y + q.height - b, q.width, b));
    if (cs.boxShadow && cs.boxShadow !== "none" && /inset/.test(cs.boxShadow)) {   // "nu"-strecket i tabellen
      const m = cs.boxShadow.match(/(rgba?\([^)]*\)|#[0-9a-f]+)/i); g.fillStyle = m ? m[1] : "#111"; g.fillRect(x, y, 2, q.height);
    }
  }
  // texten: varje textbit pa sin plats, med foraldrens typsnitt och farg
  const tw = document.createTreeWalker(bas, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const t = n.textContent.replace(/\s+/g, " "); if (!t.trim()) continue;
    const p = n.parentElement, cs = getComputedStyle(p); if (cs.display === "none" || cs.visibility === "hidden" || p.closest("button")) continue;
    const rg = document.createRange(); rg.selectNodeContents(n); const rr = [...rg.getClientRects()]; if (!rr.length) continue;
    g.font = cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily; g.fillStyle = cs.color; g.textBaseline = "middle";
    g.fillText(t.trim(), rr[0].left + dx, rr[0].top + rr[0].height / 2 + dy);
  }
  // kryssknapparna (×) ritas inte - de hor inte hemma i en bild
  return { im: c, w, h };
}

// --- ihop till en bild och ladda ner ---
async function bildSpara() {
  const val = $("bildVal").value, knapp = $("bildKnapp"); knapp.disabled = true; const gammal = knapp.textContent; knapp.textContent = "📷 …";
  try {
    const nu = new Date(), tid = nu.toISOString().slice(0, 16).replace("T", " ") + "Z", G = TAFS.gr;
    const rub = val === "bada" ? "TAF-bevakning " + tid + "   ·   gul: bas < " + G.gulBas + " ft el. sikt < " + (G.gulSikt / 1000) + " km   ·   röd: bas < " + G.rodBas + " ft el. sikt < " + (G.rodSikt / 1000) + " km" + (TAFS.vind ? "   ·   sidvind gul ≥ " + G.gulSv + " / röd ≥ " + G.rodSv + " kt" : "") : "";
    const K = val !== "tabell" ? await bildKarta() : null, T = val !== "karta" ? bildTabell($("tafTabell")) : null;
    const pad = 10, rubR = rub ? rub.split("   ·   ") : [], rubH = rub ? 22 + 17 * Math.max(0, rubR.length - 2) : 0, W = Math.max(K ? K.w : 0, T ? T.w : 0) + 2 * pad;
    const H = pad + (rub ? rubH + 17 : 0) + (K ? K.h + (T ? pad : 0) : 0) + (T ? T.h : 0) + pad + 14;
    const c = document.createElement("canvas"); c.width = W * BILD_SKALA; c.height = H * BILD_SKALA;
    const g = c.getContext("2d"); g.scale(BILD_SKALA, BILD_SKALA);
    const cs = getComputedStyle(document.body);
    g.fillStyle = cs.getPropertyValue("--panel") || "#fff"; g.fillRect(0, 0, W, H);
    let y = pad;
    if (rub) {   // rubriken: fet tid overst, granserna pa egna rader under (bryts aldrig utanfor bilden)
      const fg = cs.getPropertyValue("--fg") || "#111"; g.fillStyle = fg; g.textBaseline = "middle";
      g.font = "700 15px " + cs.fontFamily; g.fillText(rubR[0], pad, y + 9);
      g.font = "13px " + cs.fontFamily; rubR.slice(1).forEach((r, i) => g.fillText(r, pad + (i % 2 ? 0 : 0), y + 9 + 17 * (i + 1)));
      y += rubH + 17; }
    if (K) { g.drawImage(K.im, pad, y, K.w, K.h); y += K.h + (T ? pad : 0); }
    if (T) { g.drawImage(T.im, pad, y, T.w, T.h); y += T.h; }
    g.fillStyle = cs.getPropertyValue("--dim") || "#666"; g.font = "11px " + cs.fontFamily; g.textBaseline = "alphabetic";
    g.fillText("Modelltittaren (testsida) · " + tid + " · TAF/METAR: aviationweather.gov, IMGW", pad, H - pad + 4);
    const blob = await new Promise(ok => c.toBlob(ok, "image/png"));
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "taf_" + nu.toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "_") + "Z_" + val + ".png";
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  } catch (e) { alert("Bilden kunde inte skapas: " + e); }
  knapp.disabled = false; knapp.textContent = gammal;
}
(function bildInit() {
  const k = $("bildKnapp"), v = $("bildVal"); if (!k || !v) return;
  v.value = lasa("mt:bildVal") || "bada"; if (!v.value) v.value = "bada";
  v.addEventListener("change", () => lagra("mt:bildVal", v.value));
  k.addEventListener("click", bildSpara);
})();
