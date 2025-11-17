const {
    SUPABASE_URL,
    SUPABASE_KEY,
    DCM_QIDO,
    KC_TOKEN_URL,
    KC_CLIENT_ID,
    KC_CLIENT_SECRET,
    KC_USERNAME,
    KC_PASSWORD
} = process.env;

// Tentukan mode Dry Run (default ke 'true' jika tidak diset)
const DRY_RUN = (process.env.DRY_RUN || 'true') === 'true';

// Helper logging
const consoleUtils = require('../utils/consoleUtils');
const log = (msg) => consoleUtils.info(`[${new Date().toISOString()}] ${msg}`);

/**
 * Helper untuk mencari Study Instance UID di dalam JSON
 */
function findStudyInstanceUID(identifierArray) {
    if (!Array.isArray(identifierArray) || identifierArray.length === 0) {
        return null;
    }
    // Cari objek yang 'system'-nya mengandung '/study-id'
    const studyIdObj = identifierArray.find(
        item => item.system && item.system.endsWith('/study-id')
    );
    return studyIdObj ? studyIdObj.value : null;
}

/**
 * Mendapatkan Access Token dari Keycloak
 */
async function getKeycloakToken() {
    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'password');
        params.append('client_id', KC_CLIENT_ID);
        params.append('username', KC_USERNAME);
        params.append('password', KC_PASSWORD);
        params.append('scope', 'openid');
        params.append('client_secret', KC_CLIENT_SECRET);

        const response = await fetch(KC_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        });

        if (!response.ok) {
            const errorText = await response.text(); // Ambil detail error
            throw new Error(`Gagal login Keycloak: ${response.statusText} - ${errorText}`);
        }
        const data = await response.json();
        return data.access_token;
    } catch (error) {
        log(`❌ ERROR getKeycloakToken: ${error.message}`);
        return null;
    }
}

/**
 * Mengambil semua studi dari Supabase
 */
async function getSupabaseStudies() {
    // Ambil id, numberOfInstances, dan identifier
    const url = `${SUPABASE_URL}/rest/v1/imagingStudy?select=id,"numberOfInstances",identifier`;
    
    const response = await fetch(url, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Accept': 'application/json',
            'Range': '0-999'
        }
    });

    if (!response.ok) {
        throw new Error(`Gagal mengambil data Supabase: ${response.statusText}`);
    }
    return response.json();
}

/**
 * Mengambil count instances dari dcm4chee
 */
async function getDcmCount(studyUid, token) {
    // [STUDY UID QUERY]: Menggunakan tag StudyInstanceUID (DICOM Tag 0020000D)
    const url = `${DCM_QIDO}/studies?StudyInstanceUID=${encodeURIComponent(studyUid)}&includedefaults=false&includefield=00201208`;
    
    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/dicom+json'
            }
        });

        if (!response.ok) {
            log(`  [INFO] dcm4chee merespons ${response.status} untuk UID ${studyUid}. Diasumsikan 0.`);
            return 0;
        }

        const responseText = await response.text();
        if (!responseText || responseText.trim() === "") {
            log(`  [INFO] dcm4chee mengembalikan respons kosong untuk UID ${studyUid}. Diasumsikan 0.`);
            return 0;
        }

        let data;
        try {
            data = JSON.parse(responseText);
        } catch (jsonError) {
            log(`  [ERROR] Gagal parse JSON dari dcm4chee untuk ${studyUid}. Error: ${jsonError.message}`);
            return "error";
        }
        
        const count = data?.[0]?.['00201208']?.Value?.[0] || 0;
        return parseInt(count, 10);

    } catch (error) {
        log(`  [ERROR] Gagal fetch dcm_count (network) untuk ${studyUid}: ${error.message}`);
        return "error";
    }
}

/**
 * Mengupdate count di Supabase
 */
