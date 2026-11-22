# Fall-studie (22/11): hamtar observationer, modell, satellit och radar for en konvektiv situation + Uppsala-prognos.
# Skriver fall.md (text) och bilder i fall/ (laggs i grenen matprov-fall). Laser bara oppna kallor.
import json, os, re, io, math, urllib.request, urllib.parse, sys
from datetime import datetime, timezone, timedelta
os.makedirs("fall", exist_ok=True)
UT = []
def skriv(s=""): print(s); UT.append(str(s))
def h(u, binar=False, tid=90):
    u = u.replace("[", "%5B").replace("]", "%5D")
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "modelltittaren-fall github.com/metvyer", "Origin": "https://metvyer.github.io"}), timeout=tid) as r:
            d = r.read(); return d if binar else d.decode("utf-8", "replace")
    except Exception as e:
        skriv(f"  FEL {u[:120]}: {e}"); return None
NU = datetime.now(timezone.utc); DAG = NU.strftime("%Y-%m-%d")
skriv(f"# Fall {DAG}, hämtat {NU:%H:%MZ}")

# 1) METAR senaste 30 h, sodra Sverige + Uppsala
FP = "ESMS,ESGG,ESDF,ESMV,ESMQ,ESMX,ESGJ,ESMK,ESMT,ESGP,ESOW,ESKN,ESSA,ESCM,ESSB,ESSV,ESCF,ESIB,ESIA,EKCH,EKRN"
d = h(f"https://aviationweather.gov/api/data/metar?ids={FP}&hours=30&format=json")
skriv("\n## METAR med åska/CB/skurar (senaste 30 h)")
if d:
    for m in sorted(json.loads(d), key=lambda x: (x.get("icaoId"), x.get("obsTime", 0))):
        raw = m.get("rawOb", "")
        if re.search(r"\b(VC)?[-+]?TS\w*|\bCB\b|TCU|\b[-+]?SH\w*|GS|GR", raw): skriv("  " + raw)
skriv("\n## METAR/TAF Uppsala och Arlanda nu")
for i in ["ESCM", "ESSA"]:
    m = h(f"https://aviationweather.gov/api/data/metar?ids={i}&hours=3&format=raw"); skriv("  " + (m or "").strip().replace("\n", "\n  "))
    t = h(f"https://aviationweather.gov/api/data/taf?ids={i}&format=raw"); skriv("  " + (t or "-").strip())

# 2) SMHI SNOW1g punktprognos (aska-sannolikhet m.m.) for Uppsala och nagra orter i sodra Gotaland
skriv("\n## SMHI SNOW1g (åsksannolikhet %, nederbörd mm/h, moln /8) per timme")
for namn, la, lo in [("Uppsala", 59.86, 17.64), ("Göteborg", 57.71, 11.97), ("Växjö", 56.88, 14.81), ("Malmö", 55.60, 13.0), ("Kalmar", 56.66, 16.36), ("Jönköping", 57.78, 14.16)]:
    d = h(f"https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/{lo}/lat/{la}/data.json")
    if not d: continue
    j = json.loads(d); rad = []
    for ts in j.get("timeSeries", [])[:30]:
        p = ts.get("data", ts.get("parameters", {})) if isinstance(ts.get("data"), dict) else {x["name"]: x["values"][0] for x in ts.get("parameters", [])}
        tt = ts.get("time", ts.get("validTime", ""))[11:13]
        rad.append(f"{tt}Z T{p.get('air_temperature','?')} åska{p.get('thunderstorm_probability','?')} nb{p.get('precipitation_amount_mean','?')} by{p.get('wind_speed_of_gust','?')} moln{p.get('cloud_area_fraction','?')}")
    skriv(f"  {namn}: " + " | ".join(rad[:26]))

# 3) MEPS det: senaste korningar, omradesvarden over sodra Gotaland per timme och Uppsala-serie
kat = h("https://thredds.met.no/thredds/catalog/mepslatest/catalog.xml") or ""
filer = sorted(set(re.findall(r"(meps_det_2_5km_\d{8}T\d\dZ)\.ncml", kat))); skriv("\n## MEPS det-körningar: " + ", ".join(filer[-4:]))
def tal(txt):
    body = txt.split("---------------------------------------------")[-1]; out = []
    for l in body.strip().split("\n")[1:]:
        if not l.strip(): break
        for p in re.sub(r"^\s*(\[\d+\])+\s*,?", "", l).split(","):
            try: out.append(float(p))
            except: pass
    return out
