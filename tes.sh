export SEND_AUDIT_TRAIL="http://10.0.0.11/elvasoft/base/rest/v1/audit_trail"

# KEYCLOAK PASSWORD
export KEYCLOAK_PASSWORD="yobaru"

# #####################
# # CONFIG (CLEAN MULTIPLE PATIENT ID)
# #####################

# CMPID_HOST="http://10.0.0.11/dcm4chee-arc"
# CMPID_AET="DCM4CHEE"
# CMPID_CANON="elvasoft"
# CMPID_LIMIT=200
# CMPID_DRY_RUN=false

# CMPID_AUTH_TYPE="bearer"  # bearer | basic | none
# CMPID_BEARER_TOKEN="${CMPID_BEARER_TOKEN:-${CMPID_TOKEN:-}}"
# CMPID_BASIC_USER=""
# CMPID_BASIC_PASS=""
# CURL_INSECURE=false

# export CMPID_TOKEN=$(
#   curl -sS -X POST "http://10.0.0.11/elvasoft/ksf/realms/dcm4che/protocol/openid-connect/token" \
#     -H "Content-Type: application/x-www-form-urlencoded" \
#     --data "grant_type=password" \
#     --data "client_secret=changeit" \
#     --data "client_id=dcm4chee-arc-ui" \
#     --data "username=admin" \
#     --data "password=changeit" \
#     --data "scope=openid" \
#   | jq -r '.access_token'
# )

# # sanity check: should print a long JWT-like string (not "null")
# echo "${CMPID_TOKEN:0:20}..."

# #####################
# #####################

# #####################
# # CONFIG (CLEAN MWL STATUS)
# #####################

# CMS_FHIR_BASE="http://10.0.0.11/elvasoft/fhir/4_0_0"
# CMS_DCM_BASE="http://10.0.0.11/dcm4chee-arc/aets"
# CMS_DCM_AET="DCM4CHEE"
# CMS_DCM_QIDO="${CMS_DCM_BASE}/${CMS_DCM_AET}/rs"
# CMS_DCM_MWL="http://10.0.0.11/dcm4chee-arc/aets/WORKLIST/rs"

# CMS_KC_TOKEN_URL="http://10.0.0.11/elvasoft/ksf/realms/dcm4che/protocol/openid-connect/token"
# CMS_KC_CLIENT_ID="dcm4chee-arc-ui"
# CMS_KC_CLIENT_SECRET="changeit"
# CMS_KC_USERNAME="admin"
# CMS_KC_PASSWORD="changeit"
# CMS_KC_SCOPE="openid"

# CMS_ACC_SYSTEM="http://hospital.smarthealth.org/accession"
# CMS_SPS_SYSTEM="http://hospital.smarthealth.org/sps-id"
# CMS_STUDYID_SYSTEM="http://hospital.smarthealth.org/study-id"

# CMS_VERBOSE=false
# CMS_CURL_INSECURE=false
# CMS_AUDIT="/tmp/auto_sync_ops.csv"
# CMS_LOG_FILE="/tmp/auto_sync_$(date +%Y%m%d_%H%M%S).log"
# CMS_DEBUG_DIR="/tmp/auto_sync_debug"

# export CMS_TOKEN=$(
#   curl -sS -X POST "http://10.0.0.11/elvasoft/ksf/realms/dcm4che/protocol/openid-connect/token" \
#     -H "Content-Type: application/x-www-form-urlencoded" \
#     --data "grant_type=password" \
#     --data "client_secret=changeit" \
#     --data "client_id=dcm4chee-arc-ui" \
#     --data "username=admin" \
#     --data "password=changeit" \
#     --data "scope=openid" \
#   | jq -r '.access_token'
# )

# # sanity check: should print a long JWT-like string (not "null")
# echo "${CMS_TOKEN:0:20}..."

# #####################
# #####################






















read -p "Want to update image? (y/n): " yn
case "$yn" in
  y) update_image;;
  n) echo "skipped" ;;
  *) echo "Invalid input" ;;
esac

read -p "Want to clean MWL status? (y/n): " yn
case "$yn" in
  y) clean_mwl_status;;
  n) echo "skipped" ;;
  *) echo "Invalid input" ;;
esac

read -p "Want to clean multiple patient id? (y/n): " yn
case "$yn" in
  y) clean_multiple_patient_id;;
  n) echo "skipped" ;;
  *) echo "Invalid input" ;;
esac







