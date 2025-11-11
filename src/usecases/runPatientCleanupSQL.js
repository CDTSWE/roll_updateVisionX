const fs = require('fs');
const path = require('path');

/**
 * Menjalankan skrip SQL pembersihan pasien dari file.
 * @param {DBAdapter} db - Instance DBAdapter yang sudah terhubung.
 */
async function runPatientCleanupSQL(db) {
  const DRY_RUN = (process.env.DRY_RUN || 'false').toLowerCase() === 'true';
  
  let sqlFileName;
  if (DRY_RUN) {
    sqlFileName = 'patient_merge_cleanup_DRYRUN.sql';
    console.log("[INFO] Memilih skrip SQL DRY RUN (ROLLBACK)...");
  } else {
    sqlFileName = 'patient_merge_cleanup.sql';
    console.log("[INFO] Memilih skrip SQL LIVE (COMMIT)...");
  }

  const sqlFilePath = path.join(__dirname, '..', 'cleaner', 'sql', sqlFileName);
  
  let sqlScript;
  try {
    sqlScript = fs.readFileSync(sqlFilePath, 'utf8');
    console.log(`[INFO] Berhasil memuat skrip SQL dari: ${sqlFileName}`);
  } catch (err) {
    console.error(`❌ GAGAL memuat file SQL: ${sqlFilePath}`, err);
    throw new Error(`File SQL tidak ditemukan: ${sqlFileName}`);
  }

  if (!sqlScript) {
    throw new Error("Skrip SQL kosong atau tidak berhasil dibaca.");
  }

  console.log("[INFO] Mulai eksekusi skrip SQL di Supabase...");
  try {
    // DBAdapter Anda harus memiliki method 'query' atau 'run'
    // Sesuaikan 'db.query(sqlScript)' jika nama method-nya berbeda
    await db.query(sqlScript); 
    
    if (DRY_RUN) {
      console.log("✅ [DRY RUN] Skrip SQL selesai dan di-ROLLBACK.");
    } else {
      console.log("✅ [LIVE] Skrip SQL selesai dan di-COMMIT.");
    }
  } catch (err) {
    console.error(`❌ GAGAL saat eksekusi SQL: ${err.message}`);
    console.error("Detail Error:", err);
    throw new Error(`Gagal menjalankan skrip SQL: ${err.message}`);
  }
}

module.exports = runPatientCleanupSQL;