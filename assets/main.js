// Read / Index toggle: click anywhere (except links) to switch views.
(function () {
  const body = document.body;
  const toggleBtn = document.getElementById('toggle');
  if (!toggleBtn) return;

  const meta = document.querySelector('meta[name="theme-color"]');

  function setView(view, updateHash) {
    const isIndex = view === 'index';
    body.classList.toggle('index', isIndex);
    toggleBtn.setAttribute('aria-pressed', String(isIndex));
    if (meta) meta.setAttribute('content', isIndex ? '#0E0E0E' : '#FFFFFF');
    if (updateHash) {
      history.replaceState(null, '', isIndex ? '#index' : location.pathname);
    }
    if (isIndex) document.dispatchEvent(new CustomEvent('index-shown'));
  }

  function toggle() {
    setView(body.classList.contains('index') ? 'read' : 'index', true);
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('a')) return;
    if (window.getSelection && String(window.getSelection()).length > 0) return; // let people select text
    toggle();
  });

  // Defer the initial hash check so the rides script below is listening first.
  if (location.hash === '#index' || location.hash === '#rides') {
    window.addEventListener('DOMContentLoaded', () => setView('index', false));
    if (document.readyState !== 'loading') setView('index', false);
  }
})();

// Rides: render data/rides.json (written daily by the GitHub Action).
(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = (n, digits = 0) =>
    n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: digits });

  let data = null;

  function dateLabel(iso) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
  }

  // Count each stat up from zero to its total, easing out.
  function countUp() {
    if (!data) return;
    document.querySelectorAll('[data-count]').forEach((el) => {
      const target = data[el.dataset.count];
      if (target == null) { el.textContent = '—'; return; }
      if (reduceMotion || target === 0) { el.textContent = fmt(target); return; }

      const duration = 3600;
      const start = performance.now();
      if (el._raf) cancelAnimationFrame(el._raf);
      const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = fmt(Math.round(target * eased));
        if (t < 1) el._raf = requestAnimationFrame(step);
      };
      el._raf = requestAnimationFrame(step);
    });
  }

  document.addEventListener('index-shown', countUp);

  fetch('/data/rides.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => {
      if (!json) return;
      data = json;

      const updated = document.querySelector('[data-ride="updated"]');
      if (updated && data.updated_at) updated.textContent = 'Updated ' + dateLabel(data.updated_at);

      const list = document.getElementById('ride-list');
      const rides = Array.isArray(data.recent) ? data.recent : [];
      if (list) {
        rides.slice(0, 5).forEach((ride) => {
          const row = document.createElement('div');
          row.className = 'ride';

          const name = document.createElement('span');
          name.textContent = ride.name;

          const meta = document.createElement('span');
          meta.className = 'meta';
          meta.textContent = dateLabel(ride.date) + ' · ' + fmt(ride.miles, 1) + ' mi · ' + fmt(ride.elevation_ft) + ' ft · ' +
            (ride.avg_watts != null ? fmt(ride.avg_watts) + ' W avg · ' : '') +
            (ride.best20_watts != null ? fmt(ride.best20_watts) + ' W 20-min · ' : '');

          // Strava's brand guidelines require links back to Strava data to read "View on Strava".
          const link = document.createElement('a');
          link.className = 'view-on-strava';
          link.href = 'https://www.strava.com/activities/' + encodeURIComponent(ride.id);
          link.target = '_blank';
          link.rel = 'noopener';
          link.textContent = 'View on Strava';
          meta.appendChild(link);

          row.append(name, meta);
          list.appendChild(row);
        });
      }

      // If Index is already open (e.g. arrived via #index), count up now.
      if (document.body.classList.contains('index')) countUp();
    })
    .catch(() => {});
})();
