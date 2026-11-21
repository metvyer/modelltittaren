"""Gor flygplatser_europa.json och banor_europa.json (NYTT 21/11) for TAF-fliken: Europas stora och medelstora
flygplatser + sma militara, med ICAO-kod. Kalla OurAirports (public domain), github.com/davidmegginson/ourairports-data.
Kor: python3 verktyg/flygplatser_europa.py airports.csv runways.csv   (fran repots rot)
Uppdateras automatiskt var 6:e manad av .github/workflows/flygplatser.yml.
Format flygplatser: [ICAO, namn, lat, lon, storlek 2 = stor, 1 = medel/militar]
Format banor: samma som banor.json {ICAO: [[le, he, sann riktning le, "T"/"M", langd ft, (lat1, lon1, lat2, lon2)], ...]}"""
import csv, json, math, re, sys
ap, rw = (sys.argv[1], sys.argv[2]) if len(sys.argv) > 2 else ("airports.csv", "runways.csv")
MIL = re.compile(r"\b(air base|ab|military|air force|naval air|flygflottilj|luftwaffe|base a[ée]rienne|baza lotnicza|lotnisko wojskowe)\b", re.I)
fl = []
for r in csv.DictReader(open(ap, encoding="utf-8")):
    icao = (r.get("icao_code") or "").strip() or (r["ident"] if re.fullmatch(r"[A-Z]{4}", r["ident"]) else "")
    if r["continent"] != "EU" or not re.fullmatch(r"[A-Z]{4}", icao): continue
    mil = bool(MIL.search(r["name"] + " " + (r.get("keywords") or "")))
    t = r["type"]
    if t == "large_airport": s = 2
    elif t == "medium_airport" or (t == "small_airport" and mil): s = 1
    else: continue
    fl.append([icao, r["name"], round(float(r["latitude_deg"]), 4), round(float(r["longitude_deg"]), 4), s])
fl.sort(key=lambda x: x[0]); alla = {x[0] for x in fl}
def bar(lat1, lon1, lat2, lon2):
    y = math.sin(math.radians(lon2 - lon1)) * math.cos(math.radians(lat2))
    x = math.cos(math.radians(lat1)) * math.sin(math.radians(lat2)) - math.sin(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.cos(math.radians(lon2 - lon1))
    return (math.degrees(math.atan2(y, x)) + 360) % 360 if abs(x) + abs(y) > 1e-9 else None
ut = {}
for r in csv.DictReader(open(rw, encoding="utf-8")):
    a = r["airport_ident"]
    if a not in alla or r["closed"] == "1": continue
    f = lambda k: float(r[k]) if r[k] not in ("", None) else None
    le, he = r["le_ident"], r["he_ident"]
    if le.startswith("H") or (r["surface"] or "").upper().startswith("WATER"): continue
    lat1, lon1, lat2, lon2 = f("le_latitude_deg"), f("le_longitude_deg"), f("he_latitude_deg"), f("he_longitude_deg")
    hd, kalla = None, "T"
    if None not in (lat1, lon1, lat2, lon2): hd = bar(lat1, lon1, lat2, lon2)
    if hd is None: hd = f("le_heading_degT")
    m = re.match(r"(\d{1,2})", le or "")
    if hd is None and m: hd, kalla = int(m.group(1)) * 10.0, "M"
    if hd is None: continue
    rad = [le, he, round(hd, 1), kalla, int(f("length_ft") or 0)]
    if None not in (lat1, lon1, lat2, lon2): rad += [round(lat1, 5), round(lon1, 5), round(lat2, 5), round(lon2, 5)]
    ut.setdefault(a, []).append(rad)
json.dump(fl, open("flygplatser_europa.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
json.dump(ut, open("banor_europa.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("flygplatser:", len(fl), "(stora", sum(1 for x in fl if x[4] == 2), ") med banor:", len(ut))
