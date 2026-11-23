# Prov GR (23/11): raknas graupel in i snofallet? Jamfor precipitation_amount_acc med regn + sno (+ graupel) i det-filen
# och nederbord - snofall i ensemblen. Avgor om "flytande = nederbord - snofall" (Ishalka) ar ratt.
import re, urllib.request, urllib.parse
import urllib.error
def h(u):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "modelltittaren-test"}), timeout=180) as r: return r.read().decode()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{e.code} {u[-120:]} :: {e.read()[:300]!r}")
BAS = "https://thredds.met.no/thredds/dodsC/mepslatest/"
kat = h("https://thredds.met.no/thredds/catalog/mepslatest/catalog.xml")
det = sorted(set(re.findall(r"(meps_det_2_5km_\d{8}T\d\dZ)\.ncml", kat)))[-1]
ens = sorted(set(re.findall(r"(meps_lagged_6_h_subset_2_5km_\d{8}T\d\dZ)\.ncml", kat)))[-1]
dds = h(BAS + det + ".ncml.dds")
namn = [n for t, n in re.findall(r"^\s*(\w+)\s+(\w+)\[", dds, re.M) if re.search(r"precip|rain|snow|graup|hail|solid|liquid", n, re.I)]
print("## det", det); print("nederbordsvariabler:", namn)
def faltet(fil, var, idx):
    txt = h(BAS + fil + ".ncml.ascii?" + urllib.parse.quote(var + idx, safe=":,"))
    v = []
    for rad in txt.split("\n"):
        if rad.startswith("[") or rad.startswith(var + "."):
            for x in rad.split(",")[1:]:
                try: v.append(float(x))
                except ValueError: pass
    return v
# ett stort glest omrade, timme 12 (ackumulerat fran start)
dims = {}
for t, n, d in re.findall(r"^\s*(\w+)\s+(\w+)(\[[^;]*);", dds, re.M): dims[n] = d.count("[")
print("dims precipitation_amount_acc:", re.findall(r"precipitation_amount_acc(\[[^;]*);", dds)[:1])
for v in [n for n in namn if not n.endswith(('_ml', '_pl'))]:
    nd = dims.get(v, 0)
    idx = "[12][0][0:20:940][0:20:880]" if nd == 4 else "[12][0:20:940][0:20:880]" if nd == 3 else None
    if not idx: print("  hoppar", v, nd, "dim"); continue
    try:
        x = faltet(det, v, idx); x = [a for a in x if abs(a) < 1e30]
        print(f"  {v}: n={len(x)} summa={sum(x):.1f} max={max(x) if x else 0:.2f}")
    except Exception as e: print("  fel", v, e)
print("## ens", ens)
for v in ["precipitation_amount_acc", "snowfall_amount_acc"]:
    x = faltet(ens, v, "[12][0][0:4:29][0:20:940][0:20:880]"); x = [a for a in x if abs(a) < 1e30]
    print(f"  {v}: n={len(x)} summa={sum(x):.1f}")
