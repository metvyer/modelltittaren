# Prov S22 (24/11 kvall): tid-hojd - senaste METAR-koden under TAF:en nar METAR/TAF ar tand
import asyncio, time, os
from playwright.async_api import async_playwright
os.makedirs('matprov', exist_ok=True); open('sida.md', 'w').write('S22')
SIDA = "https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); s = await b.new_page(viewport={"width": 1400, "height": 1000}); fel = []
        s.on("pageerror", lambda e: fel.append(str(e)))
        await s.goto(SIDA); await s.wait_for_timeout(4000)
        await s.evaluate("bytLage('th')"); await s.wait_for_timeout(800); await s.evaluate("$('testskylt').hidden = true; $('hamta').click()")
        for i in range(40):
            if await s.evaluate("typeof M !== 'undefined' && M && M.ytaOK && M.ytaOK.filter(x => x).length > 10"): break
            await s.wait_for_timeout(1500)
        if not await s.evaluate("visaMetar"): await s.evaluate("$('lMetar').click()")
        await s.wait_for_timeout(6000)
        print("pa:", await s.evaluate("'TAF: ' + $('tafText').textContent.slice(0, 120) + ' || METAR (' + !$('metarText').hidden + '): ' + $('metarText').textContent"))
        await s.screenshot(path="matprov/s22a.png")
        await s.evaluate("$('lMetar').click()"); await s.wait_for_timeout(800)
        print("av:", await s.evaluate("'taf dold ' + $('tafText').hidden + ', metar dold ' + $('metarText').hidden"))
        print("fel:", fel[:5]); await b.close()
asyncio.run(main())
