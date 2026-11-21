# Modelltittaren - STORT MÄTPROV AV DATAKÄLLOR (NYTT 21/11)
# Körs i GitHub (testa.yml, delar=V). För varje källa: svarar den, hur fort, hur stort, vilket format,
# FÅR WEBBLÄSAREN HÄMTA DIREKT (CORS-huvudet Access-Control-Allow-Origin när frågan kommer från
# metvyer.github.io), och ett utdrag (variabler, tider, upplösning). Inga nycklar används - bara öppna källor.
# Resultatet skrivs till kallor.md (sparas som artifact) och till loggen.

import json, re, time, urllib.error, urllib.request
from datetime import datetime, timedelta, timezone

UA = "Modelltittaren-matprov (github.com/metvyer/modelltittaren)"
SIDA = "https://metvyer.github.io"
UT = []
def skriv(s=""): print(s, flush=True); UT.append(s)

def fraga(url, tid=60, maxbyte=3_000_000):
    """(status, text, sekunder, byte, cors, typ)"""
    h = {"User-Agent": UA, "Origin": SIDA, "Accept": "*/*"}
    t0 = time.time(); st, data, cors, typ = 0, b"", "", ""
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=tid) as r:
            st = r.status; cors = r.headers.get("Access-Control-Allow-Origin", ""); typ = r.headers.get("Content-Type", "")
            data = r.read(maxbyte)
    except urllib.error.HTTPError as e:
        st = e.code; cors = e.headers.get("Access-Control-Allow-Origin", "") if e.headers else ""; typ = e.headers.get("Content-Type", "") if e.headers else ""
        try: data = e.read(20000)
        except Exception: pass
    except Exception as e:
        data = str(e).encode()
    time.sleep(1.5)
    return st, data.decode("utf-8", "replace"), time.time() - t0, len(data), cors, typ

def rad(namn, url, utdrag="", tid=60, maxbyte=3_000_000):
    st, txt, sek, by, cors, typ = fraga(url, tid, maxbyte)
    c = "✅ ja" if cors in ("*", SIDA) else ("❌ nej" if st == 200 else "–")
    ex = ""
    if st == 200 and utdrag:
        try: ex = utdrag(txt)
        except Exception as e: ex = "(kunde inte tolka: " + str(e)[:80] + ")"
    elif st != 200: ex = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", txt))[:160]
    skriv(f"| {namn} | {st} | {sek:.1f} s | {by/1024:.0f} kB | {c} | {typ.split(';')[0]} | {ex} |")
    return st, txt

def tabell(rubrik):
    skriv(); skriv("### " + rubrik); skriv("| källa | svar | tid | storlek | webbläsaren direkt (CORS) | format | utdrag |"); skriv("|---|---|---|---|---|---|---|")

nu = datetime.now(timezone.utc)
iso = lambda d: d.strftime("%Y-%m-%dT%H:%M:%SZ")
LAT, LON = 59.6519, 17.9186   # Arlanda

def thredds_katalog(txt):
    refs = re.findall(r'<catalogRef[^>]*xlink:title="([^"]+)"', txt) + re.findall(r'<dataset[^>]*name="([^"]+)"', txt)
    return f"{len(refs)} poster: " + ", ".join(sorted(set(refs))[:60])

def dds_vars(txt):
    v = re.findall(r"(?:Float32|Float64|Int32|Int16|Byte|Int8|UInt16) (\w+)\[([^;]*)\];", txt)
    dims = re.findall(r"\[(\w+) = (\d+)\]", txt)
    d = dict(dims)
    return f"{len(v)} variabler; dimensioner: " + ", ".join(f"{k}={n}" for k, n in list(d.items())[:12]) + " · " + ", ".join(sorted(set(x[0] for x in v))[:80])

