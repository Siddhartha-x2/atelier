// Dark is the default. Only the display preference is stored in localStorage.
// Run before CSS so a saved light preference applies immediately.
const themeKey = 'artstudio-theme';

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
  const toggle = document.querySelector('#theme-toggle');
  const label = document.querySelector('#theme-label');
  const next = theme === 'light' ? 'dark' : 'light';
  if (toggle) {
    toggle.setAttribute('aria-label', `Switch to ${next} mode`);
    toggle.title = `Switch to ${next} mode`;
  }
  if (label)
    label.textContent = `${next[0].toUpperCase()}${next.slice(1)} mode`;
}

let savedTheme = 'dark';
try {
  savedTheme = localStorage.getItem(themeKey) === 'light' ? 'light' : 'dark';
} catch {
  /* Restricted storage still gets a working dark default. */
}
applyTheme(savedTheme);

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(document.documentElement.dataset.theme);
  document.querySelector('#theme-toggle').addEventListener('click', () => {
    const next =
      document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try {
      localStorage.setItem(themeKey, next);
    } catch {
      /* Switching still works if preferences cannot be saved. */
    }
  });
});

// Keep other open tabs consistent when the preference changes.
window.addEventListener('storage', (event) => {
  if (event.key === themeKey)
    applyTheme(event.newValue === 'light' ? 'light' : 'dark');
});
