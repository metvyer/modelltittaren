# Skisser (26/11, Jakob): fyra satt att visa moln/isbildning i ett OMRADESMETEOGRAM over kuperad terrang.
# Hamtar MEPS det-korningen (2,5 km) for en ruta i fjallen, alla modellnivaer upp till ca 5 km, +0..+24 h,
# valjer den kandidatruta som har mest varierande laga moln, och ritar:
#   A  nuvarande satt (andel av ALLA punkter, hojd over havet)  - som referens
#   1  andel bland punkter OVAN MARK (hojd over havet), terrangbandet markerat
#   2  andel per hojd OVER MARKEN
#   3  molnbasens fordelning over marken (10/50/90 %) + andel dimma/ytnara moln
#   4  isbildning: hogsta i omradet per hojd (egen Makkonen-berakning) ovanpa 1
import os, sys, math, datetime as dt
import numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap, BoundaryNorm
from netCDF4 import Dataset

UT = "matprov"; os.makedirs(UT, exist_ok=True)
BAS = "https://thredds.met.no/thredds/dodsC/mepslatest/meps_det_2_5km_{}.ncml"
KAND = {"Åre/Jämtlandsfjällen": (63.40, 13.10), "Sylarna/Helags": (62.95, 12.40), "Kebnekaise": (67.90, 18.55),
        "Jotunheimen": (61.60, 8.40), "Hardangervidda": (60.20, 7.40), "Abisko/Riksgränsen": (68.35, 18.80),
        "Lofoten": (68.15, 14.20), "Sälenfjällen": (61.20, 12.95), "Narvik/Ofotfjorden": (68.43, 17.40), "Lyngen": (69.60, 20.20),
        "Trollheimen/Sunndal": (62.70, 9.00), "Romsdalen": (62.50, 7.70), "Sognefjorden/Lærdal": (61.10, 7.40), "Hemsedal": (60.85, 8.55)}
HALV = 8          # 17 x 17 punkter = 40 x 40 km
TIDER = 25        # +0..+24
PTOPP = 480e2

def oppna():
    nu = dt.datetime.utcnow().replace(minute=0, second=0, microsecond=0)
    for h in range(0, 13):
        d = nu - dt.timedelta(hours=h)
        if d.hour % 3: continue
        dtg = d.strftime("%Y%m%dT%HZ")
        try:
            ds = Dataset(BAS.format(dtg)); n = len(ds.variables["time"][:])
            if n > TIDER: print("korning", dtg, n, "tider"); return ds, dtg
        except Exception as e: print("ej", dtg, e)
    sys.exit("ingen korning")

ds, dtg = oppna()
LAT = ds.variables["latitude"][:]; LON = ds.variables["longitude"][:]
def index(lat, lon):
    d = (LAT - lat) ** 2 + ((LON - lon) * math.cos(math.radians(lat))) ** 2
    return np.unravel_index(np.argmin(d), d.shape)
ap = ds.variables["ap"][:]; b = ds.variables["b"][:]
kTop = max(0, int(np.argmax(ap + b * 101325 >= PTOPP)) - 1); K = slice(kTop, 65)
print("nivaer", kTop, "-64")

# --- valj omrade OCH 24-timmarsfonster: mest laga moln/dimma mot terrangen (molnbas < 300 m over mark) i kuperat landomrade ---
NT_ALLA = len(ds.variables["time"][:]); bast = None
for namn, (la, lo) in KAND.items():
    iy, ix = index(la, lo)
    zs_ = np.array(ds.variables["surface_geopotential"][0, 0, iy - HALV:iy + HALV + 1, ix - HALV:ix + HALV + 1]) / 9.80665
    spann = zs_.max() - zs_.min()
    if spann < 500: print(namn, "for flackt"); continue
    cb = np.array(ds.variables["cloud_base_altitude"][0:NT_ALLA, 0, iy - HALV:iy + HALV + 1, ix - HALV:ix + HALV + 1], dtype="f8")
    lag = np.nan_to_num((cb < 300).mean(axis=(1, 2)) if np.isfinite(cb).any() else np.zeros(NT_ALLA))
    lag = np.where(np.isfinite(cb).all(axis=(1, 2)) | True, lag, 0)
    for a in range(0, NT_ALLA - TIDER + 1, 3):
        w = lag[a:a + TIDER]; poang = w.mean() + 0.5 * w.std() + min(spann, 1500) / 1500
        if not bast or poang > bast[0]: bast = (poang, namn, iy, ix, a)
    print(f"{namn}: terrang {zs_.min():.0f}-{zs_.max():.0f} m, andel bas<300 m max {lag.max():.2f} medel {lag.mean():.2f}")
