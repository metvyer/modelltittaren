# Prov S17 (24/11): SMHI:s brandrisk-API - vilka geotyper/perioder finns (punkt, multipoint), hur ser svaret ut
import json, urllib.request
B = "https://opendata-download-metfcst.smhi.se"
A = "https://opendata-download-metanalys.smhi.se"
def h(u):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "modelltittaren-prov"}), timeout=40) as r:
            t = r.read(); return r.status, len(t), t[:700].decode("utf-8", "replace")
    except Exception as e: return "FEL", 0, str(e)[:200]
for u in [B + "/api/category/fwif1g/version/1.json", B + "/api/category/fwif1g/version/1/daily.json", B + "/api/category/fwif1g/version/1/hourly.json",
          B + "/api/category/fwif1g/version/1/daily/geotype/point/lon/16/lat/58/data.json", B + "/api/category/fwif1g/version/1/hourly/geotype/point/lon/16/lat/58/data.json",
          B + "/api/category/fwif1g/version/1/daily/geotype/multipoint.json", B + "/api/category/fwif1g/version/1/hourly/geotype/multipoint.json",
          B + "/api/category/fwif1g/version/1/daily/createdtime.json", B + "/api/category/fwif1g/version/1/daily/geotype/multipoint/validtime.json",
          A + "/api/category/fwia1g/version/1/daily/geotype/multipoint.json"]:
    st, n, t = h(u); print("====", u.replace(B, "F").replace(A, "A"), st, n); print(t.replace("\n", " ")[:600])
