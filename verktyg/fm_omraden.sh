#!/bin/bash
# 23/11: Forsvarsmaktens OPPNA geodata for riksintressen (forsvarsmakten.se/riksintressen) -> GeoJSON per lager (WGS84)
# Kors i GitHub (testa.yml delar=FM). Resultatet laddas upp som artefakt "fm_omraden"; Claude gor om det till omraden_fm.json.
set -e
mkdir -p fm && cd fm
curl -sSL -o fm.zip "https://www.forsvarsmakten.se/globalassets/02-om-forsvarsmakten/myndighetsinformation/dokument/riksintressen/riksintressen_och_paverkningsomraden_2026.gdb.zip"
ls -la fm.zip; unzip -o -q fm.zip; GDB=$(find . -name "*.gdb" -type d | head -1); echo "GDB: $GDB"
ogrinfo -so "$GDB" | tee lager.txt
mkdir -p ut
for L in $(ogrinfo -q "$GDB" | sed -n 's/^[0-9]*: \([^ ]*\).*/\1/p'); do
  echo "== $L"; ogrinfo -so "$GDB" "$L" | grep -E "Feature Count|Geometry|^[A-Za-z_]+: " | head -25
  ogr2ogr -f GeoJSON -t_srs EPSG:4326 -simplify 50 -lco COORDINATE_PRECISION=4 "ut/$L.geojson" "$GDB" "$L" || echo "kunde inte: $L"
done
ls -la ut
