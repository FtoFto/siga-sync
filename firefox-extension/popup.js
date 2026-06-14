const BACKEND_URL = 'https://syncbackend-chi.vercel.app';

const appleIdInput = document.getElementById('appleId');
const appPasswordInput = document.getElementById('appPassword');
const syncBtn = document.getElementById('syncBtn');
const statusEl = document.getElementById('status');
const eventsEl = document.getElementById('events');

// Load saved credentials
browser.storage.local.get(['appleId', 'appPassword']).then(data => {
  if (data.appleId) appleIdInput.value = data.appleId;
  if (data.appPassword) appPasswordInput.value = data.appPassword;
});

function clearChildren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function setStatus(text, className) {
  clearChildren(statusEl);
  const span = document.createElement('span');
  if (className) span.className = className;
  span.textContent = text;
  statusEl.appendChild(span);
}

function appendStatusLine(text, className) {
  statusEl.appendChild(document.createElement('br'));
  const span = document.createElement('span');
  if (className) span.className = className;
  span.textContent = text;
  statusEl.appendChild(span);
}

function renderEvents(events) {
  clearChildren(eventsEl);
  events.forEach(e => {
    const div = document.createElement('div');
    div.className = 'event';

    const title = document.createElement('b');
    title.textContent = e.title;
    div.appendChild(title);

    div.appendChild(document.createElement('br'));

    const details = document.createTextNode(
      `${e.date} · ${e.start.slice(11, 16)}–${e.end.slice(11, 16)} · ${e.hours}h`
    );
    div.appendChild(details);

    eventsEl.appendChild(div);
  });
}

syncBtn.addEventListener('click', async () => {
  const appleId = appleIdInput.value.trim();
  const appPassword = appPasswordInput.value.trim();

  if (!appleId || !appPassword) {
    setStatus('Please fill in both fields.', 'error');
    return;
  }

  // Save credentials for next time
  browser.storage.local.set({ appleId, appPassword });

  syncBtn.disabled = true;
  setStatus('Reading schedule from page...');
  clearChildren(eventsEl);

  try {
    // Get the active tab
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];

    if (!tab.url.includes('siga.casadamusica.com/maestro/mapa')) {
      setStatus('Open "Mapa de Trabalhos" with your date range first.', 'error');
      syncBtn.disabled = false;
      return;
    }

    // Ask the content script for the schedule
    const response = await browser.tabs.sendMessage(tab.id, { type: 'GET_SCHEDULE' });
    const events = response.events;

    if (!events || events.length === 0) {
      setStatus('No shifts found on this page. Check your date range.', 'error');
      syncBtn.disabled = false;
      return;
    }

    setStatus(`${events.length} shifts found. Syncing to iCloud...`);

    // Send to backend for CalDAV sync
    const res = await fetch(`${BACKEND_URL}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appleId, appPassword, events }),
    });
    const data = await res.json();

    if (data.error) {
      setStatus(data.error, 'error');
    } else {
      setStatus(
        `✓ Sync complete — added/updated: ${data.added}, removed: ${data.deleted}${data.errors ? `, errors: ${data.errors}` : ''}`,
        'success'
      );
      if (data.errors > 0) {
        appendStatusLine('Some events could not be synced. Try again.', 'error');
      }
      renderEvents(events);
    }
  } catch (err) {
    setStatus(`Error: ${err.message}`, 'error');
  }

  syncBtn.disabled = false;
});