#!/usr/bin/env node
// Content-bar linter for digest HTML files (see CLAUDE.md "Content Bar").
//
//   node scripts/check-digest.mjs [--strict] <file> [...files]
//
// Zero dependencies; regex-based parsing (consistent with build-manifest.mjs)
// rather than a full HTML parser. Errors make the run fail; warnings (mostly
// unfilled template placeholders) only fail the run under --strict.

import { readFile } from 'node:fs/promises';
import { decodeEntities, parseDate } from './lib/manifest.mjs';

const MAX_BULLETS = 5;

// Distinctive strings from templates/digest-template.html that should be
// replaced before a digest is publishable. Not exhaustive by design — this
// catches the common case of an unedited or half-edited draft.
const PLACEHOLDER_STRINGS = [
  'Sharp, specific headline',
  'Lead point.',
  'Second point.',
  'Third point.',
  'Fourth point.',
  'Fifth point.',
  'https://example.com',
  'Source: article title',
  'Optional deeper context for anyone who wants it.',
  'one or two sentences of takeaway for',
];

function checkDigest(html) {
  const findings = []; // { level: 'error' | 'warning', message }

  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : '';
  if (!title || !parseDate(title)) {
    findings.push({ level: 'error', message: '<title> lacks a parseable "D Month YYYY" date' });
  }

  const metaMatch = html.match(/<meta[^>]*\bname=["']description["'][^>]*>/i);
  let description = '';
  if (metaMatch) {
    // Backreference so the closing quote matches the opening one — an
    // apostrophe inside the content must not end the match early.
    const content = metaMatch[0].match(/\bcontent=(["'])([\s\S]*?)\1/i);
    if (content) description = decodeEntities(content[2]).trim();
  }
  if (!description) {
    findings.push({ level: 'error', message: '<meta name="description"> is missing or empty' });
  }

  const bulletsMatch = html.match(/<ol\b[^>]*\bclass="[^"]*\bbullets\b[^"]*"[^>]*>([\s\S]*?)<\/ol>/i);
  if (bulletsMatch) {
    const count = (bulletsMatch[1].match(/<li\b/gi) || []).length;
    if (count > MAX_BULLETS) {
      findings.push({ level: 'error', message: `<ol class="bullets"> has ${count} items, more than the max of ${MAX_BULLETS}` });
    }
  }

  const storyRe = /<article\b[^>]*\bclass="[^"]*\bstory\b[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let storyMatch;
  let storyIndex = 0;
  while ((storyMatch = storyRe.exec(html))) {
    storyIndex += 1;
    const storyHtml = storyMatch[1];
    const sourcesMatch = storyHtml.match(/<ul\b[^>]*\bclass="[^"]*\bsources\b[^"]*"[^>]*>([\s\S]*?)<\/ul>/i);
    const hasHttpsLink = sourcesMatch ? /https:\/\//.test(sourcesMatch[1]) : false;
    if (!hasHttpsLink) {
      findings.push({ level: 'error', message: `story #${storyIndex} has no https:// link in its ul.sources block` });
    }
  }

  if (/<script\b[^>]*\bsrc=/i.test(html)) {
    findings.push({ level: 'error', message: 'external <script src=...> is not allowed; digests must be self-contained' });
  }
  if (/<link\b[^>]*\brel=["']stylesheet["']/i.test(html)) {
    findings.push({ level: 'error', message: 'external <link rel="stylesheet"> is not allowed; digests must be self-contained' });
  }
  if (/<img\b[^>]*\bsrc=["']http/i.test(html)) {
    findings.push({ level: 'error', message: 'external <img src="http...> is not allowed; digests must be self-contained' });
  }

  for (const placeholder of PLACEHOLDER_STRINGS) {
    if (html.includes(placeholder)) {
      findings.push({ level: 'warning', message: `template placeholder text still present: "${placeholder}"` });
    }
  }

  return findings;
}

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
