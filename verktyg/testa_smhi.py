# Modelltittaren - prov Z (NYTT 21/11): SMHI:s nedladdningsmappar for KNEP och CMEPS (MEPS)
#
# Katalogen pekar pa https://data-download.smhi.se/data/meteorology/knep/ och .../cmeps/.
# Skriptet listar mapparna (tva nivaer ner), tar storlek (HEAD) pa de senaste filerna,
# kollar CORS-huvudet och skriver smhi.md + Summary. Andrar inget, publicerar inget.
import os, re, urllib.request, urllib.parse

BAS = "https://data-download.smhi.se/data/meteorology/"
MAPPAR = ["", "knep/", "cmeps/", "meps/", "mesan/"]
UT = []

def skriv(s=""):
    print(s); UT.append(s)

def hamta(url, metod="GET"):
    req = urllib.request.Request(url, method=metod, headers={
        "User-Agent": "modelltittaren-test (github actions)",
        "Origin": "https://metvyer.github.io"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.status, dict(r.headers), (r.read(200000) if metod == "GET" else b"")

def lankar(html, bas):
    ut = []
    for h in re.findall(r'href="([^"?#]+)"', html):
        if h.startswith("/") or h.startswith("..") or h.startswith("http"):
            continue
        ut.append(urllib.parse.urljoin(bas, h))
    return ut

def visa(url, niva):
    try:
        st, hd, kropp = hamta(url)
    except Exception as e:
        skriv(f"- `{url}` FEL: {e}"); return
    txt = kropp.decode("utf-8", "replace")
    l = lankar(txt, url)
    skriv(f"- `{url}` status {st}, CORS: {hd.get('Access-Control-Allow-Origin', '(inget)')}, {len(l)} poster")
    for x in l[:8]: skriv(f"    - {x[len(url):]}")
    if len(l) > 8:
        skriv(f"    - ... ({len(l)-8} till) sista: " + ", ".join(x[len(url):] for x in l[-5:]))
    mappar = [x for x in l if x.endswith("/")]
    filer = [x for x in l if not x.endswith("/")]
    for f in filer[-3:]:
        try:
            st, hd, _ = hamta(f, "HEAD")
            skriv(f"    - storlek `{f[len(url):]}`: {int(hd.get('Content-Length', 0))/1e6:.1f} MB, CORS {hd.get('Access-Control-Allow-Origin', '(inget)')}")
        except Exception as e:
            skriv(f"    - HEAD {f} FEL: {e}")
    if niva < 3 and mappar:
        for m in mappar[-2:]:
            visa(m, niva + 1)

skriv("## Prov Z: SMHI KNEP / CMEPS-mappar")
for m in MAPPAR:
    visa(BAS + m, 1 if m else 3)

open("smhi.md", "w").write("\n".join(UT) + "\n")
if os.environ.get("GITHUB_STEP_SUMMARY"):
    open(os.environ["GITHUB_STEP_SUMMARY"], "a").write("\n".join(UT) + "\n")
