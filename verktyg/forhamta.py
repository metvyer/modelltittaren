#!/usr/bin/env python3
"""Modelltittaren - forhamtning av tid-hojd for de forvalda flygplatserna.

Kors av GitHub Actions (.github/workflows/forhamta.yml) var 10:e minut.
Finns en ny komplett MEPS-korning (meps_det_2_5km) pa thredds.met.no hamtas
samma data som sidan sjalv hamtar for en punkt - upp till TOPP_FL (FL450), alla
timmar och vinden - och sparas som en fil per punkt:

    forhamtat/th/<DTG>/<iy>_<ix>.json  =  {"static": text, "bitar": [[a, b, etikett, text], ...]}
    forhamtat/th/index.json            =  {"dtg": ..., "nt": ..., "klar": ..., "punkter": {"iy:ix": fil}}

Texterna ar thredds egna ascii-svar, sa sidan laser dem med samma kod som nar
den hamtar sjalv (laggIn). Bara senaste korningen sparas.

Data fran MET Norway (thredds.met.no), CC BY 4.0. Bara standardbiblioteket.
Ett anrop i taget, mjuk vantan vid 429/5xx, identifierande User-Agent.
"""
import json, math, os, shutil, sys, time, urllib.error, urllib.request
from datetime import datetime, timedelta, timezone

BAS = os.environ.get("MT_BAS", "https://thredds.met.no/thredds/dodsC/mepslatest/")   # MT_BAS: bara for test
FIL = lambda dtg: "meps_det_2_5km_" + dtg + ".ncml"
UA = "Modelltittaren-forhamtning (github.com/metvyer/modelltittaren)"
INTERVALL, SOK_TIMMAR, KRAV_TIDER, BIT = 3, 15, 67, 24
NIV, NTRYCK, NIS = 65, 13, 10
VIND_DT, VIND_DK = 3, 2
YTA = ["surface_air_pressure", "air_temperature_2m", "relative_humidity_2m", "wind_speed", "wind_direction",
       "wind_speed_of_gust", "visibility_in_air", "precipitation_amount_acc", "precipitation_type", "cloud_area_fraction"]
# Hamtas i den har ordningen (Jakobs prioritet 17/11). Samma platser som PUNKTER i index.html.
PUNKTER = [
    ("Kallinge (Ronneby)", "ESDF", 56.2667, 15.265), ("Malmen", "ESCF", 58.3978, 15.5228), ("Såtenäs", "ESIB", 58.4264, 12.7144),
    ("Kallax", "ESPA", 65.5438, 22.122), ("Vidsel", "ESPE", 65.8753, 20.15), ("Uppsala", "ESCM", 59.8973, 17.5886),
    ("Visby", "ESSV", 57.6628, 18.3462), ("Sturup", "ESMS", 55.5363, 13.3762), ("Arlanda", "ESSA", 59.6519, 17.9186),
    ("Landvetter", "ESGG", 57.6628, 12.2798), ("Hagshult", "ESMV", 57.2922, 14.1372)]
# Molnen och vinden pa modellnivaer hamtas upp till TOPP_FL (det tunga). Tryckytor och
# isbildning hamtas hela vagen (litet). Valjer man hogre topp pa sidan hamtar den sjalv resten.
TOPP_FL = 450   # 18/11: tillbaka till FL450 (FL200 sparade lite tid)
FOT = 3.28084

# MEPS-rutnatet (Lambert konform, samma som LCC i index.html)
_rad = math.pi / 180; _p0 = 63.3 * _rad; _n = math.sin(_p0); _R = 6371000
_F = math.cos(_p0) * math.tan(math.pi / 4 + _p0 / 2) ** _n / _n
LCC = dict(n=_n, RF=_R * _F, rho0=_R * _F / math.tan(math.pi / 4 + _p0 / 2) ** _n, x0=-1060084, y0=-1332517.9, dx=2500, nx=949, ny=1069)


def ruta(lat, lon):
    L = LCC
    rho = L["RF"] / math.tan(math.pi / 4 + lat * _rad / 2) ** L["n"]
    th = L["n"] * (lon - 15) * _rad
    fx = (rho * math.sin(th) - L["x0"]) / L["dx"]
    fy = (L["rho0"] - rho * math.cos(th) - L["y0"]) / L["dx"]
    ix, iy = round(fx), round(fy)
    return (iy, ix) if 0 <= ix < L["nx"] and 0 <= iy < L["ny"] else None


