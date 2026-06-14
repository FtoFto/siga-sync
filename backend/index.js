const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

function makeRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function makeUID(event) {
  const clean = event.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  return `siga-${event.date}-${event.start.slice(11,16)}-${event.end.slice(11,16)}-${clean}@siga-sync`;
}

// Discover the user's iCloud calendar home (server + user ID)
async function discoverCalendarHome(auth) {
  const principalBody = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop><d:current-user-principal/></d:prop>
</d:propfind>`;

  const principalResult = await makeRequest({
    hostname: 'caldav.icloud.com',
    path: '/',
    method: 'PROPFIND',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/xml',
      'Depth': '0',
      'Content-Length': Buffer.byteLength(principalBody),
    },
  }, principalBody);

  const principalMatch = principalResult.body.match(/<href[^>]*>([^<]*principal[^<]*)<\/href>/);
  if (!principalMatch) throw new Error(`Could not find principal path. Status: ${principalResult.status}, Body: ${principalResult.body.slice(0,300)}`);
  const principalPath = principalMatch[1];

  // calendar-home-set
  const homeBody = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-home-set/></d:prop>
</d:propfind>`;

  const homeResult = await makeRequest({
    hostname: 'caldav.icloud.com',
    path: principalPath,
    method: 'PROPFIND',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/xml',
      'Depth': '0',
      'Content-Length': Buffer.byteLength(homeBody),
    },
  }, homeBody);

  const homeMatch = homeResult.body.match(/<href[^>]*>(https:\/\/([^\/]+)([^<]+))<\/href>/);
  if (!homeMatch) throw new Error(`Could not find calendar home. Status: ${homeResult.status}, Body: ${homeResult.body.slice(0,300)}`);

  let calPath = homeMatch[3];
  if (!calPath.endsWith('/')) calPath += '/';
  calPath += 'home/';

  return {
    hostname: 'caldav.icloud.com',
    path: calPath,
    discoveredHostname: homeMatch[2],
    principalPath,
  };
}