def P(lon, lat):
    r = math.pi / 180; R = 6371000; l1 = 63.3 * r; n = math.sin(l1); F = math.cos(l1) * math.tan(math.pi / 4 + l1 / 2) ** n / n
    rho = R * F / math.tan(math.pi / 4 + lat * r / 2) ** n; rho0 = R * F / math.tan(math.pi / 4 + l1 / 2) ** n
    return (rho * math.sin(n * (lon - 15) * r) + 1060084) / 2500, (rho0 - rho * math.cos(n * (lon - 15) * r) + 1332517.9) / 2500
for fil in filer[-2:]:
    D = "https://thredds.met.no/thredds/dodsC/mepslatest/" + fil + ".ncml"
    tid = tal(h(D + ".ascii?time") or ""); t0 = datetime.fromtimestamp(tid[0], timezone.utc) if tid else None
    skriv(f"\n### {fil} (start {t0:%d %H}Z)")
    # sodra Gotaland: ruta, var 4:e punkt
    xa, ya = P(11.5, 55.3); xb, yb = P(19.0, 58.6); x0, x1, y0, y1 = int(min(xa, xb)), int(max(xa, xb)), int(min(ya, yb)), int(max(ya, yb))
    nt = min(len(tid), 30)
    for vn, enh, f in [("specific_convective_available_potential_energy", "J/kg", 1), ("lightning_index", "", 1), ("precipitation_amount_acc", "mm/h", 1), ("graupelfall_amount", "kg/m2", 1), ("wind_speed_of_gust", "m/s", 1)]:
        dd = h(D + f".ascii?{vn}[0:{nt-1}][0][{y0}:4:{y1}][{x0}:4:{x1}]", tid=180)
        if not dd: continue
        v = tal(dd); ny = (y1 - y0) // 4 + 1; nx = (x1 - x0) // 4 + 1; per = ny * nx
        if len(v) < per * nt: skriv(f"  {vn}: oväntat antal {len(v)}"); continue
        rad = []
        for t in range(nt):
            b = v[t * per:(t + 1) * per]
            if vn == "precipitation_amount_acc" or vn == "graupelfall_amount":
                if t == 0: continue
                a = v[(t - 1) * per:t * per]; b = [max(0, y - x) for x, y in zip(a, b) if math.isfinite(x) and math.isfinite(y) and abs(y) < 1e30]
            b = [x for x in b if math.isfinite(x) and abs(x) < 1e30]
            if b: rad.append(f"{(t0 + timedelta(hours=t)).strftime('%d%H')}:{max(b):.1f}" + (f"/{sum(1 for x in b if x > 0.1) * 100 // len(b)}%" if vn in ("lightning_index",) else ""))
        skriv(f"  max i södra Götaland {vn} ({enh}): " + " ".join(rad))
    # Uppsala-serie
    ux, uy = P(17.64, 59.86); ix, iy = round(ux), round(uy)
    vars_ = ["air_temperature_2m", "precipitation_amount_acc", "cloud_area_fraction", "wind_speed", "wind_speed_of_gust", "visibility_in_air", "cloud_base_altitude", "lightning_index", "specific_convective_available_potential_energy", "relative_humidity_2m"]
    q = ",".join(f"{v}[0:{nt-1}][0][{iy}][{ix}]" for v in vars_)
    dd = h(D + ".ascii?" + q)
    if dd:
        delar = {}
        for v in vars_:
            m = re.search(v + r"\.?" + v + r"?\[\d+\]\[\d+\]\[\d+\]\[\d+\]\n(.*?)\n\n", dd, re.S)
            blk = dd.split(v + ".", 1)[-1] if (v + ".") in dd else ""
        # enkel tolkning: rader "[t][0][0][0], varde" i ordning per variabel
        bitar = re.split(r"\n(?=\w+\.\w+\[)", dd.split("---------------------------------------------")[-1])
        for b in bitar:
            nm = b.strip().split(".")[0].split("[")[0]
            if nm in vars_ and nm not in delar: delar[nm] = [float(x.split(",")[-1]) for x in b.strip().split("\n")[1:] if re.match(r"^\[\d+\]", x)]
        skriv("  Uppsala (tid, T, nb mm/h, moln, vind, by m/s, sikt km, bas ft, blixtindex, CAPE):")
        for t in range(1, nt):
            g = lambda v: delar.get(v, [float("nan")] * nt)[t] if t < len(delar.get(v, [])) else float("nan")
            nb = g("precipitation_amount_acc") - (delar.get("precipitation_amount_acc", [float("nan")] * nt)[t - 1])
            skriv(f"    {(t0 + timedelta(hours=t)).strftime('%d %H')}Z  T {g('air_temperature_2m') - 273.15:5.1f}  nb {nb:4.1f}  moln {g('cloud_area_fraction') * 8 if g('cloud_area_fraction') <= 1.5 else g('cloud_area_fraction') / 12.5:3.0f}/8  vind {g('wind_speed'):4.1f}  by {g('wind_speed_of_gust'):4.1f}  sikt {g('visibility_in_air') / 1000:5.1f}  bas {g('cloud_base_altitude') * 3.28:6.0f}  blixt {g('lightning_index'):4.1f}  CAPE {g('specific_convective_available_potential_energy'):5.0f}")

