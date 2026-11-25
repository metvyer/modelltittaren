# Prov S31b (25/11 kvall): MBR0 byvind per timme i Favoriter - vad ritas?
import asyncio, time, os
from playwright.async_api import async_playwright
os.makedirs('matprov', exist_ok=True); open('sida.md', 'w').write('S31')
SIDA = "https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); s = await b.new_page(viewport={"width": 1400, "height": 1000}); fel = []
        s.on("pageerror", lambda e: fel.append(str(e)))
        s.on("console", lambda m: fel.append("konsol: " + m.text) if m.type == "error" else None)
        await s.goto(SIDA); await s.wait_for_timeout(4000)
        await s.evaluate("bytLage('f')"); await s.wait_for_timeout(7000); await s.evaluate("$('testskylt').hidden = true")
        await s.evaluate("document.querySelector('#favPanel button[data-m0=by]').click()"); await s.wait_for_timeout(4000)
        nu = await s.evaluate("+$('pFran').value"); print("P.dtg", await s.evaluate("P.dtg + ' senast ' + P.senast + ' idx ' + (SVIDX && SVIDX.dtg) + ' korningVal ' + $('pKorningVal').value"), "nu", nu)
        for t in range(nu, min(nu + 12, 36)):
            await s.evaluate(f"$('pFran').value = {t}; $('pTill').value = {t}; $('pTill').dispatchEvent(new Event('change'))"); await s.wait_for_timeout(2500)
            for i in range(15):
                if not await s.evaluate("P.upptagen"): break
                await s.wait_for_timeout(1500)
            print(t, await s.evaluate("""(() => { const im = $('kProb').querySelectorAll('image').length; return 'visa ' + $('pVisa').value + ' param ' + $('pParam').value + ' bilder ' + im + ' | tom: ' + ($('kartTom').hidden ? '-' : $('kartTom').textContent.slice(0, 110)) + ' | ' + $('pStatus').textContent.slice(0, 110) + ' | sam ' + $('pSam').textContent.slice(0, 80); })()"""))
        await s.screenshot(path="matprov/s31.png")
        print("fel:", fel[:5]); await b.close()
asyncio.run(main())
