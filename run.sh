#!/bin/bash
set -euo pipefail

############################################
# CONFIG
############################################

# SUPABASE CONFIGURATION
export SUPABASE_HOST="localhost"
export SUPABASE_PORT=5432
export SUPABASE_DATABASE="postgres"
export SUPABASE_USER="postgres.your-tenant-id"
export SUPABASE_PASSWORD="your-super-secret-and-long-postgres-password"

# SSH CONFIGURATION
export SSH_HOST="70.153.25.44"
export SSH_PORT=22
export SSH_USER="elvasoftk3s"
export SSH_PASSWORD="3lvas0ftK3S!"

export RIS_IMAGE_VERSION="image: kalbedevops.azurecr.io/elvasoft-ris:"
export BLUE_HALO_IMAGE_VERSION="image: kalbedevops.azurecr.io/vision/blue-halo:"
export OHIF_IMAGE_VERSION="image: kalbedevops.azurecr.io/visionx-ohif:"

export RIS_YAML_FILE="06-ris.yaml"
export BLUE_HALO_YAML_FILE="07-blue-halo.yaml"
export OHIF_YAML_FILE="05-ohif.yaml"

# MIRTH CONFIGURATION
export MIRTH_HOST="https://localhost"
export MIRTH_PORT=8448
export MIRTH_USERNAME="admin"
export MIRTH_PASSWORD="demo"

# DESTINATION CONNECTOR
export KEYCLOAK_LOGIN="http://10.0.0.11/elvasoft/ksf/realms/dcm4che/protocol/openid-connect/token"
export CHECK_MWL_EXIST="http://10.0.0.11/dcm4chee-arc/aets/WORKLIST/rs/mwlitems"
export CHECK_PATIENT_EXIST="http://10.0.0.11/elvasoft/fhir/4_0_0/Patient"
export PATIENT_HTTP_SENDER="http://10.0.0.11/elvasoft/fhir/4_0_0/Patient/\${patientID}"
export CHANGESTATUS_MWL="http://10.0.0.11/dcm4chee-arc/aets/WORKLIST/rs/mwlitems/\${StudyMwl}/\${spsID}/status/COMPLETED"
export CHECK_SERVICE_REQUEST_EXIST="http://10.0.0.11/elvasoft/fhir/4_0_0/ServiceRequest"
export CHECK_STUDY_EXIST_IN_FHIR="http://10.0.0.11/elvasoft/fhir/4_0_0/ImagingStudy"
export PATCH_END_EXAM_SUPABASE="http://10.0.0.11/elvasoft/base/rest/v1/performance"
export GET_STUDY_MODALITY="http://10.0.0.11/dcm4chee-arc/aets/DCM4CHEE/rs/studies"
export IMAGINGSTUDY_HTTP_SENDER="http://10.0.0.11/elvasoft/fhir/4_0_0/ImagingStudy/\${UpdatedAccessionNumber}"
export SERVICE_REQUEST_HTTP_SENDER="http://10.0.0.11/elvasoft/fhir/4_0_0/ServiceRequest/\${UpdatedAccessionNumber}"
export PROCEDURE_HTTP_SENDER="http://10.0.0.11/elvasoft/fhir/4_0_0/Procedure/\${UpdatedAccessionNumber}"
export SEND_AUDIT_LOG="http://10.0.0.11/elvasoft/base/rest/v1/audit_log"
export SEND_AUDIT_TRAIL="http://10.0.0.11/elvasoft/base/rest/v1/audit_trail"

# KEYCLOAK PASSWORD
export KEYCLOAK_PASSWORD="yobaru"


# --- 1. Config Supabase API (PostgREST) ---
export SUPABASE_URL="https://database.digital-lab.ai/supabase"

# INI PENTING: Dapatkan dari Supabase Dashboard atau file .env Anda
export SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q"
# --- 2. Config dcm4chee ---
export DCM_BASE="https://dicom-admin.digital-lab.ai/dcm4chee-arc/aets"
export DCM_AET="DCM4CHEE"
export DCM_QIDO="${DCM_BASE}/${DCM_AET}/rs"

# --- 3. Config Login Keycloak (Lengkapi) ---
export KC_TOKEN_URL="https://iam.digital-lab.ai/keycloak/realms/dcm4che/protocol/openid-connect/token"
export KC_CLIENT_ID="dcm4chee-arc-ui"
export KC_CLIENT_SECRET="changeit"
export KC_USERNAME="admin"
export KC_PASSWORD="Password123!"

export DRY_RUN="false"

# ############################################
# ############################################


update_image() {
  if ! command -v node &> /dev/null; then
      echo "❌ Node.js not installed. Please install Node.js first."
      exit 1
  fi

  if ! command -v npm &> /dev/null; then
      echo "❌ NPM not installed. Please install NPM first."
      exit 1
  fi

  echo "📦 Installing dependencies..."
  npm install || { echo "❌ npm install failed"; exit 1; }

  echo "🚀 Running script..."
  npm start

  echo ""
  echo "✅ Skrip utama selesai."
  echo ""
  echo "============================================="
  echo "🔄 2. Menjalankan Recount Number of Instances (Clean up)..."
  echo "============================================="

  RECOUNT_SCRIPT="./scripts/clean_data/recount_instances.js"

  if [ -f "$RECOUNT_SCRIPT" ]; then
    # node "$RECOUNT_SCRIPT"
    
    if [ $? -eq 0 ]; then
      echo "✅ Selesai Recount."
    else
      echo "⚠️  PERINGATAN: Skrip recount gagal. Cek log di atas."
    fi
  else
    echo "⚠️  PERINGATAN: Skrip ${RECOUNT_SCRIPT} tidak ditemukan. Melewatkan..."
  fi
  
  echo ""
  read -p "✅ Semua proses selesai! Tekan Enter untuk keluar..."
}

update_image