# 4) Satellit (MTG) och blixtar (LI) over sodra Skandinavien vid nagra tider
skriv("\n## Bilder")
def tider_bakat(timmar, steg_min):
    t = NU.replace(minute=(NU.minute // 10) * 10, second=0, microsecond=0) - timedelta(minutes=30)
    return [t - timedelta(hours=x) for x in timmar]
for t in tider_bakat([0, 3, 6, 9, 12], 10):
    ts = t.strftime("%Y-%m-%dT%H:%M:00Z")
    for lag, fmt, namn in [("mtg_fd:ir105_hrfi", "image/png", "ir"), ("mtg_fd:li_afa", "image/png", "li"), ("mtg_fd:rgb_cloudtype", "image/jpeg", "molntyp")]:
        u = f"https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers={lag}&styles=&crs=EPSG:4326&bbox=54,8,61,22&width=1000&height=700&format={urllib.parse.quote(fmt)}&time={ts}" + ("&transparent=true" if namn == "li" else "")
        b = h(u, binar=True)
        if b and len(b) > 2000 and b[:4] != b"<?xm": open(f"fall/sat_{namn}_{t:%d%H%M}.{'jpg' if 'jpeg' in fmt else 'png'}", "wb").write(b); skriv(f"  sat {namn} {ts}: {len(b)//1024} kB")
# radar met.no for samma tider (forsta tiden i varje fil = observation)
kr = h("https://thredds.met.no/thredds/catalog/radarnowcasting/catalog.xml") or ""
rf = sorted(set(re.findall(r'urlPath="(radarnowcasting/[^"]+\.(\d{8}T\d{6})Z\.nc)"', kr)))
skriv(f"  met.no radarfiler: {len(rf)} st, från {rf[0][1] if rf else '-'} till {rf[-1][1] if rf else '-'}")
for t in tider_bakat([0, 3, 6, 9, 12], 10):
    mal = t.strftime("%Y%m%dT%H%M00")
    f = min(rf, key=lambda x: abs(datetime.strptime(x[1], "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc) - t)) if rf else None
    if not f: continue
    ft = datetime.strptime(f[1], "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc)
    u = f"https://thredds.met.no/thredds/wms/{f[0]}?service=WMS&version=1.3.0&request=GetMap&layers=lwe_precipitation_rate&styles=default-scalar/metnoprecipitation&crs=EPSG:4326&bbox=54,8,61,22&width=1000&height=700&format=image/png&transparent=true&colorscalerange=0.1,50&logscale=true&numcolorbands=250&belowmincolor=transparent&time={ft:%Y-%m-%dT%H:%M:00Z}"
    b = h(u, binar=True)
    if b and len(b) > 1000: open(f"fall/radar_{ft:%d%H%M}.png", "wb").write(b); skriv(f"  radar met.no {ft:%d %H:%M}Z: {len(b)//1024} kB")
open("fall.md", "w").write("\n".join(UT) + "\n")
if os.environ.get("GITHUB_STEP_SUMMARY"): open(os.environ["GITHUB_STEP_SUMMARY"], "a").write("\n".join(UT) + "\n")
