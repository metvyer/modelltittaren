# Prov S17 (24/11): SMHI:s brandrisk-API multipoint (gzip)
import json, urllib.request, gzip
B = "https://opendata-download-metfcst.smhi.se/api/category/fwif1g/version/1"
def h(u):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "modelltittaren-prov", "Accept-Encoding": "gzip"}), timeout=60) as r:
            t = r.read(); z = len(t)
            if r.headers.get("Content-Encoding") == "gzip": t = gzip.decompress(t)
            return r.status, z, t
    except Exception as e: return "FEL", 0, str(e).encode()
for per in ("daily", "hourly"):
    st, z, t = h(B + "/" + per + "/geotype/multipoint.json"); print("==== multipoint", per, st, z, len(t))
    if st == 200:
        j = json.loads(t); print("   nycklar", list(j.keys()), "antal punkter", len(j.get("coordinates", [[]])[0]) if "coordinates" in j else "?", str(j)[:300])
    st, z, t = h(B + "/" + per + "/geotype/multipoint/validtime.json"); print("==== validtime", per, st, z, t[:400])
    if st == 200:
        vt = json.loads(t).get("validTime", [])
        if vt:
            v = vt[min(1, len(vt) - 1)].replace("-", "").replace(":", "")
            for prm in ("fwiindex", "grassfire"):
                u = B + "/" + per + "/geotype/multipoint/validtime/" + v + "/parameter/" + prm + "/leveltype/hl/level/0/data.json"
                st2, z2, t2 = h(u); print("==== data", per, prm, v, st2, "gz", z2, "rå", len(t2), t2[:300])
