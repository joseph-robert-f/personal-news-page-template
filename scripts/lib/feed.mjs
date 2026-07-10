// Pure helpers used by scripts/build-feed.mjs. Kept dependency-free and
// side-effect-free (no fs, no wall-clock reads) so output is byte-identical
// across runs for identical inputs, and so the pieces can be unit tested in
// isolation -- consistent with scripts/lib/manifest.mjs and lib/digest.mjs.

const MAX_ENTRIES = 30;

// XML-escape text content and attribute values. `&` MUST be replaced first,
// otherwise the entities produced by the later replacements would themselves
// get re-escaped (e.g. "&lt;" becoming "&amp;lt;").
export function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Returns the offset (in minutes) such that localTime = utcTime + offset for
// the given IANA timezone at the instant `utcMillis`.
function offsetMinutesAt(timezone, utcMillis) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(utcMillis)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - utcMillis) / 60000;
}

// Converts a local wall-clock date + time in an IANA timezone to a UTC ISO
// timestamp. Deterministic and DST-correct: uses Intl to look up the zone's
// offset for the date in question (two passes to settle near DST
// transitions) rather than relying on the host's local timezone or the
// current wall clock.
export function localDateTimeToUtcIso(dateIso, timeHHMM, timezone) {
  const [year, month, day] = dateIso.split('-').map(Number);
  const [hour, minute] = timeHHMM.split(':').map(Number);
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0);

  const offset1 = offsetMinutesAt(timezone, naiveUtc);
  const estimate = naiveUtc - offset1 * 60000;
  const offset2 = offsetMinutesAt(timezone, estimate);
  const utcMillis = naiveUtc - offset2 * 60000;

  return new Date(utcMillis).toISOString();
}

// Newest-first, with path as a secondary key -- same ordering rule as
// build-manifest.mjs, so feed/sitemap order stays stable regardless of the
// order digests.json happens to list them in.
function sortDigests(digests) {
  return [...digests].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });
}

function entryUpdated(config, digest) {
  return localDateTimeToUtcIso(digest.date, config.publishTimeLocal, config.timezone);
}

export function buildFeedXml(config, digests) {
  const siteUrl = config.siteUrl;
  const sorted = sortDigests(digests);
  const entries = sorted.slice(0, MAX_ENTRIES);
  const updated = entries.length ? entryUpdated(config, entries[0]) : '1970-01-01T00:00:00.000Z';

  const entryXml = entries
    .map((digest) => {
      const link = `${siteUrl}/?date=${digest.date}`;
      const summaryXml = digest.summary
        ? `\n    <summary>${escapeXml(digest.summary)}</summary>`
        : '';
      return [
        '  <entry>',
        `    <title>${escapeXml(digest.title)}</title>`,
        `    <link href="${escapeXml(link)}"/>`,
        `    <id>${escapeXml(link)}</id>`,
        `    <updated>${entryUpdated(config, digest)}</updated>${summaryXml}`,
        '  </entry>',
      ].join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <title>${escapeXml(config.siteTitle)}</title>`,
    `  <subtitle>${escapeXml(config.description)}</subtitle>`,
    `  <link rel="self" href="${escapeXml(`${siteUrl}/feed.xml`)}"/>`,
    `  <link rel="alternate" href="${escapeXml(`${siteUrl}/`)}"/>`,
    `  <id>${escapeXml(`${siteUrl}/`)}</id>`,
    `  <updated>${updated}</updated>`,
    `  <author><name>${escapeXml(config.siteTitle)}</name></author>`,
    ...(entryXml ? [entryXml] : []),
    '</feed>',
  ].join('\n') + '\n';
}

export function buildSitemapXml(config, digests) {
  const siteUrl = config.siteUrl;
  const sorted = sortDigests(digests);

  const staticUrls = [`${siteUrl}/`, `${siteUrl}/archive.html`]
    .map((loc) => `  <url>\n    <loc>${escapeXml(loc)}</loc>\n  </url>`)
    .join('\n');

  const digestUrls = sorted
    .map((digest) => {
      const loc = `${siteUrl}/?date=${digest.date}`;
      return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${digest.date}</lastmod>\n  </url>`;
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    staticUrls,
    ...(digestUrls ? [digestUrls] : []),
    '</urlset>',
  ].join('\n') + '\n';
}

// Derive the default GitHub Pages URL from a "owner/repo" string (the shape
// of the GITHUB_REPOSITORY env var on Actions runners). Lets the feed and
// sitemap build with zero configuration on a standard <owner>.github.io/<repo>
// deployment; an explicit `siteUrl` in site.config.json (custom domain, user
// site with a path, etc.) always takes precedence in the caller.
export function deriveSiteUrl(githubRepository) {
  if (typeof githubRepository !== 'string') return '';
  const m = githubRepository.match(/^([^/]+)\/([^/]+)$/);
  if (!m) return '';
  const [, owner, repo] = m;
  if (repo.toLowerCase() === `${owner.toLowerCase()}.github.io`) {
    return `https://${owner.toLowerCase()}.github.io`;
  }
  return `https://${owner.toLowerCase()}.github.io/${repo}`;
}
