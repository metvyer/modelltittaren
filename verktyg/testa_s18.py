# Prov S18 (24/11): fliken Brandrisk - SMHI-karta, punkt, EFFIS
import asyncio, time
from playwright.async_api import async_playwright
SIDA = "https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); s = await b.new_page(viewport={"width": 1400, "height": 1000}); fel = []
        s.on("pageerror", lambda e: fel.append(str(e)))
        await s.goto(SIDA); await s.wait_for_timeout(4000)
        await s.evaluate("$('testskylt').hidden = true; bytLage('brand')"); await s.wait_for_timeout(5000)
        print("flik:", await s.evaluate("lage + ' | ' + $('underrubrik').textContent + ' | dagar ' + $('brDag').options.length + ' | bilder ' + $('kBrand').querySelectorAll('image').length"))
        print("info:", await s.evaluate("$('brInfo').textContent.slice(0, 200)"))
        for f in ["fwi", "gras", "torr"]:
            await s.evaluate(f"$('brFalt').value = '{f}'; $('brFalt').dispatchEvent(new Event('change'))"); await s.wait_for_timeout(2500)
            print(f, await s.evaluate("(async () => { const u = await brFil(BR_FALT[BR.falt].fil, BR.dag); let n = 0, mx = 0; for (const v of u) if (v !== 255) { n++; if (v > mx) mx = v; } return n + ' rutor med varde, max ' + mx; })()"))
        await s.evaluate("brPunkt(58.6, 16.2)"); await s.wait_for_timeout(6000)
        print("punkt:", await s.evaluate("$('brPunkt').innerText.slice(0, 500).replace(/\\n/g, ' | ')"))
        await s.evaluate("$('brFalt').value = 'effis'; $('brFalt').dispatchEvent(new Event('change'))"); await s.wait_for_timeout(10000)
        print("effis:", await s.evaluate("$('brInfo').textContent.slice(0, 200) + ' | bilder ' + $('kBrand').querySelectorAll('image').length"))
        await s.screenshot(path="s18.png")
        print("fel:", fel[:5]); await b.close()
asyncio.run(main())
