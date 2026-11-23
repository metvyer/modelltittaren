#!/bin/bash
# NYTT 23/11 kvall: marktrycket (QFF) fran forhamta.py qff -> Cloudflare R2 (qff/<DTG>/ + qff/index.json).
# Behaller de 4 senaste korningarna. Samma nyckel som till_r2.sh (R2_ID / R2_HEMLIG, bara den lagringen).
set -e
E="https://64ff6e697fe9bcc9d141dd2798b79eee.r2.cloudflarestorage.com"; B="s3://modelltittaren-data"; SPARA=4
export AWS_DEFAULT_REGION=auto AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
if [ -z "$AWS_ACCESS_KEY_ID" ]; then echo "R2: ingen nyckel - hoppar over"; exit 0; fi
DTG=$(python3 -c "import json;print(json.load(open('forhamtat/qff/index.json'))['dtg'])")
t0=$(date +%s)
aws s3 cp --recursive "forhamtat/qff/$DTG" "$B/qff/$DTG" --endpoint-url "$E" --only-show-errors
KOR=$(aws s3 ls "$B/qff/" --endpoint-url "$E" | awk '/PRE/{print $2}' | tr -d / | grep -E '^[0-9]{8}T[0-9]{2}Z$' | sort)
for k in $(echo "$KOR" | head -n -$SPARA); do echo "R2: tar bort qff/$k"; aws s3 rm --recursive "$B/qff/$k" --endpoint-url "$E" --only-show-errors; done
SPARADE=$(echo "$KOR" | tail -n $SPARA | tr '\n' ' ')
python3 - "$SPARADE" <<'PY'
import json, sys
i = json.load(open("forhamtat/qff/index.json")); i["korningar"] = sys.argv[1].split()
json.dump(i, open("/tmp/qff_index.json", "w"), ensure_ascii=False)
PY
aws s3 cp /tmp/qff_index.json "$B/qff/index.json" --endpoint-url "$E" --content-type application/json --only-show-errors
echo "R2: QFF $DTG uppladdad pa $(( $(date +%s) - t0 )) s, sparade: $SPARADE"
