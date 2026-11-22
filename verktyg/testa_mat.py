# Prov S7 (22/11 kvall): matning, statusfarger, tom-skylt overst, sektorer med hojdfilter
import asyncio, time, os
from playwright.async_api import async_playwright
os.makedirs("matprov", exist_ok=True)
UT = []
def skriv(s=""): print(s, flush=True); UT.append(str(s))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 1300, "height": 1000}); fel = []
        pg.on("pageerror", lambda e: fel.append("JS: " + str(e)))
        await pg.goto("https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))); await pg.wait_for_timeout(3000)
        await pg.evaluate("bytLage('f')"); await pg.wait_for_timeout(1500)
        skriv("status under laddning: " + str(await pg.evaluate("$('pStatus').className + ' | ' + $('pStatus').textContent.slice(0,80)")))
        await pg.wait_for_timeout(9000)
        skriv("status klar: " + str(await pg.evaluate("$('pStatus').className + ' | ' + $('pStatus').textContent.slice(0,80)")))
        await pg.evaluate("favVal('by', 27); $('pTrosk').value='90'; probVisa()"); await pg.wait_for_timeout(4000)
        skriv("skylt: " + str(await pg.evaluate("$('kartTom').hidden ? '(dold)' : JSON.stringify($('kartTom').getBoundingClientRect().top - $('karta').getBoundingClientRect().top) + ' px fran kartans topp'")))
        await pg.evaluate("$('testskylt') && ($('testskylt').hidden = true)")
        # matning: hogerklick -> meny -> mat harifran, tva klick, dubbelklick
        k = await (await pg.query_selector("#karta")).bounding_box()
        x0, y0 = k["x"] + k["width"] * 0.45, k["y"] + k["height"] * 0.55
        await pg.mouse.click(x0, y0, button="right"); await pg.wait_for_timeout(300)
        skriv("meny: " + str(await pg.evaluate("$('matMeny') ? $('matMeny').textContent : '(ingen)'")))
        await pg.click("#matMeny button"); await pg.wait_for_timeout(300)
        await pg.mouse.click(x0 + 150, y0 - 120); await pg.wait_for_timeout(300)
        await pg.mouse.move(x0 + 260, y0 + 40); await pg.wait_for_timeout(300)
        await pg.mouse.dblclick(x0 + 260, y0 + 40); await pg.wait_for_timeout(500)
        skriv("matning: " + str(await pg.evaluate("JSON.stringify(MAT.p) + ' aktiv ' + MAT.aktiv + ' | ' + [...document.querySelectorAll('#kMat text')].map(t => t.textContent).join(' / ')")))
        skriv("punkt orord: " + str(await pg.evaluate("$('lat').value + ',' + $('lon').value")))
        await pg.evaluate("$('testskylt') && ($('testskylt').hidden = true)")
        await (await pg.query_selector("#karta")).screenshot(path="matprov/mat.png")
        # sektorer + hojdfilter
        await pg.evaluate("$('visaOmr').click()"); await pg.wait_for_timeout(300)
        await pg.evaluate("for (const cb of document.querySelectorAll('#omrMeny input')) { const t = cb.parentNode.textContent; if (/^Sektorer/.test(t) !== cb.checked) cb.click(); }"); await pg.wait_for_timeout(12000)
        skriv("sektorer alla: " + str(await pg.evaluate("document.querySelectorAll('#kOmraden .omryta').length + ' | ' + [...document.querySelectorAll('#omrMeny label')].slice(-3).map(l => l.textContent).join(' | ')")))
        await pg.select_option(".omrhojd select", "10000"); await pg.wait_for_timeout(1000)
        skriv("sektorer FL100: " + str(await pg.evaluate("document.querySelectorAll('#kOmraden .omryta').length")))
        await pg.evaluate("document.body.click(); $('testskylt') && ($('testskylt').hidden = true)")
        await (await pg.query_selector("#karta")).screenshot(path="matprov/sektorer.png")
        await pg.evaluate("matRensa()")
        skriv("fel: " + str(fel[:5])); await b.close()
    open("sida.md", "w").write("\n".join(UT) + "\n")
asyncio.run(main())
