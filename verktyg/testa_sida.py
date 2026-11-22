# Prov J (21/11 kvall): sidan i en riktig webblasare pa GitHub (natet ar oppet har) - satellit- och radarflikarna.
# Startar en lokal webbserver for repot, oppnar sidan i Chromium (playwright), tar skarmbilder till matprov/.
import asyncio, os, subprocess, sys, time
os.makedirs("matprov", exist_ok=True)
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8765"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
UT = []
def skriv(s=""): print(s); UT.append(str(s))
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 1400, "height": 1000})
        fel = []; pg.on("pageerror", lambda e: fel.append("JS: " + str(e)))
        pg.on("requestfailed", lambda r: fel.append("NÄT: " + r.url[:160] + " " + str(r.failure)))
        pg.on("console", lambda m: fel.append("KONSOL: " + m.text[:200]) if m.type == "error" else None)
        await pg.goto(os.environ.get("SIDA", "https://metvyer.github.io/modelltittaren/") + "?prov=" + str(int(time.time()))); await pg.wait_for_timeout(2500)
        await pg.evaluate("document.getElementById('testskylt') && (document.getElementById('testskylt').hidden = true)")
        async def bild(namn, js, vanta=20000):
            await pg.evaluate(js); await pg.wait_for_timeout(vanta)
            await pg.evaluate("document.getElementById('testskylt') && (document.getElementById('testskylt').hidden = true)")
            st = await pg.evaluate("(document.getElementById('obsStatus')||{}).textContent + ' | ' + (document.getElementById('obsTid')||{}).textContent")
            skriv(f"- {namn}: {st}"); await pg.screenshot(path=f"matprov/sida_{namn}.png")
        await bild("sat_geocolour", "bytLage('sat')", 25000)
        await bild("sat_ir_blixt", "OBS.sat='ir105'; OBS.blixt=true; OBS.langd=6; obsFyllVal(); OBS.ramar=[]; obsLadda(true)", 25000)
        await bild("sat_zoom", "satVb(250, 450, 300)", 15000)
        await bild("rad_smhi", "OBS.blixt=false; OBS.rad='smhi'; bytLage('rad'); satVb(0,0,2000)", 20000)
        await bild("rad_metno", "OBS.rad='metno'; obsFyllVal(); OBS.ramar=[]; obsLadda(true)", 25000)
        await bild("rad_metno_prognos", "OBS.i = OBS.ramar.length-1; obsVisa()", 1500)
        await bild("rad_under_ir", "OBS.rad='metno'; OBS.under='ir105'; obsFyllVal(); for (const r of OBS.ramar) r.bild=null; obsLadda(false)", 20000)
        await bild("m0", "bytLage('m0')", 15000)
        # meteogram med andra modeller (Arlanda, temperatur och nederbord)
        await pg.evaluate("localStorage.setItem('mt:meteoExtra', JSON.stringify({aifs:true,nordic:true,nc:true}))")
        for par in ["by", "t2", "nb"]:
            await pg.evaluate(f"bytLage('p'); $('lat').value='59.65'; $('lon').value='17.92'; $('pParam').value='{par}'; $('pParam').dispatchEvent(new Event('change'))")
            await pg.wait_for_timeout(4000)
            await pg.evaluate("EXTRA_PA={aifs:true,nordic:true,nc:true}; ['aifs','nordic','nc'].forEach(k=>$('pMeteoX_'+k).setAttribute('aria-pressed','true')); visaMeteogram()")
            await pg.wait_for_timeout(25000)
            if par == "nb": await pg.evaluate("$('pMeteoNb').value='h1'; $('pMeteoNb').dispatchEvent(new Event('change'))"); await pg.wait_for_timeout(1500)
            info = await pg.evaluate("$('pMeteoInfo').textContent + ' | ' + $('pMeteoExtraInfo').textContent + ' | ' + $('pMeteoForkl').textContent.slice(-260)")
            skriv(f"- meteogram {par}: {info}")
            r = await pg.query_selector("#pMeteoRuta")
            if r: await r.screenshot(path=f"matprov/sida_meteo_{par}.png")
        skriv("Fel/varningar (" + str(len(fel)) + "):"); [skriv("  " + f) for f in fel[:40]]
        await b.close()
asyncio.run(main()); srv.terminate()
open("sida.md", "w").write("\n".join(UT) + "\n")
if os.environ.get("GITHUB_STEP_SUMMARY"): open(os.environ["GITHUB_STEP_SUMMARY"], "a").write("## Prov J: sidan i webbläsare\n" + "\n".join(UT) + "\n")
