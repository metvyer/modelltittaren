# Prov S26 (25/11): Favoriter - MBR0-knappar, MBR0-linjen foljer troskeln (egen linjetroskel), nederbordsrad
import asyncio, time, os
from playwright.async_api import async_playwright
os.makedirs('matprov', exist_ok=True); open('sida.md', 'w').write('S26')
SIDA = "https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))
INFO = """(() => 'param ' + $('pParam').value + ' visa ' + $('pVisa').value + ' trosk ' + $('pTrosk').value + ' | linje ' + favLinjePa + ' vid ' + P.linjeTrosk + ' (ruta ' + $('favLinjeTr').value + ', rad synlig ' + !$('favLinjeRad').hidden + ')'
  + ' | intryckta: ' + [...document.querySelectorAll('#favPanel button[aria-pressed=true]')].map(b => b.textContent).join(',')
  + ' | bla linjer ' + [...document.querySelectorAll('#kProb path')].filter(p => p.getAttribute('stroke') === '#1d4ed8').length
  + ' | forkl: ' + $('pForkl').innerText.replace(/\\n/g, ' ').slice(-90) + ' | status: ' + $('pStatus').textContent.slice(0, 120))()"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); s = await b.new_page(viewport={"width": 1400, "height": 1000}); fel = []
        s.on("pageerror", lambda e: fel.append(str(e)))
        await s.goto(SIDA); await s.wait_for_timeout(4000)
        await s.evaluate("bytLage('f')"); await s.wait_for_timeout(6000); await s.evaluate("$('testskylt').hidden = true")
        print("knappar:", await s.evaluate("['favBy','favSikt','favBas','favNb'].map(id => id + ': ' + [...$(id).children].map(b => b.textContent).join(' ')).join(' | ')"))
        print("index v:", await s.evaluate("JSON.stringify(SVIDX && SVIDX.v)"))
        async def steg(namn, js, vanta=4000):
            await s.evaluate(js); await s.wait_for_timeout(vanta)
            for i in range(30):
                if not await s.evaluate("P.upptagen"): break
                await s.wait_for_timeout(2000)
            print(namn + ":", await s.evaluate(INFO))
        await steg("byvind 32", "document.querySelector('#favBy button[data-g=\"32\"]').click()")
        await steg("linje 27", "$('favLinjeTr').value = '27'; $('favLinjeTr').dispatchEvent(new Event('change'))", 1500)
        await s.screenshot(path="matprov/s26a.png")
        await steg("byvind 45", "document.querySelector('#favBy button[data-g=\"45\"]').click()")
        await steg("MBR0 byvind", "document.querySelector('#favBy button[data-m0]').click()")
        await steg("nederbord 1", "document.querySelector('#favNb button[data-g=\"1\"]').click()", 6000)
        await steg("period 6 h", "$('pTill').value = +$('pFran').value + 6; $('pTill').dispatchEvent(new Event('change'))", 6000)
        await s.screenshot(path="matprov/s26b.png")
        await steg("MBR0 nederbord", "document.querySelector('#favNb button[data-m0]').click()")
        await steg("linje av + sikt 3000", "$('favLinje').click(); document.querySelector('#favSikt button[data-g=\"3000\"]').click()")
        print("fel:", fel[:5]); await b.close()
asyncio.run(main())