async function fetchExistingEvents(auth, hostname, calPath) {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT"/>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;

  const result = await makeRequest({
    hostname,
    port: 443,
    path: calPath,
    method: 'REPORT',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/xml',
      'Depth': '1',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);

  const existing = [];
  const hrefMatches = [...result.body.matchAll(/<href[^>]*>([^<]+\.ics)<\/href>/g)].map(m => m[1]);
  const uidMatches = [...result.body.matchAll(/UID:([^\r\n]+)/g)].map(m => m[1].trim());

  for (let i = 0; i < hrefMatches.length; i++) {
    existing.push({ href: hrefMatches[i], uid: uidMatches[i] });
  }
  return existing;
}

async function deleteEvent(auth, hostname, href) {
  await makeRequest({
    hostname,
    port: 443,
    path: href,
    method: 'DELETE',
    headers: { 'Authorization': `Basic ${auth}` },
  });
}

async function putEvent(auth, hostname, calPath, event) {
  const uid = makeUID(event);
  const filename = uid.replace(/[^a-z0-9@-]/gi, '_');
  const path = `${calPath}${filename}.ics`;

  await makeRequest({
    hostname,
    port: 443,
    path,
    method: 'DELETE',
    headers: { 'Authorization': `Basic ${auth}` },
  });

  const icsData = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//siga-sync//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)}Z`,
    `DTSTART;TZID=Europe/Lisbon:${event.start.replace(/[-:]/g, '').slice(0, 15)}`,
    `DTEND;TZID=Europe/Lisbon:${event.end.replace(/[-:]/g, '').slice(0, 15)}`,
    `SUMMARY:${event.title}`,
    `DESCRIPTION:Sala: ${event.sala || 'N/A'}\\nHoras: ${event.hours}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const result = await makeRequest({
    hostname,
    port: 443,
    path,
    method: 'PUT',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Length': Buffer.byteLength(icsData),
    },
  }, icsData);

  return { status: result.status, body: result.body, path, uid };
}

app.get('/privacy.html', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Privacy Policy — SIGA → iCloud Sync</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; max-width: 640px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #222; }
    h1 { font-size: 22px; }
    h2 { font-size: 16px; margin-top: 28px; }
    p, li { font-size: 14px; }
    .updated { color: #888; font-size: 13px; }
  </style>
</head>
<body>
  <h1>Privacy Policy — SIGA → iCloud Sync</h1>
  <p class="updated">Last updated: June 2026</p>
  <p>SIGA → iCloud Sync is a browser extension that reads your work schedule from the Casa da Música SIGA system (siga.casadamusica.com) and creates matching events in your personal iCloud Calendar.</p>
  <h2>What information is used</h2>
  <ul>
    <li><strong>Schedule data</strong>: the extension reads the shift table (dates, times, room, activity) from the "Mapa de Trabalhos" page you have open. This data never leaves your browser except to be sent to the sync server described below.</li>
    <li><strong>Apple ID and app-specific password</strong>: used to authenticate with Apple's iCloud calendar service (CalDAV) so that events can be created, updated, or removed on your behalf.</li>
  </ul>
  <h2>How information is used and stored</h2>
  <ul>
    <li>Your Apple ID and app-specific password are stored locally in your browser's extension storage, so you don't need to re-enter them each time. This data stays on your device.</li>
    <li>When you click "Fetch &amp; Sync", your schedule data and iCloud credentials are sent over an encrypted (HTTPS) connection to a small sync server operated for this extension. The server uses these credentials only to connect to Apple's iCloud CalDAV service on your behalf, for the duration of the request.</li>
    <li>The sync server does not store, log, or retain your credentials or schedule data after the request completes.</li>
  </ul>
  <h2>Third parties</h2>
  <p>Data is sent only to Apple's iCloud servers (to create/update/delete calendar events) and to the sync server operated for this extension. No data is sold, shared with advertisers, or used for any purpose other than syncing your schedule.</p>
  <h2>App-specific passwords</h2>
  <p>We recommend using an Apple <a href="https://appleid.apple.com" target="_blank" rel="noopener">app-specific password</a> rather than your main Apple ID password. App-specific passwords can be revoked at any time from your Apple ID account settings without affecting your main account.</p>
  <h2>Removing your data</h2>
  <p>To remove locally stored credentials, uninstall the extension or clear its storage via your browser's extension settings. To revoke access to your iCloud account, delete the app-specific password from your Apple ID account at any time.</p>
  <h2>Contact</h2>
  <p>For questions about this policy or the extension, please contact the developer who shared this extension with you.</p>
</body>
</html>`);
});

app.post('/sync', async (req, res) => {
  const { appleId, appPassword, events } = req.body;

  if (!appleId || !appPassword || !Array.isArray(events)) {
    return res.status(400).json({ error: 'Missing appleId, appPassword, or events' });
  }

  const auth = Buffer.from(`${appleId}:${appPassword}`).toString('base64');

  try {
    const { hostname, path: calPath } = await discoverCalendarHome(auth);

    const existingEvents = await fetchExistingEvents(auth, hostname, calPath);
    const newUIDs = new Set(events.map(makeUID));
    const existingSigaEvents = existingEvents.filter(e => e.uid && e.uid.includes('@siga-sync'));
    const toDelete = existingSigaEvents.filter(e => !newUIDs.has(e.uid));

    let deleted = 0;
    for (const event of toDelete) {
      try {
        await deleteEvent(auth, hostname, event.href);
        deleted++;
      } catch (e) {}
    }

    const results = [];
    for (const event of events) {
      try {
        const result = await putEvent(auth, hostname, calPath, event);
        if (result.status === 201 || result.status === 204) {
          results.push({ title: event.title, status: 'added' });
        } else {
          results.push({ title: event.title, status: 'error', error: `Status ${result.status} | path: ${result.path} | body: ${result.body.slice(0,200)}` });
        }
      } catch (err) {
        results.push({ title: event.title, status: 'error', error: err.message });
      }
    }

    res.json({
      results,
      deleted,
      added: results.filter(r => r.status === 'added').length,
      errors: results.filter(r => r.status === 'error').length,
      calendarHome: { hostname, calPath },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => res.send('siga-sync backend running'));

module.exports = app;