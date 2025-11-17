const fs = require('fs');
const path = require('path');
const consoleUtils = require('../utils/consoleUtils');

/**
 * Menjalankan skrip SQL pembersihan pasien dari file.
 * @param {DBAdapter} db - Instance DBAdapter yang sudah terhubung.
 */
async function runPatientCleanupSQL(db) {
  const DRY_RUN = (process.env.DRY_RUN || 'false').toLowerCase() === 'true';
  
  let sqlFileName;
  if (DRY_RUN) {
    sqlFileName = 'patient_merge_cleanup_DRYRUN.sql';
    consoleUtils.info("Memilih skrip SQL DRY RUN (ROLLBACK)...");
  } else {
    sqlFileName = 'patient_merge_cleanup.sql';
    consoleUtils.info("Memilih skrip SQL LIVE (COMMIT)...");
  }

  const sqlFilePath = path.join(__dirname, '..', 'cleaner', 'sql', sqlFileName);

  let sqlScript;
  try {
    sqlScript = fs.readFileSync(sqlFilePath, 'utf8');
    consoleUtils.success(`Berhasil memuat skrip SQL dari: ${sqlFileName}`);
  } catch (err) {
    consoleUtils.error(`GAGAL memuat file SQL: ${sqlFilePath}`, err.message);
    throw new Error(`File SQL tidak ditemukan: ${sqlFileName}`);
  }

  if (!sqlScript) {
    throw new Error("Skrip SQL kosong atau tidak berhasil dibaca.");
  }

  consoleUtils.info("Mulai eksekusi skrip SQL di Supabase...");
  try {
    // DBAdapter Anda harus memiliki method 'query' atau 'run'
    // Sesuaikan 'db.query(sqlScript)' jika nama method-nya berbeda
    await db.query(sqlScript);

    if (DRY_RUN) {
      consoleUtils.success("[DRY RUN] Skrip SQL selesai dan di-ROLLBACK.");
    } else {
      consoleUtils.success("[LIVE] Skrip SQL selesai dan di-COMMIT.");
    }
  } catch (err) {
    consoleUtils.error(`GAGAL saat eksekusi SQL: ${err.message}`);
    consoleUtils.error("Detail Error:", err);
    throw new Error(`Gagal menjalankan skrip SQL: ${err.message}`);
  }
}

module.exports = runPatientCleanupSQL;