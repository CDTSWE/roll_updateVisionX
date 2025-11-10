#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { URLSearchParams } = require('url');

// =================== CONFIG ===================
const HOST = process.env.HOST || 'http://10.0.0.11/dcm4chee-arc';
const AET = process.env.AET || 'DCM4CHEE';
const CANON = process.env.CANON || 'elvasoft'; // Canonical issuer
const LIMIT = 200;
const DRY_RUN = (process.env.DRY_RUN || 'false').toLowerCase() === 'true';

// --- Auth Config ---
// Can be 'bearer', 'basic', or 'none'
const AUTH_TYPE = process.env.AUTH_TYPE || 'bearer';
// Token can be passed directly via env
let BEARER_TOKEN = process.env.BEARER_TOKEN || ''; 
const BASIC_USER = process.env.BASIC_USER || '';
const BASIC_PASS = process.env.BASIC_PASS || '';

// --- Token Retrieval Config (if AUTH_TYPE is 'bearer' and no token is provided) ---
const TOKEN_URL = process.env.TOKEN_URL || 'http://10.0.0.11/elvasoft/ksf/realms/dcm4che/protocol/openid-connect/token';
const TOKEN_CLIENT_ID = process.env.TOKEN_CLIENT_ID || 'dcm4chee-arc-ui';
const TOKEN_CLIENT_SECRET = process.env.TOKEN_CLIENT_SECRET || 'changeit';
const TOKEN_USERNAME = process.env.TOKEN_USERNAME || 'admin';
const TOKEN_PASSWORD = process.env.TOKEN_PASSWORD || 'changeit';
const TOKEN_SCOPE = process.env.TOKEN_SCOPE || 'openid';

// --- Other Config ---
// Set to true to allow self-signed certs (equiv. to curl -k)
const NODE_TLS_REJECT_UNAUTHORIZED = (process.env.CURL_INSECURE || 'false').toLowerCase() === 'true' ? '0' : '1';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = NODE_TLS_REJECT_UNAUTHORIZED;

// ================ INTERNALS ===================
const ts = new Date().toISOString().replace(/[-:.]/g, '').replace('T', '_').substring(0, 15);
const LOG_DIR = path.join(__dirname, `merge_logs_${ts}`);
const OPS_CSV = path.join(LOG_DIR, 'merged_ops.csv');

// Global Axios instance for QIDO/merge calls
const api = axios.create();

/**
 * Fetches the OIDC token if required.
 */
async function getToken() {
  console.log('Attempting to fetch auth token...');
  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('client_secret', TOKEN_CLIENT_SECRET);
    params.append('client_id', TOKEN_CLIENT_ID);
    params.append('username', TOKEN_USERNAME);
    params.append('password', TOKEN_PASSWORD);
    params.append('scope', TOKEN_SCOPE);

    const response = await axios.post(TOKEN_URL, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    
    const token = response.data?.access_token;
    if (!token) {
      throw new Error('access_token not found in response');
    }
    console.log(`Token fetched successfully: ${token.substring(0, 20)}...`);
    return token;
  } catch (err) {
    console.error('ERROR: Failed to fetch auth token.', err.response?.data || err.message);
    throw err;
  }
}

/**
 * Configures the global axios instance with auth headers.
 */
async function setupAuth() {
  if (AUTH_TYPE === 'bearer' && !BEARER_TOKEN) {
    BEARER_TOKEN = await getToken();
  }

  switch (AUTH_TYPE) {
    case 'bearer':
      api.defaults.headers.common['Authorization'] = `Bearer ${BEARER_TOKEN}`;
      break;
    case 'basic':
      const basicToken = Buffer.from(`${BASIC_USER}:${BASIC_PASS}`).toString('base64');
      api.defaults.headers.common['Authorization'] = `Basic ${basicToken}`;
      break;
    case 'none':
      // No auth needed
      break;
    default:
      throw new Error(`AUTH_TYPE must be bearer|basic|none, got: ${AUTH_TYPE}`);
  }
}

/**
 * URL-encodes a string.
 */
function urlencode(str) {
  return encodeURIComponent(str);
}

/**
 * Fetches a single page of patients.
 */
async function qidoPatientsPage(offset) {
  const url = `${HOST}/aets/${AET}/rs/patients?includefield=all&offset=${offset}&limit=${LIMIT}`;
  const response = await api.get(url);
  return response.data;
}

