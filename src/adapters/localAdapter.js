const { exec } = require("child_process");
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

  async execCommand(cmd) {
    return await execCommand(cmd);
  }

  async updateAndApplyFile(remoteFilename, imageVersion, askHelper) {
    try {
      // Limit to the first non-comment image line to avoid multi-line matches that break sed
      const grepCommand = `grep -m1 -hE "^[[:space:]]*[^#].*image:" ${this.remoteBasePath}/${remoteFilename}`;
      let result;
      try {
        result = await execCommand(grepCommand);
      } catch (grepErr) {
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

      const lines = result.stdout
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0);
      const originalLine = lines[0] || "";

      consoleUtils.info(`Current version: ${originalLine}`);

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

      const escapedOriginal = originalLine.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );
      const hasDashPrefix = originalLine.trimStart().startsWith("- ");
      const replacement = `${hasDashPrefix ? "- " : ""}${imageVersion}${newVersion}`;
      const sedCmd = `sed -i "s|${escapedOriginal}|${replacement}|g" ${this.remoteBasePath}/${remoteFilename}`;

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
      throw err;
    }
  }
}

module.exports = LocalAdapter;
