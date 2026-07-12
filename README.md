# Personal News Page Template

A small static GitHub Pages site for publishing a personal daily news brief.
Fork it, edit one config file, and use GitHub Actions to create reviewable daily
draft pull requests.

The site itself has no build dependencies. It is plain HTML plus two small Node
scripts that run on GitHub's hosted runners.

## What You Get

| File | Purpose |
| --- | --- |
| `site.config.json` | Your site title, topic, audience, timezone, cadence, color, and draft branch prefix. |
| `index.html` | Homepage that frames the newest published digest. Supports `?date=YYYY-MM-DD`. |
| `archive.html` | Archive grouped by month, newest first. |
| `templates/digest-template.html` | Starter HTML used by the draft generator. |
| `scripts/new-digest.mjs` | Creates a dated draft digest from the template. |
| `scripts/build-manifest.mjs` | Scans dated digest files and writes `digests.json`. |
| `scripts/build-feed.mjs` | Generates `feed.xml` (Atom) and `sitemap.xml` from `digests.json`; skipped until `siteUrl` is set. |
| `.github/workflows/daily-draft.yml` | Scheduled Action that opens draft PRs for review. |
| `.github/workflows/build.yml` | Deploys the published site to GitHub Pages on pushes to `main`. |

## Setup

Three steps get a working site:

1. Click **Use this template** to create your repository.
2. Enable GitHub Pages: **Settings -> Pages -> Build and deployment ->
   Source: GitHub Actions** (and approve Actions if your fork asks).
3. Let the daily workflow open PRs: **Settings -> Actions -> General ->
   Workflow permissions -> check "Allow GitHub Actions to create and approve
   pull requests"**. GitHub disables this by default in new repositories;
   without it, the daily draft branch is pushed but the PR creation step
   fails with "GitHub Actions is not permitted to create or approve pull
   requests".

That's it -- the site deploys, and the daily workflow starts opening draft
PRs on schedule. Everything below is optional tuning.

