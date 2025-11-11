// src/index.js (SUDAH DIPERBAIKI)

const env = require("./config/env");
const SSHAdapter = require("./adapters/sshAdapter");
const DBAdapter = require("./adapters/dbAdapter"); 
const MirthAdapter = require("./adapters/mirthAdapter");
const deployYamlFiles = require("./usecases/deployYamlFiles");
const updateDatabase = require("./usecases/updateDatabase");
const updateMirthChannel = require("./usecases/updateMirthChannel");
const AskHelper = require("./utils/readline");

// Import cleaner
const recountInstances = require("./cleaner/recount_instances");
const runPatientMerge = require("./cleaner/multiplePatient.js");
const runPatientCleanupSQL = require("./usecases/runPatientCleanupSQL");

async function main() {
  // 1. Buat 'ask' HANYA SATU KALI
  const ask = new AskHelper(); 
  
  // 2. Letakkan SEMUA proses di dalam SATU BLOK try...finally
  try {
    
    // --- Bagian Pertanyaan Awal ---
    let runSsh, runDb, runMirth;
    let runRecount, runMerge;

    try {
      console.log("--- 🚀 Konfigurasi Proses Deployment ---");
      runSsh = await ask.ask("Jalankan proses SSH? (y/n) ");
      runDb = await ask.ask("Jalankan proses Database? (y/n) ");
      runMirth = await ask.ask("Jalankan proses Mirth? (y/n) ");
      runRecount = await ask.ask("Jalankan proses Cleaner (Recount Instances)? (y/n) "); 
      runMerge = await ask.ask("Jalankan proses Cleaner (Patient Merge LENGKAP - PACS & DB)? (y/n) ");
    } catch (err) {
      console.error("💥 Gagal saat proses tanya jawab:", err);
      process.exit(1); 
    }
    
    // --- Bagian Eksekusi Utama ---

    // --- Proses SSH ---
    if (runSsh.toLowerCase() === "y") {
      console.log("\n=== SSH Process ===");
      const ssh = new SSHAdapter(env);
      await ssh.connect();
      await deployYamlFiles(ssh, env); 
      await ssh.disconnect();
      console.log("✓ SSH Process Completed.");
    } else {
      console.log("\n⏭️ Skipping SSH process.");
    }

    // --- Proses DB ---
    if (runDb.toLowerCase() === "y") {
      console.log("\n=== Database Process ===");
      const db = new DBAdapter(env);
      await db.connect();
      await updateDatabase(db);
      await db.disconnect();
      console.log("✓ Database Process Completed.");
    } else {
      console.log("\n⏭️ Skipping Database process.");
    }

    // --- Proses Mirth ---
    if (runMirth.toLowerCase() === "y") {
      console.log("\n=== Mirth Process ===");
      const mirth = new MirthAdapter(env);
      await updateMirthChannel(mirth);
      console.log("✓ Mirth Process Completed.");
    } else {
      console.log("\n⏭️ Skipping Mirth process.");
    }

    // --- Proses Clean Data (Recount) ---
    if (runRecount.toLowerCase() === "y") {
      console.log("\n=== Cleaner Process (Recount) ===");
      await recountInstances(); 
      console.log("✓ Cleaner Process (Recount) Completed.");
    } else {
      console.log("\n⏭️ Skipping Cleaner (Recount) process.");
    }

    // --- Proses Clean Data (Patient Merge LENGKAP) ---
    if (runMerge.toLowerCase() === "y") {
      // Hanya baca DRY_RUN global SATU KALI
      const DRY_RUN = (process.env.DRY_RUN || 'false').toLowerCase() === 'true';

      // --- AKSI 1: Membersihkan PACS (dcm4chee) ---
      console.log("\n=== 1. Cleaner Process (Patient Merge - PACS) ===");
      if (DRY_RUN) {
          console.log("[INFO] Menjalankan Aksi 1 (PACS) dalam mode DRY RUN...");
      } else {
          console.log("[PERINGATAN] Menjalankan Aksi 1 (PACS) dalam mode LIVE...");
      }
      // Skrip ini akan patuh pada DRY_RUN global
      await runPatientMerge(); 
      console.log("✓ Cleaner Process (PACS) Completed.");

      // --- AKSI 2: Membersihkan Database (Supabase) ---
      console.log("\n=== 2. Cleaner Process (Patient Merge - Database) ===");

      // TIDAK ADA PERTANYAAN KEDUA. Langsung patuh pada DRY_RUN global.
      if (DRY_RUN) {
          console.log("[INFO] Menjalankan Aksi 2 (Database) dalam mode DRY RUN (ROLLBACK)...");
      } else {
          console.log("[PERINGATAN] Menjalankan Aksi 2 (Database) dalam mode LIVE (COMMIT)...");
          console.log("!!! DATA DATABASE (SUPABASE) AKAN DIUBAH PERMANEN DALAM 5 DETIK !!!");
          // Tetap berikan jeda keamanan
          await new Promise(resolve => setTimeout(resolve, 5000)); 
      }

      const db = new DBAdapter(env);
      try {
          console.log("Menghubungkan ke database (Supabase)...");
          await db.connect();
          console.log("Koneksi database berhasil.");
          
          // Skrip ini akan patuh pada DRY_RUN global
          await runPatientCleanupSQL(db); 
          
      } catch (sqlError) {
          console.error("💥 GAGAL saat menjalankan SQL cleanup:", sqlError.message);
      } finally {
          if (db) {
              await db.disconnect();
              console.log("Koneksi database (Supabase) ditutup.");
          }
      }
      console.log("✓ Cleaner Process (Database) Completed.");

    } else {
      console.log("\n⏭️ Skipping Cleaner (Patient Merge) process.");
    }

    console.log("\n🚀 All requested deployments completed!");

  } catch (err) {
    // Menangkap error dari seluruh proses eksekusi
    console.error("💥 Error saat eksekusi proses:", err);
    process.exit(1);
  } finally {
    // 3. PANGGIL 'ask.close()' DI SINI, DI AKHIR SEMUANYA
    ask.close();
  }
}

main().catch((err) => {
  console.error("💥 Fatal error:", err);
  process.exit(1); 
});