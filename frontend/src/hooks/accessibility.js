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

/** Apply the stored settings to the document. Safe to call repeatedly. */
export function applyAccessibility() {
  const root = document.documentElement;
  root.style.fontSize = `${getFontScale() * 100}%`;
  root.toggleAttribute('data-high-contrast', getHighContrast());
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