async function updateSupabaseCount(studyUid, newCount) {
    const url = `${SUPABASE_URL}/rest/v1/imagingStudy?id=eq.${encodeURIComponent(studyUid)}`;
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ "numberOfInstances": newCount })
    });

    return response.status; // 200/204 berarti sukses
}


/**
 * Fungsi Utama
 */
async function runRecount() {
    if (DRY_RUN) {
        consoleUtils.title("MEMULAI MODE DRY RUN");
        consoleUtils.warn("TIDAK ADA DATA YANG AKAN DIUBAH");
    } else {
        consoleUtils.title("MEMULAI MODE EKSEKUSI");
        consoleUtils.warn("PERINGATAN! DATA AKAN DIUBAH!");
    }

    // 1. Dapatkan Token
    log("Mendapatkan Keycloak token...");
    const token = await getKeycloakToken();
    if (!token) {
        log("Gagal mendapatkan token, skrip berhenti.");
        return;
    }
    consoleUtils.success("Token dcm4chee didapatkan.");

    // 2. Dapatkan Studi Supabase
    log("Mengambil daftar studi dari Supabase...");
    let studies;
    try {
        studies = await getSupabaseStudies();
    } catch (error) {
        log(`${error.message}. Cek SUPABASE_URL dan SUPABASE_KEY.`);
        return;
    }

    // 3. Loop dan Bandingkan
    let countTotal = studies.length;
    let countMismatch = 0;
    let countError = 0;

    consoleUtils.info(`Ditemukan ${countTotal} studi. Memulai perbandingan...`);

    for (let i = 0; i < studies.length; i++) {
        const study = studies[i];
        const uid_pk = study.id;
        const sbCount = study.numberOfInstances || 0;

        let dcm_query_uid = findStudyInstanceUID(study.identifier);

        if (!dcm_query_uid) {
            log(`[SKIP] Gagal menemukan Study UID di identifier untuk PK ${uid_pk}. Melewatkan...`);
            countError++;
            continue;
        }

        consoleUtils.status(`(${i + 1}/${countTotal}) Cek PK: ${uid_pk}`);
        log(`Querying dcm4chee with Study UID: ${dcm_query_uid}`);
        log(`Supabase count: ${sbCount}`);

        // Kirim Study UID yang diekstrak
        const dcmCount = await getDcmCount(dcm_query_uid, token);

        if (dcmCount === "error") {
            log(`[SKIP] Gagal mengambil count dari dcm4chee.`);
            countError++;
            continue;
        }

        log(`dcm4chee count: ${dcmCount}`);

        if (Number(sbCount) === Number(dcmCount)) {
            consoleUtils.success("Jumlah sudah sesuai.");
            continue;
        }

        consoleUtils.warn(`Perlu update. Supabase=${sbCount}, dcm4chee=${dcmCount}`);
        countMismatch++;

        if (DRY_RUN) {
            log("[DRY-RUN] Melewatkan update.");
        } else {
            // 4. Eksekusi Update
            log("[EXECUTE] Mengirim update ke Supabase...");
            const httpStatus = await updateSupabaseCount(uid_pk, dcmCount);
            if (httpStatus === 200 || httpStatus === 204) {
                consoleUtils.success(`Update berhasil (HTTP ${httpStatus}).`);
            } else {
                log(`[ERROR] Update GAGAL (HTTP ${httpStatus}).`);
                countError++;
            }
        }
    }

    consoleUtils.title("PROSES RECOUNT SELESAI");
    consoleUtils.info(`Total Studi dicek: ${countTotal}`);
    consoleUtils.info(`Mismatch (perlu update): ${countMismatch}`);
    consoleUtils.info(`Gagal diproses: ${countError}`);
    if (DRY_RUN && countMismatch > 0) {
        consoleUtils.warn("Ini adalah DRY RUN. Tidak ada data yang diubah.");
        consoleUtils.info("Untuk eksekusi, set DRY_RUN=false di file run.sh");
    }
}

module.exports = runRecount;