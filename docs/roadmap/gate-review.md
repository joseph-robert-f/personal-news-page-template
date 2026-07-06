# Gate Review — Post-Sprint Release Readiness

**When to run:** After all six sprints have merged to `main` and at least one
scheduled daily-draft cycle has completed.
**Suggested model:** Claude Opus 4.8 (`claude-opus-4-8`, $5/$25 per MTok), run
at high effort.
**Rationale for model:** This is a one-time adversarial review across the whole
repository — recall matters more than cost, and review/bug-finding is exactly
where the Opus tier separates from Sonnet. The spend is a single session, not a
recurring job. Prompt the reviewer to report *every* finding with confidence
and severity and filter afterwards, rather than self-censoring to
"high-severity only" (conservative-reporting instructions measurably depress
recall on current models).

**Format:** Each gate is pass/fail with evidence. A failed gate produces a
finding (severity: blocker / major / minor) and the review does not sign off
until all blockers are fixed and re-verified. The reviewer should *break
things on purpose* — a quality gate that has never caught anything is
unverified.

---

## Gate 0 — Baseline

- [ ] `main` is green: `node --test`, `validate-config.mjs`, and
  `build-manifest.mjs` + clean diff all pass locally and in CI.
- [ ] Every sprint's own acceptance criteria (see the six sprint docs) are
  spot-checked, not assumed. Sample at least two criteria per sprint.
- [ ] `docs/roadmap/` reflects reality: anything descoped or changed during
  implementation is annotated, so the docs don't overclaim.

## Gate 1 — Determinism & data integrity (sprint 1)

- [ ] `node scripts/build-manifest.mjs` twice → byte-identical `digests.json`;
  same for the sprint-4 feed/sitemap outputs.
- [ ] Seed adversarial digests and confirm graceful handling: a title with
  numeric entities, two digests sharing a date (warning emitted, deterministic
  order), a file with no parseable date (skipped with warning, others intact).
- [ ] Fetch the deployed Pages artifact and confirm it contains **only** site
  files — no `scripts/`, `templates/`, `.github/`, `CLAUDE.md`, or
  `docs/roadmap/`.

## Gate 2 — The gates actually gate (sprint 2)

Open a scratch PR for each sabotage and confirm CI **fails** with a readable
message, then close it:

- [ ] `site.config.json` with an invalid timezone.
- [ ] A digest edited without rebuilding `digests.json` (manifest-drift check).
- [ ] A digest with six glance bullets.
- [ ] A digest story with no source link.
- [ ] Also confirm the inverse: an untouched freshly generated draft passes
  with warnings only.
- [ ] `pr-checks.yml` has `contents: read` and no write permissions.

## Gate 3 — UX & accessibility (sprint 3)

- [ ] Index, archive, a digest, and 404 reviewed in light **and** dark mode at
  mobile and desktop widths; no illegible or hard-coded-light elements.
- [ ] Keyboard-only walkthrough: skip link, nav, archive entries, `details`
  toggles — all reachable with visible focus.
- [ ] Lighthouse accessibility ≥ 95 on index and archive.
- [ ] Grep confirms `DEFAULT_CONFIG` exists in exactly two places
  (`scripts/config.mjs`, `assets/site.js`) and the parity test covers them.

## Gate 4 — Feeds (sprint 4)

- [ ] `feed.xml` passes the W3C Feed Validation Service and renders correctly
  in at least one real feed reader (titles, dates, links resolve).
- [ ] Entry links open the correct digest via `?date=`.
- [ ] Empty `siteUrl` path: build succeeds with a skip notice, site unaffected.

## Gate 5 — Scheduling (sprint 5)

- [ ] Job logs from real scheduled runs show one firing proceeding and the
  sibling firing skipping, on the same day.
- [ ] Unit tests cover both DST transition dates, a non-DST zone, and a
  half-hour-offset zone — and pass.
- [ ] Sabotage: set `publishTimeLocal` outside the cron window in a scratch PR
  and confirm `check-cron.mjs` fails CI with copy-pasteable cron lines.

## Gate 6 — AI generation & security (sprint 6)

- [ ] With the secret absent, the workflow output is byte-identical to the
  pre-sprint-6 placeholder behavior.
- [ ] With the feature on, three consecutive daily runs produce drafts that
  pass `check-digest.mjs`; manually verify a sample of cited links actually
  support their claims (the linter can't check that).
- [ ] Failure injection: run once with an invalid API key and once with
  `ai.maxStories` forced high enough to hit `max_tokens` — both must degrade
  to the placeholder draft with a `::warning::`, and the PR must still open.
- [ ] Secret hygiene: the key appears in exactly one workflow `env:` block;
  search all job logs for any fragment of the key; confirm generated files and
  PR bodies contain no key material.
- [ ] Prompt-injection sanity check: the generation prompt treats web-search
  results as content, and the rendered HTML escapes model output (a headline
  containing `<script>` must render inert).

## Gate 7 — Cross-cutting security & workflow hygiene

- [ ] Every workflow declares least-privilege `permissions`.
- [ ] No workflow interpolates untrusted input (PR titles, issue text) into
  `run:` shell lines.
- [ ] Actions are pinned at least to major versions; note any that should be
  SHA-pinned.

## Gate 8 — The fresh-fork test (most important)

Simulate the template's actual user with no prior context:

- [ ] Create a brand-new repo from the template. Follow **only** the README.
- [ ] Time-to-first-published-digest ≤ 30 minutes, with no step that requires
  reading source code to figure out.
- [ ] Every README command works verbatim; every documented config key exists;
  nothing implemented is undocumented and nothing documented is unimplemented.
- [ ] File a finding for each point of friction — these become the punch list.

---

## Sign-off

The review output is a findings table (severity, gate, file/line, evidence,
fix) followed by a one-paragraph go/no-go. **Go** requires: zero blockers,
majors either fixed or explicitly accepted with rationale, and Gate 8 passed
by someone (or a fresh model session) that did not implement the sprints.
