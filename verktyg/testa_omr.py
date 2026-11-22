# Prov S5 (22/11): omraden (LFV-luftrum + SMHI sjovaderomraden) pa den publicerade sidan
import asyncio, os, time
from playwright.async_api import async_playwright
os.makedirs("matprov", exist_ok=True)
UT = []
def skriv(s=""): print(s); UT.append(str(s))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 1400, "height": 1100}); fel = []
        pg.on("pageerror", lambda e: fel.append("JS: " + str(e)))
        pg.on("console", lambda m: fel.append("KONSOL: " + m.text[:200]) if m.type == "error" else None)
        await pg.goto("https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))); await pg.wait_for_timeout(3000)
        await pg.evaluate("$('testskylt') && ($('testskylt').hidden = true); bytLage('sat'); $('testskylt') && ($('testskylt').hidden = true)"); await pg.wait_for_timeout(3000)
        await pg.evaluate("$('visaOmr').click()"); await pg.wait_for_timeout(500)
        await pg.evaluate("for (const cb of document.querySelectorAll('#omrMeny input')) if (!cb.checked) cb.click()"); await pg.wait_for_timeout(20000)
        skriv("meny: " + await pg.evaluate("[...document.querySelectorAll('#omrMeny label')].map(l => l.textContent).join(' | ')"))
        skriv("ritat: " + await pg.evaluate("OMR_LAGER.map(L => L.id + ' ' + document.querySelectorAll('#kOmraden .omryta[data-l=\"' + L.id + '\"]').length).join(', ') + ' | etiketter ' + document.querySelectorAll('#kOmraden .omretik').length"))
        skriv("data: " + await pg.evaluate("Object.keys(OMR.data).map(k => k + ' ' + OMR.data[k].length + ' (' + JSON.stringify(OMR.data[k]).length + ' tkn)').join(', ') + ' fel ' + JSON.stringify(OMR.fel)"))
        await pg.screenshot(path="matprov/omr_meny.png")
        # bara TRA, R, D, sjo
        await pg.evaluate("for (const cb of document.querySelectorAll('#omrMeny input')) { const t = cb.parentNode.textContent; if (/^(Län|CTR|TMA|ATZ)/.test(t) && cb.checked) cb.click(); }; document.body.click()"); await pg.wait_for_timeout(1500)
        await pg.evaluate("$('testskylt') && ($('testskylt').hidden = true)")
        await pg.screenshot(path="matprov/omr_karta.png")
        e = await pg.query_selector('#kOmraden .omretik[data-l="TRA"]')
        if e:
            bb = await e.bounding_box(); await pg.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2); await pg.wait_for_timeout(500)
            skriv("tips TRA: " + await pg.evaluate("$('kTips').hidden ? '(dold)' : $('kTips').textContent"))
        await pg.evaluate("satVb(330, 620, 220)"); await pg.wait_for_timeout(1500)
        await pg.evaluate("$('testskylt') && ($('testskylt').hidden = true)")
        e = await pg.query_selector('#kOmraden .omretik[data-l="RSTA"]')
        if e:
            bb = await e.bounding_box(); await pg.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2); await pg.wait_for_timeout(500)
            skriv("tips R: " + await pg.evaluate("$('kTips').hidden ? '(dold)' : $('kTips').textContent"))
        await pg.screenshot(path="matprov/omr_zoom.png")
        skriv("fel: " + str(fel[:6])); await b.close()
    open("sida.md", "w").write("\n".join(UT) + "\n")
asyncio.run(main())
