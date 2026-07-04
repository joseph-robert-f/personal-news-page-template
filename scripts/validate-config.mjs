#!/usr/bin/env node

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSiteConfig } from './config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = await loadSiteConfig(ROOT);

console.log(`site.config.json OK: ${config.siteTitle}`);
