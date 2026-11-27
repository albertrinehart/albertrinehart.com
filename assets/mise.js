// Mise page: tap or click a phone (or the caption) to show all three screens in the next theme.
(function () {
  const THEMES = [
    ['classic', 'Classic'], ['graphite', 'Graphite'], ['ocean', 'Ocean'], ['sunset', 'Sunset'],
    ['forest', 'Forest'], ['lavender', 'Lavender'], ['midnight', 'Midnight'],
  ];
  const section = document.querySelector('.screens');
  const toggle = document.querySelector('.theme-toggle');
  if (!section || !toggle) return;

  const screens = [...section.querySelectorAll('.screen[data-screen]')];
  const nameEl = toggle.querySelector('.theme-name');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const src = (theme, screen) => '/assets/mise/' + theme + '-' + screen.dataset.screen + '.jpg';
  let index = 0;

  // Fetch the other themes in the background once the page has loaded.
  window.addEventListener('load', () => {
    THEMES.slice(1).forEach(([theme]) => screens.forEach((screen) => { new Image().src = src(theme, screen); }));
  });

  function swap(screen, url) {
    const img = screen.querySelector('img:not(.screen-next)');
    screen.querySelectorAll('.screen-next').forEach((el) => el.remove());
    if (reduceMotion) { img.src = url; return; }
    const next = new Image();
    next.className = 'screen-next';
    next.alt = '';
    next.src = url;
    screen.appendChild(next);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      img.src = url;
      img.decode().catch(() => {}).then(() => next.remove());
    };
    next.decode().catch(() => {}).then(() => {
      requestAnimationFrame(() => next.classList.add('is-in'));
      next.addEventListener('transitionend', finish, { once: true });
      setTimeout(finish, 600); // in case the fade never runs (e.g. a background tab)
    });
  }

  function nextTheme() {
    index = (index + 1) % THEMES.length;
    const [theme, name] = THEMES[index];
    screens.forEach((screen) => swap(screen, src(theme, screen)));
    nameEl.textContent = name;
  }

  section.classList.add('is-switchable');
  toggle.hidden = false;
  section.addEventListener('click', (e) => { if (e.target.closest('.screen')) nextTheme(); });
  toggle.addEventListener('click', nextTheme);
})();
