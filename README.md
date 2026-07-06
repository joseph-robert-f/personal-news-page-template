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

1. Create a new repository from this template.
2. Edit `site.config.json`:
   - `siteTitle`: name shown in the header and browser title
   - `digestTitlePrefix`: prefix used in each digest `<title>`
   - `topic`: what the daily brief tracks
   - `audience`: who the brief is written for
   - `timezone` and `publishTimeLocal`: when your routine should run
   - `accentColor`: CSS color used for links and badges. The site supports
     light and dark mode (via `prefers-color-scheme`); if you pick a custom
     accent color, check it against both the light background and the dark
     background (see the `@media (prefers-color-scheme: dark)` block in
     `index.html`) for readable contrast before publishing.
   - `siteUrl` (optional): your GitHub Pages URL, e.g.
     `https://user.github.io/repo` (no trailing slash needed). Set this to
     enable the generated Atom feed (`feed.xml`) and sitemap
     (`sitemap.xml`); while it is empty, the build skips both with a notice.
3. Enable GitHub Pages:
   - Settings -> Pages -> Build and deployment -> Source: GitHub Actions
4. Enable GitHub Actions if your fork asks for approval.
5. Run the "Create daily draft" workflow manually once, or wait for the schedule.

The deploy workflow validates the site on every push. If Pages is not enabled
yet, it exits successfully with a notice and skips deployment.

## Daily Routine

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

To enable it:

1. Create an Anthropic API key and add it as an Actions secret named
   `ANTHROPIC_API_KEY` (Settings -> Secrets and variables -> Actions -> New
   repository secret). Without this secret the workflow behaves exactly as
   before (placeholder draft), so there is no required setup.
2. Turn the feature on in `site.config.json`:

   ```json
   "ai": { "enabled": true }
   ```

The `ai` object supports these keys (all optional; defaults shown):

| Key | Default | Meaning |
| --- | --- | --- |
| `ai.enabled` | `false` | Master switch, in addition to the secret. Both must be set. |
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
