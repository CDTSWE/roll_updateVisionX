const env = require("./config/env");
const SSHAdapter = require("./adapters/sshAdapter");
const DBAdapter = require("./adapters/dbAdapter");
const MirthAdapter = require("./adapters/mirthAdapter");
const deployYamlFiles = require("./usecases/deployYamlFiles");
const updateDatabase = require("./usecases/updateDatabase");
const updateMirthChannel = require("./usecases/updateMirthChannel");

async function main() {
  // SSH
  console.log("\n=== SSH Process ===");
  const ssh = new SSHAdapter(env);
  await ssh.connect();
  await deployYamlFiles(ssh, env);
  await ssh.disconnect();

  // // DB
  // console.log("\n=== Database Process ===");
  // const db = new DBAdapter(env);
  // await db.connect();
  // await updateDatabase(db);
  // await db.disconnect();

  // // Mirth
  // console.log("\n=== Mirth Process ===");
  // const mirth = new MirthAdapter(env);
  // await updateMirthChannel(mirth);

  console.log("\n🚀 All deployments completed successfully!");
}

main().catch((err) => {
  console.error("💥 Fatal error:", err);
  process.exit(1);
});



