import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// NOTE: DEFAULT_CONFIG is mirrored in assets/site.js for the browser pages
// (index.html / archive.html), which can't import this Node module directly.
// test/site-js.test.mjs asserts the two copies stay equal. If you change one,
// change the other.
export const DEFAULT_CONFIG = Object.freeze({
  siteTitle: 'Personal News Digest',
  description: 'A personal daily news page for the topics you care about.',
  eyebrow: 'Daily Brief',
  digestTitlePrefix: 'Personal News Digest',
  topic: 'news you care about',
  audience: 'a personal daily reader',
  coverageWindow: 'last 24 hours',
  timezone: 'America/New_York',
  publishTimeLocal: '06:30',
  accentColor: '#2563eb',
  draftBranchPrefix: 'daily-digest',
  siteUrl: '',
  // 'review' (default): each daily draft opens a PR and publishes only when
  // a human merges it. 'auto': a generated digest that passes payload
  // validation and the content linter is committed straight to main and
  // deploys with no human source review; a failed generation publishes
  // nothing (the placeholder never goes live in auto mode).
  publishMode: 'review',
  // AI drafts turn on by adding the ANTHROPIC_API_KEY Actions secret -- the
  // secret is the switch. Set `"ai": { "enabled": false }` to pause AI
  // drafts without deleting the secret.
  ai: Object.freeze({ enabled: true, model: 'claude-sonnet-5', maxStories: 4, instructions: '' }),
});

export async function loadSiteConfig(root) {
  let fileConfig = {};
  try {
    fileConfig = JSON.parse(await readFile(join(root, 'site.config.json'), 'utf8'));
  } catch (err) {
    if (!err || err.code !== 'ENOENT') {
      throw new Error(`Could not read site.config.json: ${err.message}`);
    }
  }

  const config = { ...DEFAULT_CONFIG, ...fileConfig };
  // The top-level spread is shallow, so the nested `ai` object would be
  // replaced wholesale by a partial user override (e.g. `{ "enabled": true }`
  // would drop the default model). Deep-merge it so users can set one key and
  // keep the rest of the defaults. A non-object `ai` is left untouched so
  // validateSiteConfig can reject it below.
  const rawAi = fileConfig.ai;
  if (rawAi && typeof rawAi === 'object' && !Array.isArray(rawAi)) {
    config.ai = { ...DEFAULT_CONFIG.ai, ...rawAi };
  } else if (rawAi === undefined) {
    config.ai = { ...DEFAULT_CONFIG.ai };
  }
  const errors = validateSiteConfig(config);
  if (errors.length) {
    throw new Error(`Invalid site.config.json:\n- ${errors.join('\n- ')}`);
  }
  // Normalize: strip a single trailing slash so callers can always build
  // URLs as `${siteUrl}/path` without worrying about a doubled slash.
  if (typeof config.siteUrl === 'string') {
    config.siteUrl = config.siteUrl.replace(/\/$/, '');
  }
  return config;
}

export function validateSiteConfig(config) {
  const errors = [];
  const requiredStrings = [
    'siteTitle',
    'description',
    'eyebrow',
    'digestTitlePrefix',
    'topic',
    'audience',
    'coverageWindow',
    'timezone',
    'publishTimeLocal',
    'accentColor',
    'draftBranchPrefix',
  ];

  for (const key of requiredStrings) {
    if (typeof config[key] !== 'string' || !config[key].trim()) {
      errors.push(`${key} must be a non-empty string`);
    }
  }

  if (
    typeof config.publishTimeLocal === 'string' &&
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(config.publishTimeLocal)
  ) {
    errors.push('publishTimeLocal must use 24-hour HH:MM format');
  }

  if (typeof config.timezone === 'string' && config.timezone.trim()) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: config.timezone }).format(new Date());
    } catch {
      errors.push('timezone must be a valid IANA timezone, such as America/New_York');
    }
  }

  if (
    typeof config.draftBranchPrefix === 'string' &&
    !/^[A-Za-z0-9._/-]+$/.test(config.draftBranchPrefix)
  ) {
    errors.push('draftBranchPrefix may only contain letters, numbers, dots, slashes, underscores, and hyphens');
  }

  if (typeof config.siteUrl !== 'string') {
    errors.push('siteUrl must be a string');
  } else if (config.siteUrl.trim()) {
    let parsed;
    try {
      parsed = new URL(config.siteUrl.trim());
    } catch {
      errors.push('siteUrl must be a valid absolute URL, such as https://user.github.io/repo');
    }
    if (parsed && parsed.protocol !== 'https:') {
      errors.push('siteUrl must use the https:// protocol');
    }
  }

  if (typeof config.accentColor === 'string' && config.accentColor.trim()) {
    const accentColor = config.accentColor.trim();
    // Reject dangerous characters: ; { } <
    if (/[;{}]|</.test(accentColor)) {
      errors.push('accentColor must not contain semicolons, braces, or angle brackets');
    }
    // Allow hex colors (#rgb, #rrggbb, #rrggbbaa) or CSS keywords/functions
    // (letters, digits, parentheses, commas, dots, percent signs, spaces, hyphens)
    else if (!/^(#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?|[a-zA-Z0-9()\s,.%-]+)$/.test(accentColor)) {
      errors.push('accentColor must be a hex color (#rgb, #rrggbb, #rrggbbaa) or a valid CSS color keyword/function');
    }
  }

  if (config.publishMode !== 'review' && config.publishMode !== 'auto') {
    errors.push("publishMode must be 'review' or 'auto'");
  }

  if (config.ai !== undefined) {
    const ai = config.ai;
    if (typeof ai !== 'object' || ai === null || Array.isArray(ai)) {
      errors.push('ai must be an object');
    } else {
      if (typeof ai.enabled !== 'boolean') {
        errors.push('ai.enabled must be a boolean');
      }
      if (typeof ai.model !== 'string' || !ai.model.trim()) {
        errors.push('ai.model must be a non-empty string');
      } else if (!/^[a-z0-9.-]+$/i.test(ai.model)) {
        errors.push('ai.model may only contain letters, numbers, dots, and hyphens');
      }
      if (!Number.isInteger(ai.maxStories) || ai.maxStories < 1 || ai.maxStories > 8) {
        errors.push('ai.maxStories must be an integer between 1 and 8');
      }
      if (typeof ai.instructions !== 'string') {
        errors.push('ai.instructions must be a string');
      }
    }
  }

  return errors;
}

export function formatIsoDate(iso) {
  const [year, month, day] = parseIsoParts(iso);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function parseIsoParts(iso) {
  const match = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Invalid date: ${iso}. Expected YYYY-MM-DD.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date: ${iso}`);
  }
  return [year, month, day];
}
