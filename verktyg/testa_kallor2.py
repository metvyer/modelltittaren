# Modelltittaren - DJUPARE MÄTPROV AV DATAKÄLLOR (NYTT 21/11, delar=Y)
# Hämtar riktiga data/bilder från de mest lovande källorna. Bilder sparas i mappen matprov/ (workflowen lägger dem
# i grenen "matprov" så att de kan tittas på). Text till loggen och kallor2.md. Bara öppna källor, inga nycklar.
import gzip, io, json, os, re, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

UA = "Modelltittaren-matprov (github.com/metvyer/modelltittaren)"
UT = []; os.makedirs("matprov", exist_ok=True)
def skriv(s=""): print(s, flush=True); UT.append(str(s))
nu = datetime.now(timezone.utc)
LAT, LON = 59.6519, 17.9186

def h(url, tid=90, maxb=40_000_000, gz=False, hdr=None):
    """(status, bytes, sek, cors, typ, slutadress)"""
    H = {"User-Agent": UA, "Origin": "https://metvyer.github.io", "Accept": "*/*"}
    if gz: H["Accept-Encoding"] = "gzip"
    if hdr: H.update(hdr)
    t0 = time.time()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=tid) as r:
            d = r.read(maxb)
            if r.headers.get("Content-Encoding") == "gzip": d = gzip.decompress(d)
            return r.status, d, time.time() - t0, r.headers.get("Access-Control-Allow-Origin", ""), r.headers.get("Content-Type", ""), r.geturl()
    except urllib.error.HTTPError as e:
        try: d = e.read(4000)
        except Exception: d = b""
        return e.code, d, time.time() - t0, "", "", url
    except Exception as e:
        return 0, str(e).encode(), time.time() - t0, "", "", url
    finally: time.sleep(1)
def txt(b): return b.decode("utf-8", "replace")
def kort(s, n=300): return re.sub(r"\s+", " ", s)[:n]
def spara(namn, data): open(os.path.join("matprov", namn), "wb").write(data); return namn

def avsnitt(rubrik): skriv(); skriv("## " + rubrik)

# ---------- 1. MTG (EUMETSAT) ----------
def mtg():
    avsnitt("1. MTG – EUMETSAT EUMETView (WMS)")
    st, d, s, c, ty, _ = h("https://view.eumetsat.int/geoserver/wms?service=WMS&request=GetCapabilities&version=1.3.0", maxb=20_000_000)
    t = txt(d)
    lager = re.findall(r"<Layer[^>]*>\s*<Name>([^<]+)</Name>\s*<Title>([^<]*)</Title>", t)
    mtgl = [(n, ti) for n, ti in lager if n.lower().startswith("mtg")]
    skriv(f"GetCapabilities {st}, {len(lager)} lager, varav MTG {len(mtgl)}:")
    for n, ti in mtgl: skriv(f"- `{n}` – {ti}")
    # tider for nagra lager
    for n, _ in mtgl[:40]:
        i = t.find("<Name>" + n + "</Name>"); blk = t[i:i + 4000]
        dim = re.search(r'<Dimension name="time"[^>]*>([^<]{0,200})', blk)
        if dim: skriv(f"  tider `{n}`: {kort(dim.group(1), 160)}")
    bbox = "52,5,70,32"  # lat/lon (EPSG:4326, WMS 1.3.0 ordning lat,lon)
    valda = [n for n, ti in mtgl if re.search(r"ir_?105|ir105|natural|rgb_?airmass|geocolour|geocolor|vis06|ir_?38|li|flash|lightning|cloud_?type|ctth|cth", n, re.I)][:8] or [n for n, _ in mtgl[:6]]
    for n in valda:
        url = "https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=" + urllib.parse.quote(n) + f"&styles=&crs=EPSG:4326&bbox={bbox}&width=900&height=600&format=image/png"
        st, d, s, c, ty, _ = h(url)
        f = spara("mtg_" + re.sub(r"[^a-z0-9]+", "_", n.lower()) + ".png", d) if st == 200 and ty.startswith("image") else None
        skriv(f"- bild `{n}`: {st}, {s:.1f} s, {len(d)//1024} kB, {ty}, CORS '{c}'" + (f" → {f}" if f else " " + kort(txt(d), 150)))

