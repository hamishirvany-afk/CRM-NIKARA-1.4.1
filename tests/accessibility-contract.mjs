import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) {
    console.error('ACCESSIBILITY_CONTRACT_FAIL:', message);
    process.exit(1);
  }
}

function rgb(hex) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map(offset => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function luminance(hex) {
  return rgb(hex)
    .map(channel => channel / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrast(foreground, background) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

const html = fs.readFileSync('frontend/index.html', 'utf8');
const css = fs.readFileSync('frontend/style.css', 'utf8');
const app = fs.readFileSync('frontend/app.js', 'utf8');

assert(contrast('#17202f', '#ffffff') >= 4.5, 'primary light text fails WCAG AA');
assert(contrast('#667085', '#ffffff') >= 4.5, 'muted light text fails WCAG AA');
assert(contrast('#f4f7fb', '#121a27') >= 4.5, 'primary dark text fails WCAG AA');
assert(contrast('#9aa5b5', '#121a27') >= 4.5, 'muted dark text fails WCAG AA');
assert(contrast('#ffffff', '#087a64') >= 4.5, 'success button text fails WCAG AA');
assert(css.includes('.btn.success{color:#fff'), 'success button contrast override missing');
assert(css.includes(':focus-visible'), 'visible keyboard focus style missing');
assert(css.includes('prefers-reduced-motion:reduce'), 'reduced-motion preference missing');
assert(css.includes('min-height:43px') || css.includes('min-height:44px'), 'touch targets are below the product baseline');
assert(html.includes('aria-live="polite"') && html.includes('role="status"'), 'status announcements missing');
assert(html.includes('role="dialog"') && html.includes('aria-modal="true"'), 'modal semantics missing');
assert(app.includes('trapModalFocus') && app.includes('trapDatePickerFocus'), 'dialog focus containment missing');
assert(html.includes('data-text-size-choice="large"') && html.includes('highContrastSetting'), 'readability controls missing');
assert(css.includes('html[data-contrast="high"]'), 'high-contrast theme rules missing');

console.log('ACCESSIBILITY_CONTRACT_PASS');
