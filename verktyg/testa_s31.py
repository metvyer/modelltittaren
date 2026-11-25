# Prov S31 (25/11 kvall): byvind medlem 0 per timme i forhamtningen (saknas fore 03Z?)
import asyncio, time, os
from playwright.async_api import async_playwright
os.makedirs('matprov', exist_ok=True); open('sida.md', 'w').write('S31')
SIDA = "https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); s = await b.new_page(viewport={"width": 1400, "height": 1000}); fel = []
        s.on("pageerror", lambda e: fel.append(str(e)))
        await s.goto(SIDA); await s.wait_for_timeout(4000)
        await s.evaluate("bytLage('f')"); await s.wait_for_timeout(7000); await s.evaluate("$('testskylt').hidden = true")
        print(await s.evaluate("""(async () => { const idx = await svIndex(), u = ['index ' + idx.dtg + ' bas ' + idx.bas + ' skapad ' + idx.skapad];
          const NY = Math.floor((idx.y1 - idx.y0) / 2) + 1, NX = Math.floor((idx.x1 - idx.x0) / 2) + 1, n = NY * NX;
          for (const v of ['by', 'nb']) for (let t = 0; t <= 14; t++) { const d0 = await svFil(idx.dtg, v, t, idx.bas); if (!d0) { u.push(v + ' +' + t + ' ingen fil'); continue; }
            const d = v === 'nb' ? new Uint16Array(d0.buffer, 0, Math.floor(d0.byteLength / 2)) : d0, ms = v === 'nb' ? 65535 : 255;
            const c = m => { let k = 0; for (let i = m * n; i < (m + 1) * n; i++) if (d[i] !== ms) k++; return k; };
            u.push(v + ' +' + t + ': m0 ' + c(0) + ' m1 ' + c(1) + ' m14 ' + c(14) + ' m15 ' + c(15) + ' m16 ' + c(16) + ' m29 ' + c(29) + ' (n ' + n + ')'); }
          return u.join('\\n'); })()"""))
        print("fel:", fel[:5]); await b.close()
asyncio.run(main())
