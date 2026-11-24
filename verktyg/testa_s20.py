# Prov S20 (24/11 kvall): valkomstrutan, ideladan, testskylten (30 min), Ledskikt avbryter gammal hamtning
import asyncio, time, os
from playwright.async_api import async_playwright
os.makedirs('matprov', exist_ok=True); open('sida.md', 'w').write('S20')
SIDA = "https://metvyer.github.io/modelltittaren/?v=" + str(int(time.time()))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); s = await b.new_page(viewport={"width": 1400, "height": 1100}); fel = []
        s.on("pageerror", lambda e: fel.append(str(e)))
        await s.goto(SIDA); await s.wait_for_timeout(5000)
        print("forsta besok:", await s.evaluate("'valkommen ' + !$('valkommen').hidden + ', testskylt ' + !$('testskylt').hidden"))
        await s.screenshot(path="matprov/s20a.png")
        await s.click("#valkommenOk"); await s.wait_for_timeout(300)
        await s.evaluate("bytLage('m0')"); await s.wait_for_timeout(500)
        print("flikbyte direkt efter:", await s.evaluate("'testskylt ' + !$('testskylt').hidden"))
        await s.evaluate("lagra('mt:testskylt', String(Date.now() - 31 * 60e3)); bytLage('th')"); await s.wait_for_timeout(500)
        print("flikbyte efter 31 min:", await s.evaluate("'testskylt ' + !$('testskylt').hidden"))
        await s.evaluate("$('testskylt').hidden = true")
        await s.reload(); await s.wait_for_timeout(4000)
        print("omladdning:", await s.evaluate("'valkommen ' + !$('valkommen').hidden + ', testskylt ' + !$('testskylt').hidden"))
        await s.click("#omKnapp"); await s.wait_for_timeout(300)
        print("om sidan:", await s.evaluate("!$('valkommen').hidden")); await s.click("#valkommenOk")
        await s.click("#ideKnapp"); await s.wait_for_timeout(300)
        await s.fill("#ideText", "TEST från prov S20 (automatiskt) – kan raderas"); await s.fill("#ideNamn", "Provet")
        await s.screenshot(path="matprov/s20b.png")
        await s.click("#ideSkicka"); await s.wait_for_timeout(4000)
        print("ide skickad:", await s.evaluate("$('ideSvar').textContent + ' | ruta ' + !$('ideRuta').hidden"))
        print("ide utan nyckel:", await s.evaluate("fetch('https://modelltittaren.metvyer.workers.dev/ide').then(r => r.status)"))
        # Ledskikt: tva klick tatt -> bara det sista ska bli klart
        await s.evaluate("bytLage('led')"); await s.wait_for_timeout(800); await s.evaluate("$('testskylt').hidden = true")
        await s.evaluate("ledKartKlick(58.0, 12.0)"); await s.wait_for_timeout(1500); await s.evaluate("ledKartKlick(56.0, 16.0)")
        for i in range(90):
            await s.wait_for_timeout(1000); st = await s.evaluate("$('ledStatus').innerText")
            if st.startswith("Klart") or st.startswith("Kunde"): break
        print("ledskikt:", st, "|", await s.evaluate("$('ledPlats').textContent + ' | data ' + (LED.data && LED.data.ry) + ',' + (LED.data && LED.data.rx)"))
        await s.evaluate("bytLage('fall')"); await s.wait_for_timeout(800); await s.evaluate("$('testskylt').hidden = true")
        print("vaderfall:", await s.evaluate("lage + ' | ' + $('underrubrik').textContent + ' | ' + $('vyFall').innerText.slice(0, 120).replace(/\\n/g, ' ')"))
        await s.screenshot(path="matprov/s20c.png")
        print("fel:", fel[:5]); await b.close()
asyncio.run(main())
