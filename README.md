# VisionX Update Utility

A comprehensive utility script to update all data to the latest version, including Supabase RPC/Table updates, Docker image YAML updates, Mirth configuration, and data cleaning operations.

## Overview

This project provides a complete solution for updating and maintaining VisionX systems, performing the following operations:

- **Supabase RPC/Table updates**: Updates database procedures and table structures
- **Docker image YAML updates**: Updates container image versions in deployment configurations
- **Mirth configuration**: Updates Mirth Connect channel configurations
- **Number of instances cleaning**: Cleans and recalculates instance counts for imaging studies
- **MWL status cleaning**: Cleans and updates modality worklist statuses
- **Multiple patient IDs cleaning**: Cleans duplicate or inconsistent patient identifiers

## Prerequisites

- **Node.js** must be installed before running the script
- Access to your Supabase instance (self-hosted or cloud)
- Mirth Connect server access
- Docker and Kubernetes (for YAML updates)

## Configuration

Before running the script, you must configure the `run.sh` file according to your environment.

### Supabase Configuration Variables

In the `run.sh` file, set the following environment variables:

- `SUPABASE_HOST`: Your Supabase host address
- `SUPABASE_PORT`: Your Supabase port (default: 5432)
- `SUPABASE_USER`: Your Supabase username
- `SUPABASE_PASSWORD`: Your Supabase password
- The URL must point to the correct `SUPABASE_URL` and `SUPABASE_KEY`, which can be obtained from the Supabase Dashboard → API Docs

These values can be obtained from your self-hosted Supabase `.env` or YAML configuration.

### Local YAML Path

- `LOCAL_BASE_PATH`: The directory containing all YAML files that need updating

### Mirth Configuration

Configure Mirth settings based on your environment:

- **Default port**: 8443
- **Destination connector**: Only the URL usually needs to be updated

Key configuration variables include:
- `MIRTH_HOST`: Mirth server address
- `MIRTH_PORT`: Mirth server port
- `MIRTH_USERNAME`: Mirth username
- `MIRTH_PASSWORD`: Mirth password

### Keycloak Credentials

The following Keycloak environment variables must be set:

- `KC_TOKEN_URL`: Keycloak token endpoint URL
- `KC_CLIENT_ID`: Keycloak client ID
- `KC_USERNAME`: Keycloak username
- `KC_PASSWORD`: Keycloak password
- `KC_CLIENT_SECRET`: Keycloak client secret

### TLS Configuration

For quick TLS validation, users can change the URL and password to test.

If a certificate error appears, enable insecure mode by setting:
- `CURL_INSECURE=false` → `CURL_INSECURE=true`

## How to Run

The script can be executed using any of the following methods:

```bash
source ./run.sh
```

or

```bash
bash run.sh
```

or

```bash
./run.sh
```

Then you will prompted for which process you want to run

```
// Update image in yaml file
Jalankan proses Update Image? (y/n) 

// Update Supabase RPC & Table
Jalankan proses Database? (y/n) 

// Update Mirth Script
Jalankan proses Mirth? (y/n) n

// Clean Number of Instancce
Jalankan proses Cleaner (Recount Instances)? (y/n) 

// Clean Multiple Patient ID
Jalankan proses Cleaner (Patient Merge LENGKAP - PACS & DB)? (y/n) 
```

Update image process will look like this

```
{
  stdout: '        image: kalbedevops.azurecr.io/elvasoft-ris:1\n',
  stderr: ''
}
[INFO] Current version: image: kalbedevops.azurecr.io/elvasoft-ris:1

Do you want to update ris.yaml image? (y/n) y

// Example
Enter the image version to update (x.x.x): 12.2.1 
✅ Updated image version → 12.2.1

Deploy ris.yaml now? (y/n): y
```

After the main update process, you will be prompted to run the MWL status cleaning script:

```
You want to Clean MWL Status? (y/n)
```

Enter `y` or `yes` to proceed with MWL cleaning, or `n` to skip.

## Features

### Image Updates
- Automatically updates container image versions for:
  - RIS (Radiology Information System)
  - Blue Halo
  - OHIF (Open Health Imaging Foundation)

### Supabase Updates
- Executes RPC (Remote Procedure Call) updates
- Updates table structures and data
- Synchronizes with FHIR server endpoints

### Mirth Configuration
- Updates Mirth Connect channel configurations
- Ensures proper HL7 message handling
- Configures destination connectors for various services

### Data Cleaning Utilities
- **Number of instances cleaning**: Recalculates and updates instance counts for imaging studies
- **MWL status cleaning**: Updates and cleans modality worklist statuses 
- **Multiple patient IDs cleaning**: Identifies and cleans duplicate or inconsistent patient identifiers

## Project Structure

```
.
├── run.sh                 # Main execution script
├── package.json          # Node.js dependencies
├── src/
│   ├── index.js          # Main entry point
│   ├── adapters/         # API adapters
│   ├── cleaner/          # Data cleaning utilities
│   ├── config/           # Configuration modules
│   ├── usecases/         # Business logic
│   └── utils/            # Utility functions
├── scripts/
│   ├── mirth/            # Mirth configuration files
│   └── sql/              # SQL update scripts
└── README.md
```

## Security Considerations

⚠️ **Important**: The configuration contains sensitive information including:
- Database credentials
- API keys
- Authentication tokens

Ensure that:
- Configuration files are properly secured
- Environment variables are not exposed in logs
- Access to the utility is restricted to authorized personnel
- Credentials are rotated regularly

## Troubleshooting

### Common Issues

1. **Node.js not found**: Ensure Node.js is installed and in your PATH
2. **Permission denied**: Ensure the script has execute permissions (`chmod +x run.sh`)
3. **Connection errors**: Verify all host addresses, ports, and credentials are correct
4. **TLS certificate errors**: Set `CURL_INSECURE=true` for testing environments (not recommended for production)

### Verifying Updates

After running the utility, verify:
- Database tables and RPCs have been updated successfully
- YAML files contain updated image versions
- Mirth Connect channels are properly configured
- Data cleaning operations have completed as expected
