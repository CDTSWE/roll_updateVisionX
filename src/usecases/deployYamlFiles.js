const path = require("path");

async function deployYamlFiles(sshAdapter, config) {
  const yamlFiles = [
    {
      remote: config.RIS_YAML_FILE,
      version: config.RIS_IMAGE_VERSION,
    },
    {
      remote: config.BLUE_HALO_YAML_FILE,
      version: config.BLUE_HALO_IMAGE_VERSION,
    },
    {
      remote: config.OHIF_YAML_FILE,
      version: config.OHIF_IMAGE_VERSION,
    },
  ];

  for (const file of yamlFiles) {
    await sshAdapter.updateAndApplyFile(file.remote, file.version);
  }
}

module.exports = deployYamlFiles;
