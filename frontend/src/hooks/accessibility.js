/**
 * Accessibility controls.
 *
 * Indian government portals are expected to carry these under the GIGW
 * guidelines: text resizing and a high-contrast mode, both persisted so a
 * low-vision user sets them once rather than on every visit.
 *
 * Both work by setting attributes on <html>, which the stylesheet reacts to,
 * so no component needs to know about them.
 */

const FONT_KEY = 'fingrow_font_scale';
const CONTRAST_KEY = 'fingrow_high_contrast';
// Kept under its original key so an existing preference survives this change.
const THEME_KEY = 'theme';

// Steps a user can reach with A- / A / A+, as a multiplier on the root size.
export const FONT_STEPS = [0.9, 1, 1.15, 1.3];

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Blocked storage — the setting applies for this visit only.
  }
}

export function getFontScale() {
  const scale = read(FONT_KEY, 1);
  return FONT_STEPS.includes(scale) ? scale : 1;
}

export function getHighContrast() {
  return read(CONTRAST_KEY, false) === true;
}

/**
 * The theme, resolved in this order: an explicit stored choice, then the
 * operating system's preference, then light. Someone who runs their whole
 * device dark should not be handed a white page on first visit.
 */
export function getTheme() {
  let stored = null;
  try {
    stored = localStorage.getItem(THEME_KEY);
  } catch {
    stored = null;
  }
  if (stored === 'dark' || stored === 'light') return stored;

  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function setTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Applies for this visit only.
  }
  applyAccessibility();
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/** Apply the stored settings to the document. Safe to call repeatedly. */
export function applyAccessibility() {
  const root = document.documentElement;
  root.style.fontSize = `${getFontScale() * 100}%`;
  root.toggleAttribute('data-high-contrast', getHighContrast());
  root.classList.toggle('dark', getTheme() === 'dark');
  // Lets the browser style form controls and scrollbars to match.
  root.style.colorScheme = getTheme();
}

export function setFontScale(scale) {
  write(FONT_KEY, scale);
  applyAccessibility();
}

/** Move one step up or down the scale, clamped at the ends. */
export function stepFontScale(direction) {
  const current = FONT_STEPS.indexOf(getFontScale());
  const next = Math.min(FONT_STEPS.length - 1, Math.max(0, current + direction));
  setFontScale(FONT_STEPS[next]);
  return FONT_STEPS[next];
}

export function setHighContrast(on) {
  write(CONTRAST_KEY, on);
  applyAccessibility();
}

export function toggleHighContrast() {
  const next = !getHighContrast();
  setHighContrast(next);
  return next;
}
