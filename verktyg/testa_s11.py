# Prov S11 (23/11): webbkameror fran Windy via mellanservern
import asyncio, time, os
from playwright.async_api import async_playwright
os.makedirs("matprov", exist_ok=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 1300, "height": 1000}); fel = []
        pg.on("pageerror", lambda e: fel.append(str(e)))
        await pg.goto("https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))); await pg.wait_for_timeout(4000)
        await pg.evaluate("$('testskylt').hidden = true")
        print("direkt:", (await pg.evaluate("(async () => { const r = await fetch('https://modelltittaren.metvyer.workers.dev/kameror?bbox=60.5,19,58.5,16'); return r.status + ' ' + (await r.text()).slice(0, 600); })()")))
        await pg.evaluate("$('kamKnapp').click()"); await pg.wait_for_timeout(6000)
        print("kameror:", await pg.evaluate("KAM.lista.length + ' st, bbox ' + JSON.stringify(kamBbox()) + ' ritade ' + document.querySelectorAll('#kKam .kam').length"))
        print("exempel:", await pg.evaluate("JSON.stringify(KAM.lista.slice(0, 3).map(k => [k.n, k.lat, k.lon, k.t, k.u, (k.b || '').slice(0, 60)]))"))
        k = await pg.query_selector("#kKam .kam")
        if k:
            bb = await k.bounding_box(); await pg.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2); await pg.wait_for_timeout(2500)
            print("hovring:", await pg.evaluate("$('kTips').hidden + ' ' + $('kTips').textContent.slice(0, 120)"))
        await (await pg.query_selector("body")).screenshot(path="matprov/kameror.png")
        print("fel:", fel[:5]); await b.close()
asyncio.run(main())
