const { NodeSSH } = require("node-ssh");
const fs = require("fs");
const path = require("path");

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
    // Optional: switch to root if needed
    // await this.ssh.execCommand('sudo su');
  }

  async disconnect() {
    if (this.ssh.isConnected()) {
      await this.ssh.dispose();
      console.log("🔻 SSH connection closed");
    }
  }

  async updateAndApplyFile(localPath, remoteFilename, imageVersion) {
    const date = new Date();
    const timestamp = date
      .toISOString()
      .slice(0, 19)
      .replace("T", "-")
      .replace(":", "")
      .replace(":", "");
    const remotePath = `${this.remoteBasePath}/${remoteFilename}`;
    const backupPath = `${this.backupPath}/${
      path.parse(remoteFilename).name
    }-${timestamp}.yaml`;
    const tempPath = `/tmp/${timestamp}-${remoteFilename}`;

    console.log(`📁 Processing: ${localPath}`);

    // Check if backup directory exit
    const backupDir = `sudo mkdir ${this.backupPath}`;
    await this.ssh.execCommand(backupDir);

    // Check if version exist
    const versionCheck = `sudo grep "${imageVersion}" ${remotePath}`;
    const responseVersionCheck = await this.ssh.execCommand(versionCheck);
    if (responseVersionCheck.stdout) {
      console.log(
        `⚠️ Image version ${remoteFilename} already exist: ${imageVersion}`
      );
    } else {
      // Backup
      const backupCmd = `sudo cp ${remotePath} ${backupPath} 2>/dev/null || true`;
      await this.ssh.execCommand(backupCmd);
      console.log(`✅ Backed up to ${backupPath}`);

      // Upload
      await this.ssh.putFile(localPath, tempPath);
      console.log(`✅ Uploaded to temp path`);

      // Replace
      await this.ssh.execCommand(`sudo mv ${tempPath} ${remotePath}`);
      console.log(`✅ Replaced remote file`);

      // Apply
      // const applyResult = await this.ssh.execCommand(
      //   `kubectl apply -f ${remotePath}`
      // );
      // if (applyResult.stderr) {
      //   console.warn(`⚠️ kubectl stderr: ${applyResult.stderr}`);
      // }
      // console.log(`✅ kubectl applied: ${applyResult.stdout.trim()}`);
    }
  }
}

module.exports = SSHAdapter;
