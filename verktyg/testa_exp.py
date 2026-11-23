# Prov S3 (22/11): Experiment-fliken (graupel i kolumnen) mot riktiga data pa den publicerade sidan
import asyncio, os, time
from playwright.async_api import async_playwright
os.makedirs("matprov", exist_ok=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 1400, "height": 1100})
        fel = []; pg.on("pageerror", lambda e: fel.append(str(e)))
        await pg.goto("https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))); await pg.wait_for_timeout(3000)
        await pg.evaluate("bytLage('exp'); document.getElementById('testskylt').hidden = true")
        await pg.evaluate("EXP.lat = 59.9; EXP.lon = 17.6; expUppdatera()"); await pg.wait_for_timeout(40000)
        print("status:", await pg.evaluate("$('expStatus').textContent + ' | ' + $('expSam').textContent"))
        print("falt:", await pg.evaluate("Object.keys(EXP.data.F).map(k => { let m = -1e9, n = 0; for (const v of EXP.data.F[k]) if (isFinite(v)) { n++; if (v > m) m = v; } return k + ' max ' + m.toFixed(3) + ' (' + n + ' rutor)'; }).join('; ')"))
        await pg.evaluate("const o = EXP.o; expProfil({ ix: Math.round((o.x0+o.x1)/2), iy: Math.round((o.y0+o.y1)/2), lat: 59.9, lon: 17.6 })"); await pg.wait_for_timeout(20000)
        print("profil:", await pg.evaluate("$('expProfilTitel').textContent + ' | ' + $('expProfilSum').textContent"))
        print("isotermer:", await pg.evaluate("[...document.querySelectorAll('#expRuta text')].map(x => x.textContent).filter(s => /°C$|laddningszon/.test(s)).join(' ; ')"))
        el = await pg.query_selector("#expRuta"); await el.screenshot(path="matprov/sida_exp.png")
        print("fel:", fel[:5]); await b.close()
asyncio.run(main())
