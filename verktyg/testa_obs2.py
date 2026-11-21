# Prov M (21/11 kvall): EUMETSAT - hur fardiga ar senaste tiderna? met.no - vilka fargpaletter finns?
import json, os, re, urllib.request, io
from datetime import datetime, timezone, timedelta
UT = []
def skriv(s=""): print(s); UT.append(str(s))
def h(url, n=8000000):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "modelltittaren-test"}), timeout=60) as r: return r.status, r.read(n), {k.lower(): v for k, v in r.headers.items()}
    except urllib.error.HTTPError as e: return e.code, e.read(500), {}
    except Exception as e: return 0, str(e).encode(), {}
nu = datetime.now(timezone.utc); skriv("nu " + nu.isoformat())
E0 = "https://view.eumetsat.int/geoserver/"
for u in [E0 + "mtg_fd/wms?service=WMS&version=1.3.0&request=GetCapabilities", E0 + "mtg_fd/rgb_geocolour/wms?service=WMS&version=1.3.0&request=GetCapabilities", E0 + "wms?service=WMS&version=1.3.0&request=GetCapabilities"]:
    st, d, hd = h(u); t = d.decode("utf-8", "replace"); skriv(f"caps {u[len(E0):60]} {st} {len(d)//1024} kB cache-control {hd.get('cache-control')} age {hd.get('age')}")
    for m in re.finditer(r"<Name>((?:mtg_fd:)?(?:rgb_geocolour|ir105_hrfi|li_afa))</Name>", t):
        blk = t[m.end():m.end() + 6000]; dm = re.search(r'<Dimension name="time"[^>]*>([^<]{0,3000})', blk)
        skriv(f"  {m.group(1)}: {(dm.group(1)[:120] + ' … ' + dm.group(1)[-160:]) if dm else 'ingen'}")
# bilder vid olika tider: storlek och "tom?"
try:
    from PIL import Image
except Exception: Image = None
for lag in ["mtg_fd:rgb_geocolour", "mtg_fd:ir105_hrfi"]:
    for m in [0, 10, 20, 30, 40, 60, 90]:
        t = (nu - timedelta(minutes=m)).replace(second=0, microsecond=0); t = t.replace(minute=t.minute // 10 * 10)
        u = E0 + f"wms?service=WMS&version=1.3.0&request=GetMap&layers={lag}&styles=&crs=EPSG:4326&bbox=55,10,65,25&width=300&height=200&format=image/png&time={t.strftime('%Y-%m-%dT%H:%M:00Z')}"
        st, d, hd = h(u); info = ""
        if Image and st == 200:
            try: im = Image.open(io.BytesIO(d)).convert("RGBA"); px = im.getdata(); info = f"icke-tomma {sum(1 for p in px if p[3] > 0 and sum(p[:3]) > 30) / len(px):.2f}"
            except Exception as e: info = str(e)[:80]
        skriv(f"  {lag} {t.strftime('%H:%M')}: {st} {len(d)} B {hd.get('content-type')} {info} {d[:120] if st != 200 else ''}")
    u = E0 + f"wms?service=WMS&version=1.3.0&request=GetMap&layers={lag}&styles=&crs=EPSG:4326&bbox=55,10,65,25&width=300&height=200&format=image/png"
    st, d, hd = h(u); skriv(f"  {lag} UTAN tid: {st} {len(d)} B")
# met.no paletter
K = "https://thredds.met.no/thredds/catalog/radarnowcasting/catalog.xml"
st, d, hd = h(K); f = sorted(set(re.findall(r'urlPath="([^"]+\.nc)"', d.decode())))[-1]
W = "https://thredds.met.no/thredds/wms/" + f
st, d, hd = h(W + "?request=GetMetadata&item=layerDetails&layerName=lwe_precipitation_rate")
try: j = json.loads(d); skriv("paletter: " + ", ".join(j.get("palettes", []))); skriv("units: " + str(j.get("units")))
except Exception as e: skriv(f"paletter-fel {e} {d[:300]}")
for stil in ["default-scalar/seq-Greys", "default-scalar/x-Rainbow", "default-scalar/seq-YlGnBu", "raster/default"]:
    u = W + f"?service=WMS&version=1.3.0&request=GetMap&layers=lwe_precipitation_rate&styles={stil}&crs=EPSG:4326&bbox=54,4,72,32&width=300&height=200&format=image/png&transparent=true&colorscalerange=0.1,50&logscale=true&numcolorbands=250&belowmincolor=transparent&abovemaxcolor=extend"
    st, d, hd = h(u); skriv(f"  stil {stil}: {st} {len(d)} B {d[:200] if st != 200 else ''}")
open("obs2.md", "w").write("\n".join(UT) + "\n")
if os.environ.get("GITHUB_STEP_SUMMARY"): open(os.environ["GITHUB_STEP_SUMMARY"], "a").write("\n".join(UT) + "\n")
