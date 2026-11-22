# Prov Q2 (22/11): ra MEPS-profil (modellnivaer) for Uppsala - ar temperaturen "hackig" redan i modelldata?
import re, urllib.request, math, sys
from datetime import datetime, timezone
def h(u):
    with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "modelltittaren-test"}), timeout=120) as r: return r.read().decode()
kat = h("https://thredds.met.no/thredds/catalog/mepslatest/catalog.xml")
fil = sorted(set(re.findall(r'(meps_det_2_5km_\d{8}T\d\dZ)\.ncml', kat)))[-1]
D = "https://thredds.met.no/thredds/dodsC/mepslatest/" + fil + ".ncml"
print("fil", fil)
import subprocess; subprocess.run([sys.executable, "-m", "pip", "install", "-q", "pyproj"], check=False)
from pyproj import Proj
x = [float(v) for v in h(D + ".ascii?x").split("\n", 5)[-1].replace("\n", ",").split(",") if v.strip() and re.match(r"^-?[\d.eE+]+$", v.strip())]
y = [float(v) for v in h(D + ".ascii?y").split("\n", 5)[-1].replace("\n", ",").split(",") if v.strip() and re.match(r"^-?[\d.eE+]+$", v.strip())]
P = Proj(proj="lcc", lat_0=63.3, lon_0=15, lat_1=63.3, lat_2=63.3, R=6371000)
X, Y = P(17.5886, 59.8973); ix = min(range(len(x)), key=lambda i: abs(x[i] - X)); iy = min(range(len(y)), key=lambda i: abs(y[i] - Y))
print("ix", ix, "iy", iy, len(x), len(y))
tid = h(D + ".ascii?time"); tt = [float(v) for v in re.findall(r"[\d.]+e\+09|\b1[78]\d{8}\b", tid)]
t0 = datetime.fromtimestamp(tt[0], timezone.utc); print("forsta tid", t0)
it = next(i for i, t in enumerate(tt) if datetime.fromtimestamp(t, timezone.utc).hour == 7)
def tal(s): return [float(v) for v in re.findall(r"(?<![\w\[])-?\d+\.?\d*(?:[eE][-+]?\d+)?", s.split("\n\n")[0].split("\n", 1)[1])]
T = h(D + f".ascii?air_temperature_ml[{it}][0:64][{iy}][{ix}]")
ap = h(D + ".ascii?ap"); b = h(D + ".ascii?b"); ps = h(D + f".ascii?surface_air_pressure[{it}][0][{iy}][{ix}]")
def vals(txt):
    body = txt.split("---------------------------------------------")[-1]
    rows = [l for l in body.strip().split("\n") if l.strip()]
    out = []
    for l in rows:
        parts = l.split(",")[1:] if "[" in l.split(",")[0] else l.split(",")
        for p in parts:
            try: out.append(float(p))
            except: pass
    return out
Tv = vals(T); apv = vals(ap); bv = vals(b); psv = vals(ps)
print("antal", len(Tv), len(apv), len(bv), psv[-1:])
p0 = psv[-1]
for k in range(40, 65):
    if k < len(Tv): print(f"niva {k}: p={ (apv[k] + bv[k] * p0) / 100:7.1f} hPa  T={Tv[k] - 273.15:6.2f} C")
