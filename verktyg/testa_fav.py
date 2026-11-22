# Prov S6 (22/11): skylten "Faltet ar inlast - ingen ruta nar ..." i Favoriter
import asyncio, time, os
from playwright.async_api import async_playwright
os.makedirs("matprov", exist_ok=True)
UT = []
def skriv(s=""): print(s); UT.append(str(s))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 1300, "height": 1000}); fel = []
        pg.on("pageerror", lambda e: fel.append("JS: " + str(e)))
        await pg.goto("https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))); await pg.wait_for_timeout(3000)
        await pg.evaluate("bytLage('f')"); await pg.wait_for_timeout(8000)
        sk = "($('kartTom').hidden ? '(dold)' : $('kartTom').textContent)"
        await pg.evaluate("favVal('by', 27)"); await pg.wait_for_timeout(5000); skriv("by 27: " + str(await pg.evaluate(sk)))
        await pg.evaluate("$('pTrosk').value='90'; $('pTrosk').dispatchEvent(new Event('input')); probVisa()"); await pg.wait_for_timeout(5000); skriv("by 90: " + str(await pg.evaluate(sk)))
        await pg.evaluate("$('testskylt') && ($('testskylt').hidden = true)")
        k = await pg.query_selector("#karta")
        if k: await (await k.query_selector("xpath=..")).screenshot(path="matprov/karttom.png")
        await pg.evaluate("$('pVisa').value='max'; $('pVisa').dispatchEvent(new Event('change'))"); await pg.wait_for_timeout(4000); skriv("varde max: " + str(await pg.evaluate(sk)))
        await pg.evaluate("$('pVisa').value='sannolikhet'; $('pVisa').dispatchEvent(new Event('change')); favVal('sikt', 5000)"); await pg.wait_for_timeout(5000); skriv("sikt 5000: " + str(await pg.evaluate(sk)))
        skriv("fel: " + str(fel[:5])); await b.close()
    open("sida.md", "w").write("\n".join(UT) + "\n")
asyncio.run(main())
