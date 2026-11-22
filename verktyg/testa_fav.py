# Prov S6 (22/11): Favoriter - vinterknappen Snodrev, foljer status over tid
import asyncio, time, os
from playwright.async_api import async_playwright
UT = []
def skriv(s=""): print(s, flush=True); UT.append(str(s))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 1300, "height": 1000}); fel = []; anrop = []
        pg.on("pageerror", lambda e: fel.append("JS: " + str(e)))
        pg.on("console", lambda m: fel.append("KONSOL " + m.type + ": " + m.text[:200]) if m.type in ("error", "warning") else None)
        pg.on("request", lambda r: anrop.append(r.url[:110]) if ("thredds" in r.url or "workers.dev" in r.url or "raw.github" in r.url or "data/" in r.url) else None)
        await pg.goto("https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))); await pg.wait_for_timeout(3000)
        await pg.evaluate("bytLage('f')"); await pg.wait_for_timeout(10000)
        skriv("fore: " + str(await pg.evaluate("$('pStatus').textContent + ' | upptagen ' + P.upptagen + ' autoVantar ' + P.autoVantar + ' uppl ' + $('pUppl').value")))
        n0 = len(anrop)
        await pg.evaluate("document.querySelector('#favVinter button[data-k=snofok]').click()")
        for i in range(20):
            await pg.wait_for_timeout(4000)
            skriv(f"{(i+1)*4:3d}s: " + str(await pg.evaluate("$('pStatus').textContent.slice(0,160) + ' | upptagen ' + P.upptagen + ' varden ' + !!P.varden + ' fragar ' + P.fragar")))
        skriv("anrop efter tryck: " + str(len(anrop) - n0)); [skriv("  " + a) for a in anrop[n0:n0+12]]
        await pg.evaluate("document.querySelector('#favVinter button[data-k=snofok]').click()"); await pg.wait_for_timeout(8000)
        skriv("andra trycket: " + str(await pg.evaluate("$('pStatus').textContent.slice(0,160) + ' | upptagen ' + P.upptagen")))
        skriv("fel: " + str(fel[:8])); await b.close()
    open("sida.md", "w").write("\n".join(UT) + "\n")
asyncio.run(main())
