"""Gor banor.json (banriktningar) for sidans flygplatser ur OurAirports runways.csv (public domain).
Kor: python3 verktyg/banor.py runways.csv  (fran repots rot; runways.csv fran github.com/davidmegginson/ourairports-data)
Format: {ICAO: [[le, he, sann riktning le, "T"/"M", langd ft, (lat1, lon1, lat2, lon2)], ...]}
"M" = bara bannumret fanns -> riktningen ar magnetisk (sidan raknar om med ungefarlig missvisning)."""
import csv, json, re, sys
html = open("index.html", encoding="utf-8").read()
start = html.index("const PUNKTER"); blk = html[start:html.index("];", start)]
icaos = re.findall(r'"(E[A-Z]{3})"', blk)
flyg = json.load(open("flygplatser.json"))
alla = list(dict.fromkeys(icaos + [f[0] for f in flyg]))
ut, utan = {}, []
for r in csv.DictReader(open(sys.argv[1] if len(sys.argv) > 1 else "runways.csv", encoding="utf-8")):
    a = r["airport_ident"]
    if a not in alla or r["closed"] == "1": continue
    f = lambda k: float(r[k]) if r[k] not in ("", None) else None
    le, he = r["le_ident"], r["he_ident"]
    if le.startswith("H") or (r["surface"] or "").upper().startswith("WATER"): continue
    lat1, lon1, lat2, lon2 = f("le_latitude_deg"), f("le_longitude_deg"), f("he_latitude_deg"), f("he_longitude_deg")
    hd = f("le_heading_degT")
    if None not in (lat1, lon1, lat2, lon2):   # andpunkterna ger sakrast sann riktning
        import math
        y = math.sin(math.radians(lon2 - lon1)) * math.cos(math.radians(lat2))
        x = math.cos(math.radians(lat1)) * math.sin(math.radians(lat2)) - math.sin(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.cos(math.radians(lon2 - lon1))
        if abs(x) + abs(y) > 1e-9: hd = (math.degrees(math.atan2(y, x)) + 360) % 360
    m = re.match(r"(\d{1,2})", le or "")
    if hd is None and None not in (lat1, lon1, lat2, lon2):
        import math
        y = math.sin(math.radians(lon2 - lon1)) * math.cos(math.radians(lat2))
        x = math.cos(math.radians(lat1)) * math.sin(math.radians(lat2)) - math.sin(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.cos(math.radians(lon2 - lon1))
        hd = (math.degrees(math.atan2(y, x)) + 360) % 360
    kalla = "T"
    if hd is None and m: hd, kalla = int(m.group(1)) * 10.0, "M"   # bara bannummer -> magnetisk, raknas om pa sidan
    if hd is None: continue
    rad = [le, he, round(hd, 1), kalla, int(f("length_ft") or 0)]
    if None not in (lat1, lon1, lat2, lon2): rad += [round(lat1, 5), round(lon1, 5), round(lat2, 5), round(lon2, 5)]
    ut.setdefault(a, []).append(rad)
for a in icaos:
    if a not in ut: utan.append(a)
json.dump(ut, open("banor.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("flygplatser med banor:", len(ut), "av", len(alla), "| förvalda utan banor:", utan)
print("förvalda:", {a: [(x[0], x[1], x[2], x[3], len(x) > 5) for x in ut.get(a, [])] for a in icaos[:12]})
print("bara nummer (M):", sum(1 for v in ut.values() for x in v if x[3] == "M"), "| utan ändpunkter:", sum(1 for v in ut.values() for x in v if len(x) == 5))
