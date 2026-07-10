# Gate Review — Results (10 July 2026)

Executed per [gate-review.md](gate-review.md) against `main` at the PR #2
merge (`634190c`). Reviewer: Claude (Opus 4.8 for the read-only gates), with
CI sabotage tests run as scratch PRs #3–#6 (closed after CI reported; never
merged).

## Verdict: **GO, conditional** — zero blockers; one major finding (fixed in
the follow-up PR that added this document); three gates deferred pending
elapsed time or actions only the maintainer can take (listed at the end).

## Per-gate results

| Gate | Result | Evidence |
| --- | --- | --- |
| 0 Baseline | ✅ Pass | 93/93 tests, config valid, manifest byte-deterministic; roadmap docs annotated where the design changed post-merge (sprint 6 amendment). |
| 1 Determinism & artifact | ✅ Pass | Manifest/feed byte-identical across runs. Deploy-run log lists the full Pages artifact: exactly `index.html`, `archive.html`, `404.html`, `digests.json`, `site.config.json`, `assets/site.js`, `feed.xml`, `sitemap.xml`, `.nojekyll` — no scripts, docs, tests, or agent files published. |
| 2 Gates gate | ✅ Pass | Sabotage PR #3 (invalid timezone) failed at *Validate site config*; #4 (digest without manifest rebuild) failed at *Rebuild manifest* after all earlier steps passed; #5 (six bullets + missing source, manifest correct) failed at *Lint changed digest files*; control #6 (valid draft) passed fully. Each trap caught by exactly the intended step; no false positives; changed-file detection handled space-laden digest paths. |
| 3 UX & accessibility | ✅ Pass w/ findings | 16 Playwright screenshots (4 pages × 2 themes × 2 widths) all clean; skip link, focus-visible, aria-live, keyboard toggling of `details` verified. Findings below (contrast) fixed in the follow-up PR. |
| 4 Feeds | ✅ Pass* | Production log: `siteUrl not set; using derived Pages URL …` then `Wrote feed.xml (0 entries) and sitemap.xml (2 urls)`; both parse as well-formed XML locally. *Sandbox egress to `github.io` was blocked, so the live URL was verified via deploy logs rather than a fetch; maintainer should open `feed.xml` in a browser/reader once. |
| 5 Scheduling | ⏳ Deferred | Unit tests for the DST window logic pass (both transitions + non-DST + half-hour zones). Live check requires 2–3 days of scheduled firings on `main`: verify one firing proceeds and its sibling skips. |
| 6 AI generation | ✅ Pass (code) / ⏳ live deferred | Secret in exactly one step-scoped `env:`; a planted fake key could not be made to appear in any output path; adversarial payloads (`</article><script>`, `onerror`/`onmouseover` attributes, `javascript:`/`data:`/quote-breaking URLs) all escaped or dropped; exit contract 0/2/3 verified; every failure path keeps the placeholder and the daily PR opens. Live generation requires a repo with `ANTHROPIC_API_KEY` (the maintainer's personal instance). |
| 7 Workflow hygiene | ✅ Pass | Least-privilege permissions on all three workflows; `inputs.date` regex-validated and quoted before use; actions pinned to major versions (meets bar; SHA-pinning optional hardening). One minor interpolation hardened in the follow-up PR. |
| 8 Fresh fork | ⏳ Deferred | README claims audit passed (every documented command runs verbatim; every key/path exists). The full fresh-fork walkthrough must be done by someone who didn't build this — recommended: the maintainer creating their personal instance from the template. |

## Findings and dispositions

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | **Major** | Light-theme `--faint` (#9aa1a9) = 2.5–2.61:1 on white/panel — WCAG AA failure on story timestamps, archive dates, footer. | **Fixed**: `--faint` → `#6d737c` (4.78:1 / 4.58:1). |
| 2 | Minor | Dark-theme accent link text (#2563eb) = 3.30–3.65:1 — passes 3:1 UI bar, below 4.5:1 for link text. | **Fixed**: new `--link` token, `#5b8def` in dark (5.84:1); fills/chips keep `--accent`; generated digests get `{{ACCENT_COLOR_DARK}}` (custom accents pass through unchanged). |
| 3 | Minor | `index.html` shell has no `<h1>` (content h1 lives in the iframed digest). | **Fixed**: visually-hidden `<h1>` synced to `siteTitle`. |
| 4 | Minor | `github.base_ref` interpolated directly into a `run:` line in pr-checks.yml (not exploitable — trigger is branch-restricted — but the canonical injection-sink pattern). | **Fixed**: passed via `env:`. |
| 5 | Minor | Actions pinned to major tags, not SHAs. | **Accepted**: meets the spec's bar; SHA-pinning noted as optional hardening for a future pass. |
| 6 | Minor | `description` and `coverageWindow` config keys undocumented in README; agent-doc repo maps missing the four newer scripts. | **Fixed**: documented. |
| 7 | Minor | Anthropic API request shape in `generate-digest.mjs` unverifiable offline. | **Open**: confirmed on the first live AI-draft run (deferred Gate 6). |

## Outstanding for sign-off (maintainer)

1. Open the live `feed.xml` once in a browser or feed reader (Gate 4 tick).
2. After 2–3 days: check the *Create daily draft* run list shows one
   proceed + one skip per day (Gate 5).
3. First live AI draft on an instance with the secret: confirm generation
   succeeds and cited sources hold up (Gate 6 live, finding 7).
4. Fresh-fork walkthrough from the template, README-only, ≤30 min (Gate 8).
5. Housekeeping: delete the four leftover `gate-review/*` branches (the
   review's API token could not delete branches; one click on each closed
   PR #3–#6).
