# Prov S27 (25/11 kvall): satellit/radar - bildens alder mot datorns klocka
import asyncio, time, os
from playwright.async_api import async_playwright
os.makedirs('matprov', exist_ok=True); open('sida.md', 'w').write('S27')
SIDA = "https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))
INFO = "(() => { const r = OBS.ramar[OBS.i]; return $('obsTid').textContent + ' || skylt: ' + $('obsPrognosSkylt').textContent + ' || facit ' + Math.round((Date.now() - r.t) / 60e3) + ' min'; })()"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); s = await b.new_page(viewport={"width": 1400, "height": 1000}); fel = []
        s.on("pageerror", lambda e: fel.append(str(e)))
        await s.goto(SIDA); await s.wait_for_timeout(4000)
        for lg in ["sat", "rad"]:
            await s.evaluate(f"bytLage('{lg}')"); await s.wait_for_timeout(9000); await s.evaluate("$('testskylt').hidden = true")
            n = await s.evaluate("OBS.ramar.length")
            sist = await s.evaluate("OBS.ramar.map(r => !!r.prognos).lastIndexOf(false)")
            for i in sorted(set([0, max(0, sist - 1), sist, n - 1])):
                await s.evaluate(f"$('obsReglage').value = {i}; $('obsReglage').dispatchEvent(new Event('input'))"); await s.wait_for_timeout(700)
                print(lg, i, "/", n - 1, ":", await s.evaluate(INFO))
        print("fel:", fel[:5]); await b.close()
asyncio.run(main())
