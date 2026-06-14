# SIGA → iCloud Sync

Sync your Casa da Música SIGA work schedule ("Mapa de Trabalhos") directly into your
personal iCloud Calendar — with one click.

This repo contains three parts:

- **`backend/`** — a small server that talks to iCloud's CalDAV API on your behalf
- **`firefox-extension/`** — the browser extension for Firefox / Zen
- **`chrome-extension/`** — the browser extension for Chrome / Edge / Brave

---

## How it works

1. You log into SIGA normally and open **"Mapa de Trabalhos"** with your desired date range
2. You click the extension icon and enter your **Apple ID** and an **app-specific password**
3. The extension reads your shifts directly from the page (no SIGA credentials are ever sent anywhere)
4. Your shifts are sent to the backend, which creates/updates/deletes matching events in your iCloud Calendar
5. Events that no longer exist in SIGA (e.g. a cancelled shift) are automatically removed from your calendar on the next sync

Each event's notes include the **Sala** (room) for that shift.

---

## Installing the extension

### Firefox / Zen

1. Download the latest `.xpi` from [Releases](#) *(or from the Mozilla Add-on listing, once published)*
2. Drag the `.xpi` file into a Firefox/Zen window, **or** go to `about:addons` → gear icon → "Install Add-on From File"

### Chrome / Edge / Brave

1. Install from the Chrome Web Store: *(link once approved)*
2. Or for manual installs: go to `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the `chrome-extension/` folder

---

## Getting an app-specific password

The extension never uses your main Apple ID password. Instead:

1. Go to [appleid.apple.com](https://appleid.apple.com) and sign in
2. Go to **Sign-In and Security → App-Specific Passwords**
3. Click **+**, name it `siga-sync`, and generate a password
4. Paste this password into the extension popup along with your Apple ID email

You can revoke this password at any time from the same page — this immediately disconnects the extension from your iCloud account without affecting your main Apple ID password.

---

## Usage

1. Open `siga.casadamusica.com/maestro/mapa/`, log in, and set your date range ("Data Início" / "Data Fim")
2. Click the **SIGA → iCloud Sync** extension icon
3. Enter your Apple ID + app-specific password (only needed once — it's saved locally in your browser)
4. Click **Fetch & Sync**

The popup shows how many shifts were found, how many were added/updated, and how many old events were removed.

---

## Backend (`backend/`)

A minimal Express server deployed on Vercel. It exposes:

- `POST /sync` — receives `{ appleId, appPassword, events }`, syncs events to the user's iCloud calendar via CalDAV, and returns a summary
- `GET /privacy.html` — the privacy policy required for browser extension store listings

### Local development

```bash
cd backend
npm install
node index.js
```

### Deploying

```bash
cd backend
vercel --prod
```

If you redeploy to a new URL, update `BACKEND_URL` in both `firefox-extension/popup.js` and `chrome-extension/popup.js`, and the `host_permissions` / `permissions` in both `manifest.json` files.

---

## Privacy

- SIGA credentials are never used by this tool — the extension reads your schedule directly from the page you already have open while logged in
- Apple ID and app-specific password are stored locally in your browser's extension storage only
- The backend does not log, store, or retain credentials or schedule data after a sync request completes

Full privacy policy: `backend/index.js` → `/privacy.html` route (served at your deployed backend URL).

---

## Known limitations

- The schedule parser identifies "your" rows by matching your name (from SIGA's `.profile-data-name` element) against the "Sala" column — if SIGA changes this page's structure, the parser may need updating
- Days off ("Folga", "Compensação Feriado", "Feriado") are automatically skipped
- Shifts crossing midnight are handled correctly (end date rolls over to the next day)