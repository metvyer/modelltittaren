# Prov S28 (25/11 kvall): "Ny bild"-rutan i satellit/radar (simulerad: senaste bilden doljs, sedan ny lista)
import asyncio, time, os
from playwright.async_api import async_playwright
os.makedirs('matprov', exist_ok=True); open('sida.md', 'w').write('S28')
SIDA = "https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); s = await b.new_page(viewport={"width": 1400, "height": 1000}); fel = []
        s.on("pageerror", lambda e: fel.append(str(e)))
        await s.goto(SIDA); await s.wait_for_timeout(4000)
        for lg in ["rad", "sat"]:
            await s.evaluate(f"bytLage('{lg}')"); await s.wait_for_timeout(9000); await s.evaluate("$('testskylt').hidden = true")
            print(lg, "efter laddning: ruta synlig", await s.evaluate("!$('obsNyBild').hidden"))
            await s.evaluate("OBS.sistT -= 10 * 60e3; obsLadda(true)"); await s.wait_for_timeout(4000)
            print(lg, "ny bild:", await s.evaluate("!$('obsNyBild').hidden + ' | ' + $('obsNyBild').innerText.replace(/\\n/g, ' · ')"))
            await s.screenshot(path=f"matprov/s28{lg}.png")
            await s.wait_for_timeout(11000)
            print(lg, "efter 11 s: synlig", await s.evaluate("!$('obsNyBild').hidden"))
        print("fel:", fel[:5]); await b.close()
asyncio.run(main())
