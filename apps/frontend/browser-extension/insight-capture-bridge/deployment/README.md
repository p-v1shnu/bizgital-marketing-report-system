# Managed Policy Deployment (Internal, No Store)

This folder contains a ready-to-use deployment kit for installing the extension through enterprise policy (no Dev Mode, no Store listing required).

## What this kit provides

- A template `update.xml` manifest for self-hosted CRX updates
- PowerShell script to apply force-install policy for Chrome + Edge
- PowerShell script to remove that policy

## Files

- `windows/install-managed-extension.ps1`
- `windows/remove-managed-extension.ps1`
- `windows/pack-extension-crx.ps1`
- `windows/generate-update-xml.ps1`
- `update.xml.template`

## Prerequisites

1. A packaged extension CRX built with a stable private key (same key every release).
2. Extension update endpoint served over HTTPS (for example: `https://report.bizgital.com/extensions/insight-capture/update.xml`).
3. Extension ID from the packaged build.
4. Admin rights on target devices (or deployment via GPO/Intune/MDM).

## Quick Start

1. Pack CRX (same private key every release):

```powershell
.\pack-extension-crx.ps1 -PrivateKeyPath "C:\secure\insight-capture.pem"
```

2. Generate update manifest:

```powershell
.\generate-update-xml.ps1 `
  -ExtensionId "YOUR_EXTENSION_ID" `
  -CrxCodebaseUrl "https://report.bizgital.com/extensions/insight-capture/insight-capture.crx" `
  -Version "1.0.0" `
  -OutputPath ".\update.xml"
```

3. Host these files on your internal HTTPS endpoint:
   - `insight-capture.crx`
   - `update.xml` (generated from template)
4. Run:

```powershell
.\install-managed-extension.ps1 `
  -ExtensionId "YOUR_EXTENSION_ID" `
  -UpdateManifestUrl "https://report.bizgital.com/extensions/insight-capture/update.xml" `
  -Browser Both `
  -UseExtensionSettingsOverride
```

5. Restart browsers.
6. Verify:
   - `chrome://policy`
   - `edge://policy`

## Notes

- If a device is unmanaged/non-domain Edge may restrict force-install behavior for non-store sources.
- Keep extension version in sync across:
  - `manifest.json`
  - CRX package
  - `update.xml` version
- Re-use the same private key (`.pem`) every release, otherwise extension ID changes.
