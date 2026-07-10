// Pure helpers used by scripts/build-manifest.mjs (and reused by
// scripts/check-digest.mjs). Kept dependency-free and side-effect-free so they
// can be unit tested in isolation.

export const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

export function decodeEntities(s) {
  return s
    // Numeric entities: decimal (&#8212;) and hex (&#x2014;, &#X2014;)
    .replace(/&#(\d+);/g, (match, num) => {
      try {
        return String.fromCodePoint(parseInt(num, 10));
      } catch {
        return match;
      }
    })
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (match, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return match;
      }
    })
    // Named entities
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/&middot;/g, '·').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

export function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

export function iso(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// "15 June 2026" -> "2026-06-15"
export function parseDate(text) {
  const m = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return iso(m[3], month, +m[1]);
}

// Fallback when the <title> date is missing or in an unexpected format: take the
// year from the top-level "YYYY" folder and the "D Month" from the filename,
// e.g. "2026/July/29 June - 5 July/2 July Personal News Digest.html" -> 2026-07-02.
export function parseDateFromPath(path) {
  const segs = path.split('/');
  const year = /^\d{4}$/.test(segs[0]) ? segs[0] : null;
  const base = segs[segs.length - 1];
  const m = base.match(/(\d{1,2})\s+([A-Za-z]+)/);
  if (!year || !m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return iso(year, month, +m[1]);
}
