#!/bin/bash
# 23/11: Forsvarsmaktens OPPNA geodata for riksintressen (forsvarsmakten.se/riksintressen) -> GeoJSON (WGS84)
# Kors i GitHub (testa.yml delar=FM). Resultatet laddas upp som artefakt "fm_omraden".
set -e
mkdir -p fm && cd fm
curl -sSL -o fm.zip "https://www.forsvarsmakten.se/globalassets/02-om-forsvarsmakten/myndighetsinformation/dokument/riksintressen/riksintressen_och_paverkningsomraden_2026.gdb.zip"
unzip -o -q fm.zip; GDB=$(find . -name "*.gdb" -type d | head -1); echo "GDB: $GDB"
mkdir -p ut
ogrinfo -so -al "$GDB" | head -40
ogr2ogr -f GeoJSON -t_srs EPSG:4326 -simplify 40 -lco COORDINATE_PRECISION=4 ut/fm.geojson "$GDB"
ogr2ogr -f GeoJSON -t_srs EPSG:4326 -lco COORDINATE_PRECISION=5 ut/fm_full.geojson "$GDB"
ls -la ut
python3 - <<'PY'
# kompakt fil for sidan: bara de oppna lager vi visar (sjoovningsomraden, lagflygning, MSA, riksintresse pa land)
import json
TYP = {"Riksintresse i havet (sjöövningsområde)": "SJO", "Lågflygningsområde": "LAG", "MSA-område": "MSA", "Riksintresse på land": "LAND"}
r4 = lambda c: [round(c[0], 4), round(c[1], 4)] if isinstance(c[0], (int, float)) else [r4(x) for x in c]
d = json.load(open("ut/fm.geojson")); ut = []
for x in d["features"]:
    p = x["properties"]; t = TYP.get(p.get("UKATEGORI"))
    if not t or not x.get("geometry"): continue
    g = x["geometry"]; ut.append({"n": (p.get("OBJNAMN") or "").strip(), "t": t, "id": p.get("OBJID") or "", "kn": p.get("KNAMN") or "", "ln": p.get("LNAMN") or "", "g": {"type": g["type"], "coordinates": r4(g["coordinates"])}})
json.dump({"kalla": "Försvarsmakten, riksintressen och påverkansområden 2026 (öppna geodata, forsvarsmakten.se/riksintressen)", "omraden": ut}, open("ut/omraden_fm.json", "w"), ensure_ascii=False, separators=(",", ":"))
import os; print("omraden_fm.json", len(ut), "st", os.path.getsize("ut/omraden_fm.json") // 1024, "kB", {k: sum(1 for a in ut if a["t"] == k) for k in TYP.values()})
for a in ut:
    if a["t"] != "LAND": print(" ", a["t"], a["id"], a["n"][:70])
PY
python3 - <<'PY'
import json, collections
d = json.load(open("ut/fm.geojson")); f = d["features"]; print("antal", len(f))
print("falt", list(f[0]["properties"].keys()) if f else [])
for k in f[0]["properties"] if f else []:
    c = collections.Counter(str(x["properties"].get(k))[:60] for x in f)
    if len(c) < 40: print(k, dict(c))
PY
