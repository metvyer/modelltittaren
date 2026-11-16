# Bygger karta.json for Modelltittaren: Natural Earth 10m (public domain)
# projicerat till MEPS Lambert-gitter (rutindex ix, iy), klippt till domanen.
import json, math
from shapely.geometry import shape, box, mapping, LineString
from shapely.ops import transform

R = 6371000.0; P0 = math.radians(63.3); N = math.sin(P0)
F = math.cos(P0) * math.tan(math.pi/4 + P0/2)**N / N
RHO0 = R * F / math.tan(math.pi/4 + P0/2)**N
NX, NY = 949, 1069

def proj(lon, lat, z=None):
    if lat < 20: lat = 20
    rho = R * F / math.tan(math.pi/4 + math.radians(lat)/2)**N
    th = N * math.radians(lon - 15)
    x = rho*math.sin(th); y = RHO0 - rho*math.cos(th)
    ix = (x + 1060084)/2500; iy = (y + 1332517.9)/2500
    return ix, (NY - 1) - iy   # SVG-y nedat

def pr(xs, ys, zs=None):
    out = [proj(x, y) for x, y in zip(xs, ys)]
    return [o[0] for o in out], [o[1] for o in out]

BOX = box(-2, -2, NX + 1, NY + 1)
LL = box(-30, 45, 60, 80)  # grovfilter i lon/lat

def path(geom, closed, dec=1):
    parts = []
    def ring(coords, z):
        c = list(coords)
        if len(c) < 2: return
        s = "M" + " ".join(f"{x:.{dec}f},{y:.{dec}f}".replace(".0,", ",") for x, y in c[:len(c)-1 if z else None])
        parts.append(s + ("Z" if z else ""))
    def walk(g):
        t = g.geom_type
        if t == "Polygon":
            ring(g.exterior.coords, True)
            for i in g.interiors: ring(i.coords, True)
        elif t == "LineString": ring(g.coords, False)
        elif t.startswith("Multi") or t == "GeometryCollection":
            for gg in g.geoms: walk(gg)
    walk(geom)
    return "".join(parts)

def lager(fil, closed, tol, minarea=0):
    fc = json.load(open(fil))
    geoms = []
    for f in fc["features"]:
        g = shape(f["geometry"])
        if not g.intersects(LL): continue
        g = g.intersection(LL)
        if g.is_empty: continue
        g = transform(pr, g)
        if closed: g = g.buffer(0)
        g = g.intersection(BOX)
        if g.is_empty: continue
        g = g.simplify(tol, preserve_topology=True)
        if closed and minarea:
            if g.geom_type == "MultiPolygon":
                from shapely.geometry import MultiPolygon
                g = MultiPolygon([p for p in g.geoms if p.area >= minarea])
            elif g.area < minarea: continue
        if not g.is_empty: geoms.append(g)
    return "".join(path(g, closed) for g in geoms)

land = lager("ne_10m_land.geojson", True, 0.35, 0.5)
sjo = lager("ne_10m_lakes.geojson", True, 0.35, 15)
grans = lager("ne_10m_admin_0_boundary_lines_land.geojson", False, 0.35)

# Gradnat var 5:e grad
gr = []
for lat in range(50, 80, 5):
    pts = [proj(lon/2, lat) for lon in range(-60, 121)]
    g = LineString(pts).intersection(BOX)
    if not g.is_empty: gr.append(path(g.simplify(0.2), False))
for lon in range(-30, 61, 10):
    pts = [proj(lon, lat/4) for lat in range(45*4, 81*4)]
    g = LineString(pts).intersection(BOX)
    if not g.is_empty: gr.append(path(g.simplify(0.2), False))

ut = {"nx": NX, "ny": NY, "kalla": "Natural Earth 10m (public domain)",
      "land": land, "sjo": sjo, "grans": grans, "grad": "".join(gr)}
json.dump(ut, open("karta.json", "w"), separators=(",", ":"))
print({k: len(v) for k, v in ut.items() if isinstance(v, str)})
