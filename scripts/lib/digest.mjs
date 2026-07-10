// Pure helpers used by scripts/new-digest.mjs. Kept side-effect-free (no fs,
// no process.argv) so they can be unit tested in isolation.

import { MONTHS } from '../config.mjs';

export function todayInTimeZone(timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function formatWeekRange(date) {
  const dayOfWeek = date.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const start = addDays(date, -daysSinceMonday);
  const end = addDays(start, 6);
  if (start.getUTCFullYear() === end.getUTCFullYear()) {
    return `${formatNoYear(start)} - ${formatNoYear(end)}`;
  }
  return `${formatFull(start)} - ${formatFull(end)}`;
}

function formatNoYear(date) {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

function formatFull(date) {
  return `${formatNoYear(date)} ${date.getUTCFullYear()}`;
}

export function sanitizeFilePart(value) {
  const safe = String(value)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return safe || 'News Digest';
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

export function renderTemplate(template, values) {
  return template.replace(/{{\s*([A-Z0-9_]+)\s*}}/g, (match, key) => {
    if (!Object.hasOwn(values, key)) throw new Error(`Unknown template placeholder: ${key}`);
    return escapeHtml(values[key]);
  });
}
