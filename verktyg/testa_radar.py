# Modelltittaren - prov K (NYTT 21/11 kvall): underlag for radar- och satellitflikarna
# 1) SMHI radarkomposit: projektion/horn ur h5-filen, dagslistan (for loop), png-lankar
# 2) met.no radarnowcasting (thredds): senaste fil, WMS-lager, stilar, tider, testbild i EPSG:4326
# 3) EUMETSAT: GetMap med TIME, transparent, JPEG-storlek
# Skriver radar.md + Summary. Andrar inget, publicerar inget.
import io, json, os, re, subprocess, sys, urllib.request
from datetime import datetime, timezone

UT = []
def skriv(s=""):
    print(s); UT.append(str(s))
def h(url, n=3000000, tid=60):
    req = urllib.request.Request(url, headers={"User-Agent": "modelltittaren-test github.com/metvyer", "Origin": "https://metvyer.github.io"})
    try:
        with urllib.request.urlopen(req, timeout=tid) as r:
            return r.status, r.read(n), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(2000), dict(e.headers or {})
    except Exception as e:
        return 0, str(e).encode(), {}

nu = datetime.now(timezone.utc)
def cors(hd): return {k.lower(): v for k, v in hd.items()}.get('access-control-allow-origin', '-')

skriv("## Prov K: radar och satellit " + nu.strftime("%Y-%m-%d %H:%MZ"))

# ---------- 1 SMHI ----------
skriv("### SMHI radarkomposit")
R = "https://opendata-download-radar.smhi.se/api/version/latest/area/sweden/product/comp"
st, d, hd = h(R + ".json")
skriv(f"comp.json {st}")
try:
    j = json.loads(d); skriv("lastFiles[0]: " + json.dumps(j.get("lastFiles", [None])[0])[:600])
except Exception as e:
    skriv(f"tolkning: {e}"); j = {}
st, d, hd = h(R + nu.strftime("/%Y/%m/%d.json"))
try:
    dj = json.loads(d); fl = dj.get("files") or []; skriv(f"dagslista: nycklar {list(dj.keys())}, {len(fl)} filer, sista: {json.dumps(fl[-1:])[:800]}")
except Exception as e: skriv(f"dagslista-fel {e}")
for u in []:
    st, d, hd = h(u); t = d.decode("utf-8", "replace")
    skriv(f"- `{u}` {st}, {len(d)} B, CORS {hd.get('Access-Control-Allow-Origin', '-')}: {t[:500]}")
# h5-filen
try:
    import h5py
    lank = None
    for f in j.get("lastFiles", [{}])[0].get("formats", []):
        if f.get("key") == "h5": lank = f.get("link")
    if not lank: lank = R + "/latest.h5"
    st, d, hd = h(lank, 30000000)
    skriv(f"h5 {lank} {st} {len(d)} B")
    with h5py.File(io.BytesIO(d), "r") as F:
        def visa(namn, obj):
            if obj.attrs: skriv(f"  `{namn}`: " + ", ".join(f"{k}={obj.attrs[k]!r}" for k in obj.attrs)[:700])
            if isinstance(obj, h5py.Dataset): skriv(f"  data `{namn}` {obj.shape} {obj.dtype} min {obj[()].min()} max {obj[()].max()}")
        skriv("  rot: " + ", ".join(f"{k}={F.attrs[k]!r}" for k in F.attrs))
        F.visititems(visa)
except Exception as e:
    skriv(f"h5-fel: {e}")
# png: farger
try:
    from PIL import Image
    st, d, hd = h(R + "/latest.png")
    im = Image.open(io.BytesIO(d)); skriv(f"png {im.size} mode {im.mode} info {im.info}")
    from collections import Counter
    c = Counter(im.convert("RGBA").getdata()); skriv("vanligaste farger: " + str(c.most_common(25)))
except Exception as e:
    skriv(f"png-fel: {e}")

