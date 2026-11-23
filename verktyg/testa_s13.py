# Prov S13 (23/11 kvall): delning i realtid - agaren skapar en delning och sander, tittaren foljer.
# Mater: kommer WebSocket upp hos bada, syns agarens mus hos tittaren, hur snabbt foljer flikbyte. Tar bort delningen efterat.
import asyncio, time, json, urllib.request
from playwright.async_api import async_playwright
SIDA = "https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); fel = []
        a = await b.new_page(viewport={"width": 1300, "height": 1000}); t = await b.new_page(viewport={"width": 1300, "height": 1000})
        for pg, n in ((a, "agare"), (t, "tittare")): pg.on("pageerror", lambda e, n=n: fel.append(n + ": " + str(e)))
        await a.goto(SIDA); await a.wait_for_timeout(4000)
        await a.evaluate("$('testskylt').hidden = true; DELA.vem = 'Provare'; bytLage('m0')"); await a.wait_for_timeout(3000)
        await a.evaluate("delaSkapa('').then(() => { DELA.panel = true; delaBygg(); })"); await a.wait_for_timeout(2500)
        d = json.loads(await a.evaluate("JSON.stringify(aktivDelning())")); print("delning:", d["id"])
        await t.goto(SIDA.split("?")[0] + "#v=" + d["id"]); await t.wait_for_timeout(9000)
        print("ws agare:", await a.evaluate("delaWsUppe()"), " ws tittare:", await t.evaluate("delaWsUppe()"), " tittaren i flik:", await t.evaluate("lage"))
        r = await a.evaluate("JSON.stringify($('karta').getBoundingClientRect())"); r = json.loads(r)
        for i in range(12): await a.mouse.move(r["x"] + 200 + i * 15, r["y"] + 250 + i * 8); await a.wait_for_timeout(60)
        await t.wait_for_timeout(800)
        print("under musen hos agaren:", await a.evaluate(f"(document.elementFromPoint({r['x'] + 300}, {r['y'] + 330}) || {{}}).id || (document.elementFromPoint({r['x'] + 300}, {r['y'] + 330}) || {{}}).tagName"))
        print("mus (riktig) hos tittaren:", await t.evaluate("($('kMus') ? $('kMus').getAttribute('transform') : 'ingen')"))
        await a.evaluate(f"$('karta').dispatchEvent(new PointerEvent('pointermove', {{clientX: {r['x'] + 300}, clientY: {r['y'] + 300}, bubbles: true}}))"); await t.wait_for_timeout(800)
        print("mus hos tittaren:", await t.evaluate("($('kMus') ? $('kMus').getAttribute('transform') + ' ' + $('kMus').children.length + ' delar ' + ($('kMus').querySelector('text') ? $('kMus').querySelector('text').textContent : '') : 'ingen')"))
        t0 = time.time(); await a.evaluate("bytLage('sat')")
        for i in range(60):
            if await t.evaluate("lage") == "sat": break
            await t.wait_for_timeout(100)
        print(f"flikbyte hos tittaren efter {time.time() - t0:.1f} s:", await t.evaluate("lage"))
        print("info tittare:", await t.evaluate("$('delaInfo') ? $('delaInfo').textContent.slice(0, 120) : ''"))
        await a.evaluate(f"fetch(DELA_URL + '?id={d['id']}&nyckel={d['nyckel']}&tabort=1', {{method: 'POST'}})"); await a.wait_for_timeout(1500)
        print("fel:", fel[:6]); await b.close()
asyncio.run(main())
