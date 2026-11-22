# Prov S6 (22/11): Favoriter - A/B-rutor dolda, bara en knapp bla
import asyncio, time
from playwright.async_api import async_playwright
UT = []
def skriv(s=""): print(s); UT.append(str(s))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 1300, "height": 1000}); fel = []
        pg.on("pageerror", lambda e: fel.append("JS: " + str(e)))
        await pg.goto("https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))); await pg.wait_for_timeout(3000)
        await pg.evaluate("bytLage('f')"); await pg.wait_for_timeout(3000)
        stat = "[...document.querySelectorAll('#favPanel button[aria-pressed=true]')].map(b=>b.textContent).join(',') + ' | A synlig ' + ($('pKomboAFalt').offsetParent!==null) + ' B synlig ' + ($('pKomboBFalt').offsetParent!==null)"
        await pg.evaluate("favVal('sikt', 5000)"); await pg.wait_for_timeout(800); skriv("sikt 5000: " + await pg.evaluate(stat))
        await pg.evaluate("document.querySelector('#favVinter button[data-k=snofok]').click()"); await pg.wait_for_timeout(1500); skriv("snödrev: " + await pg.evaluate(stat))
        await pg.evaluate("favVal('bas', 1200)"); await pg.wait_for_timeout(800); skriv("bas 1200: " + await pg.evaluate(stat))
        await pg.evaluate("$('lat').value='59.86'; $('lon').value='17.64'; visaMeteogram()"); await pg.wait_for_timeout(30000)
        skriv("meteogram litet synligt: " + await pg.evaluate("$('pMeteoRuta').offsetParent!==null"))
        await pg.evaluate("meteoExpandera()"); await pg.wait_for_timeout(1500)
        skriv("meteogram expanderat synligt: " + await pg.evaluate("$('pMeteoRuta').offsetParent!==null"))
        await pg.evaluate("meteoExpandera()")
        skriv("fel: " + str(fel[:5])); await b.close()
    open("sida.md", "w").write("\n".join(UT) + "\n")
asyncio.run(main())
