#!/usr/bin/env node
// Scans <year>/<month>/<week>/ folders for digest HTML files and writes
// digests.json at the repo root.
//
// The date for each digest is read from the file's <title> (e.g.
// "Personal News Digest - 15 June 2026"), NOT from the folder/file name. This
// means the manifest keeps working regardless of how the folders/files are
// named, so you can add a new digest just by dropping an HTML file in and
// committing.
//
// Zero dependencies — runs on the Node already present on GitHub's runners.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatIsoDate, loadSiteConfig } from './config.mjs';
import { decodeEntities, parseDate, parseDateFromPath, stripTags } from './lib/manifest.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Recursively collect .html files under a top-level year folder.
async function findHtml(dir, rel) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    const r = `${rel}/${e.name}`;
    if (e.isDirectory()) out.push(...await findHtml(abs, r));
    else if (e.isFile() && e.name.toLowerCase().endsWith('.html')) out.push(r);
  }
  return out;
}

async function main() {
  const config = await loadSiteConfig(ROOT);
  const top = await readdir(ROOT, { withFileTypes: true });
  const files = [];
  for (const e of top) {
    if (e.isDirectory() && /^\d{4}$/.test(e.name)) {
      files.push(...await findHtml(join(ROOT, e.name), e.name));
    }
  }

  const digests = [];
  for (const path of files) {
    const html = await readFile(join(ROOT, path), 'utf8');
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    const rawTitle = titleMatch ? decodeEntities(titleMatch[1].trim()) : null;
    // Title first (authoritative), then fall back to the folder/filename so a
    // drifted title format never silently drops a published digest.
    const date = (rawTitle && parseDate(rawTitle)) || parseDateFromPath(path);
    if (!date) {
      console.warn(`Skipping (no parseable date): ${path}`);
      continue;
    }

    // Prefer an explicit <meta name="description">; fall back to the .lede
    // block used by the older digests.
    let summary = '';
    const metaTag = html.match(/<meta[^>]*\bname=["']description["'][^>]*>/i);
    if (metaTag) {
      // Backreference so the closing quote matches the opening one — otherwise
      // an apostrophe inside the content (e.g. "Anthropic's") ends it early.
      const content = metaTag[0].match(/\bcontent=(["'])([\s\S]*?)\1/i);
      if (content) summary = decodeEntities(content[2]).replace(/\s+/g, ' ').trim();
    }
    if (!summary) {
      const ledeMatch = html.match(/<div class="lede">([\s\S]*?)<\/div>/i);
      summary = ledeMatch ? stripTags(ledeMatch[1]).replace(/^Top-line:\s*/i, '') : '';
    }
    if (summary.length > 280) summary = summary.slice(0, 277).trimEnd() + '…';

    const segs = path.split('/');
    digests.push({
      date,
      title: rawTitle || `${config.digestTitlePrefix} \u2014 ${formatIsoDate(date)}`,
      path,
      year: /^\d{4}$/.test(segs[0]) ? +segs[0] : null,
      month: segs[1] || null,
      week: segs[2] || null,
      summary,
    });
  }

  // Newest first, with path as secondary sort key for stable ordering.
  digests.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });

  // Warn if two digests have the same date.
  const dateSet = new Set();
  for (const digest of digests) {
    if (dateSet.has(digest.date)) {
      console.warn(`Multiple digests have date ${digest.date}; index.html can only frame one per ?date= value.`);
    }
    dateSet.add(digest.date);
  }

  const output = { count: digests.length, digests };
  await writeFile(join(ROOT, 'digests.json'), JSON.stringify(output, null, 2) + '\n');
  console.log(`Wrote digests.json with ${digests.length} digest(s).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
