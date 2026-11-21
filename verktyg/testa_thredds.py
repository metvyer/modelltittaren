#!/usr/bin/env python3
"""Modelltittaren - testkorning mot riktiga data (NYTT 19/11, punkt 1 och 2 i lagesbilden).

Startas FOR HAND i GitHub: Actions -> "Testa thredds" -> Run workflow.
GitHub nar thredds.met.no aven nar Jakob inte sitter vid datorn, sa har testas
samma anrop som sidan gor - utan webblasare:

  A. Senaste kompletta ensemblekorning (subset-filen, 62 tider).
  B. .das for ensemblefilen -> attributen for ensemble_member (vilken medlem
     ar kontroll, vilken korning varje medlem kommer fran) - punkt 2.
  C. Meteogram (samma fraga som knappen "Meteogram har"): 30 medlemmar x 62
     timmar for byvind, nederbord, sikt och molnbas i en punkt. Tid, storlek,
     antal varden, saknade varden, rimlighet (min/median/max).
  D. Sannolikhetsomrade (samma fraga som "Hamta falt"): byvind +0..+12 h,
     150 x 150 km kring punkten i 2,5 km, binart (.dods). Tid, storlek, och
     per timme: andel medlemmar >= 32 kt, medel och hogsta - samma tal som
     sidans Visa = Sannolikhet / Medel / Hogsta ska ge i den punkten.
  E. Mellanservern (Cloudflare) jamfors med direkt: samma lilla anrop via
     workern och direkt, status + borjan av svaret (morgonens 500-fel).
  F. (NYTT 19/11 em, punkt 4) Tid-hojd med/utan temperatur + fukt pa
     modellnivaer: samma 24 h-bit som forhamtningen i fyra varianter
     (som i dag / + T,q till FL450 varje timme / + T,q till FL200 varje
     timme / + T,q till FL450 var 3:e timme). V0 och V1 kors tva ganger
     for att se spridningen. Ger en uppskattning av forhamtningens tid.

  G. (NYTT 19/11 kvall) Vilka medlemmar ar vilka? Jamfor T2m for alla 30 medlemmar
     mellan senaste ensemblefilen och de tva foregaende (3 och 6 h aldre) vid samma
     giltighetstid: identiska serier = samma medlem (lagged). Visar ocksa katalogen
     (vilka filtyper som finns), globala attribut och variabler med bara medlemsdimension.

  H. (NYTT 19/11 kvall) Saknade varden per medlem: for byvind, nederbord, sikt och
     molnbas i punkten (alla timmar) och i ett 50 x 50 km-omrade vid +6 h.

  I. (NYTT 19/11 kvall) Ar ensemblens medlem 0 samma korning som det-filen (meps_det_2_5km)?
     Jamfor T2m och byvind i punkten for samma DTG, och visa att det-filen har sikt och molnbas.

  J. (NYTT 19/11 kvall) Tid for ett sannolikhetsomrade med alla 30 medlemmar mot bara 0-14.

  K. (NYTT 19/11 natt) Registret: samma omradesfraga tva ganger via mellanservern (forsta = met.no,
     andra = cachen?), sedan /register - star fragan dar?

  L. (NYTT 20/11) Sverigeoversikt: byvind +0..+12, medlem 0-14, binart, for Sverige med omnejd 5 km,
     hela MEPS 10 km och hela MEPS 5 km - tid, MB fran thredds, och gzip-storlek for 1 byte per varde.

Vilka delar som kors valjs med MT_DELAR (t.ex. "ABCDE" = standard, "F", "ABCDEF").

Isolinjerna ritas i webblasaren och kan inte testas har - bara datat under dem.
Resultatet skrivs i korningens sammanfattning (Summary) och som fil
(testresultat.md + das_ensemble.txt) under Artifacts.

Ett anrop i taget, paus mellan anropen, samma User-Agent som forhamtningen.
Data fran MET Norway (thredds.met.no), CC BY 4.0. Bara standardbiblioteket.
"""
import math, os, re, statistics, struct, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import forhamta as F   # ruta(), enc(), PUNKTER - samma rakning som sidan

# ---- Installningar (andras har) ----
BAS = "https://thredds.met.no/thredds/dodsC/mepslatest/"
MELLAN = "https://modelltittaren.metvyer.workers.dev/mepslatest/"
SIDA = "https://metvyer.github.io"           # mellanservern slapper bara igenom anrop "fran" sidan
ENS_FIL = lambda dtg: "meps_lagged_6_h_subset_2_5km_" + dtg + ".ncml"
PROV_FIL = "meps_lagged_6_h_latest_2_5km_latest.nc.ascii?time"
UA = "Modelltittaren-test (github.com/metvyer/modelltittaren)"
MEDL, TIDER = 30, 62
PAUS = 3                                      # sekunder mellan anropen (snallt mot thredds)
KT = 3600 / 1852
FOT = 3.28084
TROSK_KT = 32
OMR_KM, OMR_TIMMAR = 150, 13                  # D: 150 x 150 km, +0..+12 h
# Meteogrammets parametrar: namn, variabel, omrakning, enhet (samma som PPARAM i sannolikhet.js)
PARAM = [("Byvind", "wind_speed_of_gust", lambda v: v * KT, "kt"),
         ("Nederbörd ack", "precipitation_amount_acc", lambda v: v, "mm"),
         ("Sikt", "visibility_in_air", lambda v: v, "m"),
         ("Molnbas", "cloud_base_altitude", lambda v: v * FOT, "ft")]

UT = []                                       # rader till sammanfattningen (markdown)
def skriv(s=""):
    print(s, flush=True); UT.append(s)


def hamta(url, ursprung=None, tidsgrans=180, binart=False):
    """Ett anrop. Returnerar (status, data, sekunder, byte). 429 -> en ny chans efter 30 s."""
    for forsok in (1, 2):
        h = {"User-Agent": UA}
        if ursprung: h["Origin"] = ursprung
        t0 = time.time(); st, data = 0, b""
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=tidsgrans) as r:
                st, data = r.status, r.read()
        except urllib.error.HTTPError as e:
            st = e.code
            try: data = e.read()
            except Exception: data = b""
        except Exception as e:
            st, data = 0, str(e).encode()
        sek = time.time() - t0
        time.sleep(PAUS)
        if st == 429 and forsok == 1:
            print("  429 - vantar 30 s", flush=True); time.sleep(30); continue
        return st, (data if binart else data.decode("utf-8", "replace")), sek, len(data)