# ---------- 2 met.no ----------
skriv("### met.no radarnowcasting")
K = "https://thredds.met.no/thredds/catalog/radarnowcasting/catalog.xml"
st, d, hd = h(K); t = d.decode("utf-8", "replace")
skriv(f"katalog {st}, CORS {hd.get('Access-Control-Allow-Origin', '-')}")
for m in re.findall(r'<dataset [^>]*>', t)[:6]: skriv("  " + m[:300])
filer = sorted(set(re.findall(r'urlPath="([^"]+\.nc)"', t)))
skriv(f"filer: {len(filer)}; forsta {filer[:1]} sista {filer[-3:]}")
agg = re.findall(r'urlPath="([^"]+)"', t); skriv("ovriga urlPath: " + str([a for a in agg if not a.endswith('.nc')][:10]))
if filer:
    f = filer[-1]
    W = "https://thredds.met.no/thredds/wms/" + f
    st, d, hd = h(W + "?service=WMS&version=1.3.0&request=GetCapabilities", 2000000)
    t = d.decode("utf-8", "replace"); skriv(f"WMS caps {st} {len(d)} B, CORS {hd.get('Access-Control-Allow-Origin', '-')}")
    for m in re.findall(r"<Layer[^>]*>\s*<Name>([^<]+)</Name>\s*<Title>([^<]*)</Title>", t)[:20]: skriv(f"  lager {m}")
    for m in re.findall(r'<Dimension name="time"[^>]*>([^<]{0,400})', t)[:3]: skriv(f"  tider: {m}")
    skriv("  stilar: " + str(sorted(set(re.findall(r"<Style>\s*<Name>([^<]+)</Name>", t)))[:30]))
    for m in re.findall(r"<EX_GeographicBoundingBox>.*?</EX_GeographicBoundingBox>", t, re.S)[:1]: skriv("  bbox " + re.sub(r"\s+", " ", m))
    D = "https://thredds.met.no/thredds/dodsC/" + f
    st, d, hd = h(D + ".dds"); skriv(f"DDS {st}: " + d.decode("utf-8", "replace")[:900])
    st, d, hd = h(D + ".ascii?time"); skriv(f"tider {st}: " + d.decode("utf-8", "replace")[-300:])
    lag = re.findall(r"<Layer[^>]*>\s*<Name>([^<]+)</Name>", t)
    lag = [x for x in lag if "precip" in x.lower() or "rr" in x.lower()] or lag[-1:]
    if lag:
        for stil in ["", "boxfill/rainbow"]:
            u = W + f"?service=WMS&version=1.3.0&request=GetMap&layers={lag[0]}&styles={stil}&crs=EPSG:4326&bbox=54,4,72,32&width=700&height=600&format=image/png&transparent=true"
            st, d, hd = h(u); skriv(f"  GetMap {lag[0]} stil '{stil}': {st}, {len(d)//1024} kB, typ {hd.get('Content-Type')}, CORS {hd.get('Access-Control-Allow-Origin', '-')} {d[:200] if st != 200 else ''}")
            if st == 200 and not os.path.exists("matprov/metno_radar.png"):
                os.makedirs("matprov", exist_ok=True); open("matprov/metno_radar.png", "wb").write(d)
    # ncWMS metadata (fargskala, min/max)
    if lag:
        st, d, hd = h(W + f"?request=GetMetadata&item=layerDetails&layerName={lag[0]}"); skriv(f"  layerDetails {st}: {d.decode('utf-8','replace')[:900]}")

# ---------- 3 EUMETSAT ----------
skriv("### EUMETSAT GetMap-varianter")
E = "https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&crs=EPSG:4326&bbox=52,0,72,35&width=800&height=500&styles="
tt = (nu.replace(second=0, microsecond=0)).strftime("%Y-%m-%dT%H:") + "%02d:00Z" % (nu.minute // 10 * 10 - 20 if nu.minute >= 20 else 0)
for lay, fmt in [("mtg_fd:ir105_hrfi", "image/png"), ("mtg_fd:rgb_geocolour", "image/jpeg"), ("mtg_fd:rgb_geocolour", "image/png"), ("mtg_fd:li_afa", "image/png&transparent=true"), ("mtg_fd:h40b", "image/png&transparent=true")]:
    u = E + f"&layers={lay}&format={fmt}&time={tt}"
    st, d, hd = h(u); skriv(f"- {lay} {fmt} time={tt}: {st}, {len(d)//1024} kB, {hd.get('Content-Type')}, CORS {cors(hd)} {d[:150] if st != 200 else ''}")
# overlager kust/grans?
st, d, hd = h("https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetCapabilities", 8000000)
t = d.decode("utf-8", "replace")
skriv("bakgrundslager: " + str([n for n in re.findall(r"<Name>([^<]+)</Name>", t) if re.search(r"coast|border|boundar|ne_|background|overlay", n, re.I)][:20]))

open("radar.md", "w").write("\n".join(UT) + "\n")
if os.environ.get("GITHUB_STEP_SUMMARY"): open(os.environ["GITHUB_STEP_SUMMARY"], "a").write("\n".join(UT) + "\n")