_, NAMN, iy, ix, A0 = bast; print("valt:", NAMN, "fran +", A0)
Y = slice(iy - HALV, iy + HALV + 1); X = slice(ix - HALV, ix + HALV + 1)
def v3(n): return np.array(ds.variables[n][A0:A0 + TIDER, K, Y, X], dtype="f8")
T = v3("air_temperature_ml"); q = v3("specific_humidity_ml"); qc = v3("mass_fraction_of_cloud_condensed_water_in_air_ml")
qi = v3("mass_fraction_of_cloud_ice_in_air_ml")
try: cf = v3("cloud_area_fraction_ml"); cf = cf / 100 if np.nanmax(cf) > 1.5 else cf
except Exception: cf = None
ps = np.array(ds.variables["surface_air_pressure"][A0:A0 + TIDER, 0, Y, X], dtype="f8")
zs = np.array(ds.variables["surface_geopotential"][0, 0, Y, X], dtype="f8") / 9.80665
U = v3("x_wind_ml"); V = v3("y_wind_ml")
t0 = dt.datetime.strptime(dtg, "%Y%m%dT%HZ"); tid = [t0 + dt.timedelta(hours=A0 + h) for h in range(TIDER)]
nt, nk, ny, nx = T.shape; NP = ny * nx
print("form", T.shape, "moln ur", "cloud_area_fraction_ml" if cf is not None else "kondensat")

# --- hojder (hypsometriskt, nerifran) ---
p = ap[K][None, :, None, None] + b[K][None, :, None, None] * ps[:, None, :, :]
Tv = T * (1 + 0.608 * q)
z = np.zeros_like(T)  # over marken
zf = np.zeros((nt, ny, nx)); pf = ps.copy(); tvf = Tv[:, -1]
for k in range(nk - 1, -1, -1):
    zf = zf + 287.05 / 9.80665 * (Tv[:, k] + tvf) / 2 * np.log(pf / p[:, k]); z[:, k] = zf; pf = p[:, k]; tvf = Tv[:, k]
zmsl = z + zs[None, None]
moln = (cf > 0.5) if cf is not None else ((qc + qi) > 1e-5)

# --- isbildning (samma som sidan, numpy) ---
def isb(T, p, qc):
    rho = p / (287.05 * T); w = qc * rho; v = 92.0; D = 0.15
    d = np.cbrt(6 * w / (np.pi * 1000 * 100e6)); mu = 1.458e-6 * T ** 1.5 / (T + 110.4)
    with np.errstate(all="ignore"):
        Kst = 1000 * d * d * v / (9 * mu * D); Re = rho * v * d / mu; phi = Re * Re / Kst
        A = 1.066 * Kst ** -0.00616 * np.exp(-1.103 * Kst ** -0.688); B = 3.641 * Kst ** -0.498 * np.exp(-1.497 * Kst ** -0.694)
        C = 0.00637 * np.maximum(phi - 100, 0) ** 0.381; a1 = np.clip(A - 0.028 - C * (B - 0.0454), 0, 1)
        F = a1 * w * v; ReD = rho * v * D / mu; h = 0.032 * ReD ** 0.85 * 0.024 / D; Tc = T - 273.15; cp = 1005
        esw = lambda t: 6.112 * np.exp(17.62 * t / (243.12 + t)) * 100
        Qv = h * 0.79 * v * v / (2 * cp); Qc = h * (-Tc); Qe = h * 0.622 * 2.501e6 * (esw(0) - esw(Tc)) / (cp * p); Ql = F * 4218 * (-Tc); Qs = 4 * 5.67e-8 * 273.15 ** 3 * (-Tc)
        a3 = np.clip((Qc + Qe + Ql + Qs - Qv) / (F * 3.337e5), 0, 1)
        r = a1 * a3 * w * v / (np.pi * 400) * 100 * 3600
    ok = (qc > 1e-6) & (T < 273.15) & (T > 233.15) & (Kst > 0.17)
    return np.where(ok, np.nan_to_num(r), 0.0)
ISB = isb(T, p, qc)

