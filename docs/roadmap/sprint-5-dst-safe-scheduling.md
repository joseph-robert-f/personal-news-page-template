# Sprint 5 — DST-Safe Scheduling (Major)

**Size:** Major-adjacent (½–1 day, but subtle)
**Suggested model:** Claude Sonnet 5 (`claude-sonnet-5`)
**Rationale for model:** Little code, but timezone/DST logic is a classic
source of off-by-one-hour bugs; worth a strong model plus the unit tests to
pin the behavior. Run at high effort; not worth Opus pricing.

## Goal

Eliminate the manual rule "if you change `timezone` or `publishTimeLocal`,
also update the cron expression" (README) and the twice-yearly DST drift.
After this sprint, `site.config.json` is the single source of truth for when
the daily draft runs.

## Spec

### 5.1 Guard-step pattern (standard fix for cron-in-UTC vs local time)

- Change `.github/workflows/daily-draft.yml` to fire **twice** per day, one
  hour apart, covering both possible UTC offsets for the configured local
  time (e.g. `30 10 * * *` and `30 11 * * *` for 06:30 Eastern).
- Add a new first step that runs `node scripts/should-run-now.mjs`:
  - Computes the current wall-clock time in `config.timezone` via
    `Intl.DateTimeFormat`.
  - Exits 0 ("run") only when the current local time is within ±35 minutes of
    `config.publishTimeLocal` **and** no draft branch/PR already exists for
    today's date (the existing idempotence check makes double-fires harmless,
    but skipping early is cleaner and saves a checkout).
  - Supports `--force` (used by `workflow_dispatch`) to bypass the time gate.
- The two cron lines still need to bracket the configured time. To remove
  even that residual coupling:

### 5.2 Cron drift check

- Add `node scripts/check-cron.mjs`: parses the cron expressions out of
  `daily-draft.yml` (simple regex on the `- cron:` lines) and verifies that,
  for both a January and a July date, the configured
  `timezone`/`publishTimeLocal` falls inside one of the scheduled UTC hours.
- Run it in sprint 2's `pr-checks.yml`; fail with a message that prints the
  correct cron lines to paste in. (Generating the workflow file automatically
  is deliberately out of scope — editing workflows from CI needs elevated
  permissions and surprises users.)

### 5.3 Documentation

- README "Daily Routine": replace the manual-sync paragraph with an
  explanation of the two-cron + guard design and the `check-cron` helper.

## Plan

1. Implement `should-run-now.mjs` with pure helper functions
   (`localMinutesOfDay(timezone, date)`, `withinWindow(...)`) in
   `scripts/lib/`, plus `node:test` coverage using fixed `Date` inputs across
   DST boundaries (second Sunday in March, first Sunday in November for
   America/New_York; also test a non-DST zone like `Asia/Tokyo` and a
   half-hour zone like `Asia/Kolkata`).
2. Implement `check-cron.mjs` + tests.
3. Update `daily-draft.yml`: two cron entries, guard step first,
   `workflow_dispatch` passes `--force`.
4. Update README; run the workflow once via `workflow_dispatch` to verify
   end-to-end.

## Acceptance criteria

- With the default config, exactly one of the two daily firings creates a
  draft PR, in both DST and standard time (verified by unit tests on the
  window logic; the guard's decision is printed to the job log).
- Changing `publishTimeLocal` to a time outside the scheduled window causes
  `check-cron.mjs` (and thus PR CI) to fail with copy-pasteable cron lines.
- `workflow_dispatch` still works at any time of day.
