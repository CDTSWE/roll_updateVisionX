const { NodeSSH } = require("node-ssh");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

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
    console.log(`🔁 Connecting to ${this.config.host} via SSH...`);
    await this.ssh.connect(this.config);
    console.log("✅ SSH connected");
  }

  async disconnect() {
    if (this.ssh.isConnected()) {
      await this.ssh.dispose();
      console.log("🔻 SSH connection closed");
    }
  }

  async updateAndApplyFile(localPath, remoteFilename, imageVersion) {
    const showImageVersion = `sudo grep -hE "^[[:space:]]*[^#].*image:" ${this.remoteBasePath}/${remoteFilename}`;
    const responseShowImageVersion = await this.ssh.execCommand(
      showImageVersion
    );

    console.log(`🔎 Current version: ${responseShowImageVersion.stdout}`);

    const answer = await ask(
      `Do you want to update ${remoteFilename} image? (y/n) `
    );

    if (answer.toLowerCase() === "n") {
      console.log("⏭️ Skipped");
      return;
    } else if (answer.toLowerCase() === "y") {
      const imageVersionAnswer = await ask(
        `Enter the image version you want to update (x.x.x): `
      );
      let changeVersion = `sed -i "s|${responseShowImageVersion.stdout}|${imageVersion}${imageVersionAnswer}|g" ${this.remoteBasePath}/${remoteFilename}`;
      if (responseShowImageVersion.stdout[0] == "-") {
        changeVersion = `sed -i "s|${responseShowImageVersion.stdout}|- ${imageVersion}${imageVersionAnswer}|g" ${this.remoteBasePath}/${remoteFilename}`;
      }

      await this.ssh.execCommand(changeVersion);

      console.log(`Success updated image version to ${imageVersionAnswer}`);
      const deployAnswer = await ask(
        `Want to deploy ${remoteFilename} now? (y/n): `
      );

      if (deployAnswer.toLowerCase() === "y") {
        const deploy = `kubectl apply -f ${this.remoteBasePath}/${remoteFilename}`;
        await this.ssh.execCommand(deploy);
        console.log(`✅ Deployed ${remoteFilename}`);
      } else if (deployAnswer.toLowerCase() === "n") {
        console.log("⏭️ Skipped deployment");
        return;
      }
    }
  }
}

module.exports = SSHAdapter;