# ---------- 2. SMHI ----------
def smhi():
    avsnitt("2. SMHI")
    # radar: produkter och senaste bild
    st, d, s, c, ty, _ = h("https://opendata-download-radar.smhi.se/api/version/latest/area/sweden/product/comp")
    try:
        j = json.loads(d); skriv(f"Radar komposit: {st}, CORS '{c}', nycklar {list(j.keys())}")
        senaste = (j.get("lastFiles") or j.get("files") or j.get("firstFiles") or [])
        skriv("  senaste: " + kort(json.dumps(senaste[-1] if senaste else {}, ensure_ascii=False), 400))
        for fmt in (senaste[-1].get("formats", []) if senaste else []):
            if fmt.get("key") in ("png", "tif"):
                st2, d2, s2, c2, ty2, _ = h(fmt["link"])
                f = spara("smhi_radar." + fmt["key"], d2) if st2 == 200 else None
                skriv(f"  bild {fmt['key']}: {st2}, {len(d2)//1024} kB, {s2:.1f} s, CORS '{c2}' → {f}")
    except Exception as e: skriv(f"Radar: {st} {kort(txt(d), 200)} ({e})")
    st, d, s, c, ty, _ = h("https://opendata-download-radar.smhi.se/api/version/latest/area/sweden.json")
    skriv(f"Radar produkter: {st} " + kort(txt(d), 400))
    # katalogen: leta KNEP, nowcast, MEPS, blixt
    for q in ["KNEP", "nowcast", "MEPS", "blixt", "radar", "CMEPSS"]:
        st, d, s, c, ty, _ = h("https://opendata-catalog.smhi.se/srv/api/search/records/_search", hdr={"Content-Type": "application/json"}) if False else (0, b"", 0, "", "", "")
    for uid, namn in [("be9d3f7b-2fbc-4dca-92f9-baee027a3f89", "radarnowcast nederbörd"), ("d7568ec4-d9e0-4f8f-bf01-e9f672a79198", "MEPS"),
                      ("bbaf9e24-aea4-471f-afeb-9ab94d63bf96", "CMEPSS"), ("2d236bdc-9ba7-4296-bb96-bb5a2665bfff", "SNOW grid")]:
        st, d, s, c, ty, _ = h("https://opendata-catalog.smhi.se/md/" + uid)
        t = txt(d)
        titel = re.findall(r"<gmd:title>\s*<gco:CharacterString>([^<]+)", t)[:2]
        beskr = re.findall(r"<gmd:abstract>\s*<gco:CharacterString>([^<]+)", t)[:1]
        urls = sorted(set(u for u in re.findall(r"(https?://[^\s<\"']+)", t) if "opendata-download" in u or "opendata-view" in u or "apidocs" in u))
        skriv(f"- katalog {namn} ({st}): {titel} · {kort(beskr[0] if beskr else '', 500)}")
        for u in urls[:12]: skriv(f"    {u}")
    # SNOW hela Sverige (med gzip)
    SN = "https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/"
    st, d, s, c, ty, _ = h(SN + "geotype/multipoint/validtime.json", gz=True)
    skriv(f"SNOW giltiga tider: {st} " + kort(txt(d), 300))
    try:
        tider = json.loads(d).get("validTime") or json.loads(d).get("time") or []
        t1 = tider[3] if len(tider) > 3 else None
    except Exception: t1 = None
    t1s = re.sub(r"[-:]", "", t1)[:15] + "Z" if t1 else (nu.replace(minute=0, second=0, microsecond=0) + timedelta(hours=3)).strftime("%Y%m%dT%H%M%SZ")
    st, d, s, c, ty, _ = h(SN + f"geotype/multipoint/time/{t1s}/parameter/air_temperature/data.json?with-geo=false", gz=True)
    try: j = json.loads(d); v = j.get("values") or j.get("timeSeries"); skriv(f"SNOW hela Sverige, temperatur {t1s}: {st}, {s:.1f} s, {len(d)//1024} kB okomprimerat, {len(v) if v else '?'} punkter, CORS '{c}' · nycklar {list(j.keys())[:8]}")
    except Exception: skriv(f"SNOW hela Sverige: {st} {kort(txt(d), 200)}")
    st, d, s, c, ty, _ = h(SN + "geotype/multipoint.json?downsample=1", gz=True)
    try: j = json.loads(d); skriv(f"SNOW gitter: {st}, {len(d)//1024} kB, nycklar {list(j.keys())[:6]}, punkter {len(j.get('coordinates', []))}")
    except Exception: skriv(f"SNOW gitter: {st} {kort(txt(d), 200)}")
    st, d, s, c, ty, _ = h(SN + "parameters.json", gz=True)
    skriv(f"SNOW parametrar: {st} " + kort(txt(d), 1500))
    # blixtar
    st, d, s, c, ty, _ = h("https://opendata-download-lightning.smhi.se/api")
    t = txt(d); skriv(f"Blixtar rot: {st} länkar: " + ", ".join(sorted(set(re.findall(r'href="([^"]+)"', t)))[:10]))
    for u in ["https://opendata-download-lightning.smhi.se/api/version/latest.json", "https://opendata-download-lightning.smhi.se/api/version/latest/year/" + nu.strftime("%Y") + ".json",
              "https://opendata-download-lightning.smhi.se/api/version/latest/year/" + nu.strftime("%Y/month/%m/day/%d") + "/data.json"]:
        st, d, s, c, ty, _ = h(u); skriv(f"  {u.split('api/')[1]}: {st}, CORS '{c}', " + kort(txt(d), 250))
    # gridded oppna data (GRIB, MEPS m.fl.)
    for u in ["https://opendata-download-grid.smhi.se/explore/", "https://opendata-download-grid.smhi.se/api", "https://opendata-download-grid.smhi.se/atom/5"]:
        st, d, s, c, ty, _ = h(u); skriv(f"  grid {u}: {st} " + kort(txt(d), 250))

