# SIGA → iCloud Sync

Sync your Casa da Música SIGA work schedule ("Mapa de Trabalhos") directly into your
personal iCloud Calendar — with one click.

This repo contains three parts:

- **`backend/`** — a small server that talks to iCloud's CalDAV API on your behalf
- **`firefox-extension/`** — the browser extension for Firefox / Zen
- **`chrome-extension/`** — the browser extension for Chrome / Edge / Brave
- **`releases/`** — ready-to-install packaged versions of both extensions

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

The easiest way to install is from the **`releases/`** folder, which always contains the
latest ready-to-use packages — no need to clone the whole repo or load unpacked source.

### Firefox / Zen

1. Go to [`releases/`](releases) and download the latest `siga-sync-firefox-vX.X.xpi`
2. Drag the `.xpi` file into a Firefox/Zen window, **or** go to `about:addons` → gear icon → "Install Add-on From File"

> If a signed `.xpi` isn't available yet, use the `-source.zip` instead: unzip it, go to
> `about:debugging` → "This Firefox"/"This Zen" → "Load Temporary Add-on..." → select
> `manifest.json` inside the unzipped folder. Note this method needs to be redone each time
> the browser restarts.

### Chrome / Edge / Brave

1. Once published on the Chrome Web Store, install via: *(link once approved)*
2. For manual installs: go to [`releases/`](releases), download the latest
   `siga-sync-chrome-vX.X.zip`, unzip it, then go to `chrome://extensions`, enable
   **Developer mode**, click **Load unpacked**, and select the unzipped folder

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

## Releases (`releases/`)

Each release is a packaged zip (or signed `.xpi` for Firefox) of a specific version of the
extensions, named `siga-sync-<browser>-v<version>.<ext>`.

### Creating a new release

After making changes and bumping the version number in both `manifest.json` files:

```bash
# Chrome
cd chrome-extension
zip -r ../releases/siga-sync-chrome-vX.X.zip . -x ".*"
cd ..

# Firefox (source fallback — prefer the signed .xpi from Mozilla if available)
cd firefox-extension
zip -r ../releases/siga-sync-firefox-vX.X-source.zip . -x ".*"
cd ..
```

Then commit:

```bash
git add releases/
git commit -m "Add vX.X release packages"
git push
```

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