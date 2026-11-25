import urllib.request, urllib.parse
B="https://thredds.met.no/thredds/dodsC/mepslatest/"
from datetime import datetime, timezone, timedelta
nu=datetime.now(timezone.utc); h=(nu.hour//3)*3-3
d=nu.replace(hour=0,minute=0,second=0,microsecond=0)+timedelta(hours=h)
dtg=d.strftime("%Y%m%dT%HZ")
for fil in ["meps_det_2_5km_"+dtg+".ncml","meps_det_2_5km_"+dtg+".nc"]:
  for q in ["visibility_in_air[0:1:1][0][0:2:4][0:2:4]","cloud_base_altitude[0:1:1][0][0:2:4][0:2:4]","air_temperature_2m[0:1:1][0][0:2:4][0:2:4]"]:
    for e in [q, urllib.parse.quote(q, safe="")]:
      u=B+fil+".ascii?"+e
      try:
        r=urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":"mt"}),timeout=40); print(fil,q[:20],"OK",r.read(200)[:80])
      except Exception as x: print(fil,q[:20],"enc" if e!=q else "raw",x)
