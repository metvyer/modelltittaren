# Prov S17b (24/11): EFFIS/GWIS WMS - kapabiliteter och lagernamn for FWI-prognos
import urllib.request, re, gzip
def h(u, n=400000):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "modelltittaren-prov", "Accept-Encoding": "gzip"}), timeout=60) as r:
            t = r.read(); t = gzip.decompress(t) if r.headers.get("Content-Encoding") == "gzip" else t
            return r.status, r.headers.get("Content-Type"), t[:n].decode("utf-8", "replace")
    except Exception as e: return "FEL", "", str(e)[:200]
for u in ["https://maps.effis.emergency.copernicus.eu/effis?service=WMS&request=GetCapabilities&version=1.3.0",
          "https://maps.effis.emergency.copernicus.eu/gwis?service=WMS&request=GetCapabilities&version=1.3.0",
          "https://ies-ows.jrc.ec.europa.eu/effis?service=WMS&request=GetCapabilities&version=1.3.0",
          "https://ies-ows.jrc.ec.europa.eu/gwis?service=WMS&request=GetCapabilities&version=1.3.0"]:
    st, ct, t = h(u); print("====", u, st, ct, len(t))
    namn = re.findall(r"<Name>([^<]*fwi[^<]*)</Name>", t, re.I); print("   fwi-lager:", namn[:40])
    tid = re.findall(r'<Dimension name="time"[^>]*>([^<]{0,200})', t); print("   tid:", tid[:3])
    print("   ", re.findall(r"<Layer[^>]*>\s*<Name>([^<]+)</Name>\s*<Title>([^<]+)</Title>", t)[:15])
