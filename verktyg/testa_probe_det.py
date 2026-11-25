import sys, os; sys.path.insert(0, "verktyg")
import forhamta as F
dtg = F.senaste_ens(); print("dtg", dtg)
for q in ["visibility_in_air[0:1:12][0][0:2:856][280:2:800]", "visibility_in_air[0:1:1][0][0:2:4][280:2:284]", "visibility_in_air[0:1:12][0][0:2:4][280:2:284]"]:
    u = F.BAS + F.FIL(dtg) + ".dods?" + F.enc(q); print(u)
    import urllib.request
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": F.UA}), timeout=120); b = r.read(); print("OK", len(b))
    except urllib.error.HTTPError as e: print("HTTP", e.code, e.read()[:300])
    except Exception as e: print("fel", e)
