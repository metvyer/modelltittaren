# Matprov 24/11: polska TAF - vilka flygplatser ger IMGW nu (jamfort med 21/11: 32 st inkl. militara),
# och finns de militara nagon annanstans (aviationweather, ogimet, IMGW-sidan)?
import re, json, time, urllib.request, urllib.error
FORR = "EPBY EPCE EPDA EPDE EPGD EPIR EPKK EPKS EPKT EPLB EPLK EPLL EPLY EPMB EPMI EPML EPMM EPMO EPNA EPOK EPPO EPPR EPPW EPRA EPRZ EPSC EPSN EPSY EPTM EPWA EPWR EPZG".split()
H1 = {"User-Agent": "Modelltittaren-matprov (github.com/metvyer/modelltittaren)", "Origin": "https://metvyer.github.io", "Referer": "https://awiacja.imgw.pl/"}
H2 = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36", "Origin": "https://awiacja.imgw.pl", "Referer": "https://awiacja.imgw.pl/"}
def f(url, h=H1):
    t0 = time.time()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=40) as r:
            return r.status, r.read(5_000_000).decode("utf-8", "replace"), time.time() - t0
    except urllib.error.HTTPError as e: return e.code, e.read()[:400].decode("utf-8", "replace"), time.time() - t0
    except Exception as e: return 0, str(e), time.time() - t0
ut = []
def p(s=""): print(s, flush=True); ut.append(s)
A = "https://aviation-api.imgw.pl/data/last?format=json&params="
for namn, h in [("modelltittaren-huvud", H1), ("webblasar-huvud", H2)]:
    for typ in ["taf", "metar"]:
        for cnt in ["1", "5"]:
            st, t, s = f(A + typ + "&count=" + cnt, h)
            ic = sorted(set(re.findall(r"\bEP[A-Z]{2}\b", t)))
            p(f"IMGW {typ} count={cnt} ({namn}): {st}, {s:.1f} s, {len(t)//1024} kB, {len(ic)} flygplatser")
            if typ == "taf" and cnt == "1":
                p("  saknas mot 21/11: " + (", ".join(x for x in FORR if x not in ic) or "inga") + " · nya: " + (", ".join(x for x in ic if x not in FORR) or "inga"))
                try:
                    j = json.loads(t); x = j if isinstance(j, list) else next(iter(j.values()))
                    if isinstance(j, dict): p("  nycklar: " + ", ".join(list(j.keys())[:40]))
                    s1 = json.dumps(j, ensure_ascii=False)
                    for m in ["EPMM", "EPKS", "EPWA", "EPLK"]:
                        k = s1.find(m); p(f"  {m}: " + (re.sub(r"\s+", " ", s1[max(0, k - 200):k + 400]) if k >= 0 else "saknas"))
                    p("  isMILITARY-flaggor: " + str(len(re.findall(r'"isMILITARY"\s*:\s*true', s1))))
                except Exception as e: p("  ej json: " + t[:300])
# via mellanservern (Cloudflare)
st, t, s = f("https://modelltittaren.metvyer.workers.dev/imgw?params=taf")
p(f"mellanservern /imgw taf: {st}, {len(set(re.findall(r'EP[A-Z]{2}', t)))} flygplatser")
MIL = "EPCE EPDA EPDE EPIR EPKS EPLK EPLY EPMB EPMI EPMM EPNA EPOK EPPR EPPW EPSN EPTM".split()
st, t, s = f("https://aviationweather.gov/api/data/taf?ids=" + ",".join(MIL) + "&format=raw")
p(f"\naviationweather TAF militara: {st} · har: " + ", ".join(sorted(set(re.findall(r"\bEP[A-Z]{2}\b", t)))))
st, t, s = f("https://aviationweather.gov/api/data/metar?ids=" + ",".join(MIL) + "&format=raw&hours=3")
p(f"aviationweather METAR militara: {st} · har: " + ", ".join(sorted(set(re.findall(r"\bEP[A-Z]{2}\b", t)))))
st, t, s = f("https://ogimet.com/display_metars2.php?lang=en&lugar=EPMM+EPKS+EPLK+EPMI&tipo=FT&ord=REV&nil=SI&fmt=txt", H2)
p(f"ogimet TAF EPMM/EPKS/EPLK/EPMI: {st} · " + re.sub(r"\s+", " ", " ".join(re.findall(r"TAF[^=]{0,160}", t)[:4]))[:900])
st, t, s = f("https://ogimet.com/cgi-bin/getmetar?icao=EPKS&begin=" + time.strftime("%Y%m%d0000", time.gmtime()), H2)
p(f"ogimet getmetar EPKS: {st} · {t[:200]}")
for url in ["https://awiacja.imgw.pl/metar-taf/", "https://awiacja.imgw.pl/en/metar-taf/"]:
    st, t, s = f(url, H2); p(f"{url}: {st} · ICAO i sidan: " + ", ".join(sorted(set(re.findall(r'\bEP[A-Z]{2}\b', t)))[:50]))
open("taf_pl.md", "w").write("\n".join(ut))
