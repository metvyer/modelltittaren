#!/bin/bash
# NYTT 23/11: Sverigeoversikten fran forhamtningen -> Cloudflare R2 (lagringen modelltittaren-data, aldrig publik).
# Kors i forhamta.yml efter varv 0. Nyckeln (R2_ID / R2_HEMLIG) ar GitHub-secrets - Object Read & Write, bara den lagringen.
# Laddar upp ens/<DTG>/ (+ en egen index.json for korningen), behaller de 8 senaste korningarna (ett dygn) och skriver
# ens/index.json med listan "korningar". Sidan laser via mellanservern /r2/ens/...
set -e
E="https://64ff6e697fe9bcc9d141dd2798b79eee.r2.cloudflarestorage.com"; B="s3://modelltittaren-data"; SPARA=8
export AWS_DEFAULT_REGION=auto AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
if [ -z "$AWS_ACCESS_KEY_ID" ]; then echo "R2: ingen nyckel (R2_ID saknas) - hoppar over"; exit 0; fi
DTG=$(python3 -c "import json;print(json.load(open('forhamtat/ens/index.json'))['dtg'])")
cp forhamtat/ens/index.json "forhamtat/ens/$DTG/index.json"
t0=$(date +%s)
aws s3 cp --recursive "forhamtat/ens/$DTG" "$B/ens/$DTG" --endpoint-url "$E" --only-show-errors
KOR=$(aws s3 ls "$B/ens/" --endpoint-url "$E" | awk '/PRE/{print $2}' | tr -d / | grep -E '^[0-9]{8}T[0-9]{2}Z$' | sort)
for k in $(echo "$KOR" | head -n -$SPARA); do echo "R2: tar bort $k"; aws s3 rm --recursive "$B/ens/$k" --endpoint-url "$E" --only-show-errors; done
SPARADE=$(echo "$KOR" | tail -n $SPARA | tr '\n' ' ')
python3 - "$SPARADE" <<'PY'
import json, sys
i = json.load(open("forhamtat/ens/index.json")); i["korningar"] = sys.argv[1].split(); i["kalla"] = "r2"
json.dump(i, open("/tmp/r2_index.json", "w"), ensure_ascii=False)
PY
aws s3 cp /tmp/r2_index.json "$B/ens/index.json" --endpoint-url "$E" --content-type application/json --only-show-errors
echo "R2: $DTG uppladdad pa $(( $(date +%s) - t0 )) s, sparade korningar: $SPARADE"
