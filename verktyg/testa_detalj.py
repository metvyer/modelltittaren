# Prov S8 (23/11): Detalj har i Favoriter - byvind 27 kt och Snodrev i 2,5 km runt Uppsala, sedan Hela Sverige
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
        skriv("skylt: " + await pg.evaluate("document.querySelector('#testskylt p').textContent.slice(0, 80)"))
        await pg.evaluate("bytLage('f')"); await pg.wait_for_timeout(10000)
        await pg.evaluate("favVal('by', 27)"); await pg.wait_for_timeout(4000)
        await pg.evaluate("$('favDetalj').click()")
        skriv("vantar: " + await pg.evaluate("$('favDetaljInfo').textContent + ' | ' + $('pStatus').textContent"))
        # klick: simulera kartKlick med en punkt nara Uppsala via favDetaljKlick-logiken
        await pg.evaluate("""(() => { const f = rutaF(59.86, 17.64); const svg = $('karta'); const pt = svg.createSVGPoint(); pt.x = f.fx; pt.y = KY - 1 - f.fy;
          const m = svg.querySelector('g').getScreenCTM ? svg.getScreenCTM() : null; const sp = m ? pt.matrixTransform(m) : { x: 0, y: 0 };
          const orig = window.kartPunkt; window.kartPunkt = () => ({ x: f.fx, y: KY - 1 - f.fy }); kartKlick({ clientX: sp.x, clientY: sp.y, shiftKey: false }, svg); window.kartPunkt = orig; })()""")
        for i in range(10):
            await pg.wait_for_timeout(6000)
            s = await pg.evaluate("$('pStatus').textContent.slice(0, 160) + ' | upptagen ' + P.upptagen")
            if i in (0, 3) or ('upptagen false' in s): skriv(f"by {(i+1)*6}s: {s}")
            if 'upptagen false' in s: break
        skriv("omr: " + await pg.evaluate("JSON.stringify([berakna().s, berakna().nx, berakna().ny]) + ' info ' + $('favDetaljInfo').textContent + ' hela ' + !$('favHela').hidden"))
        skriv("index by: " + await pg.evaluate("JSON.stringify(P.index.filter(e => e.dtg === P.dtg && e.v === 'by').map(e => [e.s, e.y1 - e.y0, e.tider.length]))"))
        await pg.evaluate("$('testskylt') && ($('testskylt').hidden = true)")
        await (await pg.query_selector("#karta")).screenshot(path="matprov/detalj_by.png")
        await pg.evaluate("document.querySelector('#favVinter button[data-k=snofok]').click()")
        for i in range(15):
            await pg.wait_for_timeout(6000)
            s = await pg.evaluate("$('pStatus').textContent.slice(0, 160) + ' | upptagen ' + P.upptagen")
            if i in (0, 3, 6) or 'Klart: Sn' in s or 'avbröts' in s or 'kunde inte' in s: skriv(f"snodrev {(i+1)*6}s: {s}")
            if 'Klart: Sn' in s or 'avbröts' in s or 'kunde inte' in s: break
        skriv("index sno: " + await pg.evaluate("JSON.stringify(P.index.filter(e => e.dtg === P.dtg && e.v === 'sno').map(e => [e.s, e.y1 - e.y0, e.tider.length]))"))
        await (await pg.query_selector("#karta")).screenshot(path="matprov/detalj_snodrev.png")
        await pg.evaluate("$('favHela').click()"); await pg.wait_for_timeout(3000)
        skriv("hela: " + await pg.evaluate("$('pStatus').textContent + ' | storlek ' + $('pStorlek').value + ' uppl ' + $('pUppl').value"))
        await pg.evaluate("bytLage('p')"); await pg.wait_for_timeout(1000)
        skriv("ut: storlek " + await pg.evaluate("$('pStorlek').value + ' uppl ' + $('pUppl').value + ' detalj ' + P.detalj"))
        skriv("fel: " + str(fel[:5])); await b.close()
    open("sida.md", "w").write("\n".join(UT) + "\n")
asyncio.run(main())
