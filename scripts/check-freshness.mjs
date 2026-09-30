#!/usr/bin/env node
// Freshness check for the daily workflow's auto-publish failure alert.
//
// Reads digests.json and reports how many days have passed between the
// newest published digest and --date, and whether that is long enough to
// alert (see STALE_ALERT_DAYS in lib/health.mjs).
//
//   node scripts/check-freshness.mjs --date YYYY-MM-DD
//
// Prints one line, `<alert> <latest>` -- e.g. `true 2026-07-13`, or
// `true none` when nothing has published yet -- so a workflow step can
// `read` both values. Always exits 0 on valid input; the caller decides
// what to do with the answer.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { latestDigestDate, shouldAlert } from './lib/health.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const args = parseArgs(process.argv.slice(2));
if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date ?? '')) {
  console.error('Usage: node scripts/check-freshness.mjs --date YYYY-MM-DD');
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(await readFile(join(ROOT, 'digests.json'), 'utf8'));
} catch {
  manifest = { digests: [] };
}

console.log(`${shouldAlert(manifest, args.date)} ${latestDigestDate(manifest) || 'none'}`);

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--date') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --date');
      parsed.date = value;
      i += 1;
      continue;
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }
  return parsed;
}