# ---------- 3. FMI ----------
def fmi():
    avsnitt("3. FMI – harmonie, meps och nowcast")
    W = "https://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request="
    for sq in ["fmi::forecast::harmonie::surface::grid", "fmi::forecast::meps::surface::grid"]:
        st, d, s, c, ty, _ = h(W + "describeStoredQueries&storedquery_id=" + sq)
        ab = re.findall(r"<Abstract[^>]*>(.*?)</Abstract>", txt(d), re.S); skriv(f"- {sq}: " + kort(ab[0] if ab else "", 900))
        st, d, s, c, ty, _ = h(W + "getFeature&storedquery_id=" + sq + "&parameters=Temperature,Precipitation1h&bbox=17.5,59.4,18.3,59.9&starttime=" + nu.strftime("%Y-%m-%dT%H:00:00Z") + "&endtime=" + (nu + timedelta(hours=3)).strftime("%Y-%m-%dT%H:00:00Z"), tid=120)
        t = txt(d); lank = [x.replace("&amp;", "&") for x in re.findall(r"<gml:fileReference>(.*?)</gml:fileReference>", t)]
        skriv(f"  körning(ar): {sorted(set(re.findall(r'origintime=([0-9T:-]+Z)', t)))} · {len(lank)} filer")
        if lank:
            u = lank[0] + ("&format=netcdf" if "format=" not in lank[0] else "")
            st2, d2, s2, c2, ty2, _ = h(u, tid=180)
            skriv(f"  fil: {st2}, {s2:.1f} s, {len(d2)//1024} kB, {ty2}, CORS '{c2}', början {d2[:8]!r}")
    # gissa producentnamn for nowcast i nedladdningstjansten
    for prod in ["mnwc_scandinavia_surface", "mnwc", "harmonie_mnwc_surface", "smartmet_nowcast", "nowcast_scandinavia_surface", "meps_scandinavia_surface", "harmonie_scandinavia_surface"]:
        u = f"https://opendata.fmi.fi/download?producer={prod}&param=Temperature&bbox=17.5,59.4,18.3,59.9&format=netcdf&projection=EPSG:4326"
        st, d, s, c, ty, _ = h(u, tid=60, maxb=200000)
        skriv(f"  producent `{prod}`: {st}, {len(d)//1024} kB, " + (kort(txt(d), 160) if st != 200 else "data"))
    st, d, s, c, ty, _ = h("https://opendata.fmi.fi/timeseries?producer=harmonie_scandinavia_surface&latlon=59.65,17.92&param=origintime,time,temperature&format=json&timestep=15&starttime=now&endtime=now%2B3h")
    skriv(f"  timeseries harmonie 15 min: {st} " + kort(txt(d), 400))
    st, d, s, c, ty, _ = h("https://opendata.fmi.fi/timeseries?producer=mnwc&latlon=59.65,17.92&param=origintime,time,temperature&format=json&timestep=15&starttime=now&endtime=now%2B3h")
    skriv(f"  timeseries mnwc 15 min: {st} " + kort(txt(d), 400))

