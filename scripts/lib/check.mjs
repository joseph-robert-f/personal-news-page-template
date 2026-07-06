// Pure content-bar linter for digest HTML (see CLAUDE.md "Content Bar").
// Extracted from scripts/check-digest.mjs so both the CLI and
// scripts/generate-digest.mjs can share the exact same checks. Kept
// dependency-free and side-effect-free so it can be unit tested in isolation.

import { decodeEntities, parseDate } from './manifest.mjs';

export const MAX_BULLETS = 5;

// Distinctive strings from templates/digest-template.html that should be
// replaced before a digest is publishable. Not exhaustive by design — this
// catches the common case of an unedited or half-edited draft.
export const PLACEHOLDER_STRINGS = [
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

// Returns findings as { level: 'error' | 'warning', message } objects.
export function checkDigest(html) {
  const findings = [];

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
