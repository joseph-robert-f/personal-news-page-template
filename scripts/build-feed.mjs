#!/usr/bin/env node
// Generates feed.xml (Atom 1.0) and sitemap.xml at the repo root from
// digests.json + site.config.json. Skipped with a notice (exit 0) when
// `siteUrl` is not configured, so the site keeps building out of the box
// before a fork owner points it at their Pages URL.
//
// Zero dependencies -- runs on the Node already present on GitHub's runners.
// Thin CLI over the pure builders in scripts/lib/feed.mjs so the XML
// generation itself stays unit-testable in isolation.

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSiteConfig } from './config.mjs';
import { buildFeedXml, buildSitemapXml } from './lib/feed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function readDigests() {
  try {
    const raw = await readFile(join(ROOT, 'digests.json'), 'utf8');
    return JSON.parse(raw).digests || [];
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw new Error(`Could not read digests.json: ${err.message}`);
  }
}

async function main() {
  const config = await loadSiteConfig(ROOT);

  if (!config.siteUrl) {
    console.log('siteUrl not set; skipping feed and sitemap');
    return;
  }

  const digests = await readDigests();
  const feedXml = buildFeedXml(config, digests);
  const sitemapXml = buildSitemapXml(config, digests);

  await writeFile(join(ROOT, 'feed.xml'), feedXml);
  await writeFile(join(ROOT, 'sitemap.xml'), sitemapXml);

  console.log(`Wrote feed.xml (${Math.min(digests.length, 30)} entries) and sitemap.xml (${digests.length + 2} urls).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