# ---------- 4. met.no: MET Nordic, nowcast, thredds-kataloger ----------
def metno():
    avsnitt("4. met.no – MET Nordic, nowcast, kataloger")
    B = "https://thredds.met.no/thredds/dodsC/metpplatest/met_forecast_1_0km_nordic_latest.nc"
    st, d, s, c, ty, _ = h(B + ".ascii?time"); t = txt(d)
    v = re.findall(r"\b(1[0-9]{9})\b", t); skriv(f"MET Nordic tider: {st}, {len(v)} st, första {datetime.fromtimestamp(int(v[0]), timezone.utc) if v else '?'}, sista {datetime.fromtimestamp(int(v[-1]), timezone.utc) if v else '?'} · rått: {kort(t[-200:], 200)}")
    st, d, s, c, ty, _ = h(B + ".dds"); vars_ = re.findall(r"(?:Float32|Float64|Int32|Int16|Byte) (\w+)\[", txt(d)); skriv("variabler: " + ", ".join(vars_))
    st, d, s, c, ty, _ = h(B + ".ascii?precipitation_amount[0:1:5][1000:100:1500][700:100:1000]"); skriv(f"nederbörd stickprov: {st}, {s:.1f} s · " + kort(txt(d)[-300:], 300))
    st, d, s, c, ty, _ = h("https://api.met.no/weatherapi/nowcast/2.0/complete?lat=%.3f&lon=%.3f" % (LAT, LON))
    try:
        j = json.loads(d); ts = j["properties"]["timeseries"]
        skriv(f"api.met.no nowcast: {len(ts)} tider {ts[0]['time']} … {ts[-1]['time']}, parametrar nu: {list(ts[0]['data']['instant']['details'].keys())}, därefter: {list((ts[1]['data'].get('next_1_hours') or {}).get('details', {}).keys())} · radar: {j['properties']['meta'].get('radar_coverage')}")
    except Exception as e: skriv(f"nowcast: {st} {kort(txt(d), 200)}")
    for kat in ["https://thredds.met.no/thredds/catalog/remotesensing/catalog.xml", "https://thredds.met.no/thredds/catalog/remotesensingradar/catalog.xml",
                "https://thredds.met.no/thredds/catalog/remotesensingradaraccr/catalog.xml", "https://thredds.met.no/thredds/catalog/radarnowcasting/catalog.xml",
                "https://thredds.met.no/thredds/catalog/yrwms/catalog.xml"]:
        st, d, s, c, ty, _ = h(kat); t = txt(d)
        skriv(f"- {kat.split('catalog/')[1]}: {st} · " + ", ".join(sorted(set(re.findall(r'(?:name|xlink:title)="([^"]+)"', t)))[:25]))
    st, d, s, c, ty, _ = h("https://thredds.met.no/thredds/catalog/catalog.xml"); t = txt(d)
    for href in re.findall(r'xlink:href="([^"]+)"', t)[:10]:
        st2, d2, *_ = h("https://thredds.met.no/thredds/catalog/" + href.replace("catalog.xml", "") + "catalog.xml" if not href.startswith("http") else href)
        skriv(f"  {href}: " + ", ".join(sorted(set(re.findall(r'xlink:title="([^"]+)"', txt(d2))))[:30]))

