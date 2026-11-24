# Prov S21 (24/11 kvall): KONRAD3D bara i Radar-fliken, Radar med Europakartan
import asyncio, time, os
from playwright.async_api import async_playwright
os.makedirs('matprov', exist_ok=True); open('sida.md', 'w').write('S21')
SIDA = "https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); s = await b.new_page(viewport={"width": 1400, "height": 1000}); fel = []
        s.on("pageerror", lambda e: fel.append(str(e)))
        await s.goto(SIDA); await s.wait_for_timeout(4000)
        await s.evaluate("lagra('mt:konrad', 'ja'); KD.pa = true; bytLage('th')"); await s.wait_for_timeout(1500); await s.evaluate("$('testskylt').hidden = true")
        print("tid-hojd:", await s.evaluate("'knapp synlig ' + ($('konradKnapp').offsetParent !== null) + ', ritat ' + $('kKonrad').childNodes.length"))
        await s.evaluate("bytLage('rad')"); await s.wait_for_timeout(8000); await s.evaluate("$('testskylt').hidden = true")
        await s.evaluate("$('zHem').click()"); await s.wait_for_timeout(3000)
        print("radar:", await s.evaluate("'knapp synlig ' + ($('konradKnapp').offsetParent !== null) + ', kartGr ' + JSON.stringify(kartGr()) + ', vb.w ' + Math.round(vb.w) + ', EU-karta synlig ' + (getComputedStyle($('kGeoEU')).display) + ', ramar ' + OBS.ramar.length + ', konrad-element ' + $('kKonrad').childNodes.length + ', celler ' + KD.celler.length + ', fel ' + KD.fel"))
        await s.screenshot(path="matprov/s21a.png")
        await s.evaluate("bytLage('m0')"); await s.wait_for_timeout(1500)
        print("karta mbr0:", await s.evaluate("'knapp synlig ' + ($('konradKnapp').offsetParent !== null) + ', ritat ' + $('kKonrad').childNodes.length + ', EU ' + getComputedStyle($('kGeoEU')).display"))
        print("fel:", fel[:5]); await b.close()
asyncio.run(main())
