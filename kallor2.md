
## 1. MTG – EUMETSAT EUMETView (WMS)
GetCapabilities 200, 116 lager, varav MTG 13:
- `mtg_fd:frp` – Fire Radiative Power (FRP)
- `mtg_fd:h40b` – Blended FCI / LEO MW precipitation - MTG - 0 degree
- `mtg_fd:ir105_hrfi` – FCI HRFI IR10.5 μm Image - MTG-I - 0 degree
- `mtg_fd:li_afa` – LI Accumulated Flash Area - MTG-I - 0 degree
- `mtg_fd:rgb_cloudphase` – Cloud Phase RGB - MTG-I - 0 degree
- `mtg_fd:rgb_cloudtype` – Cloud Type RGB - MTG-I - 0 degree
- `mtg_fd:rgb_dust` – Dust RGB - MTG-I - 0 degree
- `mtg_fd:rgb_firetemperature` – Fire Temperature RGB - MTG-I - 0 degree
- `mtg_fd:rgb_fog` – Fog / Low Clouds RGB - MTG-I - 0 degree
- `mtg_fd:rgb_geocolour` – Geo Colour RGB - MTG-I - 0 degree
- `mtg_fd:rgb_snow` – Snow RGB - MTG - 0 degree
- `mtg_fd:rgb_truecolour` – True Colour RGB - MTG-I - 0 degree
- `mtg_fd:vis06_hrfi` – FCI HRFI VIS0.6 μm Image - MTG-I - 0 degree
  tider `mtg_fd:frp`: 2026-07-23T00:00:00.000Z/2026-11-21T15:00:00.000Z/PT10M
  tider `mtg_fd:h40b`: 2026-07-23T00:00:00.000Z/2026-11-21T15:10:00.000Z/PT10M
  tider `mtg_fd:ir105_hrfi`: 2024-09-23T00:00:00.000Z/2026-11-21T15:10:00.000Z/PT10M
  tider `mtg_fd:li_afa`: 2025-05-30T15:00:00.000Z/2026-11-21T15:25:00.000Z/PT5M
  tider `mtg_fd:rgb_cloudphase`: 2024-09-23T02:00:00.000Z/2026-11-21T15:10:00.000Z/PT10M
  tider `mtg_fd:rgb_cloudtype`: 2025-06-01T17:20:00.000Z/2026-11-21T15:10:00.000Z/PT10M
  tider `mtg_fd:rgb_dust`: 2024-10-22T00:40:00.000Z/2026-11-21T15:10:00.000Z/PT10M
  tider `mtg_fd:rgb_firetemperature`: 2025-08-05T00:00:00.000Z/2026-11-21T15:10:00.000Z/PT10M
  tider `mtg_fd:rgb_fog`: 2025-06-06T18:40:00.000Z/2026-11-21T15:10:00.000Z/PT10M
  tider `mtg_fd:rgb_geocolour`: 2024-09-23T00:00:00.000Z/2026-11-21T15:10:00.000Z/PT10M
  tider `mtg_fd:rgb_snow`: 2025-12-10T00:00:00.000Z/2026-11-21T15:10:00.000Z/PT10M
  tider `mtg_fd:rgb_truecolour`: 2024-09-23T02:00:00.000Z/2026-11-21T15:10:00.000Z/PT10M
  tider `mtg_fd:vis06_hrfi`: 2024-09-16T02:40:00.000Z/2026-11-21T15:20:00.000Z/PT10M
- bild `mtg_fd:ir105_hrfi`: 200, 5.5 s, 166 kB, image/png, CORS '*' → mtg_mtg_fd_ir105_hrfi.png
- bild `mtg_fd:li_afa`: 200, 1.1 s, 30 kB, image/png, CORS '*' → mtg_mtg_fd_li_afa.png
- bild `mtg_fd:rgb_cloudtype`: 200, 7.3 s, 808 kB, image/png, CORS '*' → mtg_mtg_fd_rgb_cloudtype.png
- bild `mtg_fd:rgb_geocolour`: 200, 1.4 s, 943 kB, image/png, CORS '*' → mtg_mtg_fd_rgb_geocolour.png
- bild `mtg_fd:vis06_hrfi`: 200, 2.7 s, 595 kB, image/png, CORS '*' → mtg_mtg_fd_vis06_hrfi.png

