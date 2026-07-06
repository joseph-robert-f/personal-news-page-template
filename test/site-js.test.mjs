// Parity test: assets/site.js carries a browser-side copy of DEFAULT_CONFIG
// (scripts/config.mjs can't be imported from a plain <script> tag). This test
// keeps the two copies from drifting apart -- see the NOTE comments in both
// files.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DEFAULT_CONFIG } from '../scripts/config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function extractDefaultConfig(source) {
  const match = source.match(/var DEFAULT_CONFIG = (\{[\s\S]*?\n  \});/);
  if (!match) {
    throw new Error('Could not find "var DEFAULT_CONFIG = {...};" in assets/site.js');
  }
  const sandbox = {};
  vm.createContext(sandbox);
  return vm.runInContext(`(${match[1]})`, sandbox);
}

test('assets/site.js DEFAULT_CONFIG matches scripts/config.mjs DEFAULT_CONFIG', async () => {
  const source = await readFile(join(__dirname, '..', 'assets', 'site.js'), 'utf8');
  // JSON round-trip both sides so the comparison ignores realm-of-origin (the
  // browser copy is built inside a vm sandbox) and Object.freeze on nested
  // objects (e.g. the `ai` sub-object). Structural parity is still enforced.
  const browserConfig = JSON.parse(JSON.stringify(extractDefaultConfig(source)));
  assert.deepEqual(browserConfig, JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
});
