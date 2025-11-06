require("dotenv").config();

const env = {
  // SSH
  SSH_HOST: process.env.SSH_HOST,
  SSH_PORT: parseInt(process.env.SSH_PORT, 10) || 22,
  SSH_USER: process.env.SSH_USER,
  SSH_PASSWORD: process.env.SSH_PASSWORD,

  // Image Version
  RIS_IMAGE_VERSION: process.env.RIS_IMAGE_VERSION,
  BLUE_HALO_IMAGE_VERSION: process.env.BLUE_HALO_IMAGE_VERSION,
  OHIF_IMAGE_VERSION: process.env.OHIF_IMAGE_VERSION,

  // Yaml Files
  RIS_YAML_FILE: process.env.RIS_YAML_FILE,
  BLUE_HALO_YAML_FILE: process.env.BLUE_HALO_YAML_FILE,
  OHIF_YAML_FILE: process.env.OHIF_YAML_FILE,

  // Supabase / PostgreSQL
  SUPABASE_HOST: process.env.SUPABASE_HOST,
  SUPABASE_PORT: parseInt(process.env.SUPABASE_PORT, 10) || 5432,
  SUPABASE_DATABASE: process.env.SUPABASE_DATABASE,
  SUPABASE_USER: process.env.SUPABASE_USER,
  SUPABASE_PASSWORD: process.env.SUPABASE_PASSWORD,

  // Mirth
  MIRTH_HOST: process.env.MIRTH_HOST,
  MIRTH_PORT: process.env.MIRTH_PORT,
  MIRTH_USERNAME: process.env.MIRTH_USERNAME,
  MIRTH_PASSWORD: process.env.MIRTH_PASSWORD,

  // Mirth Endpoint URLs (from env)
  KEYCLOAK_LOGIN: process.env.KEYCLOAK_LOGIN,
  CHECK_MWL_EXIST: process.env.CHECK_MWL_EXIST,
  CHECK_PATIENT_EXIST: process.env.CHECK_PATIENT_EXIST,
  PATIENT_HTTP_SENDER: process.env.PATIENT_HTTP_SENDER,
  CHANGESTATUS_MWL: process.env.CHANGESTATUS_MWL,
  CHECK_SERVICE_REQUEST_EXIST: process.env.CHECK_SERVICE_REQUEST_EXIST,
  CHECK_STUDY_EXIST_IN_FHIR: process.env.CHECK_STUDY_EXIST_IN_FHIR,
  PATCH_END_EXAM_SUPABASE: process.env.PATCH_END_EXAM_SUPABASE,
  GET_STUDY_MODALITY: process.env.GET_STUDY_MODALITY,
  IMAGINGSTUDY_HTTP_SENDER: process.env.IMAGINGSTUDY_HTTP_SENDER,
  SERVICE_REQUEST_HTTP_SENDER: process.env.SERVICE_REQUEST_HTTP_SENDER,
  PROCEDURE_HTTP_SENDER: process.env.PROCEDURE_HTTP_SENDER,
  SEND_AUDIT_LOG: process.env.SEND_AUDIT_LOG,
  SEND_AUDIT_TRAIL: process.env.SEND_AUDIT_TRAIL,
  KEYCLOAK_PASSWORD: process.env.KEYCLOAK_PASSWORD,
  // ... (add all others)
};

// Validate required env vars (optional but recommended)
const required = ["SSH_HOST", "SSH_USER", "SUPABASE_HOST", "MIRTH_HOST"];
for (const key of required) {
  if (!env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

module.exports = env;
