// Unit tests for scripts/lib/digest.mjs.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatWeekRange, renderTemplate, sanitizeFilePart } from '../scripts/lib/digest.mjs';

test('formatWeekRange spans a year boundary with full dates on both ends', () => {
  // 1 January 2026 is a Thursday; its Monday-start week runs from
  // 29 December 2025 through 4 January 2026.
  assert.equal(formatWeekRange(new Date(Date.UTC(2026, 0, 1))), '29 December 2025 - 4 January 2026');
});

test('formatWeekRange omits the year on both ends when the week stays in one year', () => {
  assert.equal(formatWeekRange(new Date(Date.UTC(2026, 6, 6))), '6 July - 12 July');
});

test('sanitizeFilePart strips filesystem-unsafe characters and collapses whitespace', () => {
  assert.equal(sanitizeFilePart('a/b\\c:d*e?f"g<h>i|j'), 'abcdefghij');
  assert.equal(sanitizeFilePart('  a   b  '), 'a b');
});

test('sanitizeFilePart falls back to "News Digest" when nothing safe remains', () => {
  assert.equal(sanitizeFilePart('   '), 'News Digest');
  assert.equal(sanitizeFilePart('///'), 'News Digest');
});

test('renderTemplate throws on an unknown placeholder', () => {
  assert.throws(() => renderTemplate('{{FOO}}', {}), /Unknown template placeholder: FOO/);
});

test('renderTemplate HTML-escapes substituted values', () => {
  assert.equal(renderTemplate('{{FOO}}', { FOO: `<b>&'"` }), '&lt;b&gt;&amp;&#39;&quot;');
});
