# Prov S2 (22/11): vad sidan har for temperatur pa modellnivaerna i Uppsala kl 07Z (jamfors med radata, prov Q2)
import asyncio, os, time
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 1400, "height": 1000})
        await pg.goto("https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))); await pg.wait_for_timeout(3000)
        await pg.evaluate("document.getElementById('testskylt') && (document.getElementById('testskylt').hidden = true)")
        await pg.evaluate("bytLage('th'); const s_ = $('punkt'); s_.value = String(PUNKTER.findIndex(p => p[1] === 'ESCM')); sattPunkt(); 0")
        await pg.wait_for_timeout(60000)
        r = await pg.evaluate("""(() => { if (!M) return 'ingen M';
          const t0 = M.t0 || (M.tider && M.tider[0]); let it = -1;
          for (let t = 0; t < M.nt; t++) { const d = new Date((M.t0 !== undefined ? M.t0 : 0) + t * 3600e3); if (d.getUTCHours() === 7 && d.getUTCDate() === new Date().getUTCDate()) { it = t; break; } }
          const ut = ['dtg ' + M.dtg + ' t0 ' + new Date(M.t0).toISOString() + ' it ' + it];
          for (let k = 38; k < NIV; k++) ut.push(k + ': T=' + (M.tqHar[it * NIV + k] ? (M.ta[it * NIV + k] - 273.15).toFixed(2) : '-') + ' ap=' + (M.ap ? M.ap[k] : '') + ' b=' + (M.b ? M.b[k] : ''));
          return ut.join('\\n'); })()""")
        print(r)
        await b.close()
asyncio.run(main())
