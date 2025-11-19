const path = require("path");
const fs = require("fs");
const consoleUtils = require("../utils/consoleUtils");

async function updateMirthChannel(mirthAdapter) {
  const channelName = "mirth-vision";
  const newXmlPath = path.join(
    __dirname,
    "../../scripts/mirth/updated-mirth.xml"
  );
  const deployXmlPath = path.join(
    __dirname,
    "../../scripts/mirth/channel-mirth.xml"
  );

  // Delete existing
  const channelId = await mirthAdapter.getChannelIdByName(channelName);
  if (channelId) {
    await mirthAdapter.deleteChannel(channelId);
    consoleUtils.success(`Deleted old channel: ${channelName}`);
  }

  // Import new (with env-modified hosts)
  const modifiedXml = await mirthAdapter.modifyChannelXml(newXmlPath);
  await mirthAdapter.importChannel(modifiedXml);
  consoleUtils.success("Imported new channel");

  // Deploy
  const deployXml = fs.readFileSync(deployXmlPath, "utf8");
  await mirthAdapter.deployChannels(deployXml);
  consoleUtils.success("Deployed channel");
}

module.exports = updateMirthChannel;