# ================ CLEAN MULTIPLE PATIENT ID =======================
clean_multiple_patient_id() {
  if [[ "${CMPID_AUTH_TYPE}" == "bearer" && -z "${CMPID_BEARER_TOKEN}" ]]; then
    echo "ERROR: No bearer token found. Export CMPID_TOKEN or CMPID_BEARER_TOKEN first." >&2
    exit 1
  fi

  curl_flags=(-sS)
  $CMPID_CURL_INSECURE && curl_flags+=(-k)

  case "$CMPID_AUTH_TYPE" in
    bearer) auth_hdr=(-H "Authorization: Bearer ${CMPID_BEARER_TOKEN}") ;;
    basic)  auth_hdr=(-u "${CMPID_BASIC_USER}:${CMPID_BASIC_PASS}") ;;
    none)   auth_hdr=() ;;
    *) echo "CMPID_AUTH_TYPE must be bearer|basic|none"; exit 1 ;;
  esac

  TS="$(date +%Y%m%d_%H%M%S)"
  LOG_DIR="./merge_logs_${TS}"
  mkdir -p "$LOG_DIR"
  OPS_CSV="${LOG_DIR}/merged_ops.csv"
  echo "timestamp,patient_id,src_issuer,target_issuer,action,result" > "$OPS_CSV"

  urlencode() { printf '%s' "$1" | jq -sRr @uri; }

  # -------- QIDO helpers (now always include *all* fields) --------
  qido_patients_page() {
    local offset="$1"
    curl "${curl_flags[@]}" "${auth_hdr[@]}" \
      "${CMPID_HOST}/aets/${CMPID_AET}/rs/patients?includefield=all&offset=${offset}&limit=${CMPID_LIMIT}"
  }

  # Prefer demo from existing canonical; else from most recent study; else empty
  pick_demo_for_pid() {
    local pid="$1" pid_enc; pid_enc="$(urlencode "$pid")"
    local pats_json name dob sex

    pats_json="$(curl "${curl_flags[@]}" "${auth_hdr[@]}" \
      "${CMPID_HOST}/aets/${CMPID_AET}/rs/patients?00100020=${pid_enc}&includefield=all")"

    # If not an array, bail with empty demo
    if ! echo "$pats_json" | jq -e 'type=="array"' >/dev/null 2>&1; then
      echo '{"name":"","dob":"","sex":""}'; return 0
    fi

    name="$(echo "$pats_json" | jq -r '.[] | select(.["00100021"].Value[0]=="'"$CMPID_CANON"'") | .["00100010"].Value[0].Alphabetic // empty')"
    dob="$( echo "$pats_json" | jq -r '.[] | select(.["00100021"].Value[0]=="'"$CMPID_CANON"'") | .["00100030"].Value[0] // empty')"
    sex="$( echo "$pats_json" | jq -r '.[] | select(.["00100021"].Value[0]=="'"$CMPID_CANON"'") | .["00100040"].Value[0] // empty')"

    if [[ -n "$name" || -n "$dob" || -n "$sex" ]]; then
      printf '{"name":%s,"dob":%s,"sex":%s}\n' \
        "$(jq -Rn --arg v "$name" '$v')" \
        "$(jq -Rn --arg v "$dob"  '$v')" \
        "$(jq -Rn --arg v "$sex"  '$v')"
      return 0
    fi

    local studies_json
    studies_json="$(curl "${curl_flags[@]}" "${auth_hdr[@]}" \
      "${CMPID_HOST}/aets/${CMPID_AET}/rs/studies?00100020=${pid_enc}&includefield=all")"

    if ! echo "$studies_json" | jq -e 'type=="array"' >/dev/null 2>&1; then
      echo '{"name":"","dob":"","sex":""}'; return 0
    fi

    local name2 dob2 sex2
    read -r name2 dob2 sex2 < <(echo "$studies_json" | jq -r '
      def dtkey: (."00080020".Value[0] // "") as $d | (."00080030".Value[0] // "") as $t | ($d + "T" + $t);
      ( .[] | {k:(dtkey), n:(."00100010".Value[0].Alphabetic // ""), d:(."00100030".Value[0] // ""), s:(."00100040".Value[0] // "")} )
      | sort_by(.k) | reverse | .[0] // {}
      | [(.n // ""), (.d // ""), (.s // "")] | @tsv
    ')
    printf '{"name":%s,"dob":%s,"sex":%s}\n' \
      "$(jq -Rn --arg v "${name2:-}" '$v')" \
      "$(jq -Rn --arg v "${dob2:-}"  '$v')" \
      "$(jq -Rn --arg v "${sex2:-}"  '$v')"
  }

  build_payload() {
    local pid="$1" name="$2" dob="$3" sex="$4"
    local base d1 d2 d3
    base=$(jq -n --arg pid "$pid" --arg canon "$CMPID_CANON" \
            '{ "00100020": {"vr":"LO","Value":[ $pid ]},
              "00100021": {"vr":"LO","Value":[ $canon ]} }')
    d1='{}'; [[ -n "$name" ]] && d1=$(jq -n --arg name "$name" '{ "00100010": {"vr":"PN","Value":[{"Alphabetic": $name }]} }')
    d2='{}'; [[ -n "$dob"  ]] && d2=$(jq -n --arg dob  "$dob"  '{ "00100030": {"vr":"DA","Value":[ $dob ]} }')
    d3='{}'; [[ -n "$sex"  ]] && d3=$(jq -n --arg sex  "$sex"  '{ "00100040": {"vr":"CS","Value":[ $sex ]} }')
    jq -n --argjson a "$base" --argjson b "$d1" --argjson c "$d2" --argjson d "$d3" '[ $a + $b + $c + $d ]'
  }

  do_merge() {
    local pid="$1" src_issuer="$2" payload="$3" now http_code body url
    local path_pid; path_pid="$(urlencode "$pid")"
    if [[ -z "$src_issuer" ]]; then
      url="${CMPID_HOST}/aets/${CMPID_AET}/rs/patients/${path_pid}?merge=true"
    else
      local path_iss; path_iss="$(urlencode "$src_issuer")"
      url="${CMPID_HOST}/aets/${CMPID_AET}/rs/patients/${path_pid}^^^${path_iss}?merge=true"
    fi
    now="$(date -Is)"

    if $CMPID_DRY_RUN; then
      echo "[DRY] PUT ${url}"
      echo "[DRY] DATA: ${payload}"
      echo "${now},${pid},${src_issuer:-<empty>},${CMPID_CANON},merge,CMPID_DRY_RUN" >> "$OPS_CSV"
    else
      set +e
      resp="$(curl "${curl_flags[@]}" "${auth_hdr[@]}" -X PUT "${url}" \
              -H "Content-Type: application/dicom+json" \
              -d "${payload}" -w "\n%{http_code}")"
      set -e
      http_code="$(echo "$resp" | tail -n1)"
      body="$(echo "$resp" | sed '$d')"
      if [[ "$http_code" =~ ^2 ]]; then
        echo "${now},${pid},${src_issuer:-<empty>},${CMPID_CANON},merge,${http_code}" >> "$OPS_CSV"
      else
        echo "WARN: merge failed for ${pid} ${src_issuer:-<empty>} -> ${CMPID_CANON}, HTTP ${http_code}"
        echo "${now},${pid},${src_issuer:-<empty>},${CMPID_CANON},merge,ERR_${http_code}" >> "$OPS_CSV"
        echo "$body" > "${LOG_DIR}/err_${pid}_${src_issuer:-EMPTY}_${now//:/-}.log"
      fi
    fi
  }

  echo "Building PatientID -> issuers map..."
  declare -A seen
  declare -A pid_issuers_csv

  offset=0
  while :; do
    page_json="$(qido_patients_page "$offset")"

    # If the server returned a non-array (e.g., warning string), stop
    if ! echo "$page_json" | jq -e 'type=="array"' >/dev/null 2>&1; then
      break
    fi

    cnt=$(echo "$page_json" | jq 'length')
    [[ "$cnt" -eq 0 ]] && break

    # Extract "ID|Issuer" per row; issuer may be empty string
    while IFS='|' read -r pid issuer; do
      [[ -z "$pid" ]] && continue
      key="${pid}|${issuer}"; [[ -n "${seen[$key]+x}" ]] && continue
      seen[$key]=1
      if [[ -n "${pid_issuers_csv[$pid]+x}" ]]; then
        if [[ ! ",${pid_issuers_csv[$pid]}," =~ ,${issuer}, ]]; then
          pid_issuers_csv[$pid]="${pid_issuers_csv[$pid]},${issuer}"
        fi
      else
        pid_issuers_csv[$pid]="${issuer}"
      fi
    done < <(echo "$page_json" | jq -r '.[] | "\(.["00100020"].Value[0])|\( ( .["00100021"].Value[0] // "" ) )"')

    offset=$((offset + CMPID_LIMIT))
  done

  echo "Merging per PID into canonical issuer ${CMPID_CANON}..."
  for pid in "${!pid_issuers_csv[@]}"; do
    IFS=',' read -r -a issuers <<< "${pid_issuers_csv[$pid]}"

    # If already only elvasoft, skip
    if [[ "${#issuers[@]}" -eq 1 && "${issuers[0]}" == "$CMPID_CANON" ]]; then
      continue
    fi

    # Choose a seed issuer (prefer canonical if present)
    seed=""
    for iss in "${issuers[@]}"; do
      if [[ "$iss" == "$CMPID_CANON" ]]; then seed="$iss"; break; fi
    done
    if [[ -z "$seed" ]]; then
      for iss in "${issuers[@]}"; do
        if [[ -n "$iss" && "$iss" != "$CMPID_CANON" && "$iss" != "DCM4CHEE.null.null" ]]; then seed="$iss"; break; fi
      done
    fi
    [[ -z "$seed" ]] && seed=""

    # Prepare demographics payload
    demo="$(pick_demo_for_pid "$pid")" || demo='{"name":"","dob":"","sex":""}'
    name="$(echo "$demo" | jq -r '.name // empty')"
    dob="$( echo "$demo" | jq -r '.dob // empty')"
    sex="$( echo "$demo" | jq -r '.sex // empty')"
    payload="$(build_payload "$pid" "$name" "$dob" "$sex")"

    # 1) If seed != canonical, merge seed -> canonical first (establish canonical row)
    if [[ "$seed" != "$CMPID_CANON" ]]; then
      do_merge "$pid" "$seed" "$payload"
    fi

    # 2) Merge every other variant (including empty) into canonical
    for iss in "${issuers[@]}"; do
      [[ "$iss" == "$seed" ]] && [[ "$seed" != "$CMPID_CANON" ]] && continue
      [[ "$iss" == "$CMPID_CANON" ]] && continue
      do_merge "$pid" "$iss" "$payload"
    done
  done

  echo "Done. Log: $OPS_CSV"
}

















































# ================ CLEAN MWL STATUS =======================
############################################
# prerequisites
############################################
clean_mwl_status(){
  need(){ command -v "$1" >/dev/null 2>&1 || { echo "need $1"; exit 1; }; }
  need curl; need jq; need sed; need tr; need cut; need awk

  C_FHIR=(-sS -L --http1.1 --compressed -H "Accept: application/fhir+json")
  C_QIDO=(-sS -L --http1.1 --compressed -H "Accept: application/dicom+json")
  C_JSON=(-sS -L --http1.1 --compressed -H "Accept: application/json")
  [[ "$CMS_VERBOSE" == true ]] && { C_FHIR=(-v "${C_FHIR[@]}"); C_QIDO=(-v "${C_QIDO[@]}"); C_JSON=(-v "${C_JSON[@]}"); }
  [[ "$CMS_CURL_INSECURE" == true ]] && { C_FHIR=("${C_FHIR[@]}" -k); C_QIDO=("${C_QIDO[@]}" -k); C_JSON=("${C_JSON[@]}" -k); }

  mkdir -p "$CMS_DEBUG_DIR"
  [[ -f "$CMS_AUDIT" ]] || echo "timestamp,unscheduled,scheduled,step,http_code,result,info" >"$CMS_AUDIT"

  now(){ date -Is; }
  log(){ 
      local msg="$*"
      printf '[%s] %s\n' "$(now)" "$msg" | tee -a "$CMS_LOG_FILE"
  }
  debug_save(){
      local filename="$1"
      local content="$2"
      echo "$content" > "${CMS_DEBUG_DIR}/${filename}" 2>/dev/null || true
  }
  audit(){ echo "$(now),$1,$2,$3,$4,$5,$6" >> "$CMS_AUDIT"; }
  enc(){ jq -rn --arg v "$1" '$v|@uri'; }
  trim(){ sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'; }

  ############################################
  # auth
  ############################################
  log "Getting Keycloak token..."
  CMS_TOKEN="$(curl "${C_JSON[@]}" -X POST \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data "grant_type=password&client_id=${CMS_KC_CLIENT_ID}&client_secret=${CMS_KC_CLIENT_SECRET}&username=${CMS_KC_USERNAME}&password=${CMS_KC_PASSWORD}&scope=${CMS_KC_SCOPE}" \
    "$CMS_KC_TOKEN_URL" 2>/dev/null | jq -r '.access_token')"
  [[ -z "${CMS_TOKEN:-}" || "$CMS_TOKEN" == "null" ]] && { log "ERROR: cannot get Keycloak token"; exit 1; }
  AUTH=(-H "Authorization: Bearer $CMS_TOKEN")
  log "Token obtained successfully"

  ############################################
  # helpers
  ############################################
  # Query by accession only, not filtering by patient
  qido_uid_by_accession(){
    local acc="$1"
    local url="${CMS_DCM_QIDO}/studies?00080050=$(enc "$acc")&includedefaults=false&includefield=0020000D&includefield=00100020&includefield=00080050"
    local result
    result="$(curl "${C_QIDO[@]}" "${AUTH[@]}" "$url" 2>/dev/null)"
    debug_save "qido_${acc}.json" "$result"
    echo "$result"
  }

  # Check if accession exists in MWL
  check_mwl_exists(){
    local acc="$1"
    local url="${CMS_DCM_MWL}/mwlitems?00080050=$(enc "$acc")&includedefaults=false"
    local response
    response="$(curl "${C_QIDO[@]}" "${AUTH[@]}" "$url" 2>/dev/null)"
    debug_save "mwl_${acc}.json" "$response"
    
    # Check if response is non-empty array
    if [[ -n "$response" ]] && [[ "$response" != "[]" ]]; then
      echo "exists"
    else
      echo "not_exists"
    fi
  }

  fhir_delete_with_etag(){
    local url="$1"
    local code
    code="$(curl "${C_FHIR[@]}" -X DELETE "$url" -o /dev/null -w '%{http_code}' 2>/dev/null)" || true
    [[ "$code" =~ ^(200|204|404)$ ]] && { echo "$code"; return; }
    if [[ "$code" == "409" ]]; then
      local hdr etag re
      hdr="$(mktemp)"; trap 'rm -f "$hdr"' RETURN
      curl -sS -L --http1.1 --compressed -D "$hdr" -o /dev/null "$url" >/dev/null 2>&1 || true
      etag="$(sed -n 's/^[eE][tT][aA][gG]:[[:space:]]*//p' "$hdr" | tr -d '\r')"
      if [[ -n "$etag" ]]; then
        re="$(curl "${C_FHIR[@]}" -H "If-Match: $etag" -X DELETE "$url" -o /dev/null -w '%{http_code}' 2>/dev/null)" || true
        echo "${re:-$code}"
      else
        echo "$code"
      fi
    else
      echo "$code"
    fi
  }

  mwl_complete(){
    local study225="$1" sps="$2"
    [[ -z "$study225" || -z "$sps" ]] && { echo "skip"; return; }
    local url="${CMS_DCM_MWL}/mwlitems/$(enc "$study225")/$(enc "$sps")/status/COMPLETED"
    curl "${C_JSON[@]}" "${AUTH[@]}" -X POST "$url" -o /dev/null -w '%{http_code}' 2>/dev/null || true
  }

  # Update study with accession number and metadata
  update_study_metadata(){
    local study_uid="$1" acc="$2" study_desc="$3" exam_date="$4" exam_time="$5" ref_doc="$6" clinical="$7" patient_id="$8"
    
    local payload='{
      "0020000D": {"vr": "UI", "Value": ["'"$study_uid"'"]},
      "00100020": {"vr": "LO", "Value": ["'"$patient_id"'"]},
      "00080050": {"vr": "SH", "Value": ["'"$acc"'"]}'
    
    [[ -n "$study_desc" ]] && payload+=',
      "00081030": {"vr": "LO", "Value": ["'"$study_desc"'"]}'
    [[ -n "$exam_date" ]] && payload+=',
      "00080020": {"vr": "DA", "Value": ["'"$exam_date"'"]}'
    [[ -n "$exam_time" ]] && payload+=',
      "00080030": {"vr": "TM", "Value": ["'"$exam_time"'"]}'
    [[ -n "$ref_doc" ]] && payload+=',
      "00080090": {"vr": "PN", "Value": ["'"$ref_doc"'"]}'
    [[ -n "$clinical" ]] && payload+=',
      "001021B0": {"vr": "LT", "Value": ["'"$clinical"'"]}'
    
    payload+='}'
    
    debug_save "update_payload_${study_uid}.json" "$payload"
    
    local url="${CMS_DCM_QIDO}/studies/$(enc "$study_uid")"
    curl "${C_JSON[@]}" "${AUTH[@]}" -X PUT "$url" \
      -H "Content-Type: application/dicom+json" \
      -d "$payload" \
      -o /dev/null -w '%{http_code}' 2>/dev/null || true
  }

  ############################################
  # fetch SR bundle
  ############################################
  log "Fetching ServiceRequest bundle from FHIR..."
  SR_BUNDLE="$(curl "${C_FHIR[@]}" "${CMS_FHIR_BASE}/ServiceRequest" 2>/dev/null)"
  debug_save "sr_bundle.json" "$SR_BUNDLE"

  mapfile -t ALL_IDS < <(echo "$SR_BUNDLE" | jq -r --arg sys "$CMS_ACC_SYSTEM" '
    .entry[]?.resource as $r
    | ( [ ($r.identifier // [])[]? | select(.system==$sys) | .value ] + [ $r.id ] )
    | unique[] | select(type=="string")
  ' | sort -u)

  mapfile -t UNS < <(printf '%s\n' "${ALL_IDS[@]}" | sed -n 's/^\(.*-unscheduled\)$/\1/p')
  ALL_SET="$(printf '%s\n' "${ALL_IDS[@]}")"

  log "Found ${#UNS[@]} unscheduled studies:"
  for u in "${UNS[@]}"; do log "  - $u"; done
  echo

  ############################################
  # iterate
  ############################################
  SYNC_COUNT=0
  SKIP_COUNT=0

  for U_ACC in "${UNS[@]}"; do
    log "========================================="
    log "Processing: ${U_ACC}"
    BASE="${U_ACC%-unscheduled}"
    
    # Check if paired scheduled SR exists
    if ! echo "$ALL_SET" | grep -qx "$BASE"; then
      log "  Skip: no scheduled pair found"
      SKIP_COUNT=$((SKIP_COUNT + 1))
      continue
    fi
    
    log "  ✓ Found scheduled pair: ${BASE}"
    
    # Check if base accession exists in MWL
    MWL_STATUS="$(check_mwl_exists "$BASE")"
    if [[ "$MWL_STATUS" == "exists" ]]; then
      log "  ⏸️  Skip: still in MWL (exam not completed)"
      SKIP_COUNT=$((SKIP_COUNT + 1))
      continue
    fi
    
    log "  ✅ Not in MWL - proceeding with sync"
    
    # Fetch scheduled SR & patient
    SCHED_SR_JSON="$(curl "${C_FHIR[@]}" "${CMS_FHIR_BASE}/ServiceRequest/${BASE}" 2>/dev/null)"
    debug_save "sr_${BASE}.json" "$SCHED_SR_JSON"
    
    ok="$(echo "$SCHED_SR_JSON" | jq -e '.resourceType=="ServiceRequest"' >/dev/null 2>&1 && echo yes || echo no)"
    [[ "$ok" != "yes" ]] && { log "  ❌ Cannot fetch ServiceRequest"; SKIP_COUNT=$((SKIP_COUNT + 1)); continue; }

    PAT_REF="$(echo "$SCHED_SR_JSON" | jq -r '.subject.reference // empty' 2>/dev/null || echo "")"
    [[ -z "$PAT_REF" ]] && { log "  ❌ No patient reference"; SKIP_COUNT=$((SKIP_COUNT + 1)); continue; }
    PAT_ID="${PAT_REF#Patient/}"

    PAT_JSON="$(curl "${C_FHIR[@]}" "${CMS_FHIR_BASE}/Patient/${PAT_ID}" 2>/dev/null)"
    debug_save "patient_${PAT_ID}.json" "$PAT_JSON"
    
    MRN="$(echo "$PAT_JSON" | jq -r '.identifier[0]?.value // .id // empty' 2>/dev/null | trim)"
    PNAME="$(echo "$PAT_JSON" | jq -r '.name[0]?.text // ([.name[0]?.given[0], .name[0]?.family]|map(select(.!=null))|join(" ")) // empty' 2>/dev/null | trim)"
    BIRTH="$(echo "$PAT_JSON" | jq -r '.birthDate // empty' 2>/dev/null | trim)"
    SEX_RAW="$(echo "$PAT_JSON" | jq -r '.gender // "O"' 2>/dev/null | trim)"
    SEX="$(printf %s "$SEX_RAW" | cut -c1 | tr '[:lower:]' '[:upper:]')"
    BIRTH_DCM=""; [[ -n "$BIRTH" ]] && BIRTH_DCM="$(printf %s "$BIRTH" | tr -d '-')"
    
    log "  Patient: MRN=${MRN}, Name=${PNAME}"

    # Get study metadata from scheduled SR
    STUDY_DESC="$(echo "$SCHED_SR_JSON" | jq -r '.code.text // empty' 2>/dev/null | trim)"
    REF_DOC="$(echo "$SCHED_SR_JSON" | jq -r '.requester.display // empty' 2>/dev/null | trim)"
    CLINICAL="$(echo "$SCHED_SR_JSON" | jq -r '.note[0]?.text // empty' 2>/dev/null | trim)"
    EXAM_DATE="$(echo "$SCHED_SR_JSON" | jq -r '.occurrenceDateTime // empty' 2>/dev/null | trim)"
    EXAM_DATE_DCM=""
    EXAM_TIME_DCM=""
    if [[ -n "$EXAM_DATE" ]]; then
      EXAM_DATE_DCM="$(echo "$EXAM_DATE" | cut -d'T' -f1 | tr -d '-')"
      if [[ "$EXAM_DATE" == *"T"* ]]; then
        EXAM_TIME_DCM="$(echo "$EXAM_DATE" | cut -d'T' -f2 | cut -d'.' -f1 | tr -d ':' | cut -c1-6)"
      fi
    fi

    ############################################
    # DICOM STUDY OPERATIONS
    ############################################
    log "  Searching DICOM for study..."
    
    # Query by accession only, not filtering by patient
    STUDY_SEARCH="$(qido_uid_by_accession "$BASE")"
    debug_save "study_search_${BASE}.json" "$STUDY_SEARCH"
    
    SRC_UID="$(echo "$STUDY_SEARCH" | jq -r '.[0]? | .["0020000D"]?.Value?[0] // empty' 2>/dev/null || echo "")"
    CURRENT_PATIENT_ID="$(echo "$STUDY_SEARCH" | jq -r '.[0]? | .["00100020"]?.Value?[0] // empty' 2>/dev/null || echo "")"
    CURRENT_ACCESSION="$(echo "$STUDY_SEARCH" | jq -r '.[0]? | .["00080050"]?.Value?[0] // empty' 2>/dev/null || echo "")"

    if [[ -z "$SRC_UID" ]]; then
      # Try with unscheduled accession as fallback
      log "  Trying unscheduled accession..."
      STUDY_SEARCH="$(qido_uid_by_accession "$U_ACC")"
      debug_save "study_search_${U_ACC}.json" "$STUDY_SEARCH"
      
      SRC_UID="$(echo "$STUDY_SEARCH" | jq -r '.[0]? | .["0020000D"]?.Value?[0] // empty' 2>/dev/null || echo "")"
      CURRENT_PATIENT_ID="$(echo "$STUDY_SEARCH" | jq -r '.[0]? | .["00100020"]?.Value?[0] // empty' 2>/dev/null || echo "")"
      CURRENT_ACCESSION="$(echo "$STUDY_SEARCH" | jq -r '.[0]? | .["00080050"]?.Value?[0] // empty' 2>/dev/null || echo "")"
    fi

    if [[ -z "$SRC_UID" ]]; then
      log "  ❌ Cannot find StudyInstanceUID in DICOM"
      SKIP_COUNT=$((SKIP_COUNT + 1))
      continue
    fi
    
    log "  ✓ Found Study UID: ${SRC_UID}"
    log "  Current: Patient=${CURRENT_PATIENT_ID}, Accession=${CURRENT_ACCESSION}"
    
    # Check if study needs to be moved to different patient
    if [[ "$CURRENT_PATIENT_ID" == "$MRN" ]]; then
      log "  ✓ Already correct patient, skipping MOVE"
    else
      log "  → Moving study to patient ${MRN}"
      q="PatientID=$(enc "$MRN")&PatientName=$(enc "$PNAME")&PatientSex=$(enc "$SEX")"
      [[ -n "$BIRTH_DCM" ]] && q="${q}&PatientBirthDate=$(enc "$BIRTH_DCM")"
      MOVE_URL="${CMS_DCM_QIDO}/studies/$(enc "$SRC_UID")/patient?${q}"
      
      code="$(curl "${C_JSON[@]}" "${AUTH[@]}" -X POST "$MOVE_URL" -o /dev/null -w '%{http_code}' 2>/dev/null)" || true
      log "  MOVE result: http=${code}"
      
      if [[ ! "$code" =~ ^(200|202|204|403)$ ]]; then
        log "  ❌ MOVE failed with code ${code}"
        SKIP_COUNT=$((SKIP_COUNT + 1))
        continue
      fi
    fi
    
    # Check if metadata needs updating
    if [[ "$CURRENT_ACCESSION" == "$BASE" ]]; then
      log "  ✓ Already correct accession"
    else
      log "  → Updating metadata"
      update_code="$(update_study_metadata "$SRC_UID" "$BASE" "$STUDY_DESC" "$EXAM_DATE_DCM" "$EXAM_TIME_DCM" "$REF_DOC" "$CLINICAL" "$MRN")"
      log "  UPDATE result: http=${update_code}"
    fi

    ############################################
    # FHIR OPERATIONS
    ############################################
    log "  Processing FHIR resources..."
    
    # Get Patient ID from FHIR for ImagingStudy update
    PATIENT_FHIR_RESPONSE="$(curl "${C_FHIR[@]}" "${CMS_FHIR_BASE}/Patient?identifier=${MRN}" 2>/dev/null)"
    debug_save "patient_search_${MRN}.json" "$PATIENT_FHIR_RESPONSE"
    
    PATIENT_FHIR_ID="$(echo "$PATIENT_FHIR_RESPONSE" | jq -r '.entry[0]?.resource.id // empty' 2>/dev/null || echo "")"
    
    if [[ -z "$PATIENT_FHIR_ID" ]]; then
      PATIENT_FHIR_ID="$PAT_ID"
      log "  Using Patient ID from ServiceRequest: ${PATIENT_FHIR_ID}"
    fi

    ##########################################
    # IMAGING STUDY - ID agnostic approach with proper sequencing
    ##########################################
    log "  Looking for ImagingStudy..."
    
    # URL encode accession numbers to handle spaces and special characters
    U_ACC_ENC="$(enc "$U_ACC")"
    BASE_ENC="$(enc "$BASE")"
    
    # Search using simple identifier parameter (searches across all identifier systems)
    IS_SEARCH_UNSCHED="$(curl "${C_FHIR[@]}" "${CMS_FHIR_BASE}/ImagingStudy?identifier=${U_ACC_ENC}" 2>/dev/null)"
    debug_save "is_search_unsched_${U_ACC}.json" "$IS_SEARCH_UNSCHED"
    IS_ID_UNSCHED="$(echo "$IS_SEARCH_UNSCHED" | jq -r '.entry[0]?.resource.id // empty' 2>/dev/null || echo "")"
    
    if [[ -n "$IS_ID_UNSCHED" ]]; then
      log "  ✓ Found ImagingStudy/${IS_ID_UNSCHED} with unscheduled accession"
      
      # Get the full existing ImagingStudy to preserve all data
      IS_JSON="$(curl "${C_FHIR[@]}" "${CMS_FHIR_BASE}/ImagingStudy/${IS_ID_UNSCHED}" 2>/dev/null)"
      debug_save "is_unsched_full_${IS_ID_UNSCHED}.json" "$IS_JSON"
      
      # Prepare new ImagingStudy with base accession as ID, preserving ALL data from old one
      log "  → Preparing new ImagingStudy JSON..."
      NEW_IS="$(echo "$IS_JSON" | jq --arg newId "$BASE" \
                                      --arg acc "$BASE" \
                                      --arg patRef "Patient/${PATIENT_FHIR_ID}" \
                                      --arg sys "$CMS_ACC_SYSTEM" \
                                      --arg studyIdSys "http://hospital.smarthealth.org/study-id" \
        '. |
        .id = $newId |
        .status = "available" |
        .subject.reference = $patRef |
        .identifier = (
          [{system: $sys, value: $acc}] +
          ([.identifier[]? | select(.system == $studyIdSys)] // [])
        ) |
        del(.meta, .text)' 2>&1)"
      
      jq_exit=$?
      debug_save "is_new_prepared_${BASE}.json" "$NEW_IS"
      
      # Check if jq command succeeded
      if [[ $jq_exit -ne 0 ]]; then
        log "  ❌ jq command failed with exit code: $jq_exit"
        log "  Error output: $NEW_IS"
        SKIP_COUNT=$((SKIP_COUNT + 1))
        continue
      fi
      
      # Validate that we have valid JSON
      if ! echo "$NEW_IS" | jq -e 'type == "object" and .resourceType == "ImagingStudy"' >/dev/null 2>&1; then
        log "  ❌ Failed to prepare valid ImagingStudy JSON"
        log "  Debug: Check ${CMS_DEBUG_DIR}/is_new_prepared_${BASE}.json"
        SKIP_COUNT=$((SKIP_COUNT + 1))
        continue
      fi
      
      log "  ✓ Prepared new ImagingStudy data with ID=${BASE}"
      
      # CRITICAL: Delete the unscheduled ImagingStudy FIRST to avoid Study UID conflict
      log "  → Deleting old ImagingStudy/${IS_ID_UNSCHED} (to free Study UID)"
      is_del_code="$(fhir_delete_with_etag "${CMS_FHIR_BASE}/ImagingStudy/${IS_ID_UNSCHED}")"
      log "  DELETE result: http=${is_del_code}"
      
      if [[ "$is_del_code" =~ ^(200|204)$ ]]; then
        # Now create new ImagingStudy with base accession as ID after deletion
        log "  → Creating new ImagingStudy/${BASE}"
        is_create_code="$(curl "${C_FHIR[@]}" -X PUT "${CMS_FHIR_BASE}/ImagingStudy/${BASE}" \
          -H "Content-Type: application/fhir+json" \
          -d "$NEW_IS" \
          -o /dev/null -w '%{http_code}' 2>/dev/null)" || true
        log "  CREATE result: http=${is_create_code}"
        
        if [[ ! "$is_create_code" =~ ^(200|201)$ ]]; then
          log "  ❌ Failed to create new ImagingStudy after deletion (code=${is_create_code})"
          log "  ⚠️  Data loss: original ImagingStudy deleted but new one not created"
          log "  ⚠️  Backup stored in: ${CMS_DEBUG_DIR}/is_new_prepared_${BASE}.json"
        else
          log "  ✅ Successfully migrated ImagingStudy from ${IS_ID_UNSCHED} to ${BASE}"
        fi
      else
        log "  ⚠️  Failed to delete unscheduled ImagingStudy (code=${is_del_code}), skipping creation"
      fi
      
    else
      # No unscheduled ImagingStudy found, check if base already exists
      log "  No unscheduled ImagingStudy, checking for base..."
      IS_SEARCH_BASE="$(curl "${C_FHIR[@]}" "${CMS_FHIR_BASE}/ImagingStudy?identifier=${BASE_ENC}" 2>/dev/null)"
      debug_save "is_search_base_${BASE}.json" "$IS_SEARCH_BASE"
      IS_ID_BASE="$(echo "$IS_SEARCH_BASE" | jq -r '.entry[0]?.resource.id // empty' 2>/dev/null || echo "")"
      
      if [[ -n "$IS_ID_BASE" ]]; then
        log "  ✓ Found existing ImagingStudy/${IS_ID_BASE}"
        IS_JSON="$(curl "${C_FHIR[@]}" "${CMS_FHIR_BASE}/ImagingStudy/${IS_ID_BASE}" 2>/dev/null)"
        debug_save "is_base_${IS_ID_BASE}.json" "$IS_JSON"
        
        # Just update status to available and patient reference
        UPDATED_IS="$(echo "$IS_JSON" | jq --arg patRef "Patient/${PATIENT_FHIR_ID}" '
          .status = "available" |
          .subject.reference = $patRef
        ' 2>/dev/null || echo '{}')"
        
        log "  → Updating ImagingStudy"
        is_update_code="$(curl "${C_FHIR[@]}" -X PUT "${CMS_FHIR_BASE}/ImagingStudy/${IS_ID_BASE}" \
          -H "Content-Type: application/fhir+json" \
          -d "$UPDATED_IS" \
          -o /dev/null -w '%{http_code}' 2>/dev/null)" || true
        log "  UPDATE result: http=${is_update_code}"
      else
        log "  ⚠️  No ImagingStudy found (neither unscheduled nor base)"
      fi
    fi

    # Try to complete MWL if procedure exists
    log "  Checking for Procedure..."
    PROC_JSON="$(curl -sS -L --http1.1 --compressed "${CMS_FHIR_BASE}/Procedure/${BASE}" 2>/dev/null || true)"
    debug_save "procedure_${BASE}.json" "$PROC_JSON"
    
    if [[ -n "$PROC_JSON" ]] && echo "$PROC_JSON" | jq -e '.resourceType=="Procedure"' >/dev/null 2>&1; then
      SPS_ID="$(echo "$PROC_JSON" | jq -r --arg sys "$CMS_SPS_SYSTEM" '.identifier[]? | select(.system==$sys) | .value // empty' 2>/dev/null | head -1)"
      STUDY225="$(echo "$PROC_JSON" | jq -r --arg sys "$CMS_STUDYID_SYSTEM" '.identifier[]? | select(.system==$sys) | .value // empty' 2>/dev/null | head -1)"
      if [[ -n "$SPS_ID" && -n "$STUDY225" ]]; then
        log "  → Completing MWL"
        mwl_code="$(mwl_complete "$STUDY225" "$SPS_ID")"
        log "  MWL result: http=${mwl_code}"
      fi
    fi

    ##########################################
    # FHIR CLEANUP
    ##########################################
    log "  Cleaning up unscheduled resources..."
    
    # Delete unscheduled Procedure
    proc_del_code="$(fhir_delete_with_etag "${CMS_FHIR_BASE}/Procedure/${U_ACC}")"
    [[ "$proc_del_code" =~ ^(200|204|404)$ ]] && log "  DEL Procedure: http=${proc_del_code}"

    # Delete unscheduled ServiceRequest
    SR_DEL_CODE="$(fhir_delete_with_etag "${CMS_FHIR_BASE}/ServiceRequest/${U_ACC}")"
    log "  DEL ServiceRequest: http=${SR_DEL_CODE}"
    
    # Delete linked resources
    SR_REF="ServiceRequest/${U_ACC}"
    SR_REF_ENC="$(enc "$SR_REF")"

    # Delete Observations
    OBS_SEARCH="$(curl -sS -L --http1.1 --compressed "${CMS_FHIR_BASE}/Observation?based-on=${SR_REF_ENC}" 2>/dev/null || echo '{}')"
    mapfile -t OBS_IDS < <(echo "$OBS_SEARCH" | jq -r '.entry[]?.resource.id' 2>/dev/null || echo "")
    for id in "${OBS_IDS[@]:-}"; do
      [[ -z "$id" ]] && continue
      fhir_delete_with_etag "${CMS_FHIR_BASE}/Observation/${id}" >/dev/null
    done

    # Delete DiagnosticReports
    DR_SEARCH="$(curl -sS -L --http1.1 --compressed "${CMS_FHIR_BASE}/DiagnosticReport?based-on=${SR_REF_ENC}" 2>/dev/null || echo '{}')"
    mapfile -t DR_IDS < <(echo "$DR_SEARCH" | jq -r '.entry[]?.resource.id' 2>/dev/null || echo "")
    for id in "${DR_IDS[@]:-}"; do
      [[ -z "$id" ]] && continue
      fhir_delete_with_etag "${CMS_FHIR_BASE}/DiagnosticReport/${id}" >/dev/null
    done

    # Delete Media
    MEDIA_SEARCH="$(curl -sS -L --http1.1 --compressed "${CMS_FHIR_BASE}/Media?based-on=${SR_REF_ENC}" 2>/dev/null || echo '{}')"
    mapfile -t MEDIA_IDS < <(echo "$MEDIA_SEARCH" | jq -r '.entry[]?.resource.id' 2>/dev/null || echo "")
    for id in "${MEDIA_IDS[@]:-}"; do
      [[ -z "$id" ]] && continue
      fhir_delete_with_etag "${CMS_FHIR_BASE}/Media/${id}" >/dev/null
    done
    
    if [[ "$SR_DEL_CODE" =~ ^(200|204)$ ]]; then
      log "✅ Successfully synchronized: ${U_ACC} → ${BASE}"
      audit "$U_ACC" "$BASE" "complete" "200" "success" "synchronized"
      SYNC_COUNT=$((SYNC_COUNT + 1))
    else
      log "⚠️  Partial sync (some operations may have failed)"
      audit "$U_ACC" "$BASE" "partial" "$SR_DEL_CODE" "partial" "check_logs"
      SYNC_COUNT=$((SYNC_COUNT + 1))
    fi
    
    echo
  done

  ############################################
  # Summary
  ############################################
  log "========================================="
  log "SYNCHRONIZATION COMPLETE"
  log "  Synchronized: ${SYNC_COUNT} pairs"
  log "  Skipped: ${SKIP_COUNT} pairs"
  log "  Audit log: ${CMS_AUDIT}"
  log "  Full log: ${CMS_LOG_FILE}"
  log "  Debug files: ${CMS_DEBUG_DIR}"
  log "========================================="

}





