# BIZGITAL Insight Capture Bridge (Chrome/Edge Extension)

This extension lets the **Insight Capture Workspace page in our system UI** trigger Facebook insight screenshot capture using the user's own browser session.

## Why this exists

- No noVNC flow for day-to-day usage
- Uses the same Facebook login session the user already has in their browser
- Works on Windows and macOS (Chrome/Edge)

## Install (Load Unpacked)

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder:
   `apps/frontend/browser-extension/insight-capture-bridge`

## Install (Developer Mode Toolkit - Recommended for current internal rollout)

Use helper scripts in:
`deployment/dev-mode`

1. Build distributable zip (for employees):
```powershell
.\build-devmode-zip.ps1
```
2. Employee install flow (no PowerShell required):
   - Extract zip to a stable folder
   - Open `chrome://extensions` or `edge://extensions`
   - Enable `Developer mode`
   - Click `Load unpacked`
   - Select extracted folder
3. IT/technical install flow (optional helper script):
```powershell
.\install-dev-mode.ps1 -Browser Both
```
4. If using helper script, in browser do once:
   - Enable `Developer mode`
   - Click `Load unpacked`
   - Select `%LOCALAPPDATA%\BIZGITAL\InsightCaptureBridge`

Thai guide:
`deployment/dev-mode/INSTALL_TH.md`

## Manifest Profiles (Dev / Prod)

This extension now uses split manifest profiles:

- Shared base: `manifest.shared.json`
- Dev profile: `manifest.profiles/dev.json` (includes localhost)
- Prod profile: `manifest.profiles/prod.json` (store-safe host patterns)

Generate `manifest.json` for local unpacked usage:

```powershell
.\deployment\build-manifest.ps1 -Profile dev
```

Build production zip for Chrome Web Store upload:

```powershell
.\deployment\build-prod-zip.ps1
```

## Install (Managed Policy, Internal)

For internal production rollout without Dev Mode:

1. Use deployment kit:
`apps/frontend/browser-extension/insight-capture-bridge/deployment`
2. Host extension CRX + `update.xml` on an internal HTTPS endpoint.
3. Apply enterprise policy (`ExtensionInstallForcelist`) with admin tooling (GPO/Intune/MDM or local admin script).
4. Restart browser and verify in:
   - `chrome://policy`
   - `edge://policy`

See:
`deployment/README.md`

## Use from system UI

1. Open:
`/app/internal/insight-capture-workspace`
2. Fill Post URL (and optional Page ID)
3. Click **Capture via Extension**
4. If login/checkpoint appears on Facebook tab, complete it there
5. Go back and click capture again

PNG files are saved from system UI to a selected local folder:
- `Save destination: Selected folder (no save popup)`
- Click `Select output folder` once
- Next captures are auto-saved to `<your-folder>/insight-captures/...`
- Folder selection is persisted across browser refreshes

## Notes

- This MVP captures the visible browser viewport after Insights opens.
- It keeps the Facebook tab open for login/checkpoint remediation when needed.
- Settings page is available via the extension popup `Settings` button (options page).