# --- till fasta hojder ---
HM = np.arange(0, 5001, 25.0); HA = np.arange(0, 3001, 25.0)
def tillHojd(f, zz, H):  # f, zz: (nt, nk, ny, nx) -> (nt, len(H), ny, nx), NaN under marken/utanfor
    ut = np.full((nt, len(H), ny, nx), np.nan)
    for t in range(nt):
        for j in range(ny):
            for i in range(nx):
                zk = zz[t, ::-1, j, i]; fk = f[t, ::-1, j, i]
                ut[t, :, j, i] = np.interp(H, zk, fk, left=np.nan, right=np.nan)
    return ut
mM = tillHojd(moln.astype("f8"), zmsl, HM) > 0.5; okM = ~np.isnan(tillHojd(T, zmsl, HM))
# mark: under terrangen finns inga punkter; mellan marken och lagsta nivan (ca 12 m): lagsta nivans varde
for t in range(nt):
    for j in range(ny):
        for i in range(nx):
            lag = (HM >= zs[j, i]) & (HM < zmsl[t, -1, j, i]); okM[t, lag, j, i] = True; mM[t, lag, j, i] = moln[t, -1, j, i]
mA = tillHojd(moln.astype("f8"), z, HA) > 0.5; okA = ~np.isnan(tillHojd(T, z, HA))
for t in range(nt):
    for j in range(ny):
        for i in range(nx):
            lag = HA < z[t, -1, j, i]; okA[t, lag, j, i] = True; mA[t, lag, j, i] = moln[t, -1, j, i]
TM = np.nanmean(tillHojd(T, zmsl, HM), axis=(2, 3)) - 273.15
iM = np.nanmax(np.nan_to_num(tillHojd(ISB, zmsl, HM)), axis=(2, 3))
uM = np.nanmean(tillHojd(U, zmsl, HM), axis=(2, 3)); vM = np.nanmean(tillHojd(V, zmsl, HM), axis=(2, 3))

andelAlla = mM.sum(axis=(2, 3)) / NP * 100
andelOvan = np.where(okM.sum(axis=(2, 3)) > 0, mM.sum(axis=(2, 3)) / np.maximum(okM.sum(axis=(2, 3)), 1) * 100, np.nan)
underMark = (1 - okM.sum(axis=(2, 3)) / NP) * 100
andelAGL = mA.sum(axis=(2, 3)) / NP * 100
# molnbas over marken per punkt (lagsta molniga hojd), NaN = molnfritt under 3000 m
bas = np.full((nt, ny, nx), np.nan)
for t in range(nt):
    for j in range(ny):
        for i in range(nx):
            w = np.where(mA[t, :, j, i])[0]
            if len(w): bas[t, j, i] = HA[w[0]]
klar = np.isnan(bas).sum(axis=(1, 2)) / NP * 100
dimma = (bas <= 30).sum(axis=(1, 2)) / NP * 100
def pct(qq):  # percentil av molnbasen dar molnfria raknas som "over 3000"
    b2 = np.where(np.isnan(bas), 1e9, bas).reshape(nt, -1); v = np.percentile(b2, qq, axis=1); return np.where(v > 3000, np.nan, v)
p10, p50, p90 = pct(10), pct(50), pct(90)

# ------------------------------- ritning -------------------------------
plt.rcParams.update({"font.size": 10, "axes.spines.top": False, "axes.spines.right": False, "font.family": "DejaVu Sans"})
GRA = ListedColormap(["#ffffff00", "#e2e8f0", "#cbd5e1", "#94a3b8", "#64748b", "#475569", "#1e293b"])
GN = BoundaryNorm([0, 5, 20, 40, 60, 80, 95, 101], GRA.N)
ISC = ListedColormap(["#ffffff00", "#93c5fd", "#4ade80", "#facc15", "#dc2626"]); ISN = BoundaryNorm([0, 0.05, 0.6, 2.5, 7.5, 1e3], ISC.N)
X_ = np.arange(nt)
def tidsaxel(ax):
    ax.set_xlim(-0.5, nt - 0.5); st = [i for i in range(nt) if tid[i].hour % 3 == 0]
    ax.set_xticks(st); ax.set_xticklabels([("%s %02dZ" % (["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"][tid[i].weekday()], tid[i].hour)) if tid[i].hour == 0 or i == st[0] else "%02dZ" % tid[i].hour for i in st])
