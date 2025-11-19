// src/index.js (SUDAH DIPERBAIKI)

const env = require("./config/env");
const LocalAdapter = require("./adapters/localAdapter");
const DBAdapter = require("./adapters/dbAdapter");
const MirthAdapter = require("./adapters/mirthAdapter");
const deployYamlFiles = require("./usecases/deployYamlFiles");
const updateDatabase = require("./usecases/updateDatabase");
const updateMirthChannel = require("./usecases/updateMirthChannel");
const AskHelper = require("./utils/readline");
const consoleUtils = require("./utils/consoleUtils");

// Import cleaner
const recountInstances = require("./cleaner/recount_instances");
const runPatientMerge = require("./cleaner/multiplePatient.js");
const runPatientCleanupSQL = require("./usecases/runPatientCleanupSQL");

async function main() {
  const ask = new AskHelper();

  try {
    let runSsh, runDb, runMirth;
    let runRecount, runMerge;

    try {
      consoleUtils.title("Konfigurasi Proses Deployment");
      runSsh = await ask.ask("Jalankan proses Update Image? (y/n) ");
      runDb = await ask.ask("Jalankan proses Database? (y/n) ");
      runMirth = await ask.ask("Jalankan proses Mirth? (y/n) ");
      runRecount = await ask.ask(
        "Jalankan proses Cleaner (Recount Instances)? (y/n) ",
      );
      runMerge = await ask.ask(
        "Jalankan proses Cleaner (Patient Merge LENGKAP - PACS & DB)? (y/n) ",
      );
    } catch (err) {
      consoleUtils.error(`Gagal saat proses tanya jawab: ${err.message}`);
      process.exit(1);
    }

    // --- Bagian Eksekusi Utama ---

    // --- Proses SSH ---
    if (runSsh.toLowerCase() === "y") {
      consoleUtils.section("Update Image Process (No SSH)");
      const local = new LocalAdapter(env);
      await deployYamlFiles(local, env, ask);
      consoleUtils.success("Update Image Process Completed.");
    } else {
      consoleUtils.skipped("Skipping SSH process.");
    }

    // --- Proses DB ---
    if (runDb.toLowerCase() === "y") {
      consoleUtils.section("Database Process");
      const db = new DBAdapter(env);
      await db.connect();
      await updateDatabase(db);
      await db.disconnect();
      consoleUtils.success("Database Process Completed.");
    } else {
      consoleUtils.skipped("Skipping Database process.");
    }

    // --- Proses Mirth ---
    if (runMirth.toLowerCase() === "y") {
      consoleUtils.section("Mirth Process");
      const mirth = new MirthAdapter(env);
      await updateMirthChannel(mirth);
      consoleUtils.success("Mirth Process Completed.");
    } else {
      consoleUtils.skipped("Skipping Mirth process.");
    }

    // --- Proses Clean Data (Recount) ---
    if (runRecount.toLowerCase() === "y") {
      consoleUtils.section("Cleaner Process (Recount)");
      await recountInstances();
      consoleUtils.success("Cleaner Process (Recount) Completed.");
    } else {
      consoleUtils.skipped("Skipping Cleaner (Recount) process.");
    }

    // --- Proses Clean Data (Patient Merge LENGKAP) ---
    if (runMerge.toLowerCase() === "y") {
      const DRY_RUN = (process.env.DRY_RUN || "false").toLowerCase() === "true";

      const log = DRY_RUN ? consoleUtils.info : consoleUtils.warn;

      consoleUtils.section("1. Cleaner Process (PACS)");

      await runPatientMerge();
      consoleUtils.success("Cleaner Process (PACS) Completed.");

      consoleUtils.section("2. Cleaner Process (Database)");

      if (!DRY_RUN) {
        consoleUtils.warn(
          "DATA DATABASE (SUPABASE) AKAN DIUBAH PERMANEN DALAM 5 DETIK!",
        );
        consoleUtils.warn("Delaying for 5 seconds as safety measure...");
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      const db = new DBAdapter(env);
      try {
        consoleUtils.info("Menghubungkan ke database (Supabase)...");
        await db.connect();
        consoleUtils.success("Koneksi database berhasil.");

        await runPatientCleanupSQL(db, DRY_RUN);
      } catch (sqlError) {
        consoleUtils.error(
          `GAGAL saat menjalankan SQL cleanup: ${sqlError.message}`,
        );
      } finally {
        if (db) {
          await db.disconnect();
          consoleUtils.info("Koneksi database (Supabase) ditutup.");
        }
      }
      consoleUtils.success("Cleaner Process (Database) Completed.");
    } else {
      consoleUtils.skipped("Skipping Cleaner (Patient Merge) process.");
    }

    consoleUtils.success("All requested deployments completed!");
  } catch (err) {
    consoleUtils.error(`Error saat eksekusi proses: ${err.message}`);
    process.exit(1);
  } finally {
    ask.close();
  }
}

main().catch((err) => {
  consoleUtils.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