# ---------- 5. DMI ----------
def dmi():
    avsnitt("5. DMI – EDR punkt (ensemble-sannolikheter)")
    for coll in ["harmonie_dini_eps_probabilities", "harmonie_dini_eps_means", "harmonie_dini_sf"]:
        st, d, s, c, ty, _ = h(f"https://opendataapi.dmi.dk/v1/forecastedr/collections/{coll}")
        try: j = json.loads(d); skriv(f"- {coll}: {st}, parametrar: " + ", ".join(list(j.get("parameter_names", {}).keys())[:60]))
        except Exception: skriv(f"- {coll}: {st} {kort(txt(d), 200)}")
        st, d, s, c, ty, _ = h(f"https://opendataapi.dmi.dk/v1/forecastedr/collections/{coll}/position?coords=POINT({LON}%20{LAT})&crs=crs84&f=CoverageJSON")
        try: j = json.loads(d); skriv(f"  punkt Arlanda: {st}, {s:.1f} s, CORS '{c}', tider {len(j['domain']['axes']['t']['values'])}, parametrar {list(j.get('ranges', {}).keys())[:20]}")
        except Exception: skriv(f"  punkt: {st} {kort(txt(d), 250)}")

# ---------- 6. Open-Meteo: vilka modeller ----------
def openmeteo():
    avsnitt("6. Open-Meteo – vilka modeller ger data för Arlanda")
    M = ["metno_nordic", "metno_seamless", "dmi_harmonie_arome_europe", "dmi_seamless", "knmi_harmonie_arome_europe", "ecmwf_ifs", "ecmwf_ifs025", "ecmwf_aifs025_single",
         "icon_seamless", "icon_global", "icon_eu", "gfs_seamless", "gfs_global", "ncep_hrrr_conus", "gem_seamless", "jma_seamless", "ukmo_seamless", "ukmo_global_deterministic_10km",
         "meteofrance_seamless", "meteofrance_arpege_europe", "cma_grapes_global", "bom_access_global", "kma_seamless", "italia_meteo_arpae_icon_2i", "meteoswiss_icon_ch1"]
    for m in M:
        st, d, s, c, ty, _ = h(f"https://api.open-meteo.com/v1/forecast?latitude={LAT}&longitude={LON}&hourly=temperature_2m,cloud_base,visibility,wind_gusts_10m&models={m}&forecast_days=3")
        try:
            j = json.loads(d); hh = j["hourly"]; n = sum(1 for x in hh["temperature_2m"] if x is not None)
            skriv(f"- {m}: {st}, {n} timmar med värden, molnbas {'ja' if any(x is not None for x in hh.get('cloud_base', [])) else 'nej'}, sikt {'ja' if any(x is not None for x in hh.get('visibility', [])) else 'nej'}")
        except Exception: skriv(f"- {m}: {st} {kort(txt(d), 120)}")
    for m in ["icon_seamless", "icon_eu", "ecmwf_ifs025", "ecmwf_aifs025", "gfs025", "gem_global", "bom_access_global_ensemble", "ukmo_global_ensemble_20km", "metno_nordic", "meps"]:
        st, d, s, c, ty, _ = h(f"https://ensemble-api.open-meteo.com/v1/ensemble?latitude={LAT}&longitude={LON}&hourly=wind_gusts_10m&models={m}&forecast_days=2")
        try: j = json.loads(d); skriv(f"- ensemble {m}: {st}, {len([k for k in j['hourly'] if k.startswith('wind_gusts_10m')])} medlemmar")
        except Exception: skriv(f"- ensemble {m}: {st} {kort(txt(d), 120)}")

for f in (mtg, smhi, fmi, metno, dmi, openmeteo):
    try: f()
    except Exception as e: skriv(f"FEL i {f.__name__}: {e}")
open("kallor2.md", "w", encoding="utf-8").write("\n".join(UT) + "\n")
