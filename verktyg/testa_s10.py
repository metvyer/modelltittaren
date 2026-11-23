# Prov S10 (23/11): sidan laddar utan JS-fel och tid-hojd for en forhamtad flygplats ger en rad till /th-oppning
import asyncio, time
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 1300, "height": 1000}); fel = []; beacon = []
        pg.on("pageerror", lambda e: fel.append(str(e)))
        pg.on("request", lambda r: beacon.append(r.url) if "th-oppning" in r.url or "gh-trafik" in r.url else None)
        await pg.goto("https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))); await pg.wait_for_timeout(4000)
        await pg.evaluate("$('testskylt').hidden = true; bytLage('th')")
        await pg.evaluate("const s = $('punkt'); for (const o of s.options) if (/ESCM/.test(o.textContent)) s.value = o.value; s.dispatchEvent(new Event('change')); valjOchHamta()")
        await pg.wait_for_timeout(25000)
        print("status:", await pg.evaluate("($('iStatus') || {}).textContent"))
        print("beacon:", beacon)
        # 23/11 em: R2
        await pg.evaluate("bytLage('f')"); await pg.wait_for_timeout(10000)
        print("SVIDX:", await pg.evaluate("JSON.stringify({ bas: SVIDX.bas, kalla: SVIDX.kalla, dtg: SVIDX.dtg, kor: SVIDX.korningar, vs: SVIDX.vs })"))
        t0 = time.time(); await pg.evaluate("document.querySelector('#favVinter button[data-k=snofok]').click()")
        for i in range(20):
            await pg.wait_for_timeout(2000); s = await pg.evaluate("$('pStatus').textContent.slice(0,160) + ' | ' + P.upptagen")
            if 'Klart: Sn' in s or 'avbröts' in s or 'kunde inte' in s: break
        print(f"snodrev {time.time()-t0:.0f} s:", s)
        print("index sno:", await pg.evaluate("JSON.stringify(P.index.filter(e => e.dtg === P.dtg && e.v === 'sno').map(e => [e.s, e.tider.length]))"))
        r = await pg.evaluate("(async () => { const r = await fetch('https://modelltittaren.metvyer.workers.dev/r2/ens/index.json'); const r2 = await fetch('https://modelltittaren.metvyer.workers.dev/radar/smhi/lista'); const l = await r2.json(); return r.status + ' radar ' + l.length + ' bilder, senaste ' + new Date(l[l.length-1]).toISOString(); })()")
        print("r2/radar:", r)
        print("fel:", fel[:5]); await b.close()
asyncio.run(main())
