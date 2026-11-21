# Mätprov 21/11: IMGW:s flyg-API (hittat i awiacja.imgw.pl:s skript) - ger det TAF för EPMM m.fl.?
import re, json, time, urllib.request, urllib.error
H = {"User-Agent": "Modelltittaren-matprov (github.com/metvyer/modelltittaren)", "Origin": "https://metvyer.github.io", "Referer": "https://awiacja.imgw.pl/"}
def f(url):
    t0 = time.time()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=40) as r:
            return r.status, r.read(3_000_000).decode("utf-8", "replace"), r.headers.get("Access-Control-Allow-Origin", ""), r.headers.get("Content-Type", ""), time.time() - t0
    except urllib.error.HTTPError as e: return e.code, e.read()[:400].decode("utf-8", "replace"), e.headers.get("Access-Control-Allow-Origin", ""), "", time.time() - t0
    except Exception as e: return 0, str(e), "", "", time.time() - t0
A = "https://aviation-api.imgw.pl"
for u in ["/data/last?params=taf&format=json&count=1", "/data/last?params=taf&format=json&count=50", "/data/last?params=metar&format=json&count=1",
          "/data?params=taf", "/data?params=taf&format=json", "/data/last?params=new_sigmet&format=json&count=1", "/data/last?params=gamet&format=json&count=1", "/api", "/"]:
    st, t, c, ty, s = f(A + u)
    icao = sorted(set(re.findall(r"\bEP[A-Z]{2}\b", t)))
    print(f"| {u} | {st} | {s:.1f} s | {len(t)//1024} kB | CORS '{c}' | {ty} | ICAO: {', '.join(icao[:40])} |", flush=True)
    m = re.search(r"TAF[^\"]{0,10}EPMM[^\"]{0,250}", t)
    if m: print("   EPMM: " + re.sub(r"\s+", " ", m.group(0)), flush=True)
    if st == 200 and not icao: print("   " + re.sub(r"\s+", " ", t[:300]), flush=True)
# struktur (21/11): forsta posterna i svaren
for u in ["/data/last?params=taf&format=json&count=1", "/data/last?params=metar&format=json&count=1"]:
    st, t, c, ty, s = f(A + u)
    try:
        j = json.loads(t); print("STRUKTUR", u, type(j).__name__, (list(j.keys())[:20] if isinstance(j, dict) else len(j)), flush=True)
        x = j if isinstance(j, list) else next(iter(j.values()))
        print("FORSTA", json.dumps(x[:2] if isinstance(x, list) else x, ensure_ascii=False)[:1500], flush=True)
    except Exception as e: print("STRUKTUR fel", e, t[:500], flush=True)
