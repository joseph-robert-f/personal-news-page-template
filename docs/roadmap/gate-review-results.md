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
| 4 Feeds | ✅ Pass | Production log: `siteUrl not set; using derived Pages URL …` then `Wrote feed.xml (0 entries) and sitemap.xml (2 urls)`; both parse as well-formed XML locally. Live tick confirmed 10 July 2026: maintainer opened the deployed `feed.xml` — well-formed Atom, correct self/alternate links and derived Pages URL; `<updated>` shows the epoch placeholder expected for a feed with zero entries. |
| 5 Scheduling | ✅ Pass (unit tests); live check deferred to first use | Unit tests for the DST window logic pass (both transitions + non-DST + half-hour zones). The template's own schedule is dormant by design, so the live check (one firing proceeds, its sibling skips) happens in the first repository created from the template for a real use case. No template-side work remains (#13, closed 30 September 2026). |
| 6 AI generation | ✅ Pass (live, 11 July 2026) | Secret in exactly one step-scoped `env:`; a planted fake key could not be made to appear in any output path; adversarial payloads all escaped or dropped; exit contract verified. Live shakedown on the maintainer's instance surfaced six defects across five runs (finding 9) — every failure soft-skipped exactly as designed (placeholder kept, no crash, nothing force-published). Run 8 produced a real sourced digest that passed the linter with 0 errors/0 warnings and opened the "(AI draft)" PR. Formal close on the maintainer's source review + merge. |
| 7 Workflow hygiene | ✅ Pass | Least-privilege permissions on all three workflows; `inputs.date` regex-validated and quoted before use; actions pinned to major versions (meets bar; SHA-pinning optional hardening — since done, see finding 5). One minor interpolation hardened in the follow-up PR. |
| 8 Fresh fork | ⏳ Deferred | README claims audit passed (every documented command runs verbatim; every key/path exists). The full fresh-fork walkthrough must be done by someone who didn't build this — recommended: the maintainer creating their personal instance from the template. |

## Findings and dispositions

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | **Major** | Light-theme `--faint` (#9aa1a9) = 2.5–2.61:1 on white/panel — WCAG AA failure on story timestamps, archive dates, footer. | **Fixed**: `--faint` → `#6d737c` (4.78:1 / 4.58:1). |
| 2 | Minor | Dark-theme accent link text (#2563eb) = 3.30–3.65:1 — passes 3:1 UI bar, below 4.5:1 for link text. | **Fixed**: new `--link` token, `#5b8def` in dark (5.84:1); fills/chips keep `--accent`; generated digests get `{{ACCENT_COLOR_DARK}}` (custom accents pass through unchanged). |
| 3 | Minor | `index.html` shell has no `<h1>` (content h1 lives in the iframed digest). | **Fixed**: visually-hidden `<h1>` synced to `siteTitle`. |
| 4 | Minor | `github.base_ref` interpolated directly into a `run:` line in pr-checks.yml (not exploitable — trigger is branch-restricted — but the canonical injection-sink pattern). | **Fixed**: passed via `env:`. |
| 5 | Minor | Actions pinned to major tags, not SHAs. | **Accepted** at review time (meets the spec's bar). **Done later (#17)**: every `uses:` pinned to a full commit SHA with a version comment. No Dependabot: repos made from the template would inherit its monthly PRs; update pins by hand when an action releases a fix. |
| 6 | Minor | `description` and `coverageWindow` config keys undocumented in README; agent-doc repo maps missing the four newer scripts. | **Fixed**: documented. |
| 7 | Minor | Anthropic API request shape in `generate-digest.mjs` unverifiable offline. | **Confirmed real on the first live run (10 July 2026)**: the API rejected `maxItems`/`minItems` in the structured-output schema (HTTP 400) — those keywords are unsupported by structured outputs. **Fixed**: removed from `DIGEST_SCHEMA` (limits already enforced by prompt, `validatePayload`, and `renderDigest`); regression test bans all unsupported schema keywords. The failure also validated the exit-3 soft-skip path live: the placeholder draft was kept and the branch pushed as designed. |
| 8 | Minor | Fresh-fork run (Gate 8, 10 July 2026): daily workflow's PR creation fails on new repositories — GitHub's default Actions policy blocks PR creation regardless of the workflow's `permissions` block. | **Fixed**: README Setup now includes enabling "Allow GitHub Actions to create and approve pull requests" as step 3. |
| 9 | Major | Live AI-generation shakedown (Gate 6, 10–11 July 2026) surfaced four further defects: (a) non-streaming API calls die at Node fetch's 300s header timeout — a draft's response headers only arrive when the whole generation finishes; (b) a reused draft branch executes its own stale script snapshot, and a merged PR for the branch blocked new PRs; (c) the script's 10-minute per-attempt cap aborted healthy generations; (d) the model can return a schema-valid payload with an empty stories array, which failed validation with no retry. | **All fixed**: (a) the request streams and the SSE transcript is reassembled (`assembleStreamedMessage`), with network errors retried once under the exit-3 contract; (b) reused draft branches merge `origin/main` first and only an OPEN PR blocks creation; (c) 30-minute cap + 3-minute idle abort, web search `max_uses` 12→8; (d) the prompt forbids empty stories (widening to recent developments on quiet days) and payload-validation failures retry once with the errors fed back. Every failure soft-skipped as designed; run 8 then generated a real digest (0 lint errors/warnings). |

## Outstanding for sign-off (maintainer)

1. ~~Open the live `feed.xml` once in a browser or feed reader (Gate 4 tick).~~
   **Done 10 July 2026** — feed is live and well-formed; Gate 4 closed.
2. ~~Gate 5 live check on a real instance.~~ **Moved to first use (30
   September 2026):** the template's schedule is dormant by design and the
   maintainer runs no standing instance. The first repository created from
   the template for a real use case confirms it as a side effect: its
   *Create daily draft* run list shows one proceed + one skip per day, and
   a DST change should be watched once. No API key is needed for this
   check; the guard step logs its decision before any AI step runs.
3. First live AI draft on an instance with the secret: confirm generation
   succeeds and cited sources hold up (Gate 6 live, finding 7).
4. Fresh-fork walkthrough from the template, README-only, ≤30 min (Gate 8).
5. Housekeeping: delete the four leftover `gate-review/*` branches (the
   review's API token could not delete branches; one click on each closed
   PR #3–#6).
