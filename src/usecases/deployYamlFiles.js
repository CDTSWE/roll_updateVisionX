async function deployYamlFiles(adapter, config, askHelper) {
  const yamlFiles = [
    { remote: config.RIS_YAML_FILE, version: config.RIS_IMAGE_VERSION },
    {
      remote: config.BLUE_HALO_YAML_FILE,
      version: config.BLUE_HALO_IMAGE_VERSION,
    },
    { remote: config.OHIF_YAML_FILE, version: config.OHIF_IMAGE_VERSION },
  ];

  for (const file of yamlFiles) {
    await adapter.updateAndApplyFile(file.remote, file.version, askHelper);
  }
}

module.exports = deployYamlFiles;
