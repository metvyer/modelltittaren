# Prov S12 (23/11): Sannolikhet - Visa (medlem/max/min/medel) ska ga att valja efter att Favoriternas Snodrev anvants
import asyncio, time
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 1300, "height": 1000}); fel = []
        pg.on("pageerror", lambda e: fel.append(str(e)))
        await pg.goto("https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))); await pg.wait_for_timeout(4000)
        await pg.evaluate("$('testskylt').hidden = true; bytLage('f')"); await pg.wait_for_timeout(8000)
        await pg.evaluate("document.querySelector('#favVinter button[data-k=snofok]').click()"); await pg.wait_for_timeout(8000)
        print("i fav:", await pg.evaluate("$('pKombo').value + ' lagrat ' + JSON.stringify(lasa('mt:pKombo'))"))
        await pg.evaluate("bytLage('p')"); await pg.wait_for_timeout(3000)
        print("sannolikhet:", await pg.evaluate("'kombo ' + JSON.stringify($('pKombo').value) + ' visa disabled ' + $('pVisa').disabled + ' etikett ' + document.querySelector('label[for=pVisa]').textContent + ' alternativ ' + [...$('pVisa').options].slice(0, 6).map(o => o.value).join(',')"))
        await pg.reload(); await pg.wait_for_timeout(4000); await pg.evaluate("$('testskylt').hidden = true; bytLage('p')"); await pg.wait_for_timeout(2000)
        print("efter omladdning:", await pg.evaluate("'kombo ' + JSON.stringify($('pKombo').value) + ' visa disabled ' + $('pVisa').disabled"))
        print("fel:", fel[:5]); await b.close()
asyncio.run(main())
