# Prov S6-variant 23/11: Snodrev i Favoriter med olika perioder (rent fonster per period)
import asyncio, time, os
from playwright.async_api import async_playwright
os.makedirs("matprov", exist_ok=True)
UT = []
def skriv(s=""): print(s, flush=True); UT.append(str(s))
PERIODER = [(0, 12), (0, 24), (6, 30), (0, 36), (12, 48), (0, 61)]
async def en(p, a, b):
    br = await p.chromium.launch(); pg = await br.new_page(viewport={"width": 1300, "height": 1000}); fel = []
    pg.on("pageerror", lambda e: fel.append("JS: " + str(e)))
    await pg.goto("https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))); await pg.wait_for_timeout(3000)
    await pg.evaluate("bytLage('f')"); await pg.wait_for_timeout(10000)
    skriv(f"=== period {a}-{b}: fore: fran {await pg.evaluate('$(\"pFran\").value')} till {await pg.evaluate('$(\"pTill\").value')} dt {await pg.evaluate('$(\"pDt\").value')} uppl {await pg.evaluate('$(\"pUppl\").value')}")
    await pg.evaluate(f"$('pFran').value='{a}'; $('pTill').value='{b}'; $('pFran').dispatchEvent(new Event('change')); $('pTill').dispatchEvent(new Event('change'))")
    await pg.wait_for_timeout(3000)
    await pg.evaluate("window._st = []; const so = window.status; window.status = function(t, k) { window._st.push((t||'').slice(0, 100)); return so(t, k); }; window._ph=[]; const ph = probHamta; probHamta = async function(a, b) { window._ph.push('in ' + P.vOverride + ' lista ' + JSON.stringify(P.listaOverride)); const r = await ph(a, b); window._ph.push('ut fragar ' + P.fragar + ': ' + $('pStatus').textContent.slice(0, 100)); return r; }")
    await pg.evaluate("document.querySelector('#favVinter button[data-k=snofok]').click()")
    for i in range(12):
        await pg.wait_for_timeout(10000)
        s = await pg.evaluate("$('pStatus').textContent.slice(0,130) + ' | upptagen ' + P.upptagen + ' tom ' + P.komboTom + ' fran ' + $('pFran').value + ' till ' + $('pTill').value")
        if i in (0, 2, 5, 11) or 'Klart' in s: skriv(f"  {(i+1)*10}s: {s}")
        if 'Klart: Sn' in s: break
    skriv("  PH " + str(await pg.evaluate('JSON.stringify(window._ph)'))[:1500])
    skriv("  ST " + str(await pg.evaluate('JSON.stringify([...new Set(window._st)])'))[:1500])
    skriv("  DIAG " + str(await pg.evaluate("""(async () => { const K = komboAktiv(); if (!K) return 'ingen K'; const bv = berakna();
      const ut = ['bv ' + JSON.stringify(bv && [bv.v, bv.s, bv.y0, bv.y1, bv.x0, bv.x1])];
      for (const v of K.delar) ut.push(v + ' ' + JSON.stringify(P.index.filter(e => e.dtg === P.dtg && e.v === v).map(e => [e.s, e.y0, e.y1, e.x0, e.x1, e.tider.length, Math.min(...e.tider), Math.max(...e.tider)])));
      const kand = P.index.filter(e => e.dtg === P.dtg && e.v === K.delar[0]);
      for (const e of kand) { const inom = bv && bv.s === e.s && innehaller(e, { ...bv, v: e.v, dtg: e.dtg }); ut.push('inom ' + inom);
        const r = await komboOmrade(e, K, komboA(), komboB()); ut.push('komboOmrade ' + (r ? 'ok' : 'null')); }
      return ut.join(' || '); })()""")))
    skriv("  fel: " + str(fel[:3])); await br.close()
async def main():
    async with async_playwright() as p:
        for a, b in PERIODER: await en(p, a, b)
    open("sida.md", "w").write("\n".join(UT) + "\n")
asyncio.run(main())
