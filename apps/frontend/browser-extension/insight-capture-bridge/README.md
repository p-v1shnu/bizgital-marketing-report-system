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
