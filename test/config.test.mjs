// Unit tests for scripts/config.mjs.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_CONFIG, formatIsoDate, parseIsoParts, validateSiteConfig } from '../scripts/config.mjs';

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
