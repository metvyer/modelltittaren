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
        # del 1b: mottagaren ber att fa sanda -> gul rad overst hos agaren, aven med sandningsraden stangd
        await a.evaluate("DELA.panel = false; delaBygg()"); await t.evaluate("DELA.vem = 'Mottagare'; delaBeOmStyr()"); await a.wait_for_timeout(6000)
        print("fraga hos agaren:", await a.evaluate("$('delaFragaFast').hidden ? 'dold' : $('delaFragaFast').textContent + ' | sticky ' + getComputedStyle($('delaFragaFast')).position"))
        await a.evaluate("delaAgarSvar('neka')"); await a.wait_for_timeout(1500)
        print("efter Nej:", await a.evaluate("$('delaFragaFast').hidden ? 'dold' : 'syns'"))
        # del 1c: agaren har ritat och stoppar sandningen -> fragan Rensa?
        await a.evaluate("RIT.linjer.push({p: [[60, 15], [61, 17]], typ: 'linje'}); ritSpara(); DELA.panel = true; delaBygg()"); await a.wait_for_timeout(500)
        await a.evaluate("[...document.querySelectorAll('#delaRad button')].find(b => b.textContent.includes('Stoppa')).click()"); await a.wait_for_timeout(500)
        print("rensa-fraga:", await a.evaluate("$('delaFragaFast').hidden ? 'dold' : $('delaFragaFast').textContent"))
        await a.evaluate("[...document.querySelectorAll('#delaFragaFast button')].find(b => b.textContent.includes('Rensa')).click()"); await a.wait_for_timeout(500)
        print("efter Rensa:", await a.evaluate("RIT.linjer.length + ' linjer, raden ' + ($('delaFragaFast').hidden ? 'dold' : 'syns')"))
        await a.evaluate("DELA.sander = true; delaBygg()")
        await a.evaluate(f"fetch(DELA_URL + '?id={d['id']}&nyckel={d['nyckel']}&tabort=1', {{method: 'POST'}})"); await a.wait_for_timeout(1500)
        # del 2: DELAREN saknar direktlank (WebSocket stoppad i agarens sida) - tittaren ska fraga tatt och folja inom nagra s
        a2 = await b.new_page(viewport={"width": 1300, "height": 1000}); t2 = await b.new_page(viewport={"width": 1300, "height": 1000})
        await a2.add_init_script("window.WebSocket = function () { throw new Error('stoppad i provet'); };")
        await a2.goto(SIDA); await a2.wait_for_timeout(4000)
        await a2.evaluate("$('testskylt').hidden = true; DELA.vem = 'Utan'; bytLage('m0')"); await a2.wait_for_timeout(2000)
        await a2.evaluate("delaSkapa('')"); await a2.wait_for_timeout(2500)
        d2 = json.loads(await a2.evaluate("JSON.stringify(aktivDelning())"))
        await t2.goto(SIDA.split("?")[0] + "#v=" + d2["id"]); await t2.wait_for_timeout(9000)
        print("del 2 ws agare:", await a2.evaluate("delaWsUppe()"), " ws tittare:", await t2.evaluate("delaWsUppe()"), " sandare enligt rummet:", await t2.evaluate("WS.sandare"), " realtid:", await t2.evaluate("delaRealtid()"))
        for flik in ("sat", "rad"):
            t0 = time.time(); await a2.evaluate(f"bytLage('{flik}')")
            for i in range(200):
                if await t2.evaluate("lage") == flik: break
                await t2.wait_for_timeout(100)
            print(f"del 2 flikbyte till {flik} hos tittaren efter {time.time() - t0:.1f} s:", await t2.evaluate("lage"))
            await t2.wait_for_timeout(2000)
        await a2.evaluate(f"fetch(DELA_URL + '?id={d2['id']}&nyckel={d2['nyckel']}&tabort=1', {{method: 'POST'}})"); await a2.wait_for_timeout(1500)
        print("fel:", fel[:6]); await b.close()
asyncio.run(main())
