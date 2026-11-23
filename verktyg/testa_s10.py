# Prov S10 (23/11): sidan laddar utan JS-fel och tid-hojd for en forhamtad flygplats ger en rad till /th-oppning
import asyncio, time
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 1300, "height": 1000}); fel = []; beacon = []
        pg.on("pageerror", lambda e: fel.append(str(e)))
        pg.on("request", lambda r: beacon.append(r.url) if "th-oppning" in r.url or "gh-trafik" in r.url else None)
        await pg.goto("https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))); await pg.wait_for_timeout(4000)
        await pg.evaluate("$('testskylt').hidden = true; bytLage('th')")
        await pg.evaluate("const s = $('punkt'); for (const o of s.options) if (/ESCM/.test(o.textContent)) s.value = o.value; s.dispatchEvent(new Event('change')); valjOchHamta()")
        await pg.wait_for_timeout(25000)
        print("status:", await pg.evaluate("($('iStatus') || {}).textContent"))
        print("beacon:", beacon); print("fel:", fel[:5]); await b.close()
asyncio.run(main())
