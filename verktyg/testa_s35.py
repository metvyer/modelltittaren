# Prov S35 (27/11): en ruta (valkomst+test) vid start, Om sidan, ingen idelada; tid-hojd byter fran borttagen korning
import asyncio, time, os
from playwright.async_api import async_playwright
os.makedirs('matprov', exist_ok=True); open('sida.md', 'w').write('S35')
SIDA = "https://metvyer.github.io/modelltittaren/?v=" + str(int(time.time()))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); s = await b.new_page(viewport={"width": 1400, "height": 1000}); fel = []
        s.on("pageerror", lambda e: fel.append(str(e)))
        await s.goto(SIDA); await s.wait_for_timeout(5000)
        print("start:", await s.evaluate("'ruta ' + !$('testskylt').hidden + ' | ' + $('testskyltRubrik').textContent + ' | ide-knapp ' + !!$('ideKnapp') + ' | valkommen ' + !!$('valkommen')"))
        await s.screenshot(path="matprov/s35a.png")
        await s.click("#testskyltOk"); await s.wait_for_timeout(300)
        await s.evaluate("bytLage('m0')"); await s.wait_for_timeout(500)
        print("flikbyte direkt:", await s.evaluate("!$('testskylt').hidden"))
        await s.click("#omKnapp"); await s.wait_for_timeout(300); print("om sidan:", await s.evaluate("!$('testskylt').hidden")); await s.click("#testskyltOk")
        await s.evaluate("bytLage('th')"); await s.wait_for_timeout(500); await s.evaluate("$('hamta').click()")
        for i in range(40):
            if await s.evaluate("typeof M !== 'undefined' && M && M.ytaOK && M.ytaOK.filter(x => x).length > 10 && !upptagen"): break
            await s.wait_for_timeout(1500)
        ny = await s.evaluate("M.dtg"); print("laddad:", ny)
        await s.evaluate("M.dtg = '20261120T00Z'; korningBorta(FIL(M.dtg))")
        await s.wait_for_timeout(1500); print("status:", await s.evaluate("$('status').textContent"))
        for i in range(40):
            await s.wait_for_timeout(1500)
            if await s.evaluate(f"M && M.dtg !== '20261120T00Z' && !upptagen"): break
        print("efter:", await s.evaluate("M.dtg + ' | ' + $('status').textContent.slice(0, 120)"))
        print("fel:", fel[:5]); await b.close()
asyncio.run(main())
