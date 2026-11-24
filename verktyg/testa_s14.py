# Prov S14 (24/11): bildspel, medlem 0:s rang i Favoriter/Sannolikhet, min/max-medlem i meteogrammet.
import asyncio, time, json
from playwright.async_api import async_playwright
SIDA = "https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); fel = []
        s = await b.new_page(viewport={"width": 1400, "height": 1000}); s.on("pageerror", lambda e: fel.append(str(e)))
        await s.goto(SIDA); await s.wait_for_timeout(5000)
        await s.evaluate("$('testskylt').hidden = true")
        print("skript:", await s.evaluate("[...document.scripts].map(x => x.src).filter(x => /bildspel|sannolikhet/.test(x)).join(' ')"))
        # 1. bildspel
        await s.evaluate("bytLage('m0')"); await s.wait_for_timeout(4000)
        await s.evaluate("$('bildKnapp').click()"); await s.wait_for_timeout(500)
        await s.evaluate("RIT.linjer = [{p: [[60, 15], [62, 18]], farg: 'rod', text: 'Prov'}]; ritSpara(); ritRita(); bsSparaNu('MBR0 med linje', false)")
        await s.evaluate("RIT.linjer = []; ritSpara(); bytLage('sat')"); await s.wait_for_timeout(2500)
        await s.evaluate("bsSparaNu('Satellit', true)")
        print("bilder:", await s.evaluate("BS.lista.map(x => x.namn + ':' + x.vy.l + (x.frys ? ':frys' : '') + ':' + JSON.stringify(x.giltig)).join(' | ')"))
        await s.evaluate("bsVisa(0)"); await s.wait_for_timeout(4000)
        print("efter bild 1:", await s.evaluate("lage + ', linjer ' + RIT.linjer.length + ', m0t ' + M0F.t + ', rad: ' + $('bildRad').textContent.slice(0, 160)"))
        await s.keyboard.press("PageDown"); await s.wait_for_timeout(3000)
        print("efter PageDown:", await s.evaluate("lage + ', aktiv ' + BS.aktiv + ', linjer ' + RIT.linjer.length"))
        # 2. rang i Favoriter
        await s.evaluate("bytLage('f')"); await s.wait_for_timeout(8000)
        await s.evaluate("$('pVisa').value = 'm0rang'; $('pVisa').dispatchEvent(new Event('change'))"); await s.wait_for_timeout(3000)
        print("rang:", await s.evaluate("$('pSam').textContent.slice(0, 150) + ' | forkl: ' + $('pForkl').textContent.slice(0, 120)"))
        print("rang-varden:", await s.evaluate("(() => { const r = (P.siffKalla || [])[0]; if (!r || !r.d) return 'inga'; const a = Array.from(r.d).filter(isFinite); return a.length + ' rutor, min ' + Math.min(...a).toFixed(0) + ' max ' + Math.max(...a).toFixed(0) + ' medel ' + (a.reduce((x, y) => x + y, 0) / a.length).toFixed(0); })()"))
        # 3. meteogram
        await s.evaluate("$('pVisa').value = 'sannolikhet'; $('pVisa').dispatchEvent(new Event('change')); visaMeteogram()"); await s.wait_for_timeout(15000)
        await s.evaluate("$('pMeteoExt').click()"); await s.wait_for_timeout(1000)
        print("meteogram:", await s.evaluate("$('pMeteoRuta').hidden ? 'dolt' : 'syns, siffror ' + [...$('pMeteoSvg').querySelectorAll('text')].filter(t => t.getAttribute('font-size') === '8').length"))
        r = json.loads(await s.evaluate("JSON.stringify((() => { const h = [...$('pMeteoSvg').querySelectorAll('rect')].find(x => x.getAttribute('fill') === 'transparent'); const b = h.getBoundingClientRect(); return {x: b.x + b.width / 2, y: b.y + b.height / 2}; })())"))
        await s.mouse.move(r["x"], r["y"]); await s.wait_for_timeout(500)
        print("hovring kurvor:", await s.evaluate("[...$('pMeteoSvg').querySelectorAll('path')].filter(x => x.getAttribute('stroke-dasharray') === '3 2').length + ' streckade, ' + [...$('pMeteoSvg').querySelectorAll('text')].filter(t => /^m\\d+$/.test(t.textContent)).map(t => t.textContent).join(',')"))
        print("under musen:", await s.evaluate(f"(() => {{ const e = document.elementFromPoint({r['x']}, {r['y']}); return e ? e.tagName + ' ' + (e.id || e.getAttribute('fill') || e.className.baseVal || '') : 'inget'; }})()"), r)
        await s.evaluate("[...$('pMeteoSvg').querySelectorAll('rect')].filter(x => x.getAttribute('fill') === 'transparent')[20].dispatchEvent(new MouseEvent('mousemove', {clientX: 300, clientY: 300, bubbles: true}))"); await s.wait_for_timeout(300)
        print("syntetisk hovring:", await s.evaluate("[...$('pMeteoSvg').querySelectorAll('path')].filter(x => x.getAttribute('stroke-dasharray') === '3 2').length + ' streckade, ' + [...$('pMeteoSvg').querySelectorAll('text')].filter(t => /^m\\d+$/.test(t.textContent)).map(t => t.textContent).join(',')"))
        await s.screenshot(path="s14.png")
        print("fel:", fel[:6]); await b.close()
asyncio.run(main())
