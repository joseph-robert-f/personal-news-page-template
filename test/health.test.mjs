// Unit tests for scripts/lib/health.mjs.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  daysSinceLatestDigest,
  latestDigestDate,
  shouldAlert,
  STALE_ALERT_DAYS,
} from '../scripts/lib/health.mjs';

const manifest = (...dates) => ({ count: dates.length, digests: dates.map((date) => ({ date })) });

test('latestDigestDate picks the newest date regardless of order', () => {
  assert.equal(latestDigestDate(manifest('2026-07-11', '2026-07-13', '2026-07-12')), '2026-07-13');
});

test('latestDigestDate is empty for an empty or malformed manifest', () => {
  assert.equal(latestDigestDate(manifest()), '');
  assert.equal(latestDigestDate({}), '');
  assert.equal(latestDigestDate(null), '');
  assert.equal(latestDigestDate(manifest('13 July 2026')), '');
});

test('daysSinceLatestDigest counts whole days across a month boundary', () => {
  assert.equal(daysSinceLatestDigest(manifest('2026-07-31'), '2026-08-02'), 2);
});

test('daysSinceLatestDigest is Infinity when nothing has published', () => {
  assert.equal(daysSinceLatestDigest(manifest(), '2026-09-30'), Infinity);
});

test('daysSinceLatestDigest is unaffected by a DST change between the dates', () => {
  // US DST ends 2026-11-01; dates are compared as UTC midnights.
  assert.equal(daysSinceLatestDigest(manifest('2026-10-31'), '2026-11-02'), 2);
});

test('shouldAlert stays quiet after one missed day (the retry may still land)', () => {
  assert.equal(STALE_ALERT_DAYS, 2);
  assert.equal(shouldAlert(manifest('2026-09-29'), '2026-09-30'), false);
});

test('shouldAlert fires once two days are missing', () => {
  assert.equal(shouldAlert(manifest('2026-09-28'), '2026-09-30'), true);
});

test('shouldAlert fires for the July 2026 stall (last digest 13 July)', () => {
  assert.equal(shouldAlert(manifest('2026-07-11', '2026-07-12', '2026-07-13'), '2026-09-30'), true);
});

test('shouldAlert fires on a new instance with no digests', () => {
  assert.equal(shouldAlert(manifest(), '2026-09-30'), true);
});

test('shouldAlert is quiet when today already published', () => {
  assert.equal(shouldAlert(manifest('2026-09-30'), '2026-09-30'), false);
});
