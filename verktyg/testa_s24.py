# Prov S24 (25/11): isobarer i satellit/radar foljer bildens timme
import asyncio, time, os
from playwright.async_api import async_playwright
os.makedirs('matprov', exist_ok=True); open('sida.md', 'w').write('S24')
SIDA = "https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); s = await b.new_page(viewport={"width": 1400, "height": 1000}); fel = []
        s.on("pageerror", lambda e: fel.append(str(e)))
        await s.goto(SIDA); await s.wait_for_timeout(4000)
        await s.evaluate("bytLage('rad')"); await s.wait_for_timeout(1000); await s.evaluate("$('testskylt').hidden = true; OBS.langd = 6; if (!QF.pa) $('qffKnapp').click()")
        await s.wait_for_timeout(9000)
        info = "(() => 'bild ' + $('obsTid').textContent.slice(0, 22) + ' | linjer ' + $('kQff').querySelectorAll('path').length + ' | ' + QF.info)()"
        print("senaste:", await s.evaluate(info))
        await s.evaluate("obsVisa ? obsVisa(0) : null") if await s.evaluate("typeof obsVisa === 'function'") else None
        await s.evaluate("$('obsReglage').value = 0; $('obsReglage').dispatchEvent(new Event('input'))"); await s.wait_for_timeout(3000)
        print("forsta:", await s.evaluate(info))
        await s.screenshot(path="matprov/s24a.png")
        await s.evaluate("bytLage('sat')"); await s.wait_for_timeout(9000); await s.evaluate("$('testskylt').hidden = true")
        print("satellit:", await s.evaluate(info))
        print("fel:", fel[:5]); await b.close()
asyncio.run(main())