def tolka_grid(txt, var):
    """Alla varden for variabeln ur ett ascii-svar (Grid: forsta blocket ar sjalva faltet)."""
    vals, inne = [], False
    for rad in txt.replace("\r", "").split("\n"):
        r = rad.strip()
        if r.startswith(var + "." + var + "[") or (r.startswith(var + "[") and r.endswith("]") and "," not in r):
            inne = True; continue
        if inne:
            if not r: break
            if r[0] == "[":
                vals += [float(x) for x in r[r.rindex("]") + 1:].lstrip(",").split(",") if x.strip()]
            elif "[" in r and r.endswith("]"):
                break
    return vals


def ok_varde(v):
    return math.isfinite(v) and abs(v) < 1e30   # _FillValue 9.96921E36 = saknas


def las_dods(buf, n):
    """Forsta arrayen i ett DAP2-binarsvar: DDS-text, 'Data:\\n', langd x2 (XDR), float32 big-endian."""
    i = buf.find(b"\nData:\n")
    if i < 0: return None
    p = i + 7
    antal = struct.unpack(">I", buf[p:p + 4])[0]
    if antal < n or len(buf) < p + 8 + 4 * antal: return None
    return struct.unpack(">%df" % antal, buf[p + 8:p + 8 + 4 * antal])


def senaste_ens():
    nu = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    d = nu - timedelta(hours=nu.hour % 3)
    for i in range(6):
        dtg = (d - timedelta(hours=3 * i)).strftime("%Y%m%dT%HZ")
        st, txt, sek, _ = hamta(BAS + ENS_FIL(dtg) + ".ascii?time", tidsgrans=60)
        m = re.search(r"\ntime\[(\d+)\]", txt) if st == 200 else None
        n = int(m.group(1)) if m else 0
        skriv(f"- {dtg}: svar {st}, {n} tider ({sek:.1f} s)")
        if n >= TIDER: return dtg
    return None


def matTQ(iy, ix):
    """F: tid for en 24 h-bit tid-hojd (som forhamtningen) med och utan T + q pa modellnivaer."""
    skriv("## F. Tid-höjd med/utan temperatur + fukt på modellnivåer (24 h-bit, som förhämtningen)")
    dtg, nt = F.senaste_korning()
    if not dtg:
        skriv("Ingen komplett det-körning hittad - F hoppas över."); skriv(); return
    yx = f"[{iy}][{ix}]"
    st, stat, sek, by = hamta(F.BAS + F.FIL(dtg) + ".ascii?" + F.enc(
        "time,ap,b,pressure,height5,latitude" + yx + ",longitude" + yx + ",surface_geopotential[0][0]" + yx))
    if st != 200:
        skriv(f"Fasta data: svar {st} - F hoppas över."); skriv(); return
    gammal = F.TOPP_FL
    F.TOPP_FL = 450; ks450 = F.lagsta_niva(stat)
    F.TOPP_FL = 200; ks200 = F.lagsta_niva(stat)
    F.TOPP_FL = gammal
    a, b = 0, F.BIT - 1
    tt, t3 = f"[{a}:{b}]", f"[{a}:{F.VIND_DT}:{b}]"
    def fraga(tq_ks, tq_steg):
        v = [n + tt + "[0]" + yx for n in F.YTA]
        v.append("cloud_base_altitude" + tt + "[0]" + yx)
        v.append("cloud_area_fraction_ml" + tt + f"[{ks450}:{F.NIV - 1}]" + yx)
        v.append("geopotential_pl" + tt + f"[0:{F.NTRYCK - 1}]" + yx)
        v.append("icing_index" + tt + f"[0:{F.NIS - 1}]" + yx)
        v += [n + t3 + f"[{ks450}:{F.VIND_DK}:{F.NIV - 1}]" + yx for n in ("x_wind_ml", "y_wind_ml")]
        v += [n + t3 + f"[0:{F.NTRYCK - 1}]" + yx for n in ("x_wind_pl", "y_wind_pl")]
        if tq_ks is not None:
            tid = tt if tq_steg == 1 else f"[{a}:{tq_steg}:{b}]"
            v += [n + tid + f"[{tq_ks}:{F.NIV - 1}]" + yx for n in ("air_temperature_ml", "specific_humidity_ml")]
        return F.BAS + F.FIL(dtg) + ".ascii?" + F.enc(",".join(v))
    VAR = [("V0 som i dag (moln/vind FL450)", None, 1), ("V1 + T,q FL450 varje timme", ks450, 1),
           ("V2 + T,q FL200 varje timme", ks200, 1), ("V3 + T,q FL450 var 3:e timme", ks450, 3)]
    skriv(f"Körning {dtg}, nivåer från k={ks450} (FL450) resp. k={ks200} (FL200) till {F.NIV - 1}, timmar +{a}..+{b}.")
    skriv("| Variant | Svar | Tid | kB |"); skriv("|---|---|---|---|")
    tider = {}
    for i in (0, 1, 2, 3, 0, 1):   # V0 och V1 tva ganger (servern varierar)
        namn, ks, stg = VAR[i]
        st, txt, sek, by = hamta(fraga(ks, stg), tidsgrans=240)
        skriv(f"| {namn} | {st} | {sek:.1f} s | {by/1024:.0f} |")
        if st == 200: tider.setdefault(i, []).append(sek)
    if 0 in tider:
        v0 = statistics.mean(tider[0])
        skriv()
        skriv(f"Förhämtningen i dag ca 41 min (11 orter, FL450). Uppskattning om varje bit blir lika mycket långsammare:")
        for i in (1, 2, 3):
            if i in tider:
                k = statistics.mean(tider[i]) / v0
                skriv(f"- {VAR[i][0]}: {k:.2f} x V0 -> ca {41 * k:.0f} min")
    skriv()


