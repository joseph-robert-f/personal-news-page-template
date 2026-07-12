// Unit tests for scripts/config.mjs.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DEFAULT_CONFIG, formatIsoDate, loadSiteConfig, parseIsoParts, validateSiteConfig } from '../scripts/config.mjs';

const REQUIRED_STRINGS = [
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

test('validateSiteConfig accepts the default config', () => {
  assert.deepEqual(validateSiteConfig(DEFAULT_CONFIG), []);
});

test('validateSiteConfig rejects each required string when missing or empty', () => {
  for (const key of REQUIRED_STRINGS) {
    for (const badValue of [undefined, '', '   ']) {
      const errors = validateSiteConfig({ ...DEFAULT_CONFIG, [key]: badValue });
      assert.ok(
        errors.some((e) => e.startsWith(`${key} must be a non-empty string`)),
        `expected an error for ${key} = ${JSON.stringify(badValue)}, got ${JSON.stringify(errors)}`,
      );
    }
  }
});

test('validateSiteConfig rejects a bad publishTimeLocal', () => {
  for (const bad of ['25:00', '6:30']) {
    const errors = validateSiteConfig({ ...DEFAULT_CONFIG, publishTimeLocal: bad });
    assert.ok(errors.some((e) => e.includes('publishTimeLocal must use 24-hour HH:MM format')));
  }
});

test('validateSiteConfig rejects a bad timezone', () => {
  const errors = validateSiteConfig({ ...DEFAULT_CONFIG, timezone: 'Mars/Olympus' });
  assert.ok(errors.some((e) => e.includes('timezone must be a valid IANA timezone')));
});

test('validateSiteConfig rejects a bad draftBranchPrefix', () => {
  const errors = validateSiteConfig({ ...DEFAULT_CONFIG, draftBranchPrefix: 'feat branch' });
  assert.ok(errors.some((e) => e.includes('draftBranchPrefix may only contain')));
});

test('validateSiteConfig rejects a dangerous accentColor', () => {
  const errors = validateSiteConfig({ ...DEFAULT_CONFIG, accentColor: 'blu;e}' });
  assert.ok(errors.some((e) => e.includes('accentColor must not contain')));
});

test('validateSiteConfig accepts valid accentColor forms', () => {
  for (const good of ['#2563eb', 'rebeccapurple', 'rgb(37, 99, 235)']) {
    assert.deepEqual(validateSiteConfig({ ...DEFAULT_CONFIG, accentColor: good }), []);
  }
});

test('validateSiteConfig accepts an empty siteUrl', () => {
  assert.deepEqual(validateSiteConfig({ ...DEFAULT_CONFIG, siteUrl: '' }), []);
});

test('validateSiteConfig accepts a valid absolute https:// siteUrl', () => {
  assert.deepEqual(validateSiteConfig({ ...DEFAULT_CONFIG, siteUrl: 'https://user.github.io/repo' }), []);
});

test('validateSiteConfig rejects a non-https siteUrl', () => {
  const errors = validateSiteConfig({ ...DEFAULT_CONFIG, siteUrl: 'http://user.github.io/repo' });
  assert.ok(errors.some((e) => e.includes('siteUrl must use the https:// protocol')));
});

test('validateSiteConfig rejects an unparsable siteUrl', () => {
  const errors = validateSiteConfig({ ...DEFAULT_CONFIG, siteUrl: 'not a url' });
  assert.ok(errors.some((e) => e.includes('siteUrl must be a valid absolute URL')));
});

test('validateSiteConfig rejects a non-string siteUrl', () => {
  const errors = validateSiteConfig({ ...DEFAULT_CONFIG, siteUrl: 42 });
  assert.ok(errors.some((e) => e.includes('siteUrl must be a string')));
});

test('validateSiteConfig accepts the default ai config', () => {
  assert.deepEqual(validateSiteConfig({ ...DEFAULT_CONFIG, ai: { ...DEFAULT_CONFIG.ai } }), []);
});

test('validateSiteConfig rejects a non-boolean ai.enabled', () => {
  const errors = validateSiteConfig({ ...DEFAULT_CONFIG, ai: { ...DEFAULT_CONFIG.ai, enabled: 'yes' } });
  assert.ok(errors.some((e) => e.includes('ai.enabled must be a boolean')));
});

test('validateSiteConfig rejects a bad ai.model with illegal characters', () => {
  const errors = validateSiteConfig({ ...DEFAULT_CONFIG, ai: { ...DEFAULT_CONFIG.ai, model: 'claude sonnet!' } });
  assert.ok(errors.some((e) => e.includes('ai.model may only contain')));
});

test('validateSiteConfig rejects an empty ai.model', () => {
  const errors = validateSiteConfig({ ...DEFAULT_CONFIG, ai: { ...DEFAULT_CONFIG.ai, model: '' } });
  assert.ok(errors.some((e) => e.includes('ai.model must be a non-empty string')));
});

test('validateSiteConfig rejects ai.maxStories out of the 1-8 range', () => {
  for (const bad of [0, 9, 2.5]) {
    const errors = validateSiteConfig({ ...DEFAULT_CONFIG, ai: { ...DEFAULT_CONFIG.ai, maxStories: bad } });
    assert.ok(errors.some((e) => e.includes('ai.maxStories must be an integer between 1 and 8')), `expected error for maxStories=${bad}`);
  }
});

test('validateSiteConfig accepts ai.maxStories at the boundaries', () => {
  for (const good of [1, 8]) {
    assert.deepEqual(validateSiteConfig({ ...DEFAULT_CONFIG, ai: { ...DEFAULT_CONFIG.ai, maxStories: good } }), []);
  }
});

test('validateSiteConfig rejects a non-string ai.instructions', () => {
  const errors = validateSiteConfig({ ...DEFAULT_CONFIG, ai: { ...DEFAULT_CONFIG.ai, instructions: 42 } });
  assert.ok(errors.some((e) => e.includes('ai.instructions must be a string')));
});

test('validateSiteConfig rejects a non-object ai', () => {
  const errors = validateSiteConfig({ ...DEFAULT_CONFIG, ai: 'nope' });
  assert.ok(errors.some((e) => e.includes('ai must be an object')));
});

test('loadSiteConfig deep-merges a partial ai override, keeping the other defaults', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'site-config-test-'));
  try {
    await writeFile(join(dir, 'site.config.json'), JSON.stringify({ ai: { enabled: true } }));
    const config = await loadSiteConfig(dir);
    assert.equal(config.ai.enabled, true);
    assert.equal(config.ai.model, 'claude-sonnet-5');
    assert.equal(config.ai.maxStories, 4);
    assert.equal(config.ai.instructions, '');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadSiteConfig rejects an invalid ai override (maxStories 9)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'site-config-test-'));
  try {
    await writeFile(join(dir, 'site.config.json'), JSON.stringify({ ai: { maxStories: 9 } }));
    await assert.rejects(() => loadSiteConfig(dir), /ai\.maxStories/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('parseIsoParts rejects invalid calendar dates and unparsable strings', () => {
  assert.throws(() => parseIsoParts('2026-02-30'));
  assert.throws(() => parseIsoParts('2026-13-01'));
  assert.throws(() => parseIsoParts('garbage'));
});

test('parseIsoParts accepts a leap day', () => {
  assert.deepEqual(parseIsoParts('2028-02-29'), [2028, 2, 29]);
});

test('formatIsoDate formats a YYYY-MM-DD date as "D Month YYYY"', () => {
  assert.equal(formatIsoDate('2026-07-06'), '6 July 2026');
});

test('loadSiteConfig strips a single trailing slash from siteUrl', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'site-config-test-'));
  try {
    await writeFile(join(dir, 'site.config.json'), JSON.stringify({ siteUrl: 'https://user.github.io/repo/' }));
    const config = await loadSiteConfig(dir);
    assert.equal(config.siteUrl, 'https://user.github.io/repo');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadSiteConfig leaves a siteUrl with no trailing slash untouched', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'site-config-test-'));
  try {
    await writeFile(join(dir, 'site.config.json'), JSON.stringify({ siteUrl: 'https://user.github.io/repo' }));
    const config = await loadSiteConfig(dir);
    assert.equal(config.siteUrl, 'https://user.github.io/repo');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('validateSiteConfig accepts both publish modes and rejects anything else', () => {
  assert.deepEqual(validateSiteConfig({ ...DEFAULT_CONFIG, publishMode: 'review' }), []);
  assert.deepEqual(validateSiteConfig({ ...DEFAULT_CONFIG, publishMode: 'auto' }), []);
  for (const bad of ['yes', '', 'AUTO', 42, null, undefined]) {
    const errors = validateSiteConfig({ ...DEFAULT_CONFIG, publishMode: bad });
    assert.ok(errors.some((e) => e.includes('publishMode')), `publishMode=${String(bad)} should be rejected`);
  }
});
