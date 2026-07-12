#!/usr/bin/env node
// Guard step for .github/workflows/daily-draft.yml.
//
// The daily-draft schedule fires twice a day (once for each possible UTC
// offset of the configured local publish time -- see scripts/check-cron.mjs
// for the check that keeps those two cron lines correct). This script
// decides, for a given firing, whether the current wall-clock time in
// config.timezone is close enough to config.publishTimeLocal to proceed; the
// other firing is expected to no-op.
//
//   node scripts/should-run-now.mjs [--force] [--now <ISO 8601 instant>]
//
// Writes `should_run=true|false` to $GITHUB_OUTPUT when that env var is set,
// and always exits 0 -- deciding not to run is not a failure. The calling
// workflow step branches on the output, not the exit code.

import { appendFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSiteConfig } from './config.mjs';
import { localMinutesOfDay, withinCatchupWindow } from './lib/schedule.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// GitHub cron firings routinely run 60-120 minutes late on busy slots (both
// of a real instance's daily firings were once delayed past a +/-35m window,
// silently skipping the day's draft). Accept up to 35 minutes early and up
// to 4 hours late (catch-up); the workflow itself makes a second proceeding
// firing a no-op when today's draft already exists on the branch.
const EARLY_TOLERANCE_MINUTES = 35;
const LATE_TOLERANCE_MINUTES = 240;

const args = parseArgs(process.argv.slice(2));
const config = await loadSiteConfig(ROOT);

const [targetHour, targetMinute] = config.publishTimeLocal.split(':').map(Number);
const targetMinutes = targetHour * 60 + targetMinute;

let shouldRun;
let reason;

if (args.force) {
  shouldRun = true;
  reason = '--force supplied';
} else {
  const now = args.now ? new Date(args.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    console.error(`::error::--now value is not a valid ISO 8601 instant: ${args.now}`);
    process.exit(1);
  }
  const nowMinutes = localMinutesOfDay(config.timezone, now);
  shouldRun = withinCatchupWindow(nowMinutes, targetMinutes, EARLY_TOLERANCE_MINUTES, LATE_TOLERANCE_MINUTES);
  reason = `now=${formatMinutes(nowMinutes)} target=${formatMinutes(targetMinutes)} timezone=${config.timezone} window=-${EARLY_TOLERANCE_MINUTES}m/+${LATE_TOLERANCE_MINUTES}m`;
}

console.log(`should_run=${shouldRun} (${reason})`);

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `should_run=${shouldRun}\n`, 'utf8');
}

process.exit(0);

function formatMinutes(minutes) {
  const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
  const minute = String(minutes % 60).padStart(2, '0');
  return `${hour}:${minute}`;
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--force') {
      parsed.force = true;
      continue;
    }
    if (arg === '--now') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --now');
      parsed.now = value;
      i += 1;
      continue;
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }
  return parsed;
}
