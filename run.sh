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

export RIS_IMAGE_VERSION="image: kalbedevops.azurecr.io/elvasoft-ris:0.11.3"
export BLUE_HALO_IMAGE_VERSION="image: kalbedevops.azurecr.io/vision/blue-halo:0.1.7"
export OHIF_IMAGE_VERSION="image: kalbedevops.azurecr.io/visionx-ohif:3.9.3.25-unsecured"

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
  read -p "✅ Selesai! Tekan Enter untuk keluar..."
}

update_image
