# Prov S16 (24/11): KONRAD3D - riktig fil (oftast inga celler i november) + en konstgjord cell med prognos
import asyncio, time
from playwright.async_api import async_playwright
SIDA = "https://metvyer.github.io/modelltittaren/?prov=" + str(int(time.time()))
PROV = """<?xml version="1.0" ?><konrad3d><head><metadata><reference_time>2026-11-24T12:00:00Z</reference_time></metadata><product><associated_grid_projection><projected_area>
<upper_left_corner>55.86209 1.46330</upper_left_corner><upper_right_corner>55.84544 18.73162</upper_right_corner><lower_left_corner>45.69643 3.56699</lower_left_corner><lower_right_corner>45.68461 16.58087</lower_right_corner>
</projected_area></associated_grid_projection></product></head><cells reference_time="2026-11-24T12:00:00Z"><feature identifier="7"><metadata><identifier>7</identifier></metadata>
<tracking><cell_speed>40.0</cell_speed><reference_time_first_detection>2026-11-24T11:30:00Z</reference_time_first_detection></tracking>
<forecast><centroid_forecasts><centroid_forecast forecast_time="2026-11-24T12:15:00Z"><geodetic_coordinate><latitude>55.55</latitude><longitude>13.30</longitude></geodetic_coordinate></centroid_forecast>
<centroid_forecast forecast_time="2026-11-24T12:30:00Z"><geodetic_coordinate><latitude>55.6</latitude><longitude>13.5</longitude></geodetic_coordinate></centroid_forecast>
<centroid_forecast forecast_time="2026-11-24T13:00:00Z"><geodetic_coordinate><latitude>55.7</latitude><longitude>13.9</longitude></geodetic_coordinate></centroid_forecast></centroid_forecasts></forecast>
<geometry><covered_area>40</covered_area><centroid_3d><geodetic_coordinate><latitude>55.5</latitude><longitude>13.1</longitude></geodetic_coordinate></centroid_3d><echo_top_msl>9000</echo_top_msl>
<polygons_projected><geodetic_coordinates><polygon no="0"><latitudes>55.45 55.55 55.55 55.45</latitudes><longitudes>13.0 13.0 13.2 13.2</longitudes></polygon></geodetic_coordinates></polygons_projected></geometry>
<intensity><severity>3</severity><max_value>58.2</max_value><cell_based_VIL>30.5</cell_based_VIL><hail_flag>1</hail_flag><heavy_rain_potential>30</heavy_rain_potential><trends><severity_trend>0.4</severity_trend></trends></intensity>
<lightning><lightning_rate>12</lightning_rate></lightning></feature></cells></konrad3d>"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); s = await b.new_page(viewport={"width": 1400, "height": 1000}); fel = []
        s.on("pageerror", lambda e: fel.append(str(e)))
        await s.goto(SIDA); await s.wait_for_timeout(4000)
        await s.evaluate("$('testskylt').hidden = true; bytLage('m0')"); await s.wait_for_timeout(1500)
        await s.evaluate("$('konradKnapp').click()"); await s.wait_for_timeout(6000)
        print("riktig fil:", await s.evaluate("KD.fil + ', ' + KD.celler.length + ' celler, tid ' + new Date(KD.tid).toISOString() + ', horn ' + JSON.stringify(KD.horn) + ', fel ' + KD.fel + ', banor ' + $('kKonrad').querySelectorAll('path').length"))
        await s.evaluate("const t = kdTolka(" + repr(PROV) + "); KD.celler = t.celler; KD.tid = t.tid; KD.horn = t.horn; kdRita()")
        print("konstgjord:", await s.evaluate("JSON.stringify(KD.celler[0]).slice(0, 300) + ' | konrad-grupper ' + $('kKonrad').querySelectorAll('.konrad').length + ', text ' + [...$('kKonrad').querySelectorAll('text')].map(t => t.textContent).join(',')"))
        print("hovring:", await s.evaluate("kdTipsText(KD.celler[0]).replace(/<[^>]+>/g, '')"))
        await s.evaluate("bytLage('rad')"); await s.wait_for_timeout(5000)
        print("i radar:", await s.evaluate("'synlig ' + kdSynligNu() + ', celler ritade ' + $('kKonrad').querySelectorAll('.konrad').length"))
        print("fel:", fel[:5]); await b.close()
asyncio.run(main())
