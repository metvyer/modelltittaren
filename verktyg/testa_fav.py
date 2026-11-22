# Prov S6 (22/11 kvall): vinterknappen (forsta trycket), METAR-status i meteogrammet, isolinjer
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
        await pg.evaluate("bytLage('f')"); await pg.wait_for_timeout(10000)
        await pg.evaluate("favVal('by', 32)"); await pg.wait_for_timeout(5000)
        await pg.evaluate("window._kh = 0; window._ph = []; window._st = []; const so = window.status; window.status = function(t, k) { window._st.push((t||'').slice(0, 110)); return so(t, k); }; const o = komboHamta; komboHamta = function(a) { window._kh++; window._khUpp = P.upptagen; return o(a); }; const ph = probHamta; probHamta = async function(a, b) { const st0 = Date.now(); window._ph.push('in ' + P.vOverride + ' upp ' + P.upptagen + ' o0 ' + JSON.stringify(berakna() && [berakna().v, berakna().s])); try { const r = await ph(a, b); window._ph.push('ut ' + (Date.now() - st0) + ' ms: ' + $('pStatus').textContent.slice(0, 120)); return r; } catch (e) { window._ph.push('FEL ' + e); throw e; } }")
        await pg.evaluate("document.querySelector('#favVinter button[data-k=snofok]').click()")
        for i in range(5):
            await pg.wait_for_timeout(5000)
            skriv(f"snodrev {(i+1)*5}s: " + str(await pg.evaluate("$('pStatus').textContent.slice(0,140) + ' | upptagen ' + P.upptagen + ' kh ' + window._kh + ' khUpp ' + window._khUpp + ' tom ' + P.komboTom")))
        skriv('PH ' + str(await pg.evaluate('JSON.stringify(window._ph)')))
        skriv('ST ' + str(await pg.evaluate('JSON.stringify(window._st)')))
        await pg.evaluate("favVal('by', 32); if (!visaIso) $('visaIso').click()"); await pg.wait_for_timeout(5000)
        await pg.evaluate("$('testskylt') && ($('testskylt').hidden = true)")
        k = await pg.query_selector("#karta")
        if k: await k.screenshot(path="matprov/iso.png")
        for namn, la, lo in [("hav", "57.6", "19.6"), ("Uppsala", "59.86", "17.64")]:
            await pg.evaluate(f"$('lat').value='{la}'; $('lon').value='{lo}'; visaMeteogram()"); await pg.wait_for_timeout(25000)
            skriv(f"METAR {namn}: " + str(await pg.evaluate("$('pMeteoMetarInfo').textContent")))
        skriv("fel: " + str(fel[:5])); await b.close()
    open("sida.md", "w").write("\n".join(UT) + "\n")
asyncio.run(main())
