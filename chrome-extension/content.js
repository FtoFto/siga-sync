function parseSchedule() {
  const rows = document.querySelectorAll('table tbody tr');
  const events = [];
  let currentDate = '';
  let lastEventSala = '';

  // Get the logged-in user's name from the profile section (present on every SIGA page)
  const userNameEl = document.querySelector('.profile-data-name');
  let userName = userNameEl ? userNameEl.textContent.trim() : '';

  rows.forEach(row => {
    const cells = row.querySelectorAll('td');

    // Date header row (single cell spanning the whole row)
    if (cells.length === 1) {
      currentDate = cells[0].textContent.trim().split(',')[0];
      return;
    }
    if (cells.length < 5) return;

    const sala = cells[2].textContent.trim();
    const activity = cells[3].textContent.trim();
    const hours = cells[4].textContent.trim();

    // If this row doesn't contain your name, it's the general event row (grey row).
    // Remember its Sala so we can attach it to your personal row below it.
    if (!userName || !sala.includes(userName)) {
      lastEventSala = sala;
      return;
    }

    // Skip days off and holidays
    if (['Folga', 'Compensação Feriado', 'Feriado'].some(x => activity.includes(x))) return;

    const start = cells[0].textContent.trim();
    const end = cells[1].textContent.trim();

    // If the shift crosses midnight (end time is earlier than start time),
    // the end date must be the next day
    let endDate = currentDate;
    if (end <= start) {
      const [y, m, d] = currentDate.trim().split('-').map(Number);
      const date = new Date(y, m - 1, d);
      date.setDate(date.getDate() + 1);
      endDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    events.push({
      date: currentDate,
      start: `${currentDate}T${start}:00`,
      end: `${endDate}T${end}:00`,
      title: activity,
      hours,
      sala: lastEventSala,
    });
  });

  return events;
}

// Listen for requests from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_SCHEDULE') {
    const events = parseSchedule();
    sendResponse({ events });
  }
});