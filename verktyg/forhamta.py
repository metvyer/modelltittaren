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

Varv 2 (argument "tq", NYTT 19/11 em): lagger till temperatur + fukt pa modellnivaer
i samma filer (bitar med etikett "T..."), se TQ_DELAR.

Data fran MET Norway (thredds.met.no), CC BY 4.0. Bara standardbiblioteket.
Ett anrop i taget, mjuk vantan vid 429/5xx, identifierande User-Agent.
"""
import json, math, os, re, shutil, sys, time, urllib.error, urllib.request
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
# NYTT 19/11 em - VARV 2: temperatur + fukt pa ALLA modellnivaer upp till TOPP_FL (full upplosning i hojdled,
# Jakobs val). Timvis +3..+23 (de forsta timmarna har passerat nar korningen ar klar), var 3:e timme +24..+45.
# Matt 19/11: T+q kostar ca 4 s per timme och ort -> varv 2 ca 20 min for 11 orter.
TQ_DELAR = [(3, 23, 1), (24, 45, 3)]   # (fran, till, steg)
TQ_VAR = ("air_temperature_ml", "specific_humidity_ml")
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


# Statistik (19/11): antal anrop till thredds och mangd data i denna korning av skriptet
STAT = {"anrop": 0, "byte": 0}
STAT_MAX = 200   # sa manga rader behalls i forhamtat/statistik.json


def hamta(url, forsok=4, tidsgrans=180):
    """Text fran thredds. Returnerar (status, text). 0 = ingen kontakt."""
    for f in range(1, forsok + 1):
        st, txt = 0, ""
        STAT["anrop"] += 1
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=tidsgrans) as r:
                raw = r.read(); STAT["byte"] += len(raw)
                st, txt = r.status, raw.decode("utf-8", "replace")
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



def tq_punkt(dtg, nt, stat, iy, ix):
    """Varv 2: T + q pa modellnivaer for en punkt. Lista med bitar [a, b, etikett, text] eller None.
    Etikett "T<k1>-64" (+ ".x3" om var 3:e timme) - sidan laser den i laggIn."""
    yx = f"[{iy}][{ix}]"
    ks = lagsta_niva(stat)
    bitar = []
    for a, b, st in TQ_DELAR:
        b = min(b, nt - 1)
        if a > b:
            continue
        tt = f"[{a}:{b}]" if st == 1 else f"[{a}:{st}:{b}]"
        v = [n + tt + f"[{ks}:{NIV - 1}]" + yx for n in TQ_VAR]
        etikett = f"T{ks}-{NIV - 1}" + ("" if st == 1 else f".x{st}")
        code, txt = hamta(BAS + FIL(dtg) + ".ascii?" + enc(",".join(v)), tidsgrans=300)
        if code != 200:
            print(f"  T+q +{a}..+{b}: svar {code}", flush=True)
            return None
        bitar.append([a, b, etikett, txt])
    return bitar


def varv_tq(ut):
    """Varv 2: lagger till T + q i de redan forhamtade orterna for senaste korningen (index.json: "tq": true)."""
    thdir = os.path.join(ut, "th")
    idxfil = os.path.join(thdir, "index.json")
    if not os.path.exists(idxfil):
        print("Varv 2: inget forhamtat - inget gors."); return 0
    with open(idxfil, encoding="utf-8") as f:
        idx = json.load(f)
    if not idx.get("klar") or idx.get("tq"):
        print(f"Varv 2: {idx.get('dtg')} {'har redan T+q' if idx.get('tq') else 'ar inte klar'} - inget gors."); return 0
    dtg, nt = idx["dtg"], idx["nt"]
    print(f"Varv 2 (T + fukt): {dtg}, {len(idx['punkter'])} punkter", flush=True)
    t0, ok = time.time(), 0
    for nyckel, fil in idx["punkter"].items():
        iy, ix = map(int, nyckel.split(":"))
        path = os.path.join(thdir, dtg, fil)
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        if any(str(b[2]).startswith("T") for b in d["bitar"]):
            ok += 1; continue
        t1 = time.time()
        tq = tq_punkt(dtg, nt, d["static"], iy, ix)
        if not tq:
            print(f"{nyckel}: T+q misslyckades", flush=True); continue
        d["bitar"] += tq
        with open(path, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
        ok += 1
        print(f"{nyckel}: T+q {time.time() - t1:.0f} s", flush=True)
    if ok == 0:
        print("Varv 2: ingen punkt fick T+q."); return 0
    idx["tq"] = ok == len(idx["punkter"])          # alla klara -> inte igen; annars forsoker nasta korning av skriptet
    idx["tqTider"] = [list(x) for x in TQ_DELAR]
    with open(idxfil, "w", encoding="utf-8") as f:
        json.dump(idx, f, ensure_ascii=False, indent=1)
    print(f"Varv 2 klart: {ok} punkter pa {time.time() - t0:.0f} s, {STAT['anrop']} anrop, {STAT['byte'] / 1e6:.1f} MB")
    sfil = os.path.join(ut, "statistik.json")
    logg = []
    try:
        with open(sfil, encoding="utf-8") as f:
            logg = json.load(f)
    except Exception:
        pass
    logg.insert(0, {"tid": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "dtg": dtg, "punkter": ok, "varv": "T+q",
                    "anrop": STAT["anrop"], "byte": STAT["byte"], "sek": round(time.time() - t0)})
    with open(sfil, "w", encoding="utf-8") as f:
        json.dump(logg[:STAT_MAX], f, ensure_ascii=False, indent=0)
    with open(os.environ.get("GITHUB_OUTPUT", os.devnull), "a") as f:
        f.write("andrat=ja\n")
    return 0


# ===================================================================
#  SVERIGEOVERSIKT (NYTT 20/11, Jakob: "kor Sverige oversikten") - varv 0, fore tid-hojd
#  Ensemblens byvind, sikt och molnbas for Sverige med omnejd i 5 km, +0..+36, alla 30 medlemmar.
#  Lagras exakt som sidan sjalv lagrar (1 byte per varde, samma kodning som koda() i sannolikhet.js),
#  en gzip-fil per parameter och timme: forhamtat/ens/<DTG>/<v>_<t>.bin.gz, layout [medlem][y][x].
#  Medlem 15-29 = forra korningens 0-14 tre timmar senare (testkorning G) -> tas ur forra korningens
#  filer om de finns, annars hamtas de. Medlem 0:s sikt/molnbas finns inte i ensemblefilen -> det-filen.
#  Matt 20/11 (del L): Sverige 5 km byvind 13 h x 15 medl. = 12 s, 41 MB fran thredds, gzip 0,7 MB/timme.
# ===================================================================
ENS_FILN = lambda dtg: "meps_lagged_6_h_subset_2_5km_" + dtg + ".ncml"
SV = {"y0": 112, "y1": 808, "x0": 312, "x1": 744, "s": 2}   # 20/11: utokad till hela Ostersjon (ca 1,35x)     # delbart med 8 -> passar sidans rutnat for 5/10/20 km
SV_TIDER = list(range(0, 37))
SV_BLOCK = [(0, 12), (13, 25), (26, 36)]
ENS_MEDL, ENS_NYA = 30, 15
KT = 3600 / 1852
FOT = 3.28084


def _trapp(delar):
    ut = []
    for a, b, st in delar:
        v = a
        while v <= b + 1e-9:
            ut.append(int(math.floor(v + 0.5))); v += st
    return ut


# samma som PPARAM i sannolikhet.js (bara de tre parametrarna i oversikten)
SV_PARAM = {
    "by": {"var": "wind_speed_of_gust", "konv": lambda v: v * KT, "tabell": None},
    "sikt": {"var": "visibility_in_air", "konv": lambda v: v,
             "tabell": _trapp([[0, 200, 10], [225, 500, 25], [550, 1000, 50], [1100, 5000, 100], [5200, 10000, 200], [11000, 75000, 1000]])},
    "bas": {"var": "cloud_base_altitude", "konv": lambda v: v * FOT,
            "tabell": _trapp([[0, 200, 10], [250, 1000, 50], [1100, 5000, 100], [5500, 20000, 500], [25000, 25000, 1]])},
}


def _koda_np(pa, a):
    """Som koda() i sannolikhet.js men for en hel numpy-vektor (float32) -> uint8, 255 = saknas."""
    import numpy as np
    a = np.asarray(a, dtype=np.float64); ok = np.isfinite(a) & (np.abs(a) < 1e30)
    v = pa["konv"](np.where(ok, a, 0.0)); T = pa["tabell"]
    if T:
        T = np.asarray(T, dtype=np.float64)
        k = np.searchsorted(T, v, side="right") - 1
        k = np.clip(k, 0, len(T) - 1)
    else:
        k = np.clip(np.floor(v + 0.5), 0, 254)
    return np.where(ok, k, 255).astype(np.uint8)


def _koda(pa, raa):
    """Som koda() i sannolikhet.js: 255 = saknas."""
    if not math.isfinite(raa) or abs(raa) > 1e30:
        return 255
    v = pa["konv"](raa); T = pa["tabell"]
    if T:
        if v >= T[-1]: return len(T) - 1
        if v <= T[0]: return 0
        import bisect
        return bisect.bisect_right(T, v) - 1
    return max(0, min(254, int(math.floor(v + 0.5))))


def hamta_bin(url, n, tidsgrans=300):
    """Binart (.dods) -> lista med n float32, eller None."""
    import struct
    for f in range(1, 5):
        STAT["anrop"] += 1
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=tidsgrans) as r:
                buf = r.read(); STAT["byte"] += len(buf)
            i = buf.find(b"\nData:\n")
            if i >= 0:
                import numpy as np
                p = i + 7; antal = struct.unpack(">I", buf[p:p + 4])[0]
                if antal >= n: return np.frombuffer(buf, dtype=">f4", count=n, offset=p + 8)
            print("  ovantat svar", flush=True)
        except urllib.error.HTTPError as e:
            print(f"  svar {e.code}", flush=True)
            if e.code in (400, 403, 404): return None
        except Exception as e:
            print(f"  fel {e}", flush=True)
        if f < 4: time.sleep(15 * 2 ** (f - 1))
    return None


def senaste_ens():
    nu = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    d = nu - timedelta(hours=nu.hour % 3)
    for i in range(6):
        dtg = (d - timedelta(hours=3 * i)).strftime("%Y%m%dT%HZ")
        code, txt = hamta(BAS + ENS_FILN(dtg) + ".ascii?time", forsok=2, tidsgrans=60)
        m = re.search(r"\ntime\[(\d+)\]", txt) if code == 200 else None
        if m and int(m.group(1)) >= 62: return dtg
        time.sleep(1)
    return None


def varv_ens(ut):
    import gzip
    endir = os.path.join(ut, "ens"); os.makedirs(endir, exist_ok=True)
    idxfil = os.path.join(endir, "index.json")
    gammal = {}
    try:
        with open(idxfil, encoding="utf-8") as f: gammal = json.load(f)
    except Exception: pass
    dtg = senaste_ens()
    if not dtg: print("Sverige: ingen komplett ensemblekorning hittad."); return 0
    if gammal.get("dtg") == dtg and gammal.get("klar"):
        print(f"Sverige: {dtg} finns redan."); return 0
    t0 = time.time(); STAT["anrop"] = 0; STAT["byte"] = 0
    y0, y1, x0, x1, s_ = SV["y0"], SV["y1"], SV["x0"], SV["x1"], SV["s"]
    ny, nx = (y1 - y0) // s_ + 1, (x1 - x0) // s_ + 1; n = ny * nx
    forra = gammal.get("dtg") if gammal.get("klar") else None
    dtgF = (datetime.strptime(dtg, "%Y%m%dT%HZ") - timedelta(hours=3)).strftime("%Y%m%dT%HZ")
    if forra != dtgF: forra = None
    # 20/11: ateranvand bara om forra korningen har samma ruta (rutan utokades 20/11)
    if forra and any(gammal.get(k) != SV[k] for k in ("y0", "y1", "x0", "x1", "s")): forra = None
    dirn = os.path.join(endir, dtg); os.makedirs(dirn, exist_ok=True)
    print(f"Sverige: {dtg}, {ny}x{nx} punkter (5 km), forra korningen {'finns' if forra else 'saknas'}", flush=True)
    ateranvant = 0
    for v, pa in SV_PARAM.items():
        for a, b in SV_BLOCK:
            nt = b - a + 1
            import numpy as np
            koder = [np.full(ENS_MEDL * n, 255, dtype=np.uint8) for _ in range(nt)]
            # medlem 0-14
            fr = enc(f"{pa['var']}[{a}:1:{b}][0][0:{ENS_NYA - 1}][{y0}:{s_}:{y1}][{x0}:{s_}:{x1}]")
            vals = hamta_bin(BAS + ENS_FILN(dtg) + ".dods?" + fr, nt * ENS_NYA * n)
            if vals is None: print(f"  {v} +{a}..+{b}: misslyckades - avbryter"); return 1
            kod = _koda_np(pa, vals)
            for k in range(nt): koder[k][:ENS_NYA * n] = kod[k * ENS_NYA * n:(k + 1) * ENS_NYA * n]
            # medlem 15-29: forra korningens 0-14 vid t+3, annars hamta
            saknas = []
            for k in range(nt):
                t = a + k; gf = os.path.join(endir, forra, f"{v}_{t + 3}.bin.gz") if forra else None
                if gf and os.path.exists(gf):
                    with gzip.open(gf, "rb") as f: g = f.read()
                    koder[k][ENS_NYA * n:] = np.frombuffer(g, dtype=np.uint8, count=ENS_NYA * n); ateranvant += 1
                else: saknas.append(k)
            if saknas:
                ka, kb = saknas[0], saknas[-1]
                fr = enc(f"{pa['var']}[{a + ka}:1:{a + kb}][0][{ENS_NYA}:{ENS_MEDL - 1}][{y0}:{s_}:{y1}][{x0}:{s_}:{x1}]")
                vals = hamta_bin(BAS + ENS_FILN(dtg) + ".dods?" + fr, (kb - ka + 1) * ENS_NYA * n)
                if vals is None: print(f"  {v} medl 15-29: misslyckades - avbryter"); return 1
                kod = _koda_np(pa, vals)
                for kk in range(kb - ka + 1): koder[ka + kk][ENS_NYA * n:] = kod[kk * ENS_NYA * n:(kk + 1) * ENS_NYA * n]
            # medlem 0:s sikt/molnbas ur det-filen
            if v in ("sikt", "bas") and all((ko[:n] == 255).all() for ko in koder):
                fr = enc(f"{pa['var']}[{a}:1:{b}][0][{y0}:{s_}:{y1}][{x0}:{s_}:{x1}]")
                vals = hamta_bin(BAS + FIL(dtg) + ".dods?" + fr, nt * n)
                if vals is not None:
                    kod = _koda_np(pa, vals)
                    for k in range(nt): koder[k][:n] = kod[k * n:(k + 1) * n]
            for k in range(nt):
                with gzip.open(os.path.join(dirn, f"{v}_{a + k}.bin.gz"), "wb", compresslevel=6) as f: f.write(koder[k].tobytes())
            print(f"  {v} +{a}..+{b} klart ({time.time() - t0:.0f} s)", flush=True)
    # bara senaste korningen ligger kvar
    for d in os.listdir(endir):
        if d != dtg and os.path.isdir(os.path.join(endir, d)):
            import shutil; shutil.rmtree(os.path.join(endir, d))
    idx = {"dtg": dtg, "klar": True, "y0": y0, "y1": y1, "x0": x0, "x1": x1, "s": s_, "tider": SV_TIDER, "v": list(SV_PARAM),
           "skapad": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")}
    with open(idxfil, "w", encoding="utf-8") as f: json.dump(idx, f, ensure_ascii=False)
    mb = sum(os.path.getsize(os.path.join(dirn, x)) for x in os.listdir(dirn)) / 1e6
    print(f"Sverige klart: {time.time() - t0:.0f} s, {STAT['anrop']} anrop, {STAT['byte'] / 1e6:.0f} MB fran thredds, {mb:.0f} MB filer, {ateranvant} timmar medl. 15-29 fran forra")
    with open(os.environ.get("GITHUB_OUTPUT", os.devnull), "a") as f: f.write("andrat=ja\n")
    return 0


def main():
    ut = sys.argv[1] if len(sys.argv) > 1 else "forhamtat"
    if len(sys.argv) > 2 and sys.argv[2] == "tq":   # varv 2 (NYTT 19/11 em)
        return varv_tq(ut)
    if len(sys.argv) > 2 and sys.argv[2] == "ens":  # varv 0 (NYTT 20/11) - Sverigeoversikten
        return varv_ens(ut)
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
           "punkter": punkter, "tq": False}
    with open(idxfil, "w", encoding="utf-8") as f:
        json.dump(idx, f, ensure_ascii=False, indent=1)
    print(f"Klart: {len(punkter)} punkter pa {time.time() - t0:.0f} s, {STAT['anrop']} anrop, {STAT['byte'] / 1e6:.1f} MB")
    # logg over forhamtningarna (visas pa statistik.html)
    sfil = os.path.join(ut, "statistik.json")
    logg = []
    try:
        with open(sfil, encoding="utf-8") as f:
            logg = json.load(f)
    except Exception:
        pass
    logg.insert(0, {"tid": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "dtg": dtg, "punkter": len(punkter),
                    "anrop": STAT["anrop"], "byte": STAT["byte"], "sek": round(time.time() - t0)})
    with open(sfil, "w", encoding="utf-8") as f:
        json.dump(logg[:STAT_MAX], f, ensure_ascii=False, indent=0)
    with open(os.environ.get("GITHUB_OUTPUT", os.devnull), "a") as f:
        f.write("andrat=ja\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