/**
 * Picks the best demographic data for a given PatientID.
 * Prefers data from the canonical issuer, otherwise from the most recent study.
 */
async function pickDemoForPid(pid) {
  const pidEnc = urlencode(pid);

  // 1. Try to get demo from existing canonical patient record
  try {
    const patUrl = `${HOST}/aets/${AET}/rs/patients?00100020=${pidEnc}&includefield=all`;
    const patResponse = await api.get(patUrl);
    const patients = patResponse.data;

    if (Array.isArray(patients)) {
      const canonicalPat = patients.find(p => p['00100021']?.Value[0] === CANON);
      if (canonicalPat) {
        const name = canonicalPat['00100010']?.Value[0]?.Alphabetic ?? '';
        const dob = canonicalPat['00100030']?.Value[0] ?? '';
        const sex = canonicalPat['00100040']?.Value[0] ?? '';
        if (name || dob || sex) {
          return { name, dob, sex };
        }
      }
    }
  } catch (err) {
    console.warn(`Warning: Could not fetch patient records for ${pid}`, err.message);
  }

  // 2. If not found, get demo from the most recent study
  try {
    const studyUrl = `${HOST}/aets/${AET}/rs/studies?00100020=${pidEnc}&includefield=all`;
    const studyResponse = await api.get(studyUrl);
    const studies = studyResponse.data;

    if (!Array.isArray(studies) || studies.length === 0) {
      return { name: '', dob: '', sex: '' }; // No studies, return empty
    }

    const getDtKey = (study) => {
      const d = study['00080020']?.Value[0] ?? ''; // Study Date
      const t = study['00080030']?.Value[0] ?? ''; // Study Time
      return `${d}T${t}`;
    };

    const mappedStudies = studies.map(study => ({
      k: getDtKey(study),
      n: study['00100010']?.Value[0]?.Alphabetic ?? '',
      d: study['00100030']?.Value[0] ?? '',
      s: study['00100040']?.Value[0] ?? '',
    }));

    mappedStudies.sort((a, b) => b.k.localeCompare(a.k)); // Sort descending by datetime

    const latest = mappedStudies[0] ?? {};
    return {
      name: latest.n ?? '',
      dob: latest.d ?? '',
      sex: latest.s ?? '',
    };

  } catch (err) {
    console.warn(`Warning: Could not fetch studies for ${pid}`, err.message);
    return { name: '', dob: '', sex: '' };
  }
}

/**
 * Builds the DICOM+JSON merge payload.
 */
function buildPayload(pid, name, dob, sex) {
  const payload = {
    '00100020': { vr: 'LO', Value: [pid] },
    '00100021': { vr: 'LO', Value: [CANON] },
  };
  if (name) {
    payload['00100010'] = { vr: 'PN', Value: [{ Alphabetic: name }] };
  }
  if (dob) {
    payload['00100030'] = { vr: 'DA', Value: [dob] };
  }
  if (sex) {
    payload['00100040'] = { vr: 'CS', Value: [sex] };
  }
  // The API expects an array containing this one object
  return [payload];
}

/**
 * Performs the merge operation (or simulates if DRY_RUN).
 */
async function doMerge(pid, srcIssuer, payload) {
  let url;
  const pathPid = urlencode(pid);
  const srcIssuerStr = srcIssuer || '<empty>';
  
  if (!srcIssuer) {
    url = `${HOST}/aets/${AET}/rs/patients/${pathPid}?merge=true`;
  } else {
    const pathIss = urlencode(srcIssuer);
    url = `${HOST}/aets/${AET}/rs/patients/${pathPid}^^^${pathIss}?merge=true`;
  }

  const now = new Date().toISOString();
  
  if (DRY_RUN) {
    console.log(`[DRY] PUT ${url}`);
    console.log(`[DRY] DATA: ${JSON.stringify(payload)}`);
    const logLine = `${now},${pid},${srcIssuerStr},${CANON},merge,DRY_RUN\n`;
    fs.appendFileSync(OPS_CSV, logLine);
    return;
  }

  try {
    const response = await api.put(url, payload, {
      headers: { 'Content-Type': 'application/dicom+json' },
    });
    
    // Success (2xx status)
    const logLine = `${now},${pid},${srcIssuerStr},${CANON},merge,${response.status}\n`;
    fs.appendFileSync(OPS_CSV, logLine);

  } catch (err) {
    // Failure (non-2xx status)
    const httpCode = err.response?.status || 'ERR_NO_RESPONSE';
    const body = err.response?.data || err.message;
    console.warn(`WARN: merge failed for ${pid} ${srcIssuerStr} -> ${CANON}, HTTP ${httpCode}`);
    
    const logLine = `${now},${pid},${srcIssuerStr},${CANON},merge,ERR_${httpCode}\n`;
    fs.appendFileSync(OPS_CSV, logLine);
    
    const errLogFile = path.join(LOG_DIR, `err_${pid}_${srcIssuer || 'EMPTY'}_${now.replace(/:/g, '-')}.log`);
    fs.writeFileSync(errLogFile, typeof body === 'object' ? JSON.stringify(body, null, 2) : String(body));
  }
}

