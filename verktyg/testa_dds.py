# Prov D2 (22/11): alla variabelnamn i MEPS det-filen (och ensemblen) - leta fardiga kolumnfalt (graupel m.m.)
import re, urllib.request
def h(u):
    with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "modelltittaren-test"}), timeout=120) as r: return r.read().decode()
kat = h("https://thredds.met.no/thredds/catalog/mepslatest/catalog.xml")
for mall in [r"meps_det_2_5km_\d{8}T\d\dZ", r"meps_lagged_6_h_subset_2_5km_\d{8}T\d\dZ"]:
    f = sorted(set(re.findall("(" + mall + r")\.ncml", kat)))[-1]
    dds = h("https://thredds.met.no/thredds/dodsC/mepslatest/" + f + ".ncml.dds")
    rader = re.findall(r"^\s*(\w+)\s+(\w+)(\[[^;]*);", dds, re.M)
    print("##", f, len(rader), "variabler")
    for typ, namn, dims in rader:
        if re.search(r"velocity|omega|vertical|upward|w_|_ml$", namn, re.I):
            print("  ", namn, re.sub(r"\s+", "", dims)[:80])
