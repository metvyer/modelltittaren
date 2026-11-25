# Bygger karta_afrika.json (NYTT 25/11 kvall): grovt kartunderlag for Afrika och Mellanostern till satellitfliken
# (MTG ser hela jordskivan fran 0°). Samma projektion som karta_europa.json men utanfor Europarutan. (Kopia av bygg_karta_europa.py.)
# Natural Earth 50m (public domain), samma Lambert-projektion och rutindex som karta.json (MEPS), men
# UTANFOR MEPS-rutan (dar ligger den detaljerade karta.json). Kor fran en mapp med ne_50m_*.geojson:
#   python3 verktyg/bygg_karta_europa.py <mapp>   (filerna fran github.com/nvkelso/natural-earth-vector/geojson)
import json, math, os, sys
from shapely.geometry import shape, box, LineString
from shapely.ops import transform
sys.path.insert(0, os.path.dirname(__file__))
D = sys.argv[1] if len(sys.argv) > 1 else "."
R = 6371000.0; P0 = math.radians(63.3); N = math.sin(P0)
F = math.cos(P0) * math.tan(math.pi/4 + P0/2)**N / N
RHO0 = R * F / math.tan(math.pi/4 + P0/2)**N
NX, NY = 949, 1069
def proj(lon, lat, z=None):
    lat = max(lat, -60)
    rho = R * F / math.tan(math.pi/4 + math.radians(lat)/2)**N
    th = N * math.radians(lon - 15)
    x = rho*math.sin(th); y = RHO0 - rho*math.cos(th)
    return (x + 1060084)/2500, (NY - 1) - (y + 1332517.9)/2500
def pr(xs, ys, zs=None):
    out = [proj(x, y) for x, y in zip(xs, ys)]; return [o[0] for o in out], [o[1] for o in out]
LL_EU = box(-32, 32, 50, 75)   # Europarutan (karta_europa.json)
LL = box(-26, -36, 66, 75).difference(LL_EU)   # Afrika + Mellanostern i lon/lat
# kartans granser i rutindex: hornen + kanter av LL
kant = [proj(lo, la) for lo in range(-26, 67, 2) for la in (-36, 75)] + [proj(lo, la) for la in range(-36, 76) for lo in (-26, 66)]
X0, X1 = min(p[0] for p in kant), max(p[0] for p in kant); Y0, Y1 = min(p[1] for p in kant), max(p[1] for p in kant)
BOX = box(X0, Y0, X1, Y1); MEPS = box(0, 0, NX - 1, NY - 1)
def path(geom, dec=1):
    parts = []
    def ring(c, z):
        c = list(c)
        if len(c) < 2: return
        parts.append("M" + " ".join(f"{x:.{dec}f},{y:.{dec}f}".replace(".0,", ",") for x, y in c[:len(c)-1 if z else None]) + ("Z" if z else ""))
    def walk(g):
        t = g.geom_type
        if t == "Polygon":
            ring(g.exterior.coords, True)
            for i in g.interiors: ring(i.coords, True)
        elif t == "LineString": ring(g.coords, False)
        elif t.startswith("Multi") or t == "GeometryCollection":
            for gg in g.geoms: walk(gg)
    walk(geom); return "".join(parts)
def lager(fil, closed, tol, minarea=0):
    out = []
    for f in json.load(open(os.path.join(D, fil)))["features"]:
        g = shape(f["geometry"])
        if not g.intersects(LL): continue
        g = transform(pr, g.intersection(LL))
        if closed: g = g.buffer(0)
        g = g.intersection(BOX).difference(MEPS)   # bara utanfor MEPS-rutan
        if g.is_empty: continue
        g = g.simplify(tol, preserve_topology=True)
        if closed and minarea and g.area < minarea: continue
        out.append(path(g))
    return "".join(out)
land = lager("ne_50m_land.geojson", True, 1.2, 2)
sjo = lager("ne_50m_lakes.geojson", True, 1.2, 30)
grans = lager("ne_50m_admin_0_boundary_lines_land.geojson", False, 1.2)
kust = lager("ne_50m_coastline.geojson", False, 1.2)   # kustlinjer (utan raka snittkanter) - ritas overst
gr = []
EUBOX = None
for lat in range(-30, 31, 10):
    g = LineString([proj(lo / 2, lat) for lo in range(-52, 133)]).intersection(BOX).difference(MEPS)
    if not g.is_empty: gr.append(path(g.simplify(0.5)))
for lon in range(-20, 61, 10):
    g = LineString([proj(lon, la / 4) for la in range(-36 * 4, 32 * 4 + 1)]).intersection(BOX).difference(MEPS)
    if not g.is_empty: gr.append(path(g.simplify(0.5)))
ut = {"x0": round(X0), "y0": round(Y0), "x1": round(X1), "y1": round(Y1), "kalla": "Natural Earth 50m (public domain)", "land": land, "sjo": sjo, "grans": grans, "kust": kust, "grad": "".join(gr)}
json.dump(ut, open("karta_afrika.json", "w"), separators=(",", ":"))
print({k: (len(v) if isinstance(v, str) else v) for k, v in ut.items()})
