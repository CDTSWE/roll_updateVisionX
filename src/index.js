const env = require("./config/env");
const SSHAdapter = require("./adapters/sshAdapter");
const DBAdapter = require("./adapters/dbAdapter");
const MirthAdapter = require("./adapters/mirthAdapter");
const deployYamlFiles = require("./usecases/deployYamlFiles");
const updateDatabase = require("./usecases/updateDatabase");
const updateMirthChannel = require("./usecases/updateMirthChannel");
const AskHelper = require("./utils/readline");

async function main() {
  const ask = new AskHelper();
  let runSsh, runDb, runMirth;

  try {
    console.log("--- 🚀 Konfigurasi Proses Deployment ---");
    runSsh = await ask.ask("Jalankan proses SSH? (y/n) ");
    runDb = await ask.ask("Jalankan proses Database? (y/n) ");
    runMirth = await ask.ask("Jalankan proses Mirth? (y/n) ");
  } catch (err) {
    console.error("💥 Gagal saat proses tanya jawab:", err);
    process.exit(1);
  } finally {
    ask.close();
  }

  try {
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

    console.log("\n🚀 All requested deployments completed!");
  } catch (err) {
    console.error("💥 Error saat eksekusi proses:", err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("💥 Fatal error:", err);
  process.exit(1);
});