def isoterm(ax, H, TT):
    cs = ax.contour(X_, H, TT.T, levels=[-15, -10, -5, 0], colors=["#1e3a8a"] * 3 + ["#2563eb"], linewidths=[0.7, 0.7, 0.7, 1.8], linestyles=["--", "--", "--", "-"])
    ax.clabel(cs, fmt=lambda v: "%d°" % v, fontsize=8)
def vind(ax, H):
    hs = [h for h in range(250, int(H[-1]), 500)]
    for t in range(0, nt, 3):
        for h in hs:
            k = int(np.argmin(abs(HM - h)))
            if np.isnan(uM[t, k]): continue
            ax.barbs(t, h, uM[t, k] * 1.944, vM[t, k] * 1.944, length=5.2, linewidth=0.6, color="#0f766e")
def terrang(ax, agl=False):
    if agl: return
    ax.axhline(zs.min(), color="#78350f", lw=1, ls=":"); ax.axhline(zs.max(), color="#78350f", lw=1, ls=":"); ax.axhline(zs.mean(), color="#78350f", lw=1.2, ls="--")
    ax.text(nt - 0.4, zs.max(), " högsta mark %d m" % zs.max(), va="bottom", ha="right", fontsize=8, color="#78350f")
    ax.text(nt - 0.4, zs.mean(), " medel %d m" % zs.mean(), va="bottom", ha="right", fontsize=8, color="#78350f")
    ax.text(nt - 0.4, zs.min(), " lägsta %d m" % zs.min(), va="top", ha="right", fontsize=8, color="#78350f")
def fig(titel, under):
    f, ax = plt.subplots(figsize=(11, 5.6), dpi=110); ax.set_title(titel, loc="left", fontsize=13, fontweight="bold")
    f.text(0.01, 0.005, under, fontsize=8.5, color="#475569"); return f, ax
UNDER = f"MEPS det {dtg} · {NAMN} · 40×40 km ({NP} punkter à 2,5 km) · terräng {zs.min():.0f}–{zs.max():.0f} m · moln = " + ("modellens molnandel > 50 %" if cf is not None else "molnvatten+molnis > 0,01 g/kg")
def fargstapel(f, ax, m, etikett, ticks=None):
    c = f.colorbar(m, ax=ax, pad=0.01, fraction=0.035); c.set_label(etikett)
    if ticks: c.set_ticks(ticks)

# A
f, ax = fig("A · Nuvarande sätt: andel av ALLA punkter med moln (höjd över havet)", UNDER)
m = ax.pcolormesh(X_, HM, andelAlla.T, cmap=GRA, norm=GN, shading="nearest"); isoterm(ax, HM, TM); terrang(ax); vind(ax, HM)
tidsaxel(ax); ax.set_ylabel("Höjd över havet (m)"); ax.set_ylim(max(0, zs.min() - 250), 3500); fargstapel(f, ax, m, "% av alla punkter", [5, 20, 40, 60, 80, 95])
f.savefig(f"{UT}/omr_A_nuvarande.png", bbox_inches="tight"); plt.close(f)
# 1
f, ax = fig("1 · Andel bland punkter OVAN MARK (höjd över havet)", UNDER)
m = ax.pcolormesh(X_, HM, andelOvan.T, cmap=GRA, norm=GN, shading="nearest")
def underMarkRita(ax):   # andel av omradet som ligger under marken pa hojden: streckade linjer 25/50/75 % (ingen tackande fargning)
    cs = ax.contour(X_, HM, underMark.T, levels=[25, 50, 75], colors="#92400e", linewidths=[0.6, 1.0, 0.6], linestyles=["--", "-", "--"])
    ax.clabel(cs, fmt=lambda v: "%d %% av området under mark" % v, fontsize=7)
    ax.fill_between(X_, 0, zs.min(), color="#a16207", alpha=0.35, lw=0)
