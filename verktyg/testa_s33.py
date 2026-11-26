# Prov S33 (26/11): Karta MBR0 - isbildning, hogsta i kolumnen
import asyncio, time, os
from playwright.async_api import async_playwright
os.makedirs('matprov', exist_ok=True); open('sida.md', 'w').write('S33')
SIDA = "https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); s = await b.new_page(viewport={"width": 1400, "height": 1100}); fel = []
        s.on("pageerror", lambda e: fel.append(str(e)))
        await s.goto(SIDA); await s.wait_for_timeout(4000)
        await s.evaluate("bytLage('m0')"); await s.wait_for_timeout(4000); await s.evaluate("$('testskylt').hidden = true")
        t0 = time.time()
        await s.evaluate("$('m0Param').value = 'isb'; $('m0Param').dispatchEvent(new Event('change'))")
        for i in range(90):
            await s.wait_for_timeout(2000)
            if await s.evaluate("M0F.v === 'isb' && M0F.data && M0F.nyckel && M0F.nyckel.includes(':isb:')"): break
        print("tid", round(time.time() - t0), "s | status:", await s.evaluate("$('m0Status').textContent"))
        print("statistik:", await s.evaluate("""(() => { const d = M0F.data, K = [0.05, 0.6, 2.5, 7.5], c = [0, 0, 0, 0, 0]; let mx = 0, n = 0;
          for (const w of d) { if (!isFinite(w)) continue; n++; mx = Math.max(mx, w); let k = 0; for (let i = 0; i < K.length; i++) if (w >= K[i]) k = i + 1; c[k]++; }
          return 'punkter ' + n + ' | ingen/trace<0,05 ' + c[0] + ' | 0,05-0,6 ' + c[1] + ' | light ' + c[2] + ' | moderate ' + c[3] + ' | severe ' + c[4] + ' | max ' + mx.toFixed(2) + ' cm/h | ' + $('kartTidM0').textContent; })()"""))
        await s.screenshot(path="matprov/s33a.png")
        await s.evaluate("$('m0Fram').click()"); await s.wait_for_timeout(1000)
        for i in range(60):
            await s.wait_for_timeout(2000)
            if await s.evaluate("!/hämtar/i.test($('m0Status').textContent)"): break
        print("nasta timme:", await s.evaluate("$('m0Status').textContent + ' | ' + $('kartTidM0').textContent"))
        print("fel:", fel[:5]); await b.close()
asyncio.run(main())
