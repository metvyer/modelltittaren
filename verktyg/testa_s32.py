# Prov S32 (25/11 kvall): satellit over Afrika/Mellanostern
import asyncio, time, os
from playwright.async_api import async_playwright
os.makedirs('matprov', exist_ok=True); open('sida.md', 'w').write('S32')
SIDA = "https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); s = await b.new_page(viewport={"width": 1400, "height": 1000}); fel = []
        s.on("pageerror", lambda e: fel.append(str(e)))
        await s.goto(SIDA); await s.wait_for_timeout(4000)
        await s.evaluate("bytLage('sat')"); await s.wait_for_timeout(8000); await s.evaluate("$('testskylt').hidden = true")
        print("granser:", await s.evaluate("JSON.stringify({ af: KARTA_AF, gr: kartGr(), maxb: Math.round(kartMaxBredd()) })"))
        for namn, lat, lon, w in [("Mogadishu", 2.04, 45.34, 1600), ("Nordafrika", 30, 15, 2600), ("Hela", None, None, None)]:
            if lat is None: await s.evaluate("$('zHem').click()")
            else: await s.evaluate(f"(() => {{ const q = tillKarta({lat}, {lon}), a = kartAspekt(); satVb(q.x - {w} / 2, q.y - {w} * a / 2, {w}); }})()")
            await s.wait_for_timeout(12000)
            print(namn, ":", await s.evaluate("'vb ' + [vb.x, vb.y, vb.w].map(Math.round) + ' | bilder ' + $('kObs').querySelectorAll('image').length + ' | ' + $('obsStatus').textContent + ' | ' + $('obsTid').textContent"))
            await s.screenshot(path=f"matprov/s32_{namn}.png")
        print("fel:", fel[:5]); await b.close()
asyncio.run(main())