underMarkRita(ax)
isoterm(ax, HM, TM); terrang(ax); vind(ax, HM); tidsaxel(ax); ax.set_ylabel("Höjd över havet (m)"); ax.set_ylim(max(0, zs.min() - 250), 3500)
fargstapel(f, ax, m, "% av punkterna som finns på höjden", [5, 20, 40, 60, 80, 95])
f.savefig(f"{UT}/omr_1_ovan_mark.png", bbox_inches="tight"); plt.close(f)
# 2
f, ax = fig("2 · Andel moln per höjd ÖVER MARKEN (varje punkt räknas från sin egen mark)", UNDER)
m = ax.pcolormesh(X_, HA, andelAGL.T, cmap=GRA, norm=GN, shading="nearest")
TA = np.nanmean(tillHojd(T, z, HA), axis=(2, 3)) - 273.15; isoterm(ax, HA, TA)
tidsaxel(ax); ax.set_ylabel("Höjd över marken (m)"); ax.set_ylim(0, 2500); fargstapel(f, ax, m, "% av områdets punkter", [5, 20, 40, 60, 80, 95])
for h, txt in [(150, "150 m"), (300, "300 m")]: ax.axhline(h, color="#be123c", lw=0.7, ls=":"); ax.text(-0.4, h, txt, fontsize=7.5, color="#be123c", va="bottom")
f.savefig(f"{UT}/omr_2_over_mark.png", bbox_inches="tight"); plt.close(f)
# 3
f, (ax, ax2) = plt.subplots(2, 1, figsize=(11, 6.4), dpi=110, sharex=True, gridspec_kw={"height_ratios": [3, 1.1], "hspace": 0.08})
ax.set_title("3 · Molnbasens fördelning i området (över marken)", loc="left", fontsize=13, fontweight="bold"); f.text(0.01, 0.005, UNDER, fontsize=8.5, color="#475569")
ax.fill_between(X_, p10, p90, color="#94a3b8", alpha=0.35, lw=0, label="10–90 % av punkterna")
ax.plot(X_, p10, color="#475569", lw=1.2, ls="--", label="10 %: lägsta tiondelen har bas under"); ax.plot(X_, p50, color="#0f172a", lw=2.4, label="50 %: halva området har bas under")
ax.plot(X_, p90, color="#475569", lw=1.2, ls=":", label="90 %")
for h, txt in [(150, "150 m"), (300, "300 m"), (600, "600 m")]: ax.axhline(h, color="#be123c", lw=0.7, ls=":"); ax.text(-0.4, h, txt, fontsize=7.5, color="#be123c", va="bottom")
ax.set_ylim(0, 2000); ax.set_ylabel("Molnbas över marken (m)"); ax.legend(loc="upper right", fontsize=8.5, frameon=False)
ax2.bar(X_, dimma, color="#7c3aed", width=0.8, label="dimma/moln vid marken (bas ≤ 30 m)")
ax2.bar(X_, klar, bottom=100 - klar, color="#fde68a", width=0.8, label="molnfritt under 3000 m")
ax2.set_ylim(0, 100); ax2.set_ylabel("% av området"); ax2.legend(loc="upper left", fontsize=8, frameon=False, ncol=2); tidsaxel(ax2)
f.savefig(f"{UT}/omr_3_molnbas.png", bbox_inches="tight"); plt.close(f)
# 4
f, ax = fig("4 · Som 1 + isbildning: HÖGSTA i området per höjd (BETA, egen Makkonen-beräkning)", UNDER)
ax.pcolormesh(X_, HM, andelOvan.T, cmap=GRA, norm=GN, shading="nearest", alpha=0.75)
m = ax.pcolormesh(X_, HM, np.where(iM >= 0.05, iM, np.nan).T, cmap=ISC, norm=ISN, shading="nearest", alpha=0.85)
underMarkRita(ax)
isoterm(ax, HM, TM); terrang(ax); tidsaxel(ax); ax.set_ylabel("Höjd över havet (m)"); ax.set_ylim(max(0, zs.min() - 250), 3500)
c = f.colorbar(m, ax=ax, pad=0.01, fraction=0.035, ticks=[0.05, 0.6, 2.5, 7.5]); c.set_label("isbildning cm/h (Trace/Light/Mod/Sev)")
f.savefig(f"{UT}/omr_4_isbildning.png", bbox_inches="tight"); plt.close(f)
# karta over rutan
f, ax = plt.subplots(figsize=(4.4, 4.2), dpi=110); im = ax.imshow(zs, origin="lower", cmap="terrain", vmin=0, vmax=max(1500, zs.max()))
ax.set_title(f"{NAMN}: terräng i rutan", fontsize=10); f.colorbar(im, ax=ax, fraction=0.045, label="m ö.h."); ax.set_xticks([]); ax.set_yticks([])
f.savefig(f"{UT}/omr_0_terrang.png", bbox_inches="tight"); plt.close(f)
with open("sida.md", "w") as fh: fh.write(f"omrade {NAMN} {dtg}\n")
print("klart", NAMN, dtg, "| andel ovan mark max", np.nanmax(andelOvan), "| isb max", iM.max(), "| dimma max", dimma.max())
