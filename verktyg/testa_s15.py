# Prov S15 (24/11): tid-hojd-tabellens Td-rad - jamfor med T och RH ur modellen
import asyncio, time
from playwright.async_api import async_playwright
SIDA = "https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); s = await b.new_page(viewport={"width": 1400, "height": 1000}); fel = []
        s.on("pageerror", lambda e: fel.append(str(e)))
        await s.goto(SIDA); await s.wait_for_timeout(4000)
        await s.evaluate("$('testskylt').hidden = true; bytLage('th')"); await s.wait_for_timeout(1000)
        await s.evaluate("$('hamta').click()")
        for i in range(40):
            if await s.evaluate("typeof M !== 'undefined' && M && M.ytaOK && M.ytaOK.filter(x => x).length > 10"): break
            await s.wait_for_timeout(1500)
        print(await s.evaluate("(() => { const o = []; const ok = [...M.ytaOK.keys()].filter(i => M.ytaOK[i]).slice(0, 5); for (const t of ok) { const tk = M.yta[1][t], rh = M.yta[2][t]; o.push('t' + t + ': T ' + (tk - 273.15).toFixed(1) + ' RH ' + rh + ' Td ' + daggpunkt(tk, rh).toFixed(1)); } return o.join(' | '); })()"))
        print("Td-texter:", await s.evaluate("(() => { const all = [...document.querySelectorAll('svg text')]; const lab = all.find(t => t.textContent === 'Td °C'); if (!lab) return 'ingen etikett'; const y = lab.getAttribute('y'); return all.filter(t => t.getAttribute('y') === y).slice(0, 14).map(t => t.textContent).join(' '); })()"))
        print("T-texter:", await s.evaluate("(() => { const all = [...document.querySelectorAll('svg text')]; const lab = all.find(t => t.textContent === 'T °C'); if (!lab) return 'ingen etikett'; const y = lab.getAttribute('y'); return all.filter(t => t.getAttribute('y') === y).slice(0, 14).map(t => t.textContent).join(' '); })()"))
        print("tabellrader:", await s.evaluate("(() => { const tx = [...document.querySelectorAll('#thTabell text, #tabell text, svg text')].map(t => t.textContent); return RAD_NAMN.td + ' finns: ' + tx.includes('Td °C'); })()"))
        print("rader:", await s.evaluate("tabellRader(visaMetar && M.metar && M.metar.length > 0).join(',')"))
        await s.screenshot(path="s15.png", full_page=True)
        print("fel:", fel[:5]); await b.close()
asyncio.run(main())
