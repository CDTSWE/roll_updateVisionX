const { exec } = require("child_process");
const AskHelper = require("../utils/readline");
const consoleUtils = require("../utils/consoleUtils");

function execCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, { shell: "/bin/bash" }, (error, stdout, stderr) => {
      if (error) reject(stderr || error.message);
      else resolve({ stdout, stderr });
    });
  });
}

class LocalAdapter {
  constructor(config) {
    this.remoteBasePath =
      config.LOCAL_BASE_PATH || "/home/klbfadmin/installation-file/visionx";
  }

  async connect() {
    consoleUtils.info("Local mode: no SSH connection needed.");
  }

  async disconnect() {
    consoleUtils.info("Local mode: nothing to disconnect.");
  }

  async execCommand(cmd) {
    return await execCommand(cmd);
  }

  async updateAndApplyFile(remoteFilename, imageVersion, askHelper) {
    try {
      const grepCommand = `grep -hE "^[[:space:]]*[^#].*image:" ${this.remoteBasePath}/${remoteFilename}`;
      const result = await execCommand(grepCommand);

      consoleUtils.info(`Current version: ${result.stdout}`);

      const answer = await askHelper.ask(
        `Do you want to update ${remoteFilename} image? (y/n) `,
      );

      if (answer.toLowerCase() === "n") {
        consoleUtils.skipped("Skipped");
        return;
      }

      const newVersion = await askHelper.ask(
        `Enter the image version to update (x.x.x): `,
      );

      let sedCmd = `sed -i "s|${result.stdout}|${imageVersion}${newVersion}|g" ${this.remoteBasePath}/${remoteFilename}`;
      if (result.stdout.trim().startsWith("-")) {
        sedCmd = `sed -i "s|${result.stdout}|- ${imageVersion}${newVersion}|g" ${this.remoteBasePath}/${remoteFilename}`;
      }

      await execCommand(sedCmd);
      consoleUtils.success(`Updated image version → ${newVersion}`);

      const deployAnswer = await askHelper.ask(
        `Deploy ${remoteFilename} now? (y/n): `,
      );

      if (deployAnswer.toLowerCase() === "y") {
        const deployCommand = `kubectl apply -f ${this.remoteBasePath}/${remoteFilename}`;
        await execCommand(deployCommand);
        consoleUtils.success(`Deployed: ${remoteFilename}`);
      } else {
        consoleUtils.skipped("Deployment skipped.");
      }
    } catch (err) {
      consoleUtils.error(`LocalAdapter error: ${err}`);
    }
  }
}

module.exports = LocalAdapter;
