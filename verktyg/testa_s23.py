# Prov S23 (25/11): Favoriter -> Snodrev "byvind saknas for ... (rutnat 10 km)" - felsok
import asyncio, time, os
from playwright.async_api import async_playwright
os.makedirs('matprov', exist_ok=True); open('sida.md', 'w').write('S23')
SIDA = "https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))
DUMP = """(async () => { const K = KOMBO.snofok, u = [];
  u.push('status: ' + $('pStatus').textContent);
  u.push('P.dtg ' + P.dtg + ' fran ' + $('pFran').value + ' till ' + $('pTill').value + ' dt ' + $('pDt').value + ' uppl ' + $('pUppl').value + ' kombo ' + $('pKombo').value + ' sakn ' + JSON.stringify(P.komboSakn) + ' tom ' + P.komboTom + ' fragar ' + P.fragar + ' upptagen ' + P.upptagen);
  u.push('SVIDX ' + (SVIDX && SVIDX.dtg) + ' v ' + (SVIDX && SVIDX.v) + ' s ' + (SVIDX && JSON.stringify(SVIDX.sv || SVIDX.s)) + ' tider ' + (SVIDX && SVIDX.tider && SVIDX.tider.length));
  for (const v of ['sno', 'by']) for (const e of P.index.filter(x => x.v === v && x.dtg === P.dtg)) {
    let finns = []; for (const t of [3, 4, 5, 6, 7, 8]) { if (!e.tider.includes(t)) { finns.push(t + ':-'); continue; } const a = await DB.get(nyckelE(e, t)); finns.push(t + ':' + (a ? 'db' : 'SAKNAS')); }
    u.push(v + ' s' + e.s + ' y' + e.y0 + '-' + e.y1 + ' x' + e.x0 + '-' + e.x1 + ' tider ' + e.tider.length + ' [' + finns.join(' ') + ']' + (e.sv ? ' sv' : '') + (e.kalla ? ' ' + e.kalla : ''));
  }
  const bv = berakna(); u.push('berakna ' + JSON.stringify(bv && { s: bv.s, y0: bv.y0, y1: bv.y1, x0: bv.x0, x1: bv.x1 }));
  return u.join('\\n'); })()"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); s = await b.new_page(viewport={"width": 1400, "height": 1000}); fel = []
        s.on("pageerror", lambda e: fel.append(str(e)))
        await s.goto(SIDA); await s.wait_for_timeout(4000)
        await s.evaluate("bytLage('f')"); await s.wait_for_timeout(5000); await s.evaluate("$('testskylt').hidden = true")
        nu = await s.evaluate("+$('pFran').value"); print("nu-timme", nu)
        await s.evaluate(f"$('pTill').value = {nu + 1}; $('pTill').dispatchEvent(new Event('change'))"); await s.wait_for_timeout(2000)
        await s.evaluate("document.querySelector('#favVinter button[data-k=snofok]').click()")
        for i in range(150):
            await s.wait_for_timeout(2000); st = await s.evaluate("$('pStatus').textContent")
            if st.startswith("Klart") or "kunde inte" in st or "avbröts" in st or "hämtades inte" in st: break
        print("EFTER SNODREV:\n" + await s.evaluate(DUMP))
        await s.evaluate("$('pDt').value = '3'; $('pDt').dispatchEvent(new Event('change'))"); await s.wait_for_timeout(5000)
        print("EFTER DT=3:\n" + await s.evaluate(DUMP))
        await s.screenshot(path="matprov/s23a.png")
        print("fel:", fel[:5]); await b.close()
asyncio.run(main())
