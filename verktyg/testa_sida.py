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
        await pg.goto("http://localhost:8765/index.html"); await pg.wait_for_timeout(2500)
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
        await bild("m0", "bytLage('m0')", 15000)
        skriv("Fel/varningar (" + str(len(fel)) + "):"); [skriv("  " + f) for f in fel[:40]]
        await b.close()
asyncio.run(main()); srv.terminate()
open("sida.md", "w").write("\n".join(UT) + "\n")
if os.environ.get("GITHUB_STEP_SUMMARY"): open(os.environ["GITHUB_STEP_SUMMARY"], "a").write("## Prov J: sidan i webbläsare\n" + "\n".join(UT) + "\n")