def enc(s):
    return s.replace("[", "%5B").replace("]", "%5D")


def hamta(url, forsok=4, tidsgrans=180):
    """Text fran thredds. Returnerar (status, text). 0 = ingen kontakt."""
    for f in range(1, forsok + 1):
        st, txt = 0, ""
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=tidsgrans) as r:
                st, txt = r.status, r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            st = e.code
        except Exception:
            st = 0
        if st == 200 or st in (400, 403, 404):
            return st, txt
        if f < forsok:
            v = 15 * 2 ** (f - 1)
            print(f"  svar {st} - vantar {v} s", flush=True)
            time.sleep(v)
    return st, txt


def antal_tider(dtg):
    st, txt = hamta(BAS + FIL(dtg) + ".ascii?time", forsok=2, tidsgrans=60)
    if st != 200:
        return 0
    for rad in txt.split("\n"):
        if rad.startswith("time["):
            try:
                return int(rad[5:rad.index("]")])
            except ValueError:
                return 0
    return 0


def dtg_text(d):
    return d.strftime("%Y%m%dT%HZ")


def senaste_korning():
    nu = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    d = nu - timedelta(hours=nu.hour % INTERVALL)
    for i in range(SOK_TIMMAR // INTERVALL + 1):
        dtg = dtg_text(d - timedelta(hours=i * INTERVALL))
        n = antal_tider(dtg)
        print(f"Korning {dtg}: {n} tider", flush=True)
        if n >= KRAV_TIDER:
            return dtg, n
    return None, 0


def tolka1d(txt):
    """Endimensionella falt ur ett OPeNDAP-ascii-svar: {namn: [varden]}."""
    d, namn, vals, start = {}, None, [], False
    for rad in txt.replace("\r", "").split("\n"):
        r = rad.strip()
        if not start:
            start = r.startswith("----------"); continue
        if not r:
            if namn and vals: d[namn] = vals
            namn, vals = None, []; continue
        if r[0] != "[" and "," not in r and "[" in r and r.endswith("]"):
            if namn and vals: d[namn] = vals
            delar = r[:r.index("[")].split(".")
            # "a.a" = sjalva faltet; "a.time", "a.y" ... = kartvektorer i en Grid - hoppas over
            namn = delar[0] if len(delar) == 1 or delar[0] == delar[1] else None
            vals = []; continue
        if namn:
            if r[0] == "[": r = r[r.rindex("]") + 1:].lstrip(",")
            vals += [float(x) for x in r.split(",") if x.strip()]
    if namn and vals: d[namn] = vals
    return d


def lagsta_niva(stat):
    """Hogsta modellnivaindex (lagst hojd) som behovs for TOPP_FL - samma rakning som behov() i sidan, med marginal."""
    d = tolka1d(stat)
    ap, b = d.get("ap"), d.get("b")
    terr = (d.get("surface_geopotential") or [0])[0] / 9.80665
    if not ap or not b or len(ap) < NIV:
        return 0   # okant - hamta allt
    z = max(150, TOPP_FL * 100 / FOT)
    ps = 101325 * (1 - 2.25577e-5 * terr) ** 5.25588
    plim = ps * math.exp(-z / 7000) * 0.97
    k1 = NIV - 1
    for k in range(NIV):
        if ap[k] + b[k] * ps >= plim:
            k1 = k; break
    k = max(0, k1 - 2)                      # sidan tar k1-1, vi tar en niva till
    if (NIV - 1 - k) % VIND_DK: k -= 1      # vindnivaerna ska sluta pa lagsta nivan
    return max(0, k)


def punkt(dtg, nt, iy, ix):
    """Fasta data + alla bitar for en punkt. None om nagot misslyckas."""
    yx = f"[{iy}][{ix}]"
    st, stat = hamta(BAS + FIL(dtg) + ".ascii?" + enc(
        "time,ap,b,pressure,height5,latitude" + yx + ",longitude" + yx + ",surface_geopotential[0][0]" + yx))
    if st != 200:
        print(f"  fasta data: svar {st}", flush=True)
        return None
    bitar = []
    ks = lagsta_niva(stat)   # molnen och vinden fran denna niva och nedat
    for a in range(0, nt, BIT):
        b = min(a + BIT - 1, nt - 1)
        tt, t3 = f"[{a}:{b}]", f"[{a}:{VIND_DT}:{b}]"
        v = [n + tt + "[0]" + yx for n in YTA]
        v.append("cloud_base_altitude" + tt + "[0]" + yx)
        v.append("cloud_area_fraction_ml" + tt + f"[{ks}:{NIV - 1}]" + yx)
        v.append("geopotential_pl" + tt + f"[0:{NTRYCK - 1}]" + yx)
        v.append("icing_index" + tt + f"[0:{NIS - 1}]" + yx)
        v += [n + t3 + f"[{ks}:{VIND_DK}:{NIV - 1}]" + yx for n in ("x_wind_ml", "y_wind_ml")]
        v += [n + t3 + f"[0:{NTRYCK - 1}]" + yx for n in ("x_wind_pl", "y_wind_pl")]
        etikett = ".".join(["s", "b", f"c{ks}-{NIV - 1}", f"g0-{NTRYCK - 1}", f"i0-{NIS - 1}", f"u{ks}-{NIV - 1}", f"v0-{NTRYCK - 1}"])
        st, txt = hamta(BAS + FIL(dtg) + ".ascii?" + enc(",".join(v)))
        if st != 200:
            print(f"  +{a}..+{b}: svar {st}", flush=True)
            return None
        bitar.append([a, b, etikett, txt])
    return {"static": stat, "bitar": bitar}


def main():
    ut = sys.argv[1] if len(sys.argv) > 1 else "forhamtat"
    thdir = os.path.join(ut, "th")
    os.makedirs(thdir, exist_ok=True)
    idxfil = os.path.join(thdir, "index.json")
    gammal = {}
    if os.path.exists(idxfil):
        with open(idxfil, encoding="utf-8") as f:
            gammal = json.load(f)
    dtg, nt = senaste_korning()
    if not dtg:
        print("Ingen komplett korning hittad (eller ingen kontakt) - inget gors.")
        return 0
    if gammal.get("dtg") == dtg and gammal.get("klar"):
        print(f"{dtg} finns redan - inget gors.")
        return 0
    print(f"Hamtar {dtg} ({nt} tider) for {len(PUNKTER)} punkter", flush=True)
    ny = os.path.join(thdir, dtg)
    os.makedirs(ny, exist_ok=True)
    punkter, t0 = {}, time.time()
    for namn, icao, lat, lon in PUNKTER:
        r = ruta(lat, lon)
        if not r:
            continue
        iy, ix = r
        t1 = time.time()
        d = punkt(dtg, nt, iy, ix)
        if not d:
            print(f"{icao}: misslyckades", flush=True)
            continue
        fil = f"{iy}_{ix}.json"
        with open(os.path.join(ny, fil), "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
        punkter[f"{iy}:{ix}"] = fil
        print(f"{icao}: {time.time() - t1:.0f} s, {os.path.getsize(os.path.join(ny, fil)) // 1024} kB", flush=True)
    if not punkter:
        print("Inga punkter kunde hamtas - behaller den gamla korningen.")
        shutil.rmtree(ny, ignore_errors=True)
        return 0
    # bara senaste korningen sparas
    for namn in os.listdir(thdir):
        p = os.path.join(thdir, namn)
        if os.path.isdir(p) and namn != dtg:
            shutil.rmtree(p, ignore_errors=True)
    idx = {"dtg": dtg, "nt": nt, "klar": True, "topp": TOPP_FL, "skapad": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
           "punkter": punkter}
    with open(idxfil, "w", encoding="utf-8") as f:
        json.dump(idx, f, ensure_ascii=False, indent=1)
    print(f"Klart: {len(punkter)} punkter pa {time.time() - t0:.0f} s")
    with open(os.environ.get("GITHUB_OUTPUT", os.devnull), "a") as f:
        f.write("andrat=ja\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