**Have Claude write your drafts (recommended):** add one repository secret
named `ANTHROPIC_API_KEY` (**Settings -> Secrets and variables -> Actions**)
with an API key from [console.anthropic.com](https://console.anthropic.com/).
The secret is the switch -- with it set, each daily draft arrives pre-filled
with real, sourced stories for you to review; without it, drafts are
placeholders you fill in by hand. See [AI Drafts](#ai-drafts-optional).

**Make it yours** by editing `site.config.json` (a plain JSON file; every key
is optional and has a sensible default):

- `topic` / `audience`: what the brief tracks and who it's for. These two
  steer everything the AI writes -- set them first.
- `siteTitle`, `digestTitlePrefix`, `eyebrow`: naming and branding.
- `timezone` and `publishTimeLocal`: when the daily draft is created. If you
  move these far from the default (06:30 US Eastern), CI will tell you the
  two cron lines to paste into the workflow -- see Daily Routine.
- `description`: one-line site description (used in the feed and meta tags).
- `coverageWindow`: the period each digest covers (default "last 24 hours");
  shown on digests and used to steer AI drafts.
- `accentColor`: CSS color for links and badges. The site supports light and
  dark mode; check a custom accent against both backgrounds.
- `siteUrl`: leave empty on a normal GitHub Pages deployment -- the Atom feed
  and sitemap URLs are derived automatically from your repository name. Set
  it only for a custom domain.

## Daily Routine

> **Note for this template repository:** the daily schedule is dormant on the
> template itself (it would only produce placeholder PRs). In a repository
> created from the template, the schedule runs automatically -- each copy's
> workflow is fully independent and uses that repository's own Actions quota
> and secrets.


The scheduled workflow does not publish automatically. It creates a branch like
`daily-digest/2026-07-04`, writes a draft digest file, rebuilds `digests.json`,
and opens a draft pull request.

Review the PR, replace the placeholder text with your brief, add source links,
and merge it into `main`. The Pages workflow then publishes the digest.

GitHub cron schedules run in UTC, but `timezone`/`publishTimeLocal` is a local
wall-clock time whose UTC offset changes with daylight saving time. Instead of
requiring a manual cron edit whenever you change either setting,
`.github/workflows/daily-draft.yml` fires twice a day -- once for each
possible UTC offset of the configured local time -- and a guard step
(`scripts/should-run-now.mjs`) checks the current wall-clock time in
`config.timezone` against `publishTimeLocal` (±35 minutes) to decide which of
the two firings actually creates a draft; the other one no-ops.
`workflow_dispatch` runs always pass `--force` to bypass the time gate.

If you change `timezone` or `publishTimeLocal` far enough that the two cron
lines no longer bracket it, `node scripts/check-cron.mjs` (run automatically
in PR CI) fails and prints the exact cron lines to paste into
`.github/workflows/daily-draft.yml`.

## AI Drafts (optional)

By default the daily workflow writes a placeholder draft for you to fill in. You
can optionally have it pre-fill the draft with real, sourced content generated
by Claude with web search. Nothing changes about the publishing rule: the AI
writes the draft, a human still reviews and merges the PR.

To enable it, add **one repository secret**: create an Anthropic API key and
save it as an Actions secret named `ANTHROPIC_API_KEY` (Settings -> Secrets
and variables -> Actions -> New repository secret). The secret is the switch:
with it set, AI drafts are on; without it, the workflow writes placeholder
drafts exactly as before. No config change is needed.

The optional `ai` object in `site.config.json` tunes the behavior (all keys
optional; defaults shown):

| Key | Default | Meaning |
| --- | --- | --- |
| `ai.enabled` | `true` | Set to `false` to pause AI drafts without deleting the secret. |
| `ai.model` | `"claude-sonnet-5"` | Model used for generation. Set to `"claude-opus-4-8"` for maximum quality at higher cost. |
| `ai.maxStories` | `4` | Maximum number of story cards (1-8). |
| `ai.instructions` | `""` | Free-text steering appended to the prompt, e.g. `"Skip celebrity news; prefer primary sources."` |

A partial override such as `"ai": { "enabled": true }` keeps the other defaults.

**Cost:** a single daily run on Sonnet 5 with web search typically costs on the
order of a few cents. Opus is several times more per run.

**Review obligation:** generated drafts can misattribute or hallucinate sources.
The draft PR includes a checklist item to **verify every AI-cited source link
actually supports the claim** before merging. Do not merge an AI draft
unreviewed.

If generation fails for any reason (missing key, API error, model refusal, or
the output failing `check-digest.mjs` after a retry), the workflow logs a
warning and falls back to the placeholder draft — the daily PR always opens.

### Auto-publish (optional, hands-off mode)

If you don't want to merge a PR every day, set one key in `site.config.json`:

```json
"publishMode": "auto"
```

In auto mode the daily workflow generates the digest and, **only if
generation fully succeeds** — schema-valid payload, every story sourced, and
a clean pass through the content linter — commits it straight to `main`,
which deploys it. There is no PR and no human step.

What you give up is source verification: nobody confirms the cited links
actually support the claims before they publish. The automated gates still
stand (structure validation, HTML escaping, `javascript:`/`data:` URLs
dropped, sourceless stories dropped, linter must pass), and a failed
generation publishes **nothing** — the placeholder never goes live in auto
mode; a delayed scheduled firing the same morning retries automatically.

`"publishMode": "review"` (the default) restores the PR gate at any time.
A sensible middle path: run in review mode for the first week or two while
you calibrate `ai.instructions`, then switch to auto once you trust the
output — and spot-check the site now and then.

## Local Commands

Validate your config:

```bash
node scripts/validate-config.mjs
```

Create a draft for today:

```bash
node scripts/new-digest.mjs
```

Create a draft for a specific date:

```bash
node scripts/new-digest.mjs --date 2026-07-04
```

Preview where a draft would be written:

```bash
node scripts/new-digest.mjs --date 2026-07-04 --dry-run
```

Rebuild the manifest:

```bash
node scripts/build-manifest.mjs
```

Generate the Atom feed and sitemap (requires `siteUrl` to be set in
`site.config.json`; otherwise it prints a notice and exits without writing
anything):

```bash
node scripts/build-feed.mjs
```

Run the unit tests:

```bash
node --test
```

Lint a digest against the Content Bar (bullet count, source links, self-contained assets, etc.):

```bash
node scripts/check-digest.mjs path/to/digest.html
```

Preview the exact request that the AI draft generator would send (requires
`ANTHROPIC_API_KEY`; makes no API call):

```bash
node scripts/generate-digest.mjs --date 2026-07-04 --dry-run
```

## Content Format

Each digest is a self-contained HTML file under:

```text
YEAR/Month/Week range/D Month Personal News Digest.html
```

The manifest reads the date from the digest `<title>` using `D Month YYYY`.
The archive preview comes from `<meta name="description">`. Keep both accurate
before merging a daily PR.

The starter template is designed for a quick skim:

- Up to five "At a glance" bullets.
- A small set of story cards.
- One clear "Why it matters" line per story.
- Source links inside each story's details block.
