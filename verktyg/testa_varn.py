# Prov S4 (22/11): SMHI-varningar pa kartan + experimentets info-panel, pa den publicerade sidan
import asyncio, os, time
from playwright.async_api import async_playwright
os.makedirs("matprov", exist_ok=True)
UT = []
def skriv(s=""): print(s); UT.append(str(s))
BAS = "https://metvyer.github.io/modelltittaren/"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for namn, url, vp in [("test2", BAS + "?varntest=2&prov=" + str(int(time.time())), (1400, 1100)), ("live", BAS + "?prov=" + str(int(time.time())), (1400, 1100)), ("mobil", BAS + "?prov=" + str(int(time.time())), (400, 860))]:
            pg = await b.new_page(viewport={"width": vp[0], "height": vp[1]}); fel = []
            pg.on("pageerror", lambda e: fel.append("JS: " + str(e)))
            pg.on("console", lambda m: fel.append("KONSOL: " + m.text[:200]) if m.type == "error" else None)
            await pg.goto(url); await pg.wait_for_timeout(3000)
            await pg.evaluate("document.getElementById('testskylt') && (document.getElementById('testskylt').hidden = true)")
            await pg.evaluate("bytLage('sat'); if (!VARN.pa) $('visaVarn').click()"); await pg.wait_for_timeout(15000)
            await pg.evaluate("document.getElementById('testskylt') && (document.getElementById('testskylt').hidden = true)")
            skriv(f"## {namn}")
            skriv("antal: " + str(await pg.evaluate("(VARN.lista||[]).length + ' omraden, ritade ytor ' + document.querySelectorAll('#kVarn .varnyta').length + ', symboler ' + document.querySelectorAll('#kVarn .varnsym').length + ', fel: ' + VARN.fel")))
            skriv("lista: " + str(await pg.evaluate("[...document.querySelectorAll('#varnLista summary')].map(s => s.textContent).join(' || ')")))
            # hovra over forsta symbolen
            sym = await pg.query_selector("#kVarn .varnsym")
            if sym:
                bb = await sym.bounding_box()
                if bb: await pg.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2); await pg.wait_for_timeout(500)
                skriv("tips: " + str(await pg.evaluate("$('kTips').hidden ? '(dold)' : $('kTips').textContent")))
            await pg.screenshot(path=f"matprov/varn_{namn}.png", full_page=(namn == "mobil"))
            if namn == "live":
                await pg.evaluate("bytLage('m0')"); await pg.wait_for_timeout(20000)
                skriv("m0: " + str(await pg.evaluate("varnTid().map(t => new Date(t).toISOString()).join(' - ') + ' ytor ' + document.querySelectorAll('#kVarn .varnyta').length + ' streckade ' + document.querySelectorAll('#kVarn .kommande').length")))
                await pg.screenshot(path="matprov/varn_m0.png")
                await pg.evaluate("bytLage('p'); $('lat').value='59.86'; $('lon').value='17.64'; $('pParam').value='by'; $('pParam').dispatchEvent(new Event('change'))"); await pg.wait_for_timeout(5000)
                await pg.evaluate("visaMeteogram()"); await pg.wait_for_timeout(30000)
                skriv("meteogram: " + str(await pg.evaluate("$('pMeteoVarn').hidden ? '(dold) ' + JSON.stringify(P.meteo && [P.meteo.lat, P.meteo.lon]) : $('pMeteoVarn').textContent")))
                r = await pg.query_selector("#pMeteoRuta")
                if r: await r.screenshot(path="matprov/varn_meteo.png")
                await pg.evaluate("bytLage('exp'); $('expInfo').open = true"); await pg.wait_for_timeout(3000)
                e = await pg.query_selector("#expInfo")
                if e: await e.screenshot(path="matprov/exp_info.png")
            skriv("fel: " + str(fel[:6])); await pg.close()
        await b.close()
    open("sida.md", "w").write("\n".join(UT) + "\n")
asyncio.run(main())
