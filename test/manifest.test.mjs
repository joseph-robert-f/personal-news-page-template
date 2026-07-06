// Unit tests for scripts/lib/manifest.mjs.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeEntities, parseDate, parseDateFromPath, stripTags } from '../scripts/lib/manifest.mjs';

test('parseDate reads a "D Month YYYY" date out of a title', () => {
  assert.equal(parseDate('Personal News Digest — 15 June 2026'), '2026-06-15');
});

test('parseDate returns null when no date is present', () => {
  assert.equal(parseDate('Personal News Digest'), null);
});

test('parseDateFromPath falls back to the folder year and filename day/month', () => {
  assert.equal(
    parseDateFromPath('2026/July/29 June - 5 July/2 July Personal News Digest.html'),
    '2026-07-02',
  );
});

test('parseDateFromPath returns null without a top-level year folder', () => {
  assert.equal(parseDateFromPath('July/2 July Personal News Digest.html'), null);
});

test('decodeEntities decodes named entities', () => {
  assert.equal(decodeEntities('a &amp; b &mdash; c'), 'a & b — c');
});

test('decodeEntities decodes decimal numeric entities', () => {
  assert.equal(decodeEntities('&#8212;'), '—');
});

test('decodeEntities decodes hex numeric entities', () => {
  assert.equal(decodeEntities('&#x2014;'), '—');
  assert.equal(decodeEntities('&#X2014;'), '—');
});

test('decodeEntities leaves an invalid numeric codepoint as the literal entity text', () => {
  // A codepoint outside the valid Unicode range should not throw and should
  // be left untouched rather than silently replaced.
  assert.equal(decodeEntities('&#99999999999;'), '&#99999999999;');
});

test('stripTags removes markup, decodes entities, and collapses whitespace', () => {
  assert.equal(stripTags('<p>Hello  &amp;\n  world</p>'), 'Hello & world');
});
