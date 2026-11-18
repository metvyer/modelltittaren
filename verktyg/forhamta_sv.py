#!/usr/bin/env python3
"""Modelltittaren - Sverige-oversikt for byvind (talfiler), kors av GitHub Actions.

For ensemblekorningarna 00, 06, 12 och 18 UTC: hamtar byvind for alla 30
medlemmar i full upplosning (2,5 km) over Sverige med Ostersjon och Vasterhavet,
+0 till +36 h, och raknar for varje troskel och period hur manga medlemmar som
nar troskeln nagon gang i perioden. Resultatet sparas som "talfiler": en
gratonsbild (PNG) per troskel/period dar varje punkt = antal medlemmar (0-30).

    forhamtat/sv/index.json
    forhamtat/sv/<DTG>/by_<troskel>_<period>h_<start>.png

Byvinden avrundas till hel knop innan jamforelse (samma som sidans lagring),
villkoret ar >= troskeln. Rad 0 i bilden = norra kanten.

Hamtning: binart (.dods), 3 timmar per anrop, ett anrop i taget.
Volym: ca 1,2 GB per korning fran thredds (4 korningar per dygn).
Data fran MET Norway (thredds.met.no), CC BY 4.0.
"""
import json, os, shutil, struct, sys, time, zlib
from datetime import datetime, timedelta, timezone

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from forhamta import BAS, UA, hamta, ruta, dtg_text   # samma rutnat och hamtning som tid-hojd
import urllib.request, urllib.error

ENS_FIL = lambda dtg: "meps_lagged_6_h_subset_2_5km_" + dtg + ".ncml"
ENS_TIDER, MEDL = 62, 30
KORNINGAR = (0, 6, 12, 18)          # bara dessa (begransar belastningen pa thredds)
TIMMAR = 37                          # +0 .. +36
TROSKLAR = [26, 32, 45]              # kt, >=
PERIODER = [1, 3, 6, 12]             # timmar; period L borjar pa timme delbar med L
TIM_PER_ANROP = 3
OMRADE = dict(lat=(54.0, 69.5), lon=(9.0, 25.0))   # Sverige + Ostersjon + Vasterhavet
KT = 1.943844


def omrade_index():
    ys, xs = [], []
    la0, la1 = OMRADE["lat"]; lo0, lo1 = OMRADE["lon"]
    for i in range(41):
        f = i / 40
        for lat, lon in ((la0, lo0 + f * (lo1 - lo0)), (la1, lo0 + f * (lo1 - lo0)),
                         (la0 + f * (la1 - la0), lo0), (la0 + f * (la1 - la0), lo1)):
            r = ruta(lat, lon)
            if r:
                ys.append(r[0]); xs.append(r[1])
    return min(ys), max(ys), min(xs), max(xs)


def antal_tider(dtg):
    st, txt = hamta(BAS + ENS_FIL(dtg) + ".ascii?time", forsok=2, tidsgrans=60)
    if st != 200:
        return 0
    for rad in txt.split("\n"):
        if rad.startswith("time["):
            try:
                return int(rad[5:rad.index("]")])
            except ValueError:
                return 0
    return 0


def senaste_korning():
    nu = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    d = nu - timedelta(hours=nu.hour % 6)
    for i in range(4):
        dtg = dtg_text(d - timedelta(hours=6 * i))
        n = antal_tider(dtg)
        print(f"Ensemble {dtg}: {n} tider", flush=True)
        if n >= ENS_TIDER:
            return dtg
    return None


def hamta_dods(url, forsok=4, tidsgrans=400):
    for f in range(1, forsok + 1):
        st, data = 0, b""
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=tidsgrans) as r:
                st, data = r.status, r.read()
        except urllib.error.HTTPError as e:
            st = e.code
        except Exception as e:
            print(f"  fel: {e}", flush=True)
        if st == 200:
            return data
        if st in (400, 403, 404):
            break
        if f < forsok:
            v = 20 * 2 ** (f - 1)
            print(f"  svar {st} - vantar {v} s", flush=True)
            time.sleep(v)
    return None


def las_dods(data, antal):
    """Forsta arrayen i ett binart OPeNDAP-svar (XDR): 2 x uint32 antal, sedan big-endian float32."""
    i = data.find(b"\nData:\n")
    if i < 0:
        raise ValueError("inget Data:-avsnitt")
    i += 7
    n = struct.unpack(">I", data[i:i + 4])[0]
    if n != antal:
        raise ValueError(f"fel antal varden {n} (vantade {antal})")
    return np.frombuffer(data, dtype=">f4", count=n, offset=i + 8)


