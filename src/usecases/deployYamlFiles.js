const path = require("path");

async function deployYamlFiles(sshAdapter, config) {
  const yamlFiles = [
    {
      local: config.RIS_YAML_FILE,
      remote: config.RIS_YAML_FILE,
      version: config.RIS_IMAGE_VERSION,
    },
    {
      local: config.BLUE_HALO_YAML_FILE,
      remote: config.BLUE_HALO_YAML_FILE,
      version: config.BLUE_HALO_IMAGE_VERSION,
    },
    {
      local: config.OHIF_YAML_FILE,
      remote: config.OHIF_YAML_FILE,
      version: config.OHIF_IMAGE_VERSION,
    },
  ];

  const scriptDir = path.join(__dirname, "../../scripts/yaml");
  for (const file of yamlFiles) {
    const localPath = path.join(scriptDir, file.local);
    await sshAdapter.updateAndApplyFile(localPath, file.remote, file.version);
  }
  console.log("🎉 All YAML files deployed!");
}

module.exports = deployYamlFiles;
