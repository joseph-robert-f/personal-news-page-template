#!/usr/bin/env node
// Cron drift check, run in .github/workflows/pr-checks.yml.
//
// .github/workflows/daily-draft.yml fires on two fixed UTC cron lines that
// are meant to bracket config.publishTimeLocal/config.timezone (see
// scripts/should-run-now.mjs for the guard that picks the right firing).
// Cron lines don't move themselves when site.config.json changes, so this
// script fails PR CI if the schedule has drifted away from the config,
// printing the correct lines to paste in.
//
//   node scripts/check-cron.mjs

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSiteConfig } from './config.mjs';
import { cronCoversDate, parseCronLines, suggestCronLines } from './lib/schedule.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW_PATH = join(ROOT, '.github', 'workflows', 'daily-draft.yml');
const TOLERANCE_MINUTES = 35;
// Fixed sample dates, one in January (standard time for most northern-
// hemisphere zones) and one in July (daylight time). The specific year
// doesn't matter -- only the season's UTC offset does.
const SAMPLE_DATES = ['2026-01-15', '2026-07-15'];

async function main() {
  const config = await loadSiteConfig(ROOT);
  const workflowText = await readFile(WORKFLOW_PATH, 'utf8');
  const cronEntries = parseCronLines(workflowText);

  if (cronEntries.length === 0) {
    console.error(`::error::No "- cron: \\"M H * * *\\"" entries found in ${WORKFLOW_PATH}`);
    process.exit(1);
  }

  const uncovered = SAMPLE_DATES.filter(
    (dateIso) => !cronCoversDate(cronEntries, config, dateIso, TOLERANCE_MINUTES),
  );

  if (uncovered.length === 0) {
    console.log(
      `OK: daily-draft.yml cron schedule covers ${config.publishTimeLocal} ${config.timezone} `
      + `in both January and July (±${TOLERANCE_MINUTES}m).`,
    );
    return;
  }

  const suggested = suggestCronLines(config, SAMPLE_DATES);
  console.error(
    `::error::daily-draft.yml cron schedule does not cover ${config.publishTimeLocal} ${config.timezone} `
    + `(±${TOLERANCE_MINUTES}m) on: ${uncovered.join(', ')}`,
  );
  console.error('Paste these cron lines into .github/workflows/daily-draft.yml:');
  for (const line of suggested) {
    console.error(`  - cron: "${line}"`);
  }
  process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
