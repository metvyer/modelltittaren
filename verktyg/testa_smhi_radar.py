# Prov L (21/11 kvall): SMHI radar - vilka format finns for aldre bilder, png-projektion, tif-struktur
import io, json, os, struct, urllib.request
from datetime import datetime, timezone
UT = []
def skriv(s=""): print(s); UT.append(str(s))
def h(url, n=5000000):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "modelltittaren-test"}), timeout=60) as r: return r.status, r.read(n), {k.lower(): v for k, v in r.headers.items()}
    except urllib.error.HTTPError as e: return e.code, b"", {}
    except Exception as e: return 0, str(e).encode(), {}
R = "https://opendata-download-radar.smhi.se/api/version/latest/area/sweden/product/comp"
nu = datetime.now(timezone.utc)
st, d, _ = h(R + nu.strftime("/%Y/%m/%d.json")); fl = json.loads(d)["files"]
for k in [-1, -2, -3, -6, -12, -50]: skriv(f"fil {k}: {fl[k]['key']} format {[f['key'] for f in fl[k]['formats']]}")
nyck = fl[-6]["key"]; bas = R + nu.strftime("/%Y/%m/%d/") + nyck
for ext in [".png", ".tif", ".h5", "?format=png", ".png?format=png"]:
    st, d, hd = h(bas + ext, 3000000); skriv(f"- {bas+ext}: {st}, {len(d)} B, {hd.get('content-type')}, CORS {hd.get('access-control-allow-origin')}")
st, d, hd = h(R + "/latest.json"); skriv(f"latest.json {st}: {d[:600]}")
st, d, hd = h(R + ".json"); j = json.loads(d); skriv("comp.json lastFiles: " + json.dumps(j.get("lastFiles"))[:1200])
# tif: tagg-lista
st, d, hd = h(R + "/latest.tif"); skriv(f"latest.tif {st} {len(d)} B CORS {hd.get('access-control-allow-origin')}")
if st == 200:
    bo = "<" if d[:2] == b"II" else ">"; off = struct.unpack(bo + "I", d[4:8])[0]; n = struct.unpack(bo + "H", d[off:off + 2])[0]
    TYP = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 11: 4, 12: 8, 16: 8}
    for i in range(n):
        e = d[off + 2 + 12 * i: off + 14 + 12 * i]; tag, typ, cnt = struct.unpack(bo + "HHI", e[:8]); sz = TYP.get(typ, 1) * cnt
        if sz <= 4: raw = e[8:8 + sz]
        else: p = struct.unpack(bo + "I", e[8:12])[0]; raw = d[p:p + min(sz, 400)]
        if typ == 3: val = struct.unpack(bo + "%dH" % (len(raw) // 2), raw)
        elif typ == 4: val = struct.unpack(bo + "%dI" % (len(raw) // 4), raw)
        elif typ == 12: val = struct.unpack(bo + "%dd" % (len(raw) // 8), raw)
        elif typ == 2: val = raw.decode("latin1")
        else: val = raw[:40]
        skriv(f"  tagg {tag} typ {typ} n {cnt}: {str(val)[:300]}")
st, d, hd = h(R + "/latest.png")
try:
    from PIL import Image
    im = Image.open(io.BytesIO(d)); skriv(f"png {im.size}"); im.save("matprov_smhi.png")
except Exception as e: skriv(f"png {e}")
open("radar2.md", "w").write("\n".join(UT) + "\n")
if os.environ.get("GITHUB_STEP_SUMMARY"): open(os.environ["GITHUB_STEP_SUMMARY"], "a").write("\n".join(UT) + "\n")
