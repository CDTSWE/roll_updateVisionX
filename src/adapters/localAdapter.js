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
    this.remoteBasePath = config.LOCAL_BASE_PATH;
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
      let result;
      try {
        result = await execCommand(grepCommand);
      } catch (grepErr) {
        // If grep doesn't find any matches, it returns a non-zero exit code
        // In this case, we'll show a message and continue without updating
        consoleUtils.warn(
          `No image lines found in ${remoteFilename} or file is empty.`,
        );
        const answer = await askHelper.ask(
          `Do you want to create/update ${remoteFilename} anyway? (y/n) `,
        );

        if (answer.toLowerCase() === "n") {
          consoleUtils.skipped("Skipped");
          return;
        }

        // If user wants to proceed, we can't update without knowing the current image
        // So we'll ask for the current image format to replace
        const currentImage = await askHelper.ask(
          `Enter the current image pattern to replace (or leave empty to add to file): `,
        );

        if (currentImage.trim() !== "") {
          const newVersion = await askHelper.ask(
            `Enter the image version to update (x.x.x): `,
          );

          let sedCmd = `sed -i "s|${currentImage}|${imageVersion}${newVersion}|g" ${this.remoteBasePath}/${remoteFilename}`;
          await execCommand(sedCmd);
          consoleUtils.success(`Updated image version → ${newVersion}`);
        } else {
          consoleUtils.info(
            `No image pattern specified, skipping replacement in ${remoteFilename}`,
          );
        }

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
        return;
      }

      console.log(result);

      consoleUtils.info(`Current version: ${result.stdout.trim()}`);

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

      // Escape special characters in the result.stdout for sed
      const escapedOriginal = result.stdout
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      let sedCmd = `sed -i "s|${escapedOriginal}|${imageVersion}${newVersion}|g" ${this.remoteBasePath}/${remoteFilename}`;
      if (result.stdout.trim().startsWith("-")) {
        sedCmd = `sed -i "s|${escapedOriginal}|- ${imageVersion}${newVersion}|g" ${this.remoteBasePath}/${remoteFilename}`;
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
      throw err; // Re-throw to be handled by the calling function
    }
  }
}

module.exports = LocalAdapter;
