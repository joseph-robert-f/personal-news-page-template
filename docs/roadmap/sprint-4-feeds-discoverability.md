# Sprint 4 — Feeds & Discoverability (Major)

**Size:** Major (1–2 days)
**Suggested model:** Claude Sonnet 5 (`claude-sonnet-5`)
**Rationale for model:** A new generator script plus a config-surface change —
standard web-standards work (Atom, sitemaps, Open Graph) where Sonnet 5's
coding quality is ample and cost-efficient.

## Goal

Make the site subscribable and indexable: an Atom feed, a sitemap, and social
preview metadata. This is the highest-value feature for a news-digest site
after publishing itself.

## Spec

### 4.1 New config key: `siteUrl` (optional)

- Add `siteUrl` to `site.config.json`, `scripts/config.mjs` `DEFAULT_CONFIG`
  (default `""`), and the front-end defaults (sprint 3's `assets/site.js`).
- Validation: when non-empty, must be an absolute `https://` URL; normalize by
  stripping a trailing slash.
- Feed and sitemap generation are **skipped with a notice** when `siteUrl` is
  empty, so the template keeps working out of the box before users configure
  it. Document in the README (Setup step) that fork owners should set it to
  their Pages URL (e.g. `https://user.github.io/repo`).

### 4.2 Atom feed (`scripts/build-feed.mjs`)

- Zero-dependency Node script that reads `digests.json` and writes `feed.xml`
  (Atom 1.0 — pick Atom over RSS 2.0: proper date handling, required IDs).
- Entry fields: `title` (digest title), `link` → `{siteUrl}/?date={date}`,
  `id` → the same URL, `updated` → digest date at `publishTimeLocal` in
  `timezone` (or midnight UTC if simpler — must be deterministic),
  `summary` → manifest summary. Feed-level `updated` = newest entry.
- Cap at the newest 30 entries. XML-escape all text content.
- Determinism: byte-identical output for identical inputs (no build
  timestamps), matching the sprint-1/2 diff-based CI checks.

### 4.3 Sitemap (`sitemap.xml`)

- Generated in the same script (or `build-sitemap.mjs`): `index.html`,
  `archive.html`, and one `?date=` URL per digest.

### 4.4 Wire-up

- `build.yml`: run the feed/sitemap build after `build-manifest.mjs`; include
  `feed.xml` and `sitemap.xml` in the `_site/` staging from sprint 1.6. Feed
  files are build artifacts — do **not** commit them (unlike `digests.json`,
  which the daily-draft flow needs in-repo).
- `index.html` / `archive.html`: add
  `<link rel="alternate" type="application/atom+xml" href="./feed.xml">`.

### 4.5 Open Graph / social metadata

- `templates/digest-template.html`: add `og:title`, `og:description`,
  `og:type=article`, and `article:published_time` meta tags using existing
  placeholders ({{DIGEST_TITLE_PREFIX}}, {{DESCRIPTION}}, {{ISO_DATE}}).
- `index.html`: og:title/og:description from config at load time is not
  possible for crawlers (JS-rendered) — set static fallbacks in the HTML and
  document that fork owners can edit them, or (better) note this as a known
  limitation of the config-at-runtime design.

## Plan

1. Add and validate `siteUrl` (4.1); update README setup instructions.
2. Implement `build-feed.mjs` + sitemap (4.2, 4.3); add unit tests for XML
   escaping and entry mapping (extends sprint 2's suite).
3. Wire into `build.yml` and page `<link>` tags (4.4); add OG tags (4.5).
4. Verify: run the script against a repo seeded with 2–3 sample digests;
   validate `feed.xml` with an Atom validator (W3C feed validator) and check
   it renders in a feed reader; confirm the empty-`siteUrl` path skips cleanly.

## Acceptance criteria

- With `siteUrl` set, the deployed site serves a valid Atom feed and sitemap;
  with it unset, builds succeed with a skip notice.
- Feed output is deterministic across runs.
- New digests appear in the feed after the next deploy with correct links.
