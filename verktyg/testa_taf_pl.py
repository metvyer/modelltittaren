# Mätprov 21/11: polska TAF (EPWA, EPMM m.fl.) - finns de hos aviationweather, och vad har awiacja.imgw.pl?
import re, json, time, urllib.request, urllib.error
UA = {"User-Agent": "Modelltittaren-matprov (github.com/metvyer/modelltittaren)", "Origin": "https://metvyer.github.io"}
def f(url):
    t0 = time.time()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
            return r.status, r.read().decode("utf-8", "replace"), r.headers.get("Access-Control-Allow-Origin", ""), r.headers.get("Content-Type", ""), time.time() - t0
    except urllib.error.HTTPError as e: return e.code, e.read().decode("utf-8", "replace")[:500], "", "", time.time() - t0
    except Exception as e: return 0, str(e), "", "", time.time() - t0
ut = []
def p(s=""): print(s, flush=True); ut.append(s)
p("## Polska TAF")
st, t, c, ty, s = f("https://aviationweather.gov/api/data/taf?ids=EPWA,EPMM,EPKK,EPGD,EPPO,EPLB,EPKS,EPDE,EPMI,EPLK&format=json")
p(f"aviationweather TAF: {st}, {s:.1f} s")
try:
    for x in json.loads(t): p(f"- {x.get('icaoId')} finns hos aviationweather")
except Exception: p(t[:300])
st, t, c, ty, s = f("https://aviationweather.gov/api/data/metar?ids=EPWA,EPMM&format=json&hours=2")
p(f"aviationweather METAR EPWA/EPMM: {st} · " + (", ".join(sorted(set(x.get('icaoId') for x in json.loads(t)))) if st == 200 and t.strip().startswith('[') else t[:100]))
for url in ["https://awiacja.imgw.pl/", "https://awiacja.imgw.pl/metar-taf/", "https://awiacja.imgw.pl/en/metar-taf/"]:
    st, t, c, ty, s = f(url)
    p(f"\n### {url}: {st}, {len(t)//1024} kB, {ty}, CORS '{c}', {s:.1f} s")
    p("TAF i texten: " + str(len(re.findall(r"TAF\s+(?:AMD\s+|COR\s+)?EP[A-Z]{2}", t))) + " · ICAO: " + ", ".join(sorted(set(re.findall(r"\bEP[A-Z]{2}\b", t)))[:60]))
    js = sorted(set(re.findall(r'(?:src|href)="([^"]+\.(?:js|json)[^"]*)"', t)))
    p("skript/json: " + ", ".join(js[:30]))
    api = sorted(set(re.findall(r'["\'](/?(?:api|wp-json|ajax|data)[^"\']{0,120})["\']', t)))
    p("api-liknande sökvägar: " + ", ".join(api[:30]))
    m = re.search(r"TAF\s+(?:AMD\s+)?EPWA[^<]{0,300}", t)
    if m: p("Exempel: " + re.sub(r"\s+", " ", m.group(0)))
# Angular-sidan: leta API-adresser i skriptfilerna
st, t, c, ty, s = f("https://awiacja.imgw.pl/")
alla = set(re.findall(r'src="([^"]+\.js)"', t)) | set(re.findall(r'href="([^"]+\.js)"', t))
sedda = set()
while alla - sedda:   # folj import("./chunk-…") i filerna sa att alla delar laddas
  for js in sorted(alla - sedda):
    sedda.add(js)
    st2, tj, c2, ty2, s2 = f("https://awiacja.imgw.pl/" + js.lstrip("./"))
    alla |= set("chunk-" + x + ".js" for x in re.findall(r'chunk-([A-Z0-9]+)\.js', tj))
    urls = sorted(set(re.findall(r'["\'`](https?://[^"\'`\s]{6,140})["\'`]', tj))) + sorted(set(re.findall(r'["\'`](/[a-zA-Z0-9_\-]*(?:api|taf|metar|opmet|data|awiacja|json)[^"\'`\s]{0,100})["\'`]', tj, re.I)))
    urls = [u for u in urls if "w3.org" not in u]
    if urls: p(f"{js}: " + " | ".join(urls[:40]))
for js in []:
    st2, tj, c2, ty2, s2 = 0, "", "", "", 0
    urls = sorted(set(re.findall(r'["\'`](https?://[^"\'`\s]{6,140})["\'`]', tj))) + sorted(set(re.findall(r'["\'`](/[a-zA-Z0-9_\-]*(?:api|taf|metar|opmet|data|awiacja)[^"\'`\s]{0,100})["\'`]', tj, re.I)))
    if urls: p(f"{js}: " + " | ".join(urls[:40]))
open("taf_pl.md", "w", encoding="utf-8").write("\n".join(ut) + "\n")
