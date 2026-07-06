#!/usr/bin/env node
// Content-bar linter CLI for digest HTML files (see CLAUDE.md "Content Bar").
//
//   node scripts/check-digest.mjs [--strict] <file> [...files]
//
// Zero dependencies; regex-based parsing (consistent with build-manifest.mjs)
// rather than a full HTML parser. Errors make the run fail; warnings (mostly
// unfilled template placeholders) only fail the run under --strict. The actual
// checks live in scripts/lib/check.mjs so scripts/generate-digest.mjs can reuse
// them.

import { readFile } from 'node:fs/promises';
import { checkDigest } from './lib/check.mjs';

async function main() {
  const argv = process.argv.slice(2);
  const strict = argv.includes('--strict');
  const files = argv.filter((arg) => arg !== '--strict');

  if (files.length === 0) {
    console.error('Usage: node scripts/check-digest.mjs [--strict] <file> [...files]');
    process.exit(1);
  }

  let errorCount = 0;
  let warningCount = 0;

  for (const file of files) {
    let html;
    try {
      html = await readFile(file, 'utf8');
    } catch (err) {
      console.log(`${file}: [error] could not read file: ${err.message}`);
      errorCount += 1;
      continue;
    }

    const findings = checkDigest(html);
    for (const finding of findings) {
      console.log(`${file}: [${finding.level}] ${finding.message}`);
      if (finding.level === 'error') errorCount += 1;
      else warningCount += 1;
    }
  }

  console.log(`Checked ${files.length} file(s): ${errorCount} error(s), ${warningCount} warning(s).`);

  if (errorCount > 0 || (strict && warningCount > 0)) {
    process.exit(1);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
