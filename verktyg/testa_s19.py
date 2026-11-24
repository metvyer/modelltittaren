# Prov S19 (24/11): fliken Ledskikt - hamtning, berakning, diagram, zoom
import asyncio, time
from playwright.async_api import async_playwright
SIDA = "https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))
import os
os.makedirs('matprov', exist_ok=True); open('sida.md', 'w').write('S19')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); s = await b.new_page(viewport={"width": 1400, "height": 1300}); fel = []
        s.on("pageerror", lambda e: fel.append(str(e)))
        await s.goto(SIDA); await s.wait_for_timeout(4000)
        await s.evaluate("$('testskylt').hidden = true; bytLage('led')")
        for i in range(120):
            await s.wait_for_timeout(1000)
            st = await s.evaluate("$('ledStatus').textContent")
            if st.startswith("Klart") or st.startswith("Kunde"): break
        print("status:", st, "|", await s.evaluate("$('underrubrik').textContent + ' | ' + $('ledPlats').textContent + ' | ' + $('ledKorn').textContent"))
        print("rakning:", await s.evaluate("""(() => { const D = LED.data, pr = D.prof[LED.t], P = ledSkikt(pr, true);
          const r = a => Math.round(a * 10) / 10;
          return JSON.stringify({ nt: D.nt, kTop: D.kTop, npt: pr.pt.length, lagst: pr.pt.slice(0, 4).map(a => [r(a.z), r(a.p / 100), r(a.T - 273.15), r(a.Td), r(a.N), r(a.M), r(a.FL)]),
            topp: [r(pr.pt[pr.pt.length - 1].z), r(pr.pt[pr.pt.length - 1].p / 100)],
            skikt: P.sk.slice(0, 6).map(s => [r(s.z0), r(s.z1), r(s.g), r(s.gT), r(s.gQ)]), medel1_3km: r(P.sk.filter(s => s.z0 > 1000 && s.z1 < 3000).reduce((a, s) => a + s.g * (s.z1 - s.z0), 0) / 2000) }); })()"""))
        print("ledskikt alla timmar:", await s.evaluate("(() => { const u = []; LED.data.prof.forEach((pr, t) => { if (!pr) return; const L = ledLedskikt(ledSkikt(pr, true)); if (L.length) u.push(t + ':' + L.map(d => d.typ[0] + Math.round(d.bas) + '-' + Math.round(d.topp) + '/' + d.dM.toFixed(1)).join(',')); }); return u.slice(0, 25).join(' ') || 'inga'; })()"))
        print("diagram:", await s.evaluate("'TH rect ' + $('ledTH').querySelectorAll('rect').length + ', linjer ' + $('ledTH').querySelectorAll('line[stroke=\"#000\"]').length + ', prof paths ' + $('ledProfSvg').querySelectorAll('path').length + ' | ' + $('ledLista').innerText.slice(0, 300).replace(/\\n/g, ' | ')"))
        await s.screenshot(path="matprov/s19a.png", full_page=True)
        # zoom med hjul over tid-hojd
        await s.evaluate("$('ledTH').scrollIntoView({block: 'center'})"); await s.wait_for_timeout(300)
        bb = await s.evaluate("(() => { const r = $('ledTH').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * 0.8]; })()")
        await s.mouse.move(bb[0], bb[1]); await s.mouse.wheel(0, -400); await s.wait_for_timeout(600)
        print("under musen:", await s.evaluate(f"(() => {{ const e = document.elementFromPoint({bb[0]}, {bb[1]}); return e ? e.tagName + '#' + e.id + ' i ' + (e.closest('svg') || {{}}).id : 'inget'; }})()"))
        print("zoom:", await s.evaluate("JSON.stringify([Math.round(LED.z0), Math.round(LED.z1), LED.tA, LED.tB])"))
        await s.evaluate(f"$('ledTH').dispatchEvent(new WheelEvent('wheel', {{ deltaY: -300, clientX: {bb[0]}, clientY: {bb[1]}, bubbles: true, cancelable: true }}))"); await s.wait_for_timeout(400)
        print("syntetisk zoom:", await s.evaluate("JSON.stringify([Math.round(LED.z0), Math.round(LED.z1), LED.tA, LED.tB])"))
        await s.keyboard.down("Shift"); await s.mouse.wheel(0, -400); await s.keyboard.up("Shift"); await s.wait_for_timeout(600)
        print("tidszoom:", await s.evaluate("JSON.stringify([Math.round(LED.z0), Math.round(LED.z1), LED.tA.toFixed(1), LED.tB.toFixed(1)])"))
        await s.evaluate("$('ledBredvid').click(); $('ledTQ').click()"); await s.wait_for_timeout(800)
        print("bredvid+tq:", await s.evaluate("'TH2 ' + !$('ledTH2').hidden + ' rect ' + $('ledTH2').querySelectorAll('rect').length + ', grad paths ' + $('ledGradSvg').querySelectorAll('path').length + ', gradram ' + !$('ledGradRam').hidden"))
        await s.screenshot(path="matprov/s19b.png", full_page=True)
        await s.evaluate("$('ledAter').click(); $('led2m').click()"); await s.wait_for_timeout(500)
        print("ater:", await s.evaluate("JSON.stringify([LED.z0, LED.z1, LED.tA, LED.tB, LED.med2])"))
        # annan punkt: klick pa kartan (Gotland, hav)
        await s.evaluate("ledKartKlick(57.0, 19.5)")
        for i in range(120):
            await s.wait_for_timeout(1000)
            st = await s.evaluate("$('ledStatus').textContent")
            if (st.startswith("Klart") or st.startswith("Kunde")) and "57" in await s.evaluate("$('ledPlats').textContent"): break
        print("ny punkt:", st, await s.evaluate("$('ledPlats').textContent"))
        await s.evaluate("$('ledFarg').click(); $('ledTot').click(); $('led2m').click()"); await s.wait_for_timeout(500)
        await s.screenshot(path="matprov/s19c.png", full_page=True)
        print("fel:", fel[:5]); await b.close()
asyncio.run(main())