/**
 * Main execution function.
 */
async function main() {
  await setupAuth();

  // Setup logging
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const csvHeader = 'timestamp,patient_id,src_issuer,target_issuer,action,result\n';
  fs.writeFileSync(OPS_CSV, csvHeader);
  console.log(`Logging operations to: ${OPS_CSV}`);

  // --- 1. Build PatientID -> Issuers map ---
  console.log('Building PatientID -> issuers map...');
  const pidIssuersMap = new Map();
  const seen = new Set(); // To avoid processing the same PID|Issuer pair twice
  let offset = 0;

  while (true) {
    let pageJson;
    try {
      pageJson = await qidoPatientsPage(offset);
    } catch (err) {
      console.error(`ERROR: Failed to fetch patient page at offset ${offset}.`, err.response?.data || err.message);
      break;
    }

    if (!Array.isArray(pageJson)) {
      console.warn(`Expected array from QIDO, got: ${typeof pageJson}. Stopping pagination.`);
      break;
    }
    
    if (pageJson.length === 0) {
      console.log('No more patients found.');
      break; // All pages processed
    }
    
    console.log(`Processing ${pageJson.length} patients from offset ${offset}...`);

    for (const patient of pageJson) {
      try {
        const pid = patient['00100020']?.Value[0];
        const issuer = patient['00100021']?.Value[0] ?? ''; // Use empty string for null/undefined issuer

        if (!pid) continue;

        const key = `${pid}|${issuer}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (!pidIssuersMap.has(pid)) {
          pidIssuersMap.set(pid, new Set());
        }
        pidIssuersMap.get(pid).add(issuer);
        
      } catch (e) {
        console.warn('Skipping malformed patient record:', patient);
      }
    }
    offset += LIMIT;
  }
  
  console.log(`Found ${pidIssuersMap.size} unique PatientIDs.`);

  // --- 2. Merge per PID into canonical issuer ---
  console.log(`Merging per PID into canonical issuer ${CANON}...`);

  for (const [pid, issuersSet] of pidIssuersMap.entries()) {
    const issuers = Array.from(issuersSet);

    // If already only canonical, skip
    if (issuers.length === 1 && issuers[0] === CANON) {
      continue;
    }

    console.log(`Processing PID ${pid} with issuers: [${issuers.join(', ')}]`);

    // Choose a seed issuer (prefer canonical if present)
    let seed = issuers.find(iss => iss === CANON);
    if (!seed) {
      // Find any non-canonical, non-empty, non-DCM4CHEE.null.null issuer as seed
      seed = issuers.find(iss => iss && iss !== CANON && iss !== 'DCM4CHEE.null.null');
    }
    // If still no seed, use the first available (which might be empty string)
    if (seed === undefined) {
      seed = issuers[0];
    }

    // Prepare demographics payload
    const demo = await pickDemoForPid(pid);
    const payload = buildPayload(pid, demo.name, demo.dob, demo.sex);

    // 1) If seed != canonical, merge seed -> canonical first (to establish canonical row)
    if (seed !== CANON) {
      console.log(`  Merging seed '${seed || '<empty>'}' -> ${CANON}`);
      await doMerge(pid, seed, payload);
    }

    // 2) Merge every other variant (including empty) into canonical
    for (const iss of issuers) {
      // Skip the seed (if it wasn't canonical) since we just merged it
      if (iss === seed && seed !== CANON) continue;
      // Skip the canonical issuer itself
      if (iss === CANON) continue;
      
      console.log(`  Merging variant '${iss || '<empty>'}' -> ${CANON}`);
      await doMerge(pid, iss, payload);
    }
  }

  console.log(`Done. Log: ${OPS_CSV}`);
}

// Run the script
main().catch(err => {
  console.error('An unhandled error occurred:', err.message);
  process.exit(1);
});