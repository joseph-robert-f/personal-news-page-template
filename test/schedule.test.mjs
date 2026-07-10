// Unit tests for scripts/lib/schedule.mjs.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from '../scripts/config.mjs';
import {
  cronCoversDate,
  localMinutesOfDay,
  parseCronLines,
  suggestCronLines,
  utcMinutesForLocalTime,
  withinWindow,
} from '../scripts/lib/schedule.mjs';

// --- localMinutesOfDay -------------------------------------------------

test('localMinutesOfDay reads 06:30 EST as 390 minutes (before spring-forward)', () => {
  // 2026-03-07 11:30 UTC is still EST (UTC-5): DST starts 2026-03-08.
  assert.equal(localMinutesOfDay('America/New_York', new Date('2026-03-07T11:30:00Z')), 390);
});

test('localMinutesOfDay reads 06:30 EDT as 390 minutes (after spring-forward)', () => {
  // 2026-03-08 10:30 UTC is EDT (UTC-4): clocks jumped forward at 07:00 UTC.
  assert.equal(localMinutesOfDay('America/New_York', new Date('2026-03-08T10:30:00Z')), 390);
});

test('localMinutesOfDay reads 06:30 EDT as 390 minutes (before fall-back)', () => {
  // 2026-10-31 10:30 UTC is still EDT (UTC-4): DST ends 2026-11-01.
  assert.equal(localMinutesOfDay('America/New_York', new Date('2026-10-31T10:30:00Z')), 390);
});

test('localMinutesOfDay reads 06:30 EST as 390 minutes (after fall-back)', () => {
  // 2026-11-01 11:30 UTC is EST (UTC-5): clocks fell back at 06:00 UTC.
  assert.equal(localMinutesOfDay('America/New_York', new Date('2026-11-01T11:30:00Z')), 390);
});

test('localMinutesOfDay handles a non-DST zone (Asia/Tokyo, UTC+9)', () => {
  // 2026-07-15 21:30 UTC -> 2026-07-16 06:30 JST.
  assert.equal(localMinutesOfDay('Asia/Tokyo', new Date('2026-07-15T21:30:00Z')), 390);
});

test('localMinutesOfDay handles a half-hour offset zone (Asia/Kolkata, UTC+5:30)', () => {
  // 2026-07-15 01:00 UTC -> 2026-07-15 06:30 IST.
  assert.equal(localMinutesOfDay('Asia/Kolkata', new Date('2026-07-15T01:00:00Z')), 390);
});

test('localMinutesOfDay reports 0, not 1440, at local midnight (24h edge normalization)', () => {
  assert.equal(localMinutesOfDay('UTC', new Date('2026-01-15T00:00:00Z')), 0);
});

// --- withinWindow --------------------------------------------------------

test('withinWindow is true inside the tolerance', () => {
  assert.equal(withinWindow(400, 390, 35), true); // 10 minutes away
});

test('withinWindow is false outside the tolerance', () => {
  assert.equal(withinWindow(300, 390, 35), false); // 90 minutes away
});

test('withinWindow is true exactly at the tolerance boundary', () => {
  assert.equal(withinWindow(425, 390, 35), true); // exactly 35 minutes away
});

test('withinWindow is false just past the tolerance boundary', () => {
  assert.equal(withinWindow(426, 390, 35), false); // 36 minutes away
});

test('withinWindow handles midnight wraparound (now just before midnight, target just after)', () => {
  // target 00:10 (10), now 23:50 (1430) -> 20 minutes apart across midnight.
  assert.equal(withinWindow(1430, 10, 35), true);
});

test('withinWindow handles midnight wraparound (now just after midnight, target just before)', () => {
  // now 00:20 (20), target 23:50 (1430) -> 30 minutes apart across midnight.
  assert.equal(withinWindow(20, 1430, 35), true);
});

test('withinWindow rejects a wraparound gap that is too large', () => {
  // now 01:40 (100), target 23:50 (1430) -> 110 minutes apart across midnight.
  assert.equal(withinWindow(100, 1430, 35), false);
});

// --- utcMinutesForLocalTime ------------------------------------------------

test('utcMinutesForLocalTime: NY January 06:30 -> 11:30 UTC', () => {
  assert.equal(utcMinutesForLocalTime('2026-01-15', '06:30', 'America/New_York'), 11 * 60 + 30);
});

test('utcMinutesForLocalTime: NY July 06:30 -> 10:30 UTC', () => {
  assert.equal(utcMinutesForLocalTime('2026-07-15', '06:30', 'America/New_York'), 10 * 60 + 30);
});

test('utcMinutesForLocalTime: Tokyo 06:30 -> 21:30 UTC (previous day)', () => {
  assert.equal(utcMinutesForLocalTime('2026-07-15', '06:30', 'Asia/Tokyo'), 21 * 60 + 30);
});

// --- parseCronLines / cronCoversDate / suggestCronLines -------------------

const nyConfig = { ...DEFAULT_CONFIG, timezone: 'America/New_York', publishTimeLocal: '06:30' };

test('parseCronLines extracts daily (day/month/dow = *) cron entries', () => {
  const yaml = [
    'on:',
    '  schedule:',
    '    - cron: "30 10 * * *"',
    '    - cron: "30 11 * * *"',
  ].join('\n');
  const entries = parseCronLines(yaml);
  assert.deepEqual(entries.map((e) => [e.hour, e.minute]), [[10, 30], [11, 30]]);
});

test('parseCronLines skips entries with non-* day/month/dow fields', () => {
  const yaml = '    - cron: "30 10 15 * *"\n    - cron: "30 11 * * *"';
  const entries = parseCronLines(yaml);
  assert.deepEqual(entries.map((e) => [e.hour, e.minute]), [[11, 30]]);
});

test('cronCoversDate is true when the two-cron schedule brackets 06:30 America/New_York', () => {
  const entries = parseCronLines('- cron: "30 10 * * *"\n- cron: "30 11 * * *"');
  assert.equal(cronCoversDate(entries, nyConfig, '2026-01-15', 35), true); // EST -> 11:30 UTC
  assert.equal(cronCoversDate(entries, nyConfig, '2026-07-15', 35), true); // EDT -> 10:30 UTC
});

test('cronCoversDate is false when publishTimeLocal has drifted outside both cron lines', () => {
  const entries = parseCronLines('- cron: "30 10 * * *"\n- cron: "30 11 * * *"');
  const driftedConfig = { ...nyConfig, publishTimeLocal: '21:00' };
  assert.equal(cronCoversDate(entries, driftedConfig, '2026-01-15', 35), false);
  assert.equal(cronCoversDate(entries, driftedConfig, '2026-07-15', 35), false);
});

test('suggestCronLines computes the correct paste-in lines for a drifted config', () => {
  // 21:00 America/New_York: EST (UTC-5) -> 02:00 UTC next day; EDT (UTC-4) -> 01:00 UTC next day.
  const driftedConfig = { ...nyConfig, publishTimeLocal: '21:00' };
  const lines = suggestCronLines(driftedConfig, ['2026-01-15', '2026-07-15']);
  assert.deepEqual(new Set(lines), new Set(['0 2 * * *', '0 1 * * *']));
});

test('suggestCronLines deduplicates for a non-DST zone', () => {
  const tokyoConfig = { ...DEFAULT_CONFIG, timezone: 'Asia/Tokyo', publishTimeLocal: '06:30' };
  const lines = suggestCronLines(tokyoConfig, ['2026-01-15', '2026-07-15']);
  assert.equal(lines.length, 1);
  assert.equal(lines[0], '30 21 * * *');
});

// --- should-run-now decision path (via the pure helpers, no CLI spawn) ----

function decide(config, nowIso, toleranceMinutes = 35) {
  const [targetHour, targetMinute] = config.publishTimeLocal.split(':').map(Number);
  const targetMinutes = targetHour * 60 + targetMinute;
  const nowMinutes = localMinutesOfDay(config.timezone, new Date(nowIso));
  return withinWindow(nowMinutes, targetMinutes, toleranceMinutes);
}

test('should-run-now decision: within window at the EST firing', () => {
  assert.equal(decide(nyConfig, '2026-01-15T11:30:00Z'), true);
});

test('should-run-now decision: within window at the EDT firing', () => {
  assert.equal(decide(nyConfig, '2026-07-15T10:30:00Z'), true);
});

test('should-run-now decision: outside the window at the "wrong" EDT-time firing in summer', () => {
  // 11:30 UTC in July is 07:30 EDT, an hour past the 06:30 target.
  assert.equal(decide(nyConfig, '2026-07-15T11:30:00Z'), false);
});
