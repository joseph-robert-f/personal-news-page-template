#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatIsoDate, loadSiteConfig, MONTHS, parseIsoParts } from './config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_PATH = join(ROOT, 'templates', 'digest-template.html');

const args = parseArgs(process.argv.slice(2));
const config = await loadSiteConfig(ROOT);
const isoDate = args.date || todayInTimeZone(config.timezone);
const [year, month, day] = parseIsoParts(isoDate);
const date = new Date(Date.UTC(year, month - 1, day));
const displayDate = formatIsoDate(isoDate);
const weekRange = formatWeekRange(date);
const fileName = `${day} ${MONTHS[month - 1]} ${sanitizeFilePart(config.digestTitlePrefix)}.html`;
const relPath = args.output || `${year}/${MONTHS[month - 1]}/${weekRange}/${fileName}`;
const branchName = `${config.draftBranchPrefix.replace(/\/+$/g, '')}/${isoDate}`;

if (args['print-date']) {
  console.log(isoDate);
  process.exit(0);
}

if (args['print-path']) {
  console.log(relPath);
  process.exit(0);
}

if (args['print-branch']) {
  console.log(branchName);
  process.exit(0);
}

const description = `${config.digestTitlePrefix} for ${displayDate}, covering ${config.topic}.`;
const template = await readFile(TEMPLATE_PATH, 'utf8');
const content = renderTemplate(template, {
  ACCENT_COLOR: config.accentColor,
  AUDIENCE: config.audience,
  COVERAGE_WINDOW: config.coverageWindow,
  DATE_DISPLAY: displayDate,
  DESCRIPTION: description,
  DIGEST_TITLE_PREFIX: config.digestTitlePrefix,
  EYEBROW: config.eyebrow,
  GENERATED_DATE: displayDate,
  ISO_DATE: isoDate,
  SITE_TITLE: config.siteTitle,
  TOPIC: config.topic,
});

if (args['dry-run']) {
  console.log(`Would create ${relPath}`);
  console.log('');
  console.log(content.split('\n').slice(0, 16).join('\n'));
  process.exit(0);
}

const absPath = join(ROOT, relPath);
if (!args.force && await pathExists(absPath)) {
  console.log(`Draft already exists: ${relPath}`);
  process.exit(0);
}

await mkdir(dirname(absPath), { recursive: true });
await writeFile(absPath, content, 'utf8');
console.log(`Created ${relPath}`);

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (['dry-run', 'force', 'print-date', 'print-path', 'print-branch'].includes(key)) {
      parsed[key] = true;
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    parsed[key] = value;
    i += 1;
  }
  return parsed;
}

function renderTemplate(template, values) {
  return template.replace(/{{\s*([A-Z0-9_]+)\s*}}/g, (match, key) => {
    if (!Object.hasOwn(values, key)) throw new Error(`Unknown template placeholder: ${key}`);
    return escapeHtml(values[key]);
  });
}

function todayInTimeZone(timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatWeekRange(date) {
  const dayOfWeek = date.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const start = addDays(date, -daysSinceMonday);
  const end = addDays(start, 6);
  if (start.getUTCFullYear() === end.getUTCFullYear()) {
    return `${formatNoYear(start)} - ${formatNoYear(end)}`;
  }
  return `${formatFull(start)} - ${formatFull(end)}`;
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatNoYear(date) {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

function formatFull(date) {
  return `${formatNoYear(date)} ${date.getUTCFullYear()}`;
}

function sanitizeFilePart(value) {
  const safe = String(value)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return safe || 'News Digest';
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}
