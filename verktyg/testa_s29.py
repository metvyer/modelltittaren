# Prov S29 (25/11 kvall): Favoriter MBR0 - "inga varden i fargskalan"? felsok
import asyncio, time, os
from playwright.async_api import async_playwright
os.makedirs('matprov', exist_ok=True); open('sida.md', 'w').write('S29')
SIDA = "https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))
DUMP = """(async () => { const v = $('pParam').value, pa = PPARAM[v], { a, b, fran, lista } = periodTimmar(), u = [];
  u.push(v + ' visa ' + $('pVisa').value + ' P.dtg ' + P.dtg + ' tid ' + a + '-' + b + ' | tom: ' + ($('kartTom').hidden ? '-' : $('kartTom').textContent) + ' | status: ' + $('pStatus').textContent.slice(0, 100));
  for (const e of P.index.filter(e => e.dtg === P.dtg && e.v === v)) { const r = await beraknaOmrade(e, pa, a, b, fran, 1, lista); if (!r) { u.push('  s' + e.s + ' inget'); continue; }
    const n = r.o.ny * r.o.nx; const per = []; for (const m of [0, 1, 7, 14, 15, 29]) { let c = 0, mn = 1e9, mx = -1e9; for (let p = 0; p < n; p++) { const w = r.agg[m * n + p]; if (isFinite(w)) { c++; mn = Math.min(mn, w); mx = Math.max(mx, w); } } per.push('m' + m + ':' + c + (c ? '[' + Math.round(mn) + '..' + Math.round(mx) + ']' : '')); }
    u.push('  s' + e.s + ' n ' + n + ' utan ' + JSON.stringify(r.utan || []).slice(0, 80) + ' | ' + per.join(' ')); }
  return u.join('\\n'); })()"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); s = await b.new_page(viewport={"width": 1400, "height": 1000}); fel = []
        s.on("pageerror", lambda e: fel.append(str(e)))
        await s.goto(SIDA); await s.wait_for_timeout(4000)
        await s.evaluate("bytLage('f')"); await s.wait_for_timeout(7000); await s.evaluate("$('testskylt').hidden = true")
        for v in ["by", "sikt", "bas", "nb"]:
            await s.evaluate(f"document.querySelector('#favPanel button[data-m0={v}]').click()"); await s.wait_for_timeout(5000)
            for i in range(20):
                if not await s.evaluate("P.upptagen"): break
                await s.wait_for_timeout(1500)
            print("MBR0 " + await s.evaluate(DUMP))
        await s.screenshot(path="matprov/s29a.png")
        print("fel:", fel[:5]); await b.close()
asyncio.run(main())
