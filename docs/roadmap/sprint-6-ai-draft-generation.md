# Sprint 6 — AI-Assisted Draft Generation (Major)

**Size:** Major (2–3 days)
**Suggested model (implementation):** Claude Opus 4.8 (`claude-opus-4-8`)
**Suggested model (runtime, inside the workflow):** Claude Sonnet 5
(`claude-sonnet-5`) with the web search tool
**Rationale:** Implementing this means designing an agentic generation step —
prompt construction from config, web-search grounding, HTML assembly that
passes the digest linter, and failure handling in CI — where the strongest
coding model pays for itself. At runtime the job runs every day, so cost
matters: Sonnet 5 ($3/$15 per MTok; intro $2/$10 through 2026-08-31) with web
search delivers strong research/summarization quality at roughly a third of
Opus input cost. Fork owners who want maximum quality can set the model to
`claude-opus-4-8` in config.

**Depends on:** Sprint 2 (digest linter validates generated output).
**Benefits from:** Sprint 5 (reliable scheduling).

> **Amended after merge (fork-UX review):** the double opt-in originally
> specified here (`ai.enabled: true` **and** the secret) proved confusing in
> practice. The design now treats the `ANTHROPIC_API_KEY` secret as the sole
> switch: `ai.enabled` defaults to `true` and acts only as an optional pause.
> Additionally, `siteUrl` (sprint 4) is now auto-derived from the repository
> name on Actions runners, so feeds work with zero configuration on standard
> Pages deployments.

## Goal

Optionally pre-fill the daily draft PR with real, sourced content for the
configured `topic`/`audience`, instead of placeholder text — while preserving
the repo's core publishing rule: **nothing publishes without human review and
a merged PR.** The AI writes the draft; the human edits and merges.

## Spec

### 6.1 Opt-in and configuration

- The feature activates only when the fork has an `ANTHROPIC_API_KEY`
  repository secret. Without it, the workflow behaves exactly as today
  (placeholder draft). No new required setup.
- New optional config keys in `site.config.json` (validated in `config.mjs`):
  - `ai.enabled` (default `false`) — explicit switch in addition to the secret.
  - `ai.model` (default `"claude-sonnet-5"`).
  - `ai.maxStories` (default `4`, max `8`).
  - `ai.instructions` (default `""`) — free-text steering appended to the
    prompt (e.g. "skip celebrity news; prefer primary sources").

### 6.2 Generation script (`scripts/generate-digest.mjs`)

- Zero runtime dependency on npm packages: call the Messages API with `fetch`
  (Node 24 has global fetch). Endpoint `POST https://api.anthropic.com/v1/messages`
  with headers `x-api-key`, `anthropic-version: 2023-06-01`.
- Request shape:
  - `model` from config; `max_tokens` ~8000; `stream: true` recommended for
    long generations (or a generous client timeout).
  - Tools: `[{"type": "web_search_20260209", "name": "web_search", "max_uses": 12}]`
    so every claim is grounded in a fetched source. (On Sonnet 5 / Opus 4.8
    this variant includes dynamic result filtering; no extra beta header.)
  - Structured output (`output_config.format` with a JSON schema) for the
    digest content: `{ glanceBullets: string[] (≤5), stories: [{ category,
    when, headline, whyItMatters, detail, sources: [{title, url}] (≥1) }],
    description: string }`. Generating **JSON, not HTML**, keeps the model
    away from markup and lets the existing template pipeline own structure.
  - Prompt assembled from config: topic, audience, coverageWindow, target
    date, `ai.instructions`, plus the Content Bar rules (≤5 bullets, why-it-
    matters first, every claim sourced).
- The script then renders the JSON into the existing
  `templates/digest-template.html` structure (reusing `renderTemplate` /
  escaping helpers from `scripts/lib/`), producing one `<article class="story">`
  per story and a real `<meta name="description">`.
- Validate the result with sprint 2's `check-digest.mjs` **inside the script**;
  on lint failure, retry once with the lint errors appended to the prompt,
  then fall back to the placeholder draft (never fail the workflow because
  generation failed — print a `::warning::`).
- Handle API failure modes explicitly: non-200 responses, `stop_reason:
  "max_tokens"` (retry with fewer stories), and `stop_reason: "refusal"`
  (fall back to placeholder).

### 6.3 Workflow integration (`daily-draft.yml`)

- After the existing "Create draft digest" step: if `ai.enabled` and
  `ANTHROPIC_API_KEY` is present, run `generate-digest.mjs --date "$DIGEST_DATE"`
  to overwrite the placeholder file, then rebuild the manifest.
- The PR body checklist gains: "Verify every AI-cited source link actually
  supports the claim." Mark the PR title `Draft news digest for <date> (AI
  draft)` when generation succeeded.
- Secret hygiene: pass the key only via `env:` on that single step.

### 6.4 Documentation

- README: new "AI drafts (optional)" section — creating the secret, config
  keys, expected daily cost order-of-magnitude, and the review obligation.
- CLAUDE.md: note that generated drafts still go through the standard PR
  review gate.

## Plan

1. Land config keys + validation (6.1).
2. Build `generate-digest.mjs` behind a `--dry-run` flag that prints the JSON
   instead of writing the file; iterate on the prompt until sample runs pass
   the linter consistently for 2–3 different topics.
3. Add the render + lint + retry + fallback pipeline; unit-test the JSON→HTML
   renderer with a fixture payload (no network in tests).
4. Wire into `daily-draft.yml`; test via `workflow_dispatch` on a fork with
   the secret set, and once **without** the secret to confirm the fallback.
5. Docs (6.4).

## Acceptance criteria

- With no secret / `ai.enabled: false`, behavior is byte-identical to today.
- With the feature on, the daily PR contains a filled digest that passes
  `check-digest.mjs`: ≤5 bullets, every story carrying at least one working
  source link, real meta description, correct `D Month YYYY` title.
- Generation failures (API error, refusal, lint failure after retry) degrade
  to the placeholder draft with a workflow warning — the daily PR always
  opens.
- The API key never appears in logs, the PR, or committed files.