def main():
    skriv("# Stort mätprov av datakällor " + nu.strftime("%Y-%m-%d %H:%MZ"))
    skriv("Varje rad: svarar källan från GitHub, tid, storlek, och om webbläsaren får hämta direkt från metvyer.github.io (annars via mellanservern).")

    # ---------------- met.no ----------------
    tabell("met.no – thredds och API")
    rad("thredds toppkatalog", "https://thredds.met.no/thredds/catalog.xml", thredds_katalog)
    rad("thredds metpplatest (MET Nordic)", "https://thredds.met.no/thredds/catalog/metpplatest/catalog.xml", thredds_katalog)
    rad("MET Nordic prognos 1 km, DDS", "https://thredds.met.no/thredds/dodsC/metpplatest/met_forecast_1_0km_nordic_latest.nc.dds", dds_vars)
    rad("MET Nordic analys 1 km, DDS", "https://thredds.met.no/thredds/dodsC/metpplatest/met_analysis_1_0km_nordic_latest.nc.dds", dds_vars)
    rad("MET Nordic prognos, tider", "https://thredds.met.no/thredds/dodsC/metpplatest/met_forecast_1_0km_nordic_latest.nc.ascii?time",
        lambda t: "tider: " + " ".join(re.findall(r"\d{10}", t)[:3]) + " … " + str(len(re.findall(r"\d{10}", t))) + " st")
    rad("MEPS vc (modellnivåer) det, DDS", "https://thredds.met.no/thredds/dodsC/mepslatest/meps_det_vc_2_5km_latest.nc.dds", dds_vars)
    rad("AROME Arctic", "https://thredds.met.no/thredds/catalog/aromearcticlatest/catalog.xml", thredds_katalog)
    rad("api.met.no locationforecast (Arlanda)", f"https://api.met.no/weatherapi/locationforecast/2.0/complete?lat={LAT}&lon={LON}",
        lambda t: (lambda j: f"{len(j['properties']['timeseries'])} tider, parametrar: " + ", ".join(j['properties']['timeseries'][0]['data']['instant']['details'].keys()))(json.loads(t)))
    rad("api.met.no nowcast (Arlanda)", f"https://api.met.no/weatherapi/nowcast/2.0/complete?lat={LAT}&lon={LON}",
        lambda t: (lambda j: f"{len(j['properties']['timeseries'])} tider (steg {j['properties']['timeseries'][0]['time']} → {j['properties']['timeseries'][1]['time']})")(json.loads(t)))
    rad("Frost (obs) – kräver nyckel?", "https://frost.met.no/observations/availableTimeSeries/v0.jsonld?sources=SN18700", lambda t: t[:120])

    # ---------------- FMI ----------------
    tabell("FMI – öppna data (WFS)")
    WFS = "https://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request="
    def sq_beskr(t):
        par = re.findall(r'<Parameter name="(\w+)"', t); ab = re.findall(r"<Abstract[^>]*>(.*?)</Abstract>", t, re.S)
        return re.sub(r"\s+", " ", ab[0])[:220] + " · parametrar: " + ", ".join(par[:25]) if ab else ", ".join(par)
    for sq in ["fmi::forecast::harmonie::surface::grid", "fmi::forecast::meps::surface::grid", "fmi::forecast::harmonie::pressure::grid", "fmi::forecast::harmonie::hybrid::grid"]:
        rad("beskrivning " + sq, WFS + "describeStoredQueries&storedquery_id=" + sq, sq_beskr)
    def korningar(t):
        ot = sorted(set(re.findall(r"<omso:phenomenonTime>.*?</omso:phenomenonTime>|origintime=([0-9T:Z-]+)", t)))
        ot = sorted(set(x for x in re.findall(r"origintime=([0-9T:\-]+Z)", t)))
        st_ = sorted(set(re.findall(r"timestep=(\d+)", t)))
        lankar = re.findall(r"<gml:fileReference>(.*?)</gml:fileReference>", t)
        return f"körningar: {', '.join(ot[-6:])} · timestep: {st_} · {len(lankar)} fillänkar, t.ex. {lankar[0][:200] if lankar else '–'}"
    for sq in ["fmi::forecast::harmonie::surface::grid", "fmi::forecast::meps::surface::grid"]:
        rad("körningar " + sq, WFS + "getFeature&storedquery_id=" + sq + "&parameters=Temperature&bbox=17,59,18,60", korningar, tid=120)
    rad("FMI radar dBZ-komposit", WFS + "getFeature&storedquery_id=fmi::radar::composite::dbz&starttime=" + iso(nu - timedelta(minutes=30)),
        lambda t: f"{len(re.findall(r'<gml:fileReference>', t))} bilder, t.ex. " + (re.findall(r"<gml:fileReference>(.*?)</gml:fileReference>", t) or ["–"])[0][:200])
    rad("FMI blixtar (senaste timmen)", WFS + "getFeature&storedquery_id=fmi::observations::lightning::multipointcoverage&starttime=" + iso(nu - timedelta(hours=1)),
        lambda t: f"{t.count('<gml:pos>') or len(re.findall(r'[0-9.]+ [0-9.]+ [0-9]{10}', t))} positioner (ungefär)")
    rad("FMI sonderingar (Jokioinen)", WFS + "getFeature&storedquery_id=fmi::observations::weather::sounding::multipointcoverage&fmisid=101104",
        lambda t: f"{len(t)//1024} kB svar")
    rad("FMI WMS (openwms) lager", "https://openwms.fmi.fi/geoserver/wms?service=WMS&request=GetCapabilities&version=1.3.0",
        lambda t: f"{len(re.findall(r'<Layer', t))} lager, t.ex. " + ", ".join(re.findall(r"<Name>([^<]+)</Name>", t)[1:25]), tid=90)

    # ---------------- SMHI ----------------
    tabell("SMHI – öppna data")
    def lankar_json(t):
        j = json.loads(t); s = json.dumps(j)[:400]; return s
    # rattade adresser (21/11): nya API:erna SNOW1gv1 (prognos) och Mesan2g v3 (analys)
    SN = "https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/"
    rad("SMHI SNOW1g punkt (Arlanda)", SN + f"geotype/point/lon/{LON:.2f}/lat/{LAT:.2f}/data.json",
        lambda t: (lambda j: f"{len(j.get('timeSeries', []))} tider, första {j['timeSeries'][0].get('time')}, andra {j['timeSeries'][1].get('time')} · parametrar: " + ", ".join(list(j['timeSeries'][0].get('data', {}).keys())[:40]))(json.loads(t)))
    rad("SMHI SNOW1g giltiga tider", SN + "geotype/multipoint/validtime.json", lambda t: t[:300])
    rad("SMHI SNOW1g hela Sverige, en parameter", SN + "geotype/multipoint/time/" + (nu.replace(minute=0, second=0) + timedelta(hours=3)).strftime("%Y%m%dT%H0000Z") + "/parameter/air_temperature/data.json?with-geo=false&downsample=1",
        lambda t: (lambda j: f"{len(j.get('values', []))} punkter (hela Sverige, en tid)")(json.loads(t)), maxbyte=20_000_000)
    rad("SMHI SNOW1g geometri", SN + "geotype/multipoint.json?downsample=20", lambda t: t[:200], maxbyte=20_000_000)
    rad("SMHI Mesan2g v3 punkt", f"https://opendata-download-metanalys.smhi.se/api/category/mesan2g/version/3/geotype/point/lon/{LON:.2f}/lat/{LAT:.2f}/data.json",
        lambda t: (lambda j: f"{len(j.get('timeSeries', []))} tider · parametrar: " + ", ".join(list(j['timeSeries'][0].get('data', {}).keys())[:40]) if 'timeSeries' in j else t[:200])(json.loads(t)))
    rad("SMHI radar, produkter", "https://opendata-download-radar.smhi.se/api/version/latest/area/sweden/product/comp", lambda t: t[:300])
    rad("SMHI blixtar, senaste dag", "https://opendata-download-lightning.smhi.se/api/version/latest/year/" + nu.strftime("%Y/month/%m/day/%d") + "/data.json", lambda t: t[:200])
    rad("SMHI metfcst (prognoser) rot", "https://opendata-download-metfcst.smhi.se/api", lankar_json)
    rad("SMHI metfcst snow1g (ny?)", "https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1.json", lankar_json)
    rad("SMHI metfcst pmp3g v2 punkt (gammal)", f"https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/point/lon/{LON}/lat/{LAT}/data.json", lambda t: t[:200])
    rad("SMHI metanalys (MESAN) rot", "https://opendata-download-metanalys.smhi.se/api", lankar_json)
    rad("SMHI radar senaste komposit", "https://opendata-download-radar.smhi.se/api/version/latest/area/sweden/product/comp/latest", lambda t: t[:300])
    rad("SMHI blixtar rot", "https://opendata-download-lightning.smhi.se/api", lankar_json)
    rad("SMHI observationer rot", "https://opendata-download-metobs.smhi.se/api.json", lambda t: t[:300])
    rad("SMHI grid (GRIB AROME/MESAN)", "https://opendata-download-grid.smhi.se/", lambda t: ", ".join(re.findall(r'href="([^"]+)"', t)[:30]))
    rad("SMHI varningar", "https://opendata-download-warnings.smhi.se/ibww/api/version/1.json", lambda t: t[:200])
    rad("SMHI datakatalog (utforskaren)", "https://opendata.smhi.se/", lambda t: ", ".join(sorted(set(re.findall(r'href="(https://opendata[^"]+)"', t)))[:30]))

    # ---------------- DMI ----------------
    tabell("DMI – öppna data")
    rad("DMI prognosdata (STAC-samlingar)", "https://opendataapi.dmi.dk/v1/forecastdata/collections",
        lambda t: ", ".join(c.get("id", "?") for c in json.loads(t).get("collections", [])))
    rad("DMI EDR prognos (punkt)", "https://opendataapi.dmi.dk/v1/forecastedr/collections", lambda t: ", ".join(c.get("id", "?") for c in json.loads(t).get("collections", [])))

    # ---------------- ECMWF / DWD / NOAA ----------------
    tabell("ECMWF, DWD, NOAA – öppna data")
    rad("ECMWF open data, kataloger", "https://data.ecmwf.int/forecasts/", lambda t: ", ".join(re.findall(r'href="[^"]*?/(\d{8})/"', t)[-4:]))
    d = (nu - timedelta(hours=8)).strftime("%Y%m%d")
    rad("ECMWF open data, dagens körningar", f"https://data.ecmwf.int/forecasts/{d}/", lambda t: ", ".join(re.findall(r'href="[^"]*?/(\d{2}z)/"', t)))
    rad("ECMWF IFS 0.25 oper, filer 00z", f"https://data.ecmwf.int/forecasts/{d}/00z/ifs/0p25/oper/", lambda t: f"{len(re.findall(r'.grib2', t))} grib2-filer, t.ex. " + ", ".join(re.findall(r'(\d{14}-\d+h-oper-fc\.grib2)', t)[:3]))
    rad("ECMWF AIFS", f"https://data.ecmwf.int/forecasts/{d}/00z/", lambda t: ", ".join(re.findall(r'href="[^"]*?/00z/([^/"]+)/"', t)))
    rad("DWD ICON-EU (grib)", "https://opendata.dwd.de/weather/nwp/icon-eu/grib/", lambda t: ", ".join(re.findall(r'href="(\d{2})/"', t)))
    rad("DWD ICON-D2 (grib)", "https://opendata.dwd.de/weather/nwp/icon-d2/grib/", lambda t: ", ".join(re.findall(r'href="(\d{2})/"', t)))
    rad("NOAA GFS (NOMADS filter)", "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl", lambda t: t[:150])

    # ---------------- Open-Meteo (samlar många modeller, JSON) ----------------
    tabell("Open-Meteo – många modeller som JSON (gratis för icke-kommersiellt)")
    OM = f"https://api.open-meteo.com/v1/forecast?latitude={LAT}&longitude={LON}"
    for modell in ["metno_nordic", "dmi_harmonie_arome_europe", "knmi_harmonie_arome_europe", "ecmwf_ifs025", "ecmwf_aifs025_single", "icon_d2", "gfs_seamless"]:
        rad("Open-Meteo " + modell, OM + "&hourly=temperature_2m,wind_gusts_10m,cloud_cover_low,visibility&models=" + modell + "&forecast_days=2",
            lambda t: (lambda j: f"{len(j['hourly']['time'])} timmar, upplösning ~{j.get('generationtime_ms', 0):.0f} ms beräkning, första sikt {j['hourly'].get('visibility', [None])[0]}")(json.loads(t)))
    rad("Open-Meteo 15-minuters (metno_nordic)", OM + "&minutely_15=temperature_2m,precipitation,wind_gusts_10m&models=metno_nordic&forecast_days=1",
        lambda t: (lambda j: f"{len(j['minutely_15']['time'])} 15-min-steg, {j['minutely_15']['time'][0]} …")(json.loads(t)))
    rad("Open-Meteo ensemble (ICON-EU, ECMWF)", f"https://ensemble-api.open-meteo.com/v1/ensemble?latitude={LAT}&longitude={LON}&hourly=wind_gusts_10m&models=ecmwf_ifs025&forecast_days=2",
        lambda t: f"{len([k for k in json.loads(t)['hourly'] if k.startswith('wind_gusts_10m')])} medlemmar")

    # ---------------- Satellit ----------------
    tabell("Satellit och övrigt")
    rad("EUMETSAT EUMETView WMS", "https://view.eumetsat.int/geoserver/wms?service=WMS&request=GetCapabilities&version=1.3.0",
        lambda t: f"{len(re.findall(r'<Layer', t))} lager, t.ex. " + ", ".join([n for n in re.findall(r"<Name>([^<]+)</Name>", t) if re.search(r"mtg|msg|ir|vis|rgb", n, re.I)][:20]), tid=120, maxbyte=8_000_000)
    rad("NASA GIBS WMTS", "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/wmts.cgi?SERVICE=WMTS&REQUEST=GetCapabilities", lambda t: f"{len(re.findall(r'<Layer>', t))} lager", tid=90, maxbyte=8_000_000)
    rad("aviationweather SIGMET (internationella)", "https://aviationweather.gov/api/data/isigmet?format=json", lambda t: f"{len(json.loads(t))} SIGMET")
    rad("aviationweather PIREP/AIREP (Europa)", "https://aviationweather.gov/api/data/pirep?format=json&bbox=54,5,70,32&age=6", lambda t: f"{len(json.loads(t))} rapporter")

    with open("kallor.md", "w", encoding="utf-8") as f: f.write("\n".join(UT) + "\n")

if __name__ == "__main__":
    main()
