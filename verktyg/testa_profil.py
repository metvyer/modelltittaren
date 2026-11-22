# Prov Q2 (22/11): ra MEPS-profil (modellnivaer) for Uppsala - ar temperaturen "hackig" redan i modelldata?
import re, urllib.request, math
from datetime import datetime, timezone
def h(u):
    with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "modelltittaren-test"}), timeout=120) as r: return r.read().decode()
def vals(txt):   # alla tal efter rubrikraden i ett OPeNDAP-asciisvar (index i [..] hoppas over)
    body = txt.split("---------------------------------------------")[-1]
    out = []
    for l in body.strip().split("\n")[1:]:
        for p in re.sub(r"^\s*(\[\d+\])+\s*,?", "", l).split(","):
            try: out.append(float(p))
            except: pass
    return out
def P(lon, lat):   # Lambert konform konisk, sfar R=6371 km, lat0=lat1=lat2=63.3, lon0=15 (MEPS)
    r = math.pi / 180; R = 6371000; l1 = 63.3 * r; n = math.sin(l1); F = math.cos(l1) * math.tan(math.pi / 4 + l1 / 2) ** n / n
    rho = R * F / math.tan(math.pi / 4 + lat * r / 2) ** n; rho0 = R * F / math.tan(math.pi / 4 + l1 / 2) ** n
    return rho * math.sin(n * (lon - 15) * r), rho0 - rho * math.cos(n * (lon - 15) * r)
kat = h("https://thredds.met.no/thredds/catalog/mepslatest/catalog.xml")
filer = sorted(set(re.findall(r'(meps_det_2_5km_\d{8}T\d\dZ)\.ncml', kat))); print("filer", filer[-3:])
for fil in filer[-2:]:
    D = "https://thredds.met.no/thredds/dodsC/mepslatest/" + fil + ".ncml"
    x = vals(h(D + ".ascii?x")); y = vals(h(D + ".ascii?y")); tt = vals(h(D + ".ascii?time"))
    X, Y = P(17.5886, 59.8973); ix = min(range(len(x)), key=lambda i: abs(x[i] - X)); iy = min(range(len(y)), key=lambda i: abs(y[i] - Y))
    it = next(i for i, t in enumerate(tt) if datetime.fromtimestamp(t, timezone.utc).hour == 7)
    print(f"\n### {fil}: ix {ix} iy {iy}, tid {datetime.fromtimestamp(tt[it], timezone.utc)}")
    T = vals(h(D + f".ascii?air_temperature_ml[{it}][0:64][{iy}][{ix}]")); ap = vals(h(D + ".ascii?ap")); b = vals(h(D + ".ascii?b"))
    ps = vals(h(D + f".ascii?surface_air_pressure[{it}][0][{iy}][{ix}]"))[-1]
    print("antal", len(T), len(ap), len(b), "ps", ps)
    for k in range(38, min(65, len(T))): print(f"niva {k}: p={(ap[k] + b[k] * ps) / 100:7.1f} hPa  T={T[k] - 273.15:6.2f} C")
