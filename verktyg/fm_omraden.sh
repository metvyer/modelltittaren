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
import json, collections
d = json.load(open("ut/fm.geojson")); f = d["features"]; print("antal", len(f))
print("falt", list(f[0]["properties"].keys()) if f else [])
for k in f[0]["properties"] if f else []:
    c = collections.Counter(str(x["properties"].get(k))[:60] for x in f)
    if len(c) < 40: print(k, dict(c))
PY
