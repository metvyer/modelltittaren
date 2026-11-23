# Prov S9 (23/11): foregaende TAF vid AMD (hovring), satellit/radar dragbar form, vinterknapparna fran forhamtningen
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
        await pg.evaluate("$('testskylt').hidden = true")
        # --- TAF ---
        await pg.evaluate("bytLage('taf')"); await pg.wait_for_timeout(15000)
        skriv("taf lista: " + await pg.evaluate("TAFS.lista.join(',') + ' | data ' + Object.keys(TAFS.data).filter(k => TAFS.data[k]).length"))
        skriv("amd: " + await pg.evaluate("TAFS.lista.filter(k => TAFS.data[k] && TAFS.data[k].amd).join(',') || 'ingen AMD just nu'"))
        # tvinga ESSA som AMD for provet (riktig utgivningstid) och hamta foregaende
        r = await pg.evaluate("""(async () => { const T = TAFS.data.ESSA; if (!T) return 'ESSA saknar TAF'; T.amd = true; delete TAFS.forra.ESSA;
          await tafForraHamta(); const f = TAFS.forra.ESSA; return 'utg ' + new Date(T.utg).toISOString() + ' | forra: ' + (f ? (f.raw || '(tom)').slice(0, 120) : 'ingen'); })()""")
        skriv("forra ESSA: " + r)
        skriv("hovring: " + (await pg.evaluate("tafHovring('ESSA').replace(/<[^>]+>/g, '')"))[:600])
        await pg.evaluate("$('testskylt').hidden = true; $('kTips').style.maxWidth = '560px'; visaKTips(tafHovring('ESSA'), 300, 200, true)")
        t = await pg.query_selector("#kTips")
        if t: await t.screenshot(path="matprov/taf_hovring.png")
        await pg.evaluate("$('kTips').hidden = true")
        # --- satellit: form ---
        await pg.evaluate("bytLage('sat')"); await pg.wait_for_timeout(6000)
        await pg.evaluate("const r = document.querySelector('.kartram'); r.dispatchEvent(new Event('pointerdown')); r.style.width = '600px'; r.style.height = '420px'"); await pg.wait_for_timeout(1500)
        skriv("sat form: " + await pg.evaluate("const r = document.querySelector('.kartram'); r.offsetWidth + 'x' + r.offsetHeight + ' vb ' + $('karta').getAttribute('viewBox') + ' sparat ' + lasa('mt:obsForm') + ' resize ' + getComputedStyle(r).resize"))
        await (await pg.query_selector(".kartram")).screenshot(path="matprov/sat_form.png")
        await pg.evaluate("bytLage('p')"); await pg.wait_for_timeout(1500)
        skriv("i Sannolikhet: " + await pg.evaluate("const r = document.querySelector('.kartram'); 'style ' + r.style.width + '/' + r.style.height + ' resize ' + getComputedStyle(r).resize"))
        await pg.evaluate("bytLage('rad')"); await pg.wait_for_timeout(2000)
        skriv("radar: " + await pg.evaluate("const r = document.querySelector('.kartram'); r.offsetWidth + 'x' + r.offsetHeight"))
        await pg.evaluate("$('obsFormAter').click()"); await pg.wait_for_timeout(800)
        skriv("aterstalld: " + await pg.evaluate("const r = document.querySelector('.kartram'); r.offsetWidth + 'x' + r.offsetHeight + ' sparat ' + JSON.stringify(lasa('mt:obsForm'))"))
        # --- vinterknapparna fran forhamtningen ---
        await pg.evaluate("bytLage('f')"); await pg.wait_for_timeout(10000)
        skriv("index: " + await pg.evaluate("JSON.stringify({ dtg: SVIDX.dtg, v: SVIDX.v, vs: SVIDX.vs, vinter: SVIDX.vinter })"))
        skriv("skylt: " + (await pg.evaluate("$('favSkylt').textContent"))[:300])
        for k in ["snofok", "ishalka", "rimfrost"]:
            t0 = time.time()
            await pg.evaluate(f"document.querySelector('#favVinter button[data-k={k}]').click()")
            for i in range(20):
                await pg.wait_for_timeout(3000)
                s = await pg.evaluate("$('pStatus').textContent.slice(0, 200) + ' | upptagen ' + P.upptagen")
                if ('upptagen false' in s and ('Klart' in s or 'avbröts' in s or 'kunde inte' in s or 'Favoriter går' in s)): break
            skriv(f"{k} ({time.time() - t0:.0f} s): {s}")
            skriv("  sam: " + await pg.evaluate("$('pSam').textContent.slice(0, 200)"))
            await (await pg.query_selector("#karta")).screenshot(path=f"matprov/vinter_{k}.png")
        skriv("metno-anrop (statistik i sidan): " + await pg.evaluate("JSON.stringify(P.index.filter(e => e.dtg === P.dtg && ['sno','nb','t0','t2','rh'].includes(e.v)).map(e => [e.v, e.s, e.tider.length]))"))
        skriv("fel: " + str(fel[:5])); await b.close()
    open("sida.md", "w").write("\n".join(UT) + "\n")
asyncio.run(main())