## 2. SMHI
Radar komposit: 200, CORS '*', nycklar ['key', 'updated', 'timeZone', 'firstFiles', 'lastFiles', 'years']
  senaste: {"key": "radar_2611211525", "valid": "2026-11-21 15:25", "updated": "2026-11-21T15:27:52Z", "formats": [{"key": "png", "updated": "2026-11-21T15:27:52Z", "link": "https://opendata-download-radar.smhi.se/api/version/latest/area/sweden/product/comp/latest.png"}, {"key": "tif", "updated": "2026-11-21T15:27:52Z", "link": "https://opendata-download-radar.smhi.se/api/version/latest/area/sweden/product/c
  bild png: 200, 66 kB, 0.6 s, CORS '*' → smhi_radar.png
  bild tif: 200, 45 kB, 0.7 s, CORS '*' → smhi_radar.tif
Radar produkter: 200 {"key":"sweden","updated":"2026-11-21T15:36:18Z","timeZone":"UTC","products":[{"key":"comp","updated":"2026-11-21T15:36:18Z","link":"https://opendata-download-radar.smhi.se/api/version/latest/area/sweden/product/comp.json"}]}
- katalog radarnowcast nederbörd (200): ['Meteorologisk modell KNEP (ca 2,5 km upplösning) - Prognosdata realtid', 'GCMD - Science keywords'] · Meteorologisk modell (KNEP) - kort nederbördsprognos BESKRIVNING: I denna datamängd finns prognosdata från prognosmodellen KNEP. Knep är en kort prognos för nederbörd med 1-6 timmars prognoslängder. Prognosen utgår från nederbördsmängd beräknad utifrån radardata som under 6 prognostidssteg med justerad viktning övergår i antingen MEPS eller ECMWF meteorologiska prognosmodell. Modellen körs varje timme. Prognosen täcker ett område över Skandinavien och har rumslig upplösning på ca 2.5 km. ANVÄNDN
- katalog MEPS (200): ['Meteorologisk modell (MEPS) - Prognosdata realtid', 'GCMD - Science keywords'] · BESKRIVNING: Datafilerna innehåller analys- och prognosdata från prognosmodellen MEPS. MEPS är ett ensembleprognossystem med totalt 15 medlemmar under en tretimmarsperiod. Detta innebär att MEPS producerar 15 olika prognoser för varje prognostillfälle där de olika medlemmarna har lika initialtillstånd baserat på randvärden från utvald ensembleperturbation från Europeiska vädercentersmodell. Genom att använda informationen i samtliga ensemble-medlemmar kan olika sannolikheter beräknas, t ex hur o
- katalog CMEPSS (200): ['Meteorologisk modell (CMEPSS, medlem 0) - markparametrar', 'GCMD - Science keywords'] · BESKRIVNING I denna datamängd finns markparametrar för analys- och prognosdata i realtid från de två senaste körningarna av prognosmodellen CMEPSS, medlem 0. Filerna surfaceParameters_CMEPSS_MBR000* innehåller postprocessade så kallade mark-fält som anges för en viss höjd över marken. Modellen körs var tredje timme. Första filen är analysfilen och sedan följer 60 prognosfiler, en för varje tidssteg. CMEPSS är en numerisk prognosmodell som beskriver vädrets utveckling i tid och rum. Modellen har 
- katalog SNOW grid (200): ['Meteorologisk modell SNOW - Prognosdata realtid', 'GCMD - Science keywords'] · I denna datamängd finns prognosdata i realtid från de två senaste körningarna av SNOW, Swedish National Operational Weather forecast. SNOW, Swedish National Operational Weather forecast, är en prognosdatabas som är kvalitetskontrollerad av en meteorolog. Databasen består av prognosvärden utlagda i ett grid (fält). Varje parameter har ett värde i varje gridpunkt och vid varje specifik tidpunkt. Avståndet mellan gridpunkterna är ca 2,5 km. Tidsupplösningen på informationen i SNOW glesas ut efterha
SNOW giltiga tider: 404 <!DOCTYPE html> <html> <head> <title>404 Not Found</title> </head> <body> <h1>Error 404 Not Found</h1> <p>Not Found</p> <h3>Guru Meditation:</h3> <p>XID: 5015948382</p> <hr> <p>Varnish cache server</p> </body> </html> 
SNOW hela Sverige, temperatur 20261121T180000Z: 200, 1.0 s, 4240 kB okomprimerat, 1 punkter, CORS '*' · nycklar ['createdTime', 'referenceTime', 'timeSeries']
SNOW gitter: 200, 21598 kB, nycklar ['type', 'coordinates'], punkter 1014481
SNOW parametrar: 404 <!DOCTYPE html> <html> <head> <title>404 Not Found</title> </head> <body> <h1>Error 404 Not Found</h1> <p>Not Found</p> <h3>Guru Meditation:</h3> <p>XID: 5010312709</p> <hr> <p>Varnish cache server</p> </body> </html> 
Blixtar rot: 200 länkar: https://opendata-download-lightning.smhi.se/api.atom, https://opendata-download-lightning.smhi.se/api.json, https://opendata-download-lightning.smhi.se/api.xml, https://opendata-download-lightning.smhi.se/api/version/1.0.atom, https://opendata-download-lightning.smhi.se/api/version/1.0.json, https://opendata-download-lightning.smhi.se/api/version/1.0.xml, https://opendata-download-lightning.smhi.se/api/version/latest.atom, https://opendata-download-lightning.smhi.se/api/version/latest.json, https://opendata-download-lightning.smhi.se/api/version/latest.xml
  version/latest.json: 200, CORS '*', {"key":"latest","updated":1795219200000,"title":"Senaste versionen av nedladdningstjänsten: Välj år (sedan månad och dag)","summary":"","link":[{"href":"https://opendata-download-lightning.smhi.se/api/category/latest.json","rel":"version","type":"app
  version/latest/year/2026.json: 200, CORS '*', {"key":"2026","title":"2026","summary":"Här hittar du blixtar för 2026","link":[{"href":"https://opendata-download-lightning.smhi.se/api/version/latest/year/2026.json","rel":"year","type":"application/json"},{"href":"https://opendata-download-lightni
  version/latest/year/2026/month/11/day/21/data.json: 404, CORS '', <!doctype html><html lang="en"><head><title>HTTP Status 404 – Not Found</title><style type="text/css">body {font-family:Tahoma,Arial,sans-serif;} h1, h2, h3, b {color:white;background-color:#525D76;} h1 {font-size:22px;} h2 {font-size:16px;} h3 {font
  grid https://opendata-download-grid.smhi.se/explore/: 0 <urlopen error [Errno -2] Name or service not known>
  grid https://opendata-download-grid.smhi.se/api: 0 <urlopen error [Errno -2] Name or service not known>
  grid https://opendata-download-grid.smhi.se/atom/5: 0 <urlopen error [Errno -2] Name or service not known>

## 3. FMI – harmonie, meps och nowcast
- fmi::forecast::harmonie::surface::grid:  The stored query can be used to fetch Harmonie surface level weather forecast data encoded in GRIB or NetCDF format. The model data covers the geographical area of Scandinavia. New forecast dataset will come available every 6 hours. By default all the parameters and timesteps are selected. 
  körning(ar): ['2026-11-21T09:00:00Z', '2026-11-21T12:00:00Z'] · 2 filer
  fil: 200, 1.0 s, 21 kB, application/x-grib2, CORS '', början b'GRIB\xff\xff\x00\x02'
- fmi::forecast::meps::surface::grid:  The stored query can be used to fetch Harmonie (MEPS) surface level weather forecast data encoded in GRIB or NetCDF format. The model data covers the geographical area of Scandinavia. New forecast dataset will come available every 6 hours. By default all the parameters and timesteps are selected. 
  körning(ar): ['2026-11-21T09:00:00Z', '2026-11-21T12:00:00Z'] · 2 filer
  fil: 200, 1.1 s, 21 kB, application/x-grib2, CORS '', början b'GRIB\xff\xff\x00\x02'
  producent `mnwc_scandinavia_surface`: 400, 0 kB, 
  producent `mnwc`: 400, 0 kB, 
  producent `harmonie_mnwc_surface`: 400, 0 kB, 
  producent `smartmet_nowcast`: 400, 0 kB, 
  producent `nowcast_scandinavia_surface`: 400, 0 kB, 
  producent `meps_scandinavia_surface`: 400, 0 kB, 
  producent `harmonie_scandinavia_surface`: 200, 195 kB, data
  timeseries harmonie 15 min: 400 Unknown time string 'now+3h'
  timeseries mnwc 15 min: 400 Unknown time string 'now+3h'

## 4. met.no – MET Nordic, nowcast, kataloger
MET Nordic tider: 200, 0 st, första ?, sista ? · rått: 5428E9, 1.7954316E9, 1.7954352E9, 1.7954388E9, 1.7954424E9, 1.795446E9, 1.7954496E9, 1.7954532E9, 1.7954568E9, 1.7954604E9, 1.795464E9, 1.7954676E9, 1.7954712E9, 1.7954748E9, 1.7954784E9, 1.795482E9 
variabler: x, y, time, latitude, y, x, longitude, y, x, altitude, y, x, land_area_fraction, y, x, air_temperature_2m, time, y, x, precipitation_amount, time, y, x, wind_direction_10m, time, y, x, wind_speed_10m, time, y, x, wind_speed_of_gust, time, y, x, cloud_area_fraction, time, y, x, air_pressure_at_sea_level, time, y, x, integral_of_surface_downwelling_longwave_flux_in_air_wrt_time, time, y, x, integral_of_surface_downwelling_shortwave_flux_in_air_wrt_time, time, y, x, relative_humidity_2m, time, y, x, probability_of_snow_phase, time, y, x, probability_of_thunder, time, y, x
nederbörd stickprov: 400, 0.5 s · 81) org.apache.tomcat.util.threads.TaskThread$WrappingRunnable.run(TaskThread.java:74) java.base&#47;java.lang.Thread.run(Thread.java:840) </pre><p><b>Note</b> The full stack trace of the root cause is available in the server logs.</p><hr class="line" /><h3>Apache Tomcat/11.0.29</h3></body></html>
api.met.no nowcast: 23 tider 2026-11-21T15:40:00Z … 2026-11-21T17:30:00Z, parametrar nu: ['air_temperature', 'apparent_air_temperature', 'precipitation_rate', 'relative_humidity', 'ultraviolet_index_clear_sky', 'wind_from_direction', 'wind_speed', 'wind_speed_of_gust'], därefter: [] · radar: ok
- remotesensing/catalog.xml: 404 · viewport
- remotesensingradar/catalog.xml: 404 · viewport
- remotesensingradaraccr/catalog.xml: 200 · 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, DODShttp, DatasetScan, Radar accr archive (Norway), allServices, dapService, httpService, thisDODS, virtualServices
- radarnowcasting/catalog.xml: 200 · DODShttp, DatasetScan, MET Radar Nowcasting, allServices, dapOnly, dapService, httpService, ncssServices, pp, subsetServer, thisDODS, virtualServices, wcs, wms, yrwms-nordic.mos.pcappi-0-rr.noclass-clfilter-novpr-clcorr-block.nordiclcc-1000.20261119T154000Z.nc, yrwms-nordic.mos.pcappi-0-rr.noclass-clfilter-novpr-clcorr-block.nordiclcc-1000.20261119T154500Z.nc, yrwms-nordic.mos.pcappi-0-rr.noclass-clfilter-novpr-clcorr-block.nordiclcc-1000.20261119T155000Z.nc, yrwms-nordic.mos.pcappi-0-rr.noclass-clfilter-novpr-clcorr-block.nordiclcc-1000.20261119T155500Z.nc, yrwms-nordic.mos.pcappi-0-rr.noclass-clfilter-novpr-clcorr-block.nordiclcc-1000.20261119T160000Z.nc, yrwms-nordic.mos.pcappi-0-rr.noclass-clfilter-novpr-clcorr-block.nordiclcc-1000.20261119T160500Z.nc, yrwms-nordic.mos.pcappi-0-rr.noclass-clfilter-novpr-clcorr-block.nordiclcc-1000.20261119T161000Z.nc, yrwms-nordic.mos.pcappi-0-rr.noclass-clfilter-novpr-clcorr-block.nordiclcc-1000.20261119T161500Z.nc, yrwms-nordic.mos.pcappi-0-rr.noclass-clfilter-novpr-clcorr-block.nordiclcc-1000.20261119T162000Z.nc, yrwms-nordic.mos.pcappi-0-rr.noclass-clfilter-novpr-clcorr-block.nordiclcc-1000.20261119T162500Z.nc, yrwms-nordic.mos.pcappi-0-rr.noclass-clfilter-novpr-clcorr-block.nordiclcc-1000.20261119T163000Z.nc
- yrwms/catalog.xml: 404 · viewport
  arcticdata/arcticdata.xml: 
  metno.xml: 
  fou-kl.xml: 
  obs.xml: 
  fou-hi/fou-hi.xml: 
  projects.xml: 
  users.xml: 

## 5. DMI – EDR punkt (ensemble-sannolikheter)
- harmonie_dini_eps_probabilities: 200, parametrar: gust-wind-speed-10m-above-25ms-within-1hour-probability, gust-wind-speed-10m-above-33ms-within-1hour-probability, temperature-2m-below-273k-probability, time-integral-of-total-solid-precipitation-flux-above-10mm-in-6hours-probability, time-integral-of-total-solid-precipitation-flux-above-15mm-in-6hours-probability, time-integral-of-total-solid-precipitation-flux-above-1mm-in-6hours-probability, time-integral-of-total-solid-precipitation-flux-above-5mm-in-6hours-probability, total-precipitation-above-10mm-in-3hours-probability, total-precipitation-above-16mm-in-3hours-probability, total-precipitation-above-24mm-in-6hours-probability, total-precipitation-above-30mm-in-24hours-probability, total-precipitation-above-30mm-in-3hours-probability, total-precipitation-above-35mm-in-6hours-probability, total-precipitation-above-50mm-in-24hours-probability, visibility-above-100m-probability, wind-speed-10m-above-25ms-probability, wind-speed-10m-above-33ms-probability
  punkt Arlanda: 200, 58.9 s, CORS '*', tider 19, parametrar ['gust-wind-speed-10m-above-25ms-within-1hour-probability', 'total-precipitation-above-35mm-in-6hours-probability', 'total-precipitation-above-30mm-in-3hours-probability', 'total-precipitation-above-10mm-in-3hours-probability', 'time-integral-of-total-solid-precipitation-flux-above-15mm-in-6hours-probability', 'total-precipitation-above-16mm-in-3hours-probability', 'wind-speed-10m-above-33ms-probability', 'total-precipitation-above-30mm-in-24hours-probability', 'temperature-2m-below-273k-probability', 'time-integral-of-total-solid-precipitation-flux-above-10mm-in-6hours-probability', 'gust-wind-speed-10m-above-33ms-within-1hour-probability', 'wind-speed-10m-above-25ms-probability', 'total-precipitation-above-50mm-in-24hours-probability', 'total-precipitation-above-24mm-in-6hours-probability', 'time-integral-of-total-solid-precipitation-flux-above-1mm-in-6hours-probability', 'time-integral-of-total-solid-precipitation-flux-above-5mm-in-6hours-probability', 'visibility-above-100m-probability']
- harmonie_dini_eps_means: 200, parametrar: dew-point-temperature-2m, fraction-of-cloud-cover, gust-wind-speed-10m, pressure-sealevel, relative-humidity-2m, temperature-2m, time-integral-of-total-solid-precipitation-flux, total-column-vertically-integrated-water-vapour, total-precipitation, wind-speed-10m
  punkt: 0 The read operation timed out
- harmonie_dini_sf: 200, parametrar: -10-degrees-c-isothermal-level, 0-degrees-c-isothermal-level, 10-metre-eastward-wind-gust-since-previous-post-processing, 10-metre-northward-wind-gust-since-previous-post-processing, cloud-base, cloud-top, cloud-top-temperature, cloud-transmittance, convective-available-potential-energy, convective-inhibition, dew-point-temperature-2m, direct-solar-exposure, downward-short-wave-radiation-flux, downward-short-wave-radiation-flux-instant, fraction-of-cloud-cover, fraction-of-cloud-cover-2m, geopotential, global-radiation-flux, graupel-precipitation-rate, gust-wind-speed-10m, high-cloud-cover, land-percent, latent-heat-net-flux, level-of-free-convection, level-of-neutral-buoyance, lifting-condensation-level, low-cloud-cover, medium-cloud-cover, mixed-layer-depth, momentum-flux-u, momentum-flux-v, net-long-wave-radiation-flux, net-short-wave-radiation-flux, net-short-wave-radiation-flux-nominal-top-of-the-atmosphere, precipitation-type, pressure-sealevel, pressure-surface, pressure-surface-150m, pressure-surface-300m, probability-of-lightning, rain-precipitation-rate, relative-humidity-100m, relative-humidity-150m, relative-humidity-250m, relative-humidity-2m, relative-humidity-50m, sensible-heat-net-flux, snow-depth-water-equivalent, specific-humidity-2m, specific-humidity-2m-sealevel, specific-humidity-sealevel, temperature-0m, temperature-100m, temperature-150m, temperature-250m, temperature-2m, temperature-2m-maximum, temperature-2m-minimum, temperature-2m-sealevel, temperature-50m
  punkt: 413 {"timestamp":"2026-11-21T15:43:45.982+00:00","status":413,"error":"Payload Too Large","message":"Too many model steps and/or parameters to handle in one request. The combination of model steps and parameters exceeds current limit of 1000","path":"/v1

## 6. Open-Meteo – vilka modeller ger data för Arlanda
- metno_nordic: 200, 72 timmar med värden, molnbas nej, sikt nej
- metno_seamless: 200, 72 timmar med värden, molnbas nej, sikt ja
- dmi_harmonie_arome_europe: 200, 72 timmar med värden, molnbas ja, sikt ja
- dmi_seamless: 200, 72 timmar med värden, molnbas ja, sikt ja
- knmi_harmonie_arome_europe: 200, 72 timmar med värden, molnbas nej, sikt ja
- ecmwf_ifs: 0 <urlopen error _ssl.c:1063: The handshake operation timed out>
- ecmwf_ifs025: 200, 72 timmar med värden, molnbas nej, sikt nej
- ecmwf_aifs025_single: 200, 72 timmar med värden, molnbas nej, sikt nej
- icon_seamless: 200, 72 timmar med värden, molnbas nej, sikt ja
- icon_global: 200, 72 timmar med värden, molnbas nej, sikt nej
- icon_eu: 200, 72 timmar med värden, molnbas nej, sikt ja
- gfs_seamless: 0 <urlopen error _ssl.c:1063: The handshake operation timed out>
- gfs_global: 200, 72 timmar med värden, molnbas nej, sikt ja
- ncep_hrrr_conus: 400 {"reason":"No data is available for this location","error":true}
- gem_seamless: 200, 72 timmar med värden, molnbas nej, sikt nej
- jma_seamless: 200, 72 timmar med värden, molnbas nej, sikt nej
- ukmo_seamless: 200, 72 timmar med värden, molnbas nej, sikt ja
- ukmo_global_deterministic_10km: 200, 72 timmar med värden, molnbas nej, sikt ja
- meteofrance_seamless: 0 <urlopen error _ssl.c:1063: The handshake operation timed out>
- meteofrance_arpege_europe: 200, 72 timmar med värden, molnbas nej, sikt nej
- cma_grapes_global: 200, 72 timmar med värden, molnbas nej, sikt ja
- bom_access_global: 200, 0 timmar med värden, molnbas nej, sikt nej
- kma_seamless: 200, 0 timmar med värden, molnbas nej, sikt nej
- italia_meteo_arpae_icon_2i: 400 {"reason":"No data is available for this location","error":true}
- meteoswiss_icon_ch1: 0 <urlopen error _ssl.c:1063: The handshake operation timed out>
- ensemble icon_seamless: 200, 40 medlemmar
- ensemble icon_eu: 200, 40 medlemmar
- ensemble ecmwf_ifs025: 200, 51 medlemmar
- ensemble ecmwf_aifs025: 200, 51 medlemmar
- ensemble gfs025: 200, 31 medlemmar
- ensemble gem_global: 0 <urlopen error _ssl.c:1063: The handshake operation timed out>
- ensemble bom_access_global_ensemble: 200, 18 medlemmar
- ensemble ukmo_global_ensemble_20km: 200, 18 medlemmar
- ensemble metno_nordic: 200, 1 medlemmar
- ensemble meps: 400 {"error":true,"reason":"Invalid value: Cannot initialize MultiDomains from invalid String value meps"}
