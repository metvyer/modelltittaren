# Prov S25 (25/11): tid-hojd Td <-> RH vid klick, Favoriter: nytt falt avslutar detaljlaget
import asyncio, time, os
from playwright.async_api import async_playwright
os.makedirs('matprov', exist_ok=True); open('sida.md', 'w').write('S25')
SIDA = "https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); s = await b.new_page(viewport={"width": 1400, "height": 1000}); fel = []
        s.on("pageerror", lambda e: fel.append(str(e)))
        await s.goto(SIDA); await s.wait_for_timeout(4000)
        await s.evaluate("bytLage('th')"); await s.wait_for_timeout(800); await s.evaluate("$('testskylt').hidden = true; $('hamta').click()")
        for i in range(40):
            if await s.evaluate("typeof M !== 'undefined' && M && M.ytaOK && M.ytaOK.filter(x => x).length > 10"): break
            await s.wait_for_timeout(1500)
        rad = """(() => { const all = [...document.querySelectorAll('svg text')]; const lab = all.find(t => t.textContent === 'Td °C' || t.textContent === 'RH %'); if (!lab) return 'ingen etikett';
          const y = lab.getAttribute('y'); return lab.textContent + ': ' + all.filter(t => t.getAttribute('y') === y && t !== lab).slice(0, 12).map(t => t.textContent).join(' '); })()"""
        print("fore:", await s.evaluate(rad))
        await s.evaluate("[...document.querySelectorAll('svg text')].find(t => t.textContent === 'Td °C' || t.textContent === 'RH %').dispatchEvent(new MouseEvent('click', { bubbles: true }))"); await s.wait_for_timeout(800)
        print("efter klick:", await s.evaluate(rad))
        await s.evaluate("[...document.querySelectorAll('svg text')].find(t => t.textContent === 'Td °C' || t.textContent === 'RH %').dispatchEvent(new MouseEvent('click', { bubbles: true }))"); await s.wait_for_timeout(800)
        print("klick igen:", await s.evaluate(rad))
        await s.evaluate("bytLage('f')"); await s.wait_for_timeout(5000); await s.evaluate("$('testskylt').hidden = true")
        await s.evaluate("favVal('by', 27); P.detaljSpar = { pStorlek: $('pStorlek').value, pUppl: $('pUppl').value }; P.detalj = { lat: 59.86, lon: 17.64 }; $('pStorlek').value = '400'; $('pUppl').value = '1'; favDetaljKnappar()")
        print("detalj pa:", await s.evaluate("!!P.detalj + ' | ' + $('favDetaljInfo').textContent + ' | hela-knapp ' + !$('favHela').hidden"))
        await s.evaluate("favVal('bas', 300)"); await s.wait_for_timeout(1500)
        print("efter molnbas:", await s.evaluate("!!P.detalj + ' | storlek ' + $('pStorlek').value + ' uppl ' + $('pUppl').value + ' | hela-knapp ' + !$('favHela').hidden + ' | ' + $('pStatus').textContent"))
        print("fel:", fel[:5]); await b.close()
asyncio.run(main())