def medlemmar(iy, ix):
    """G: kartlagg medlemmarna i lagged-filerna."""
    skriv("## G. Vilka medlemmar är vilka (lagged)?")
    # katalogen
    st, kat, sek, by = hamta("https://thredds.met.no/thredds/catalog/mepslatest/catalog.xml", tidsgrans=60)
    if st == 200:
        namn = re.findall(r'name="(meps_[^"]+)"', kat)
        typer = {}
        for n in namn:
            typ = re.sub(r"\d{8}T\d{2}Z", "<DTG>", n); typer.setdefault(typ, []).append(n)
        skriv(f"Katalogen mepslatest: {len(namn)} filer, {len(typer)} typer:")
        skriv("```"); [skriv(f"{len(v):3d} st  {k}   (senaste: {sorted(v)[-1]})") for k, v in sorted(typer.items())]; skriv("```")
    else:
        skriv(f"Katalogen: svar {st}")
    # senaste subset + tva foregaende
    nu = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    d = nu - timedelta(hours=nu.hour % 3)
    kor = []
    for i in range(8):
        dtg = (d - timedelta(hours=3 * i)).strftime("%Y%m%dT%HZ")
        st, txt, sek, by = hamta(BAS + ENS_FIL(dtg) + ".ascii?time", tidsgrans=60)
        m = re.search(r"\ntime\[(\d+)\]", txt) if st == 200 else None
        if m and int(m.group(1)) >= TIDER: kor.append(dtg)
        if len(kor) == 3: break
    if len(kor) < 2:
        skriv("För få kompletta körningar."); skriv(); return
    skriv(f"Jämför {', '.join(kor)} i punkten iy={iy} ix={ix}")
    # globala attribut + variabler utan rumsdimension
    st, das, sek, by = hamta(BAS + ENS_FIL(kor[0]) + ".das", tidsgrans=120)
    if st == 200:
        m = re.search(r"NC_GLOBAL \{(.*?)\n    \}", das, re.S)
        if m: skriv("Globala attribut:"); skriv("```"); skriv("\n".join(r.strip() for r in m.group(1).strip().split("\n"))[:3000]); skriv("```")
    st, dds, sek, by = hamta(BAS + ENS_FIL(kor[0]) + ".dds", tidsgrans=60)
    if st == 200:
        sma = [r.strip() for r in dds.split("\n") if "ensemble_member" in r and "[x =" not in r and "[y =" not in r]
        skriv("Variabler med medlemsdimension men utan x/y:"); skriv("```"); skriv("\n".join(sma[:30]) or "(inga)"); skriv("```")
    # T2m-serier
    serier = {}
    for dtg in kor:
        fr = F.enc(f"air_temperature_2m[0:1:{TIDER-1}][0][0:{MEDL-1}][{iy}][{ix}]")
        st, txt, sek, by = hamta(BAS + ENS_FIL(dtg) + ".ascii?" + fr)
        v = tolka_grid(txt, "air_temperature_2m") if st == 200 else []
        if len(v) >= TIDER * MEDL: serier[dtg] = v
        skriv(f"- {dtg}: svar {st}, {len(v)} värden, {sek:.1f} s")
    ny = kor[0]
    if ny not in serier: skriv(); return
    A = serier[ny]
    for gam in kor[1:]:
        if gam not in serier: continue
        B = serier[gam]
        dh = int((datetime.strptime(ny, "%Y%m%dT%HZ") - datetime.strptime(gam, "%Y%m%dT%HZ")).total_seconds() // 3600)
        par, rader = {}, []
        for m in range(MEDL):
            bast, bfel = None, 1e9
            for m2 in range(MEDL):
                fel = [abs(A[t * MEDL + m] - B[(t + dh) * MEDL + m2]) for t in range(TIDER - dh)
                       if ok_varde(A[t * MEDL + m]) and ok_varde(B[(t + dh) * MEDL + m2])]
                if fel and max(fel) < bfel: bfel, bast = max(fel), m2
            if bfel < 0.01: par[m] = bast
            rader.append(f"{m}->{bast}({bfel:.3f})")
        skriv(f"**{ny} mot {gam} ({dh} h äldre): {len(par)} av {MEDL} medlemmar identiska.**")
        skriv("Ny medlem -> medlem i äldre filen (största skillnad K): " + ", ".join(rader))
        skriv("Identiska: " + (", ".join(f"{a}={b}" for a, b in sorted(par.items())) or "inga"))
    skriv()


def saknade(iy, ix):
    """H: saknade varden per medlem i senaste ensemblefilen."""
    skriv("## H. Saknade värden per medlem (senaste körningen + de tre föregående)")
    dtg0 = senaste_ens()
    if not dtg0: skriv(); return
    d0 = datetime.strptime(dtg0, "%Y%m%dT%HZ")
    for i in range(4):
      dtg = (d0 - timedelta(hours=3 * i)).strftime("%Y%m%dT%HZ")
      saknade1(dtg, iy, ix)
    skriv()


def saknade1(dtg, iy, ix):
    skriv(f"Körning {dtg}. Antal saknade värden per medlem (bara medlemmar som saknar något visas):")
    for pnamn, var, konv, enh in PARAM[2:]:   # bara sikt och molnbas (byvind/nb saknar inget)
        st, txt, sek, by = hamta(BAS + ENS_FIL(dtg) + ".ascii?" + F.enc(f"{var}[0:1:{TIDER-1}][0][0:{MEDL-1}][{iy}][{ix}]"))
        v = tolka_grid(txt, var) if st == 200 else []
        pm = [sum(1 for t in range(TIDER) if not ok_varde(v[t * MEDL + m])) for m in range(MEDL)] if len(v) >= TIDER * MEDL else None
        st2, txt2, sek2, by2 = hamta(BAS + ENS_FIL(dtg) + ".ascii?" + F.enc(f"{var}[6][0][0:{MEDL-1}][{iy-10}:{iy+9}][{ix-10}:{ix+9}]"))
        w = tolka_grid(txt2, var) if st2 == 200 else []
        om = [sum(1 for i in range(400) if not ok_varde(w[m * 400 + i])) for m in range(MEDL)] if len(w) >= 400 * MEDL else None
        def txtm(a, n):
            if not a: return "kunde inte läsas"
            hel = [f"m{m}" for m, c in enumerate(a) if c == n]; dels = sum(1 for c in a if 0 < c < n)
            return ("helt tomma: " + (", ".join(hel) or "inga")) + (f"; {dels} medl. delvis" if dels else "")
        skriv(f"- **{pnamn}** punkt ({TIDER} h): {txtm(pm, TIDER)} | område +6 (400 rutor): {txtm(om, 400)}")


def kontroll(iy, ix):
    """I: medlem 0 i ensemblen mot det-filen."""
    skriv("## I. Medlem 0 i ensemblen jämfört med det-filen (meps_det_2_5km)")
    nu = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    d = nu - timedelta(hours=nu.hour % 3)
    gjorda = 0
    for i in range(6):
        dtg = (d - timedelta(hours=3 * i)).strftime("%Y%m%dT%HZ")
        st1, t1, *_ = hamta(BAS + ENS_FIL(dtg) + ".ascii?time", tidsgrans=60)
        st2, t2, *_ = hamta(BAS + F.FIL(dtg) + ".ascii?time", tidsgrans=60)
        if st1 != 200 or st2 != 200: continue
        rad = []
        for var in ("air_temperature_2m", "wind_speed_of_gust", "visibility_in_air", "cloud_base_altitude"):
            se, te, *_ = hamta(BAS + ENS_FIL(dtg) + ".ascii?" + F.enc(f"{var}[0:1:{TIDER-1}][0][0][{iy}][{ix}]"))
            sd, td, *_ = hamta(BAS + F.FIL(dtg) + ".ascii?" + F.enc(f"{var}[0:1:{TIDER-1}][0][{iy}][{ix}]"))
            ve = tolka_grid(te, var) if se == 200 else []; vd = tolka_grid(td, var) if sd == 200 else []
            par = [(a, b) for a, b in zip(ve, vd) if ok_varde(a) and ok_varde(b)]
            maxd = max((abs(a - b) for a, b in par), default=float("nan"))
            rad.append(f"{var}: ens m0 {sum(ok_varde(x) for x in ve)}/{len(ve)} värden, det {sum(ok_varde(x) for x in vd)}/{len(vd)}, största skillnad {maxd:.4g} ({len(par)} jämförda)")
        skriv(f"**{dtg}**"); [skriv("- " + r) for r in rad]
        gjorda += 1
        if gjorda == 2: break
    skriv()


def tidMedlemmar(iy, ix):
    """J: tid for omrade (byvind, 150 x 150 km, 2,5 km, +0..+12) med 30 resp 15 medlemmar, binart."""
    skriv("## J. Sannolikhetsområde: 30 medlemmar mot 15 (byvind, 150×150 km, 2,5 km, 13 h, binärt)")
    dtg = senaste_ens()
    if not dtg: skriv(); return
    halv = OMR_KM * 1000 // 2500 // 2
    skriv("| Medlemmar | Svar | Tid | MB |"); skriv("|---|---|---|---|")
    res = {}
    # varje anrop i ett NYTT omrade (forskjutet 70 rutor) sa att thredds inte har nagot i sin cache
    for i, mmax in enumerate((14, 29, 14, 29, 14, 29)):
        dy = (i - 3) * 70
        fr = F.enc(f"wind_speed_of_gust[0:1:{OMR_TIMMAR-1}][0][0:{mmax}][{iy-halv+dy}:1:{iy+halv+dy}][{ix-halv}:1:{ix+halv}]")
        st, buf, sek, by = hamta(BAS + ENS_FIL(dtg) + ".dods?" + fr, tidsgrans=300, binart=True)
        skriv(f"| 0–{mmax} | {st} | {sek:.1f} s | {by/1048576:.1f} |")
        if st == 200: res.setdefault(mmax, []).append(sek)
    if 29 in res and 14 in res:
        a, b = statistics.median(res[29]), statistics.median(res[14])
        skriv(f"Median: 30 medlemmar {a:.1f} s, 15 medlemmar {b:.1f} s -> {b/a:.0%} av tiden.")
    skriv()


def register(iy, ix):
    """K: registret i mellanservern."""
    skriv("## K. Registret i mellanservern")
    dtg = senaste_ens()
    if not dtg: skriv(); return
    fraga = F.enc(f"wind_speed_of_gust[0:1:12][0][0:14][{iy-8}:1:{iy+7}][{ix-8}:1:{ix+7}]")
    for i in (1, 2):
        st, buf, sek, by = hamta(MELLAN + ENS_FIL(dtg) + ".dods?" + fraga, ursprung=SIDA, tidsgrans=120, binart=True)
        skriv(f"- anrop {i} via mellanservern: svar {st}, {sek:.1f} s, {by/1024:.0f} kB")
        time.sleep(5)
    st, txt, sek, by = hamta(MELLAN.replace("/mepslatest/", "/register") + "?dtg=" + dtg, ursprung=SIDA, tidsgrans=60)
    try:
        import json; rader = json.loads(txt)
        egen = [r for r in rader if r.get("fraga") == "?" + fraga]
        skriv(f"- /register: svar {st}, {len(rader)} rader för {dtg}; vår fråga finns: {'JA' if egen else 'NEJ'}")
        if egen: skriv("```"); skriv(json.dumps(egen[0], ensure_ascii=False)); skriv("```")
    except Exception as e:
        skriv(f"- /register: svar {st}, kunde inte läsas ({e}): {txt[:200]}")
    skriv()


def sverige():
    """L: matning av Sverigeoversikten."""
    import gzip
    skriv("## L. Sverigeöversikt – mätning (byvind +0..+12, medlem 0–14, binärt)")
    dtg = senaste_ens()
    if not dtg: skriv(); return
    fall = [("Sverige med omnejd, 5 km", 172, 806, 317, 659, 2), ("Hela MEPS, 10 km", 0, 1068, 0, 948, 4), ("Hela MEPS, 5 km", 0, 1068, 0, 948, 2)]
    skriv("| Område | Punkter | Svar | Tid | MB från thredds | 1 byte/värde | gzip | gzip per timme (30 medl.) |"); skriv("|---|---|---|---|---|---|---|---|")
    for namn, y0, y1, x0, x1, st in fall:
        y1 = y0 + (y1 - y0) // st * st; x1 = x0 + (x1 - x0) // st * st
        ny, nx = (y1 - y0) // st + 1, (x1 - x0) // st + 1
        fr = F.enc(f"wind_speed_of_gust[0:1:12][0][0:14][{y0}:{st}:{y1}][{x0}:{st}:{x1}]")
        stt, buf, sek, by = hamta(BAS + ENS_FIL(dtg) + ".dods?" + fr, tidsgrans=600, binart=True)
        n = 13 * 15 * ny * nx
        v = las_dods(buf, n) if stt == 200 else None
        if v:
            kod = bytes(min(254, max(0, int(round(x * KT)))) if math.isfinite(x) and x < 1e6 else 255 for x in v)
            gz = len(gzip.compress(kod, 6))
            skriv(f"| {namn} | {ny*nx:,} | {stt} | {sek:.0f} s | {by/1048576:.1f} | {len(kod)/1048576:.1f} MB | {gz/1048576:.2f} MB | {gz/1048576/13*2:.2f} MB |".replace(",", " "))
        else:
            skriv(f"| {namn} | {ny*nx:,} | {stt} | {sek:.0f} s | {by/1048576:.1f} | – | – | – |".replace(",", " "))
    skriv()


def nyaFalt(iy, ix):
    """M (20/11): de nya ensembleparametrarna i sidan - finns de, enhet (min/max), saknas medlem 0?"""
    skriv("## M. Nya ensemblefält (meteogramfråga per variabel, 30 medl. x 62 h)")
    dtg = senaste_ens()
    if not dtg: skriv("Ingen körning."); return
    skriv("| variabel | svar | s | min | max | medl. 0 saknas | alla saknas |"); skriv("|---|---|---|---|---|---|---|")
    for var in ["low_type_cloud_area_fraction", "medium_type_cloud_area_fraction", "high_type_cloud_area_fraction", "cloud_area_fraction",
                "fog_area_fraction", "altitude_of_0_degree_isotherm", "snowfall_amount_acc", "air_temperature_2m", "x_wind_10m", "y_wind_10m"]:
        st, txt, sek, by = hamta(BAS + ENS_FIL(dtg) + ".ascii?" + urllib.parse.quote(f"{var}[0:1:{TIDER - 1}][0][0:29][{iy}][{ix}]", safe=""), tidsgrans=120)
        v = tolka_grid(txt, var) if st == 200 else []
        ok = [x for x in v if ok_varde(x)]
        m0 = sum(1 for t in range(min(TIDER, len(v) // 30)) if not ok_varde(v[t * 30]))
        skriv(f"| {var} | {st} | {sek:.1f} | {min(ok):.3g} | {max(ok):.3g} | {m0} | {len(v) - len(ok)} av {len(v)} |" if ok else f"| {var} | {st} | {sek:.1f} | – | – | – | {len(v)} värden |")
    skriv()


def skewTid(iy, ix):
    """N (20/11): Bara skew-T - en 6 h-bit (som sidan) utan och med molnvatten + graupel, det-filen."""
    skriv("## N. Bara skew-T: tid för en 6 h-bit (+12..+17)")
    nu = datetime.now(timezone.utc); d = nu - timedelta(hours=nu.hour % 3 + 6)
    dtg = d.strftime("%Y%m%dT%HZ"); yx = f"[{iy}][{ix}]"; tt = "[12:17]"
    bas = [f"{n}{tt}[0]{yx}" for n in F.YTA] if hasattr(F, "YTA") else []
    tq = [f"air_temperature_ml{tt}[24:64]{yx}", f"specific_humidity_ml{tt}[24:64]{yx}", f"x_wind_ml{tt}[24:2:64]{yx}", f"y_wind_ml{tt}[24:2:64]{yx}"]
    wr = [f"mass_fraction_of_cloud_condensed_water_in_air_ml{tt}[36:64]{yx}", f"mass_fraction_of_graupel_in_air_ml{tt}[36:64]{yx}"]
    for namn, v in [("T, q, vind", bas + tq), ("+ molnvatten + graupel", bas + tq + wr), ("bara molnvatten + graupel", wr)]:
        st, txt, sek, by = hamta(BAS + "meps_det_2_5km_" + dtg + ".ncml.ascii?" + urllib.parse.quote(",".join(v), safe=""), tidsgrans=180)
        skriv(f"- {dtg} {namn}: svar {st}, {sek:.1f} s, {by / 1024:.0f} kB")
        if namn.startswith("bara") and st == 200:
            w = [x for x in tolka_grid(txt, "mass_fraction_of_cloud_condensed_water_in_air_ml") if ok_varde(x)]
            if w: skriv(f"  molnvatten max {max(w) * 1000:.3f} g/kg")
    skriv()


def remsaMot(iy, ix):
    """O (20/11 kvall): kostar en smal remsa mindre an hela omradet? Samma timmar (+0..+12) och alla 30
    medlemmar, molnbas, .dods som sidan. 600 km-omrade (var 5 km) mitt i Finland mot en 60 km-remsa i ostkanten.
    Ordning hel-remsa-remsa-hel sa att eventuell cache/uppvarmning syns."""
    skriv("## O. Remsa mot helt område (molnbas, +0..+12, 30 medlemmar, var 5 km)")
    dtg = senaste_ens()
    if not dtg: skriv("Ingen körning."); return
    hel = (385, 625, 529, 769)       # y0, y1, x0, x1 (600 x 600 km, mitt 62.2N 25.9E)
    remsa = (385, 625, 745, 769)     # ostligaste ~60 km
    skriv(f"Körning {dtg}.  Helt = 121 x 121 punkter, remsa = 121 x 13 punkter.")
    skriv("| försök | yta | svar | sekunder | MB |"); skriv("|---|---|---|---|---|")
    for nr, (namn, (y0, y1, x0, x1)) in enumerate([("helt", hel), ("remsa", remsa), ("remsa", remsa), ("helt", hel)], 1):
        fr = f"cloud_base_altitude[0:1:12][0][0:1:29][{y0}:2:{y1}][{x0}:2:{x1}]"
        st, data, sek, by = hamta(BAS + ENS_FIL(dtg) + ".dods?" + urllib.parse.quote(fr, safe=""), tidsgrans=300, binart=True)
        skriv(f"| {nr} | {namn} | {st} | {sek:.1f} | {by / 1048576:.1f} |")
        time.sleep(3)
    skriv()


def ytTemp(iy, ix):
    """P (20/11 kvall): finns yttemperatur (0 m) och havsytans temperatur i ensemblefilen, och for vilka medlemmar?
    Samma for 0-gradersnivan (har bara medlem 0 varden?). Plus det-filen for jamforelse."""
    skriv("## P. Yttemperatur, havsyta och 0-gradersnivå per medlem")
    dtg = senaste_ens()
    if not dtg: skriv("Ingen körning."); return
    skriv("| fil | variabel | svar | min | max | medlemmar med värden | värden saknas |"); skriv("|---|---|---|---|---|---|---|")
    for var in ["air_temperature_0m", "sea_surface_temperature", "altitude_of_0_degree_isotherm", "air_temperature_2m"]:
        st, txt, sek, by = hamta(BAS + ENS_FIL(dtg) + ".ascii?" + urllib.parse.quote(f"{var}[0:1:{TIDER - 1}][0][0:29][{iy}][{ix}]", safe=""), tidsgrans=120)
        v = tolka_grid(txt, var) if st == 200 else []
        ok = [x for x in v if ok_varde(x)]
        medl = sorted({i % 30 for i, x in enumerate(v) if ok_varde(x)})
        mtxt = "alla 30" if len(medl) == 30 else (", ".join(map(str, medl)) if medl else "inga")
        skriv(f"| ens | {var} | {st} | {min(ok):.4g} | {max(ok):.4g} | {mtxt} | {len(v) - len(ok)} av {len(v)} |" if ok else f"| ens | {var} | {st} | – | – | {mtxt} | {len(v)} värden |")
    nu = datetime.now(timezone.utc); d = nu - timedelta(hours=nu.hour % 3 + 6); ddtg = d.strftime("%Y%m%dT%HZ")
    for var in ["air_temperature_0m", "sea_surface_temperature", "altitude_of_0_degree_isotherm"]:
        st, txt, sek, by = hamta(BAS + "meps_det_2_5km_" + ddtg + ".ncml.ascii?" + urllib.parse.quote(f"{var}[0:1:12][0][{iy}][{ix}]", safe=""), tidsgrans=120)
        v = tolka_grid(txt, var) if st == 200 else []
        ok = [x for x in v if ok_varde(x)]
        skriv(f"| det {ddtg} | {var} | {st} | " + (f"{min(ok):.4g} | {max(ok):.4g} | – | {len(v) - len(ok)} av {len(v)} |" if ok else f"– | – | – | {len(v)} värden |"))
    # havsytans temperatur: prova utan hojd-dimension och i en havspunkt (mitt i Ostersjon, 58.0N 19.5E)
    hy, hx = F.ruta(58.0, 19.5)
    for fil, fr in [("ens", f"sea_surface_temperature[0:1:12][0:29][{hy}][{hx}]"), ("ens", f"sea_surface_temperature[0:1:12][0][0:29][{hy}][{hx}]"),
                    ("det", f"SFX_SST[0:1:12][0][{hy}][{hx}]"), ("ens", f"SFX_SST[0:1:12][0][0:29][{hy}][{hx}]")]:
        url = BAS + (ENS_FIL(dtg) if fil == "ens" else "meps_det_2_5km_" + ddtg + ".ncml") + ".ascii?" + urllib.parse.quote(fr, safe="")
        st, txt, sek, by = hamta(url, tidsgrans=120)
        v = tolka_grid(txt, fr.split("[")[0]) if st == 200 else []
        ok = [x for x in v if ok_varde(x)]
        skriv(f"- {fil} `{fr}`: svar {st}" + (f", {len(ok)} av {len(v)} värden, {min(ok):.4g}–{max(ok):.4g}" if ok else f", {len(v)} värden") + (f" | {txt[:160]!r}" if st != 200 else ""))
    skriv()


def flerPunkter(iy, ix):
    """Q (21/11): kostar flera punkter i SAMMA fraga mindre an en fraga per punkt? Samma variabler som
    forhamtningens varv 1 (tid-hojd), +0..+23, det-filen. 1 punkt, 3 punkter i en fraga, 3 fragor."""
    skriv("## Q. Flera punkter i en fråga (varv 1-variabler, +0..+23)")
    nu = datetime.now(timezone.utc); d = nu - timedelta(hours=nu.hour % 3 + 6); dtg = d.strftime("%Y%m%dT%HZ")
    pkt = [F.ruta(59.8973, 17.5886), F.ruta(59.6519, 17.9186), F.ruta(58.4264, 12.7144)]   # ESCM, ESSA, ESIB
    ks = 20
    def vlista(py, px):
        yx = f"[{py}][{px}]"; tt, t3 = "[0:23]", f"[0:{F.VIND_DT}:23]"
        v = [n + tt + "[0]" + yx for n in F.YTA] + ["cloud_base_altitude" + tt + "[0]" + yx, "cloud_area_fraction_ml" + tt + f"[{ks}:{F.NIV - 1}]" + yx,
             "geopotential_pl" + tt + f"[0:{F.NTRYCK - 1}]" + yx, "icing_index" + tt + f"[0:{F.NIS - 1}]" + yx]
        v += [n + t3 + f"[{ks}:{F.VIND_DK}:{F.NIV - 1}]" + yx for n in ("x_wind_ml", "y_wind_ml")]
        v += [n + t3 + f"[0:{F.NTRYCK - 1}]" + yx for n in ("x_wind_pl", "y_wind_pl")]
        return v
    def kor(namn, v):
        st, txt, sek, by = hamta(BAS + "meps_det_2_5km_" + dtg + ".ncml.ascii?" + urllib.parse.quote(",".join(v), safe=""), tidsgrans=300)
        skriv(f"| {namn} | {st} | {sek:.1f} | {by / 1024:.0f} |" + (f" {txt[:120]!r}" if st != 200 else ""))
        time.sleep(3)
        return sek
    skriv(f"Körning {dtg}."); skriv("| försök | svar | sekunder | kB |"); skriv("|---|---|---|---|")
    kor("1 punkt (ESCM)", vlista(*pkt[0]))
    kor("3 punkter i EN fråga", sum((vlista(*p) for p in pkt), []))
    tot = sum(kor(f"punkt {i + 1} av 3 separat", vlista(*p)) for i, p in enumerate(pkt))
    skriv(f"\n3 separata frågor tillsammans: {tot:.1f} s")
    # bara molnen (tyngsta variabeln) for att se om dubbletter av samma variabel packas upp en eller flera ganger
    mol = lambda p: f"cloud_area_fraction_ml[0:23][{ks}:{F.NIV - 1}][{p[0]}][{p[1]}]"
    kor("bara moln, 1 punkt", [mol(pkt[0])])
    kor("bara moln, 3 punkter i en fråga", [mol(p) for p in pkt])
    # thredds vagrar samma variabel flera ganger -> testa i stallet en ruta som tacker ESCM+ESSA,
    # och om .nc (utan ncml-aggregering) ar snabbare an .ncml
    (ay, ax), (by_, bx) = pkt[0], pkt[1]
    y0, y1, x0, x1 = min(ay, by_), max(ay, by_), min(ax, bx), max(ax, bx)
    skriv(f"Ruta ESCM+ESSA: y {y0}-{y1}, x {x0}-{x1} ({(y1 - y0 + 1) * (x1 - x0 + 1)} punkter)")
    kor("bara moln, ruta ESCM+ESSA", [f"cloud_area_fraction_ml[0:23][{ks}:{F.NIV - 1}][{y0}:{y1}][{x0}:{x1}]"])
    sy, sx = max(1, y1 - y0), max(1, x1 - x0)
    kor("bara moln, ruta med steg (bara hörnen)", [f"cloud_area_fraction_ml[0:23][{ks}:{F.NIV - 1}][{y0}:{sy}:{y1}][{x0}:{sx}:{x1}]"])
    kor("bara moln, hela Sverige steg 40", [f"cloud_area_fraction_ml[0:23][{ks}:{F.NIV - 1}][0:40:1000][150:40:850]"])
    st, txt, sek, by = hamta(BAS + "meps_det_2_5km_" + dtg + ".nc.ascii?" + urllib.parse.quote(mol(pkt[0]), safe=""), tidsgrans=300)
    skriv(f"| bara moln, 1 punkt, .nc i stället för .ncml | {st} | {sek:.1f} | {by / 1024:.0f} |" + (f" {txt[:120]!r}" if st != 200 else ""))
    skriv()


def parKoll():
    """R (21/11): parvis hamtning i forhamta.py - ger dela_par exakt samma svar som en enpunktsfraga?"""
    skriv("## R. Kontroll av parvis hämtning (forhamta.par_bitar)")
    dtg, nt = F.senaste_korning()
    pkt = [F.ruta(59.8973, 17.5886), F.ruta(59.6519, 17.9186)]
    stat = F.stat_punkt(dtg, *pkt[0]); ks = F.lagsta_niva(stat)
    t0 = time.time(); par = F.par_bitar(dtg, 24, pkt, ks); tp = time.time() - t0
    skriv(f"Körning {dtg}, ks {ks}. Paret ESCM+ESSA +0..+23: {tp:.1f} s")
    for k, r in enumerate(pkt):
        t0 = time.time(); en = F.par_bitar(dtg, 24, [r], ks); te = time.time() - t0
        a_, b_ = par[k][0][3] if par else "", en[0][0][3] if en else ""
        lika = a_ == b_
        skriv(f"- punkt {r}: ensam {te:.1f} s, svaren {'IDENTISKA' if lika else 'OLIKA'} ({len(a_)} / {len(b_)} tecken)")
        if not lika:
            ra, rb = a_.split("\n"), b_.split("\n")
            for n, (x, y) in enumerate(zip(ra, rb)):
                if x != y: skriv(f"  första skillnad rad {n}: {x[:90]!r} / {y[:90]!r}"); break
    skriv()


def main():
    punkt = os.environ.get("MT_PUNKT", "ESCM").strip().upper() or "ESCM"
    delar = os.environ.get("MT_DELAR", "ABCDE").strip().upper() or "ABCDE"
    p = next((x for x in F.PUNKTER if x[1] == punkt), F.PUNKTER[5])
    namn, icao, lat, lon = p
    iy, ix = F.ruta(lat, lon)
    skriv(f"# Test mot thredds {datetime.now(timezone.utc):%Y-%m-%d %H:%MZ}")
    skriv(f"Punkt: {namn} {icao} ({lat}, {lon}) -> ruta iy={iy} ix={ix}. Delar: {delar}")
    skriv()
    if "F" in delar:
        matTQ(iy, ix)
    if "G" in delar:
        medlemmar(iy, ix)
    if "H" in delar:
        saknade(iy, ix)
    if "I" in delar:
        kontroll(iy, ix)
    if "J" in delar:
        tidMedlemmar(iy, ix)
    if "K" in delar:
        register(iy, ix)
    if "L" in delar:
        sverige()
    if "M" in delar:
        nyaFalt(iy, ix)
    if "N" in delar:
        skewTid(iy, ix)
    if "O" in delar:
        remsaMot(iy, ix)
    if "P" in delar:
        ytTemp(iy, ix)
    if "Q" in delar:
        flerPunkter(iy, ix)
    if "R" in delar:
        parKoll()
    if not set(delar) & set("BCDE"):
        return spara(0)

    # ---- A. Senaste ensemblekorning ----
    skriv("## A. Senaste kompletta ensemblekörning")
    dtg = senaste_ens()
    if not dtg:
        skriv("**Ingen komplett körning hittad - testet avbryts.**"); return spara(1)
    skriv(f"Vald: **{dtg}**"); skriv()

    # ---- B. .das -> medlemsattribut ----
    if "B" in delar:
        skriv("## B. ensemble_member-attribut (.das)")
        st, das, sek, by = hamta(BAS + ENS_FIL(dtg) + ".das", tidsgrans=120)
        skriv(f"Svar {st}, {by/1024:.0f} kB, {sek:.1f} s")
        if st == 200:
            with open("das_ensemble.txt", "w", encoding="utf-8") as f: f.write(das)
            m = re.search(r"\n\s*ensemble_member \{(.*?)\n\s*\}", das, re.S)
            skriv("```"); skriv(m.group(1).strip() if m else "(inget block ensemble_member hittat)"); skriv("```")
            # globala rader som kan saga nagot om lagged-medlemmarna
            glob = [r.strip() for r in das.split("\n") if re.search(r"lag|member|control|ensemble", r, re.I) and "ensemble_member {" not in r]
            if glob:
                skriv("Andra rader som nämner lag/member/control/ensemble (högst 25):"); skriv("```"); skriv("\n".join(glob[:25])); skriv("```")
        # Ar det en variabel med varden? Hamta den (liten).
        st, txt, sek, by = hamta(BAS + ENS_FIL(dtg) + ".ascii?ensemble_member", tidsgrans=60)
        skriv(f"ensemble_member som värden: svar {st}, {sek:.1f} s")
        if st == 200:
            rader = [r for r in txt.split("\n") if r.strip() and not r.startswith("Dataset")][-3:]
            skriv("```"); skriv("\n".join(rader)[:600]); skriv("```")
        skriv()

    # ---- C. Meteogram ----
    if "C" in delar:
        skriv("## C. Meteogram (30 medlemmar × 62 h, samma fråga som sidan)")
        skriv("| Parameter | Svar | Tid | kB | Värden | Saknas | +0 min/median/max | +24 min/median/max |")
        skriv("|---|---|---|---|---|---|---|---|")
        for pnamn, var, konv, enh in PARAM:
            fraga = F.enc(f"{var}[0:1:{TIDER-1}][0][0:{MEDL-1}][{iy}][{ix}]")
            st, txt, sek, by = hamta(BAS + ENS_FIL(dtg) + ".ascii?" + fraga)
            v = tolka_grid(txt, var) if st == 200 else []
            sakn = sum(1 for x in v if not ok_varde(x))
            def tre(t):
                w = sorted(konv(x) for x in v[t*MEDL:(t+1)*MEDL] if ok_varde(x))
                return f"{w[0]:.1f} / {statistics.median(w):.1f} / {w[-1]:.1f} {enh}" if w else "-"
            okt = len(v) >= TIDER * MEDL
            skriv(f"| {pnamn} | {st} | {sek:.1f} s | {by/1024:.0f} | {len(v)}{'' if okt else ' ⚠'} | {sakn} | {tre(0) if okt else '-'} | {tre(24) if okt else '-'} |")
        skriv()

    # ---- D. Sannolikhetsomrade, binart ----
    if "D" in delar:
        skriv(f"## D. Sannolikhetsområde: byvind +0..+{OMR_TIMMAR-1} h, {OMR_KM}×{OMR_KM} km, 2,5 km, binärt")
        halv = OMR_KM * 1000 // 2500 // 2
        y0, y1, x0, x1 = iy - halv, iy + halv, ix - halv, ix + halv
        ny, nx = y1 - y0 + 1, x1 - x0 + 1
        fraga = F.enc(f"wind_speed_of_gust[0:1:{OMR_TIMMAR-1}][0][0:{MEDL-1}][{y0}:1:{y1}][{x0}:1:{x1}]")
        n = OMR_TIMMAR * MEDL * ny * nx
        st, buf, sek, by = hamta(BAS + ENS_FIL(dtg) + ".dods?" + fraga, tidsgrans=300, binart=True)
        v = las_dods(buf, n) if st == 200 else None
        skriv(f"Svar {st}, {by/1048576:.1f} MB, {sek:.1f} s, {ny}×{nx} rutor, väntat {n:,} värden -> {'OK' if v else 'KUNDE INTE LÄSAS'}".replace(",", " "))
        if v:
            cy, cx = iy - y0, ix - x0
            skriv(f"I punkten ({namn}), per timme - det sidan ska visa för Sannolikhet ≥{TROSK_KT} kt / Medel / Högsta / Medlem 0:")
            skriv("| Tid | ≥32 kt | Medel kt | Högsta kt | Medlem 0 kt |"); skriv("|---|---|---|---|---|")
            for t in range(OMR_TIMMAR):
                w = [v[((t * MEDL + m) * ny + cy) * nx + cx] * KT for m in range(MEDL)]
                w = [x for x in w if math.isfinite(x) and x < 1e6]
                if not w: skriv(f"| +{t} | - | - | - | - |"); continue
                over = sum(1 for x in w if x >= TROSK_KT)
                skriv(f"| +{t} | {over}/{len(w)} ({100*over/len(w):.0f} %) | {statistics.mean(w):.1f} | {max(w):.1f} | {w[0]:.1f} |")
            # hela omradet: hur manga rutor nar 30 % / 70 % nagon gang i perioden (underlag for isolinjerna)
            n30 = n70 = 0
            for y in range(ny):
                for x in range(nx):
                    over = 0
                    for m in range(MEDL):
                        if any(v[((t * MEDL + m) * ny + y) * nx + x] * KT >= TROSK_KT for t in range(OMR_TIMMAR)): over += 1
                    n30 += over >= 0.3 * MEDL; n70 += over >= 0.7 * MEDL
            skriv(f"Hela området, byvind ≥{TROSK_KT} kt någon gång +0..+{OMR_TIMMAR-1}: {n30} rutor ≥30 %, {n70} rutor ≥70 % av {ny*nx} (isolinjerna ska omsluta dessa).")
        skriv()

    # ---- E. Mellanservern mot direkt ----
    if "E" in delar:
        skriv("## E. Mellanservern (Cloudflare) jämfört med direkt")
        skriv("| Väg | Fil | Svar | Tid | Början av svaret |"); skriv("|---|---|---|---|---|")
        for vag, bas, urs in (("direkt", BAS, None), ("mellanserver", MELLAN, SIDA)):
            for fil in (PROV_FIL, ENS_FIL(dtg) + ".ascii?time"):
                st, txt, sek, by = hamta(bas + fil, ursprung=urs, tidsgrans=60)
                borjan = " ".join(txt.split())[:120].replace("|", "/")
                skriv(f"| {vag} | {fil.split('.ascii')[0].split('.nc')[0]} | {st} | {sek:.1f} s | {borjan if st != 200 else '(OK)'} |")
        skriv()
    skriv("Isolinjerna ritas i webbläsaren och testas inte här. Data: MET Norway, CC BY 4.0.")
    return spara(0)


def spara(kod):
    text = "\n".join(UT) + "\n"
    with open("testresultat.md", "w", encoding="utf-8") as f: f.write(text)
    sam = os.environ.get("GITHUB_STEP_SUMMARY")
    if sam:
        with open(sam, "a", encoding="utf-8") as f: f.write(text)
    return kod


if __name__ == "__main__":
    sys.exit(main())
