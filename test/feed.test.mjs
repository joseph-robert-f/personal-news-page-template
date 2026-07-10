// Unit tests for scripts/lib/feed.mjs.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from '../scripts/config.mjs';
import { buildFeedXml, buildSitemapXml, deriveSiteUrl, escapeXml, localDateTimeToUtcIso } from '../scripts/lib/feed.mjs';

test('escapeXml escapes all five special characters, with & first', () => {
  assert.equal(escapeXml('& < > " \''), '&amp; &lt; &gt; &quot; &apos;');
  // If & were not escaped first, escaping "<" to "&lt;" and then escaping
  // that "&" would double-escape it. Confirm a string containing both an
  // ampersand and a character that becomes an entity comes out correct.
  assert.equal(escapeXml('Tom & Jerry <ok>'), 'Tom &amp; Jerry &lt;ok&gt;');
});

test('escapeXml stringifies non-string input', () => {
  assert.equal(escapeXml(42), '42');
});

test('localDateTimeToUtcIso converts a January (EST) New York time to UTC with -05:00 offset', () => {
  // 2026-01-15 06:30 America/New_York is EST (UTC-5) -> 11:30 UTC.
  assert.equal(localDateTimeToUtcIso('2026-01-15', '06:30', 'America/New_York'), '2026-01-15T11:30:00.000Z');
});

test('localDateTimeToUtcIso converts a July (EDT) New York time to UTC with -04:00 offset', () => {
  // 2026-07-15 06:30 America/New_York is EDT (UTC-4) -> 10:30 UTC.
  assert.equal(localDateTimeToUtcIso('2026-07-15', '06:30', 'America/New_York'), '2026-07-15T10:30:00.000Z');
});

test('localDateTimeToUtcIso handles a non-DST timezone (Asia/Tokyo, UTC+9)', () => {
  // 2026-07-15 06:30 Asia/Tokyo is JST (UTC+9) year-round -> 2026-07-14T21:30:00Z.
  assert.equal(localDateTimeToUtcIso('2026-07-15', '06:30', 'Asia/Tokyo'), '2026-07-14T21:30:00.000Z');
  assert.equal(localDateTimeToUtcIso('2026-01-15', '06:30', 'Asia/Tokyo'), '2026-01-14T21:30:00.000Z');
});

const config = { ...DEFAULT_CONFIG, siteUrl: 'https://example.github.io/repo' };

test('buildFeedXml produces a valid, empty feed for an empty digest list', () => {
  const xml = buildFeedXml(config, []);
  assert.match(xml, /^<\?xml version="1\.0" encoding="utf-8"\?>\n/);
  assert.match(xml, /<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/);
  assert.doesNotMatch(xml, /<entry>/);
  assert.match(xml, /<updated>1970-01-01T00:00:00\.000Z<\/updated>/);
});

test('buildFeedXml escapes & and < in a digest title', () => {
  const digests = [
    { date: '2026-07-06', title: 'Tech & <Science> News', path: '2026/July/x/6 July.html', summary: '' },
  ];
  const xml = buildFeedXml(config, digests);
  assert.match(xml, /<title>Tech &amp; &lt;Science&gt; News<\/title>/);
  assert.doesNotMatch(xml, /<title>Tech & <Science> News<\/title>/);
});

test('buildFeedXml omits <summary> when the manifest summary is empty and includes it otherwise', () => {
  const digests = [
    { date: '2026-07-06', title: 'A', path: 'p1', summary: '' },
    { date: '2026-07-05', title: 'B', path: 'p2', summary: 'A short summary.' },
  ];
  const xml = buildFeedXml(config, digests);
  assert.match(xml, /<summary>A short summary\.<\/summary>/);
  const entryCount = (xml.match(/<entry>/g) || []).length;
  const summaryCount = (xml.match(/<summary>/g) || []).length;
  assert.equal(entryCount, 2);
  assert.equal(summaryCount, 1);
});

test('buildFeedXml caps entries at the newest 30', () => {
  const digests = Array.from({ length: 40 }, (_, i) => {
    const day = String((i % 28) + 1).padStart(2, '0');
    return { date: `2026-01-${day}`, title: `Digest ${i}`, path: `p${i}`, summary: '' };
  });
  const xml = buildFeedXml(config, digests);
  const entryCount = (xml.match(/<entry>/g) || []).length;
  assert.equal(entryCount, 30);
});

test('buildFeedXml is byte-identical across repeated calls with the same input', () => {
  const digests = [
    { date: '2026-07-06', title: 'A', path: 'p1', summary: 'summary a' },
    { date: '2026-07-05', title: 'B', path: 'p2', summary: '' },
  ];
  assert.equal(buildFeedXml(config, digests), buildFeedXml(config, digests));
});

test('buildSitemapXml includes the homepage, archive, and one URL per digest with lastmod', () => {
  const digests = [
    { date: '2026-07-06', title: 'A', path: 'p1', summary: '' },
    { date: '2026-07-05', title: 'B', path: 'p2', summary: '' },
  ];
  const xml = buildSitemapXml(config, digests);
  assert.match(xml, /<loc>https:\/\/example\.github\.io\/repo\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/example\.github\.io\/repo\/archive\.html<\/loc>/);
  assert.match(xml, /<loc>https:\/\/example\.github\.io\/repo\/\?date=2026-07-06<\/loc>\s*<lastmod>2026-07-06<\/lastmod>/);
  const urlCount = (xml.match(/<url>/g) || []).length;
  assert.equal(urlCount, 4); // home + archive + 2 digests
});

test('buildSitemapXml is not capped at 30 (all digests included)', () => {
  const digests = Array.from({ length: 40 }, (_, i) => {
    const day = String((i % 28) + 1).padStart(2, '0');
    return { date: `2026-01-${day}`, title: `Digest ${i}`, path: `p${i}`, summary: '' };
  });
  const xml = buildSitemapXml(config, digests);
  const urlCount = (xml.match(/<url>/g) || []).length;
  assert.equal(urlCount, 42); // home + archive + 40 digests
});

test('deriveSiteUrl builds the default Pages URL from owner/repo', () => {
  assert.equal(deriveSiteUrl('Alice/personal-news-page-template'),
    'https://alice.github.io/personal-news-page-template');
});

test('deriveSiteUrl handles the owner.github.io user-site repo', () => {
  assert.equal(deriveSiteUrl('Alice/Alice.github.io'), 'https://alice.github.io');
});

test('deriveSiteUrl returns empty for missing or malformed input', () => {
  assert.equal(deriveSiteUrl(undefined), '');
  assert.equal(deriveSiteUrl(''), '');
  assert.equal(deriveSiteUrl('not-a-repo'), '');
});
