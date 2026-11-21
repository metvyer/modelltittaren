# Prov N (21/11 kvall): Open-Meteo AIFS-ensemble och MET Nordic, met.no nowcast - format for meteogrammet
import json, os, urllib.request
UT = []
def skriv(s=""): print(s); UT.append(str(s))
def h(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "modelltittaren-test github.com/metvyer"}), timeout=90) as r: return r.status, r.read(), {k.lower(): v for k, v in r.headers.items()}
    except urllib.error.HTTPError as e: return e.code, e.read(800), {}
    except Exception as e: return 0, str(e).encode(), {}
LAT, LON = 59.65, 17.92
for m in ["ecmwf_aifs025", "ecmwf_aifs025_ensemble", "ecmwf_ifs025"]:
    u = f"https://ensemble-api.open-meteo.com/v1/ensemble?latitude={LAT}&longitude={LON}&hourly=temperature_2m,wind_gusts_10m,precipitation,cloud_cover,relative_humidity_2m&models={m}&wind_speed_unit=kn&past_days=1&forecast_days=3&timeformat=unixtime"
    st, d, hd = h(u); skriv(f"## ens {m}: {st} {len(d)//1024} kB CORS {hd.get('access-control-allow-origin')}")
    if st == 200:
        j = json.loads(d); H = j["hourly"]; ks = list(H.keys()); skriv(f"nycklar ({len(ks)}): {ks[:8]} ... {ks[-3:]}")
        for k in ["temperature_2m", "precipitation", "wind_gusts_10m", "cloud_cover"]:
            kk = [x for x in ks if x.startswith(k)]; v = H.get(kk[0]) if kk else None
            if v: skriv(f"  {kk[0]} ({len(kk)} medl): forsta 30 = {v[:30]}"); skriv(f"     sista 10 = {v[-10:]}")
        skriv(f"  tid forsta {H['time'][0]} steg {H['time'][1]-H['time'][0]} antal {len(H['time'])}")
    else: skriv(d[:400])
u = f"https://api.open-meteo.com/v1/forecast?latitude={LAT}&longitude={LON}&hourly=temperature_2m,wind_gusts_10m,precipitation,cloud_cover,relative_humidity_2m&models=metno_nordic&wind_speed_unit=kn&past_days=1&forecast_days=3&timeformat=unixtime"
st, d, hd = h(u); skriv(f"## metno_nordic {st} {len(d)//1024} kB CORS {hd.get('access-control-allow-origin')}")
if st == 200:
    H = json.loads(d)["hourly"]
    for k in H: skriv(f"  {k}: {H[k][20:44]} ... sista {H[k][-5:]}")
st, d, hd = h(f"https://api.met.no/weatherapi/nowcast/2.0/complete?lat={LAT}&lon={LON}")
skriv(f"## nowcast {st} {len(d)//1024} kB CORS {hd.get('access-control-allow-origin')}")
if st == 200:
    j = json.loads(d); ts = j["properties"]["timeseries"]; skriv("meta " + json.dumps(j["properties"]["meta"])[:400])
    for t in ts[:3] + ts[-2:]: skriv("  " + json.dumps(t)[:400])
open("extra.md", "w").write("\n".join(UT) + "\n")
if os.environ.get("GITHUB_STEP_SUMMARY"): open(os.environ["GITHUB_STEP_SUMMARY"], "a").write("\n".join(UT) + "\n")
