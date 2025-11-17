const { NodeSSH } = require("node-ssh");
const fs = require("fs");
const path = require("path");
const AskHelper = require("./../utils/readline");
const consoleUtils = require("../utils/consoleUtils");

class SSHAdapter {
  constructor(config) {
    this.ssh = new NodeSSH();
    this.config = {
      host: config.SSH_HOST,
      port: config.SSH_PORT,
      username: config.SSH_USER,
      password: config.SSH_PASSWORD,
    };
    this.remoteBasePath = "~/visionx/poc-update";
    this.backupPath = `${this.remoteBasePath}/backup`;
  }

  async connect() {
    consoleUtils.info(`Connecting to ${this.config.host} via SSH...`);
    await this.ssh.connect(this.config);
    consoleUtils.success("SSH connected");
  }

  async disconnect() {
    if (this.ssh.isConnected()) {
      await this.ssh.dispose();
      consoleUtils.info("SSH connection closed");
    }
  }

  async updateAndApplyFile(remoteFilename, imageVersion) {
    const askHelper = new AskHelper();

    try {
      const showImageVersion = `sudo grep -hE "^[[:space:]]*[^#].*image:" ${this.remoteBasePath}/${remoteFilename}`;
      const responseShowImageVersion = await this.ssh.execCommand(
        showImageVersion
      );

      consoleUtils.info(`Current version: ${responseShowImageVersion.stdout}`);

      const answer = await askHelper.ask(
        `Do you want to update ${remoteFilename} image? (y/n) `
      );

      if (answer.toLowerCase() === "n") {
        consoleUtils.skipped("Skipped");
        return; // 'finally' akan tetap berjalan
      } else if (answer.toLowerCase() === "y") {
        const imageVersionAnswer = await askHelper.ask(
          `Enter the image version you want to update (x.x.x): `
        );

        let changeVersion = `sed -i "s|${responseShowImageVersion.stdout}|${imageVersion}${imageVersionAnswer}|g" ${this.remoteBasePath}/${remoteFilename}`;
        if (responseShowImageVersion.stdout[0] == "-") {
          changeVersion = `sed -i "s|${responseShowImageVersion.stdout}|- ${imageVersion}${imageVersionAnswer}|g" ${this.remoteBasePath}/${remoteFilename}`;
        }

        await this.ssh.execCommand(changeVersion);

        consoleUtils.success(`Success updated image version to ${imageVersionAnswer}`);
        const deployAnswer = await askHelper.ask(
          `Want to deploy ${remoteFilename} now? (y/n): `
        );

        if (deployAnswer.toLowerCase() === "y") {
          const deploy = `kubectl apply -f ${this.remoteBasePath}/${remoteFilename}`;
          await this.ssh.execCommand(deploy);
          consoleUtils.success(`Deployed ${remoteFilename}`);
        } else if (deployAnswer.toLowerCase() === "n") {
          consoleUtils.skipped("Skipped deployment");
          return;
        }
      }
    } finally {
      askHelper.close();
    }
  }
}

module.exports = SSHAdapter;