def png_gra(arr):
    """8-bitars gratonsbild (rad 0 overst)."""
    h, w = arr.shape
    rad = b"".join(b"\x00" + arr[r].tobytes() for r in range(h))
    def bit(typ, d):
        return struct.pack(">I", len(d)) + typ + d + struct.pack(">I", zlib.crc32(typ + d) & 0xffffffff)
    return (b"\x89PNG\r\n\x1a\n" + bit(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0)) +
            bit(b"IDAT", zlib.compress(rad, 9)) + bit(b"IEND", b""))


def main():
    ut = sys.argv[1] if len(sys.argv) > 1 else "forhamtat"
    svdir = os.path.join(ut, "sv")
    os.makedirs(svdir, exist_ok=True)
    idxfil = os.path.join(svdir, "index.json")
    gammal = json.load(open(idxfil, encoding="utf-8")) if os.path.exists(idxfil) else {}
    dtg = senaste_korning()
    if not dtg:
        print("Ingen komplett ensemblekorning (00/06/12/18) - inget gors.")
        return 0
    if gammal.get("dtg") == dtg:
        print(f"{dtg} finns redan - inget gors.")
        return 0
    y0, y1, x0, x1 = omrade_index()
    ny, nx = y1 - y0 + 1, x1 - x0 + 1
    print(f"Hamtar byvind {dtg}: {ny} x {nx} punkter, +0..+{TIMMAR - 1} h", flush=True)
    kt = np.zeros((TIMMAR, MEDL, ny, nx), dtype=np.uint8)
    t0, mb = time.time(), 0.0
    for a in range(0, TIMMAR, TIM_PER_ANROP):
        b = min(a + TIM_PER_ANROP - 1, TIMMAR - 1)
        q = f"wind_speed_of_gust[{a}:{b}][0][0:{MEDL - 1}][{y0}:{y1}][{x0}:{x1}]"
        url = BAS + ENS_FIL(dtg) + ".dods?" + q.replace("[", "%5B").replace("]", "%5D")
        t1 = time.time()
        data = hamta_dods(url)
        if data is None:
            print(f"+{a}..+{b}: misslyckades - avbryter (behaller gammal oversikt)", flush=True)
            return 0
        v = las_dods(data, (b - a + 1) * MEDL * ny * nx).reshape(b - a + 1, MEDL, ny, nx).astype(np.float32)
        v = np.where(v > 1e30, 0, v)                     # saknat varde -> 0
        kt[a:b + 1] = np.clip(np.rint(v * KT), 0, 255).astype(np.uint8)
        mb += len(data) / 1e6
        print(f"+{a}..+{b}: {len(data) / 1e6:.0f} MB, {time.time() - t1:.0f} s", flush=True)
    ny_dir = os.path.join(svdir, dtg)
    os.makedirs(ny_dir, exist_ok=True)
    filer, kb = 0, 0
    for L in PERIODER:
        for s in range(0, TIMMAR - L + 1, L):
            mx = kt[s:s + L].max(axis=0)                 # hogsta per medlem i perioden
            for T in TROSKLAR:
                cnt = (mx >= T).sum(axis=0).astype(np.uint8)[::-1]   # rad 0 = norr
                p = os.path.join(ny_dir, f"by_{T}_{L}h_{s}.png")
                with open(p, "wb") as f:
                    f.write(png_gra(np.ascontiguousarray(cnt)))
                filer += 1; kb += os.path.getsize(p) / 1024
    for namn in os.listdir(svdir):
        p = os.path.join(svdir, namn)
        if os.path.isdir(p) and namn != dtg:
            shutil.rmtree(p, ignore_errors=True)
    idx = {"dtg": dtg, "param": "by", "y0": y0, "y1": y1, "x0": x0, "x1": x1, "timmar": TIMMAR,
           "troskel": TROSKLAR, "perioder": PERIODER, "villkor": ">= (hel kt)",
           "skapad": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")}
    with open(idxfil, "w", encoding="utf-8") as f:
        json.dump(idx, f, ensure_ascii=False, indent=1)
    print(f"Klart: {mb:.0f} MB hamtat, {filer} filer ({kb / 1024:.1f} MB) pa {time.time() - t0:.0f} s")
    with open(os.environ.get("GITHUB_OUTPUT", os.devnull), "a") as f:
        f.write("andrat=ja\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
