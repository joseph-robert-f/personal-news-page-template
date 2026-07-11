#!/usr/bin/env node
// Generates a real, sourced daily digest by calling the Anthropic Messages API
// with the web search tool and structured output, then rendering the JSON into
// the standard digest template and linting it. See Sprint 6.
//
//   node scripts/generate-digest.mjs --date YYYY-MM-DD [--dry-run] [--output <path>]
//   node scripts/generate-digest.mjs --print-enabled   # prints ai.enabled
//
// Exit-code contract (so the workflow can branch without failing the run):
//   0  success — file written (or --dry-run printed)
//   2  ANTHROPIC_API_KEY missing (soft-skip: keep the placeholder draft)
//   3  generation failed after retries (soft-skip: keep the placeholder draft)
// Anything else is an unexpected crash. The API key is never printed.

import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatIsoDate, loadSiteConfig, MONTHS, parseIsoParts } from './config.mjs';
import { formatWeekRange, sanitizeFilePart, todayInTimeZone } from './lib/digest.mjs';
import { assembleStreamedMessage, buildPrompt, DIGEST_SCHEMA, renderDigest, validatePayload } from './lib/generate.mjs';
import { checkDigest } from './lib/check.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_PATH = join(ROOT, 'templates', 'digest-template.html');
const API_URL = 'https://api.anthropic.com/v1/messages';
// Per-attempt ceiling. A real draft (multiple web searches + writing) can
// legitimately run past 10 minutes -- a live run was aborted twice at an
// earlier 10-minute cap while still streaming healthily. This is an
// unattended batch job, so the cap is generous; the idle timeout below is
// what catches genuinely dead connections quickly.
const REQUEST_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
// Abort if the stream goes silent. A healthy generation delivers a steady
// flow of SSE events (deltas, tool progress, pings), so a long gap means
// the connection died, not that the model is thinking.
const IDLE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (['dry-run', 'print-enabled'].includes(key)) {
      parsed[key] = true;
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    parsed[key] = value;
    i += 1;
  }
  return parsed;
}

// Isolated so tests can stub the HTTP call. Returns a plain result object.
// The request always streams: a non-streaming call sends no response headers
// until the entire generation finishes, and Node's built-in fetch gives up
// after 300s without headers (UND_ERR_HEADERS_TIMEOUT) — well under the
// several minutes a web-search draft takes. Streaming delivers headers
// immediately and keeps bytes flowing, so only the overall abort timer here
// bounds the request.
export async function callAnthropic(body, apiKey) {
  const controller = new AbortController();
  const overall = setTimeout(
    () => controller.abort(new Error(`request exceeded the ${REQUEST_TIMEOUT_MS / 60000}-minute per-attempt cap`)),
    REQUEST_TIMEOUT_MS,
  );
  let idle = null;
  const resetIdle = () => {
    clearTimeout(idle);
    idle = setTimeout(
      () => controller.abort(new Error(`stream idle for ${IDLE_TIMEOUT_MS / 60000} minutes (connection presumed dead)`)),
      IDLE_TIMEOUT_MS,
    );
  };
  try {
    resetIdle();
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ...body, stream: true }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* leave json null */ }
      return { ok: false, status: res.status, json, text };
    }

    let sse = '';
    const decoder = new TextDecoder();
    for await (const chunk of res.body) {
      resetIdle();
      sse += decoder.decode(chunk, { stream: true });
    }
    sse += decoder.decode();

    const { message, error } = assembleStreamedMessage(sse);
    if (error) {
      const text = JSON.stringify(error);
      return { ok: false, status: res.status, json: { error }, text };
    }
    return { ok: true, status: res.status, json: message, text: sse };
  } finally {
    clearTimeout(overall);
    clearTimeout(idle);
  }
}

export function buildRequestBody(config, prompt) {
  return {
    model: config.ai.model,
    max_tokens: 8000,
    // max_uses stays below the API's ~10-iteration server-side tool loop
    // (which would end the turn early with stop_reason: pause_turn) and
    // keeps generation time reasonable.
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }],
    output_config: { format: { type: 'json_schema', schema: DIGEST_SCHEMA } },
    messages: [{ role: 'user', content: prompt }],
  };
}

function extractLastText(json) {
  if (!json || !Array.isArray(json.content)) return null;
  const textBlocks = json.content.filter((b) => b && b.type === 'text' && typeof b.text === 'string');
  if (!textBlocks.length) return null;
  return textBlocks[textBlocks.length - 1].text;
}

// Runs the request/render/lint loop with the two single-shot retries
// (max_tokens -> fewer stories, lint failure -> errors appended). Returns
// { ok: true, html } or { ok: false, reason }. `call` defaults to the real
// HTTP function but is injectable for tests.
export async function generateDigest({ config, template, meta, apiKey, call = callAnthropic }) {
  let maxStories = config.ai.maxStories;
  let notes = [];
  let maxTokensRetried = false;
  let lintRetried = false;
  let networkRetried = false;
  let validationRetried = false;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const prompt = buildPrompt(config, meta.isoDate, meta.displayDate, { maxStories, notes });

    let resp;
    try {
      resp = await call(buildRequestBody(config, prompt), apiKey);
    } catch (err) {
      // Network-level failure (DNS, reset, abort). Retry once, then fail
      // through the normal soft-skip contract (exit 3) instead of crashing.
      if (!networkRetried) {
        networkRetried = true;
        continue;
      }
      const cause = err && err.cause ? ` (${err.cause.code || err.cause.message || err.cause})` : '';
      return { ok: false, reason: `network error calling the Anthropic API: ${err.message}${cause}` };
    }

    if (!resp.ok) {
      const snippet = (resp.text || '').slice(0, 300);
      return { ok: false, reason: `Anthropic API returned HTTP ${resp.status}: ${snippet}` };
    }

    const stopReason = resp.json && resp.json.stop_reason;

    if (stopReason === 'refusal') {
      return { ok: false, reason: 'model declined to generate the digest (stop_reason: refusal)' };
    }

    if (stopReason === 'pause_turn') {
      // The server-side tool loop hit its iteration limit before finishing.
      // max_uses is set below the limit so this should not happen; surface
      // it clearly rather than as a confusing "no text block" error.
      return { ok: false, reason: 'model paused mid-generation (stop_reason: pause_turn); the web search budget may be set too high relative to the API tool-loop limit' };
    }

    if (stopReason === 'max_tokens') {
      if (!maxTokensRetried) {
        maxTokensRetried = true;
        maxStories = Math.max(1, maxStories - 2);
        notes = [...notes, `The previous attempt ran out of output tokens. Write at most ${maxStories} stories and keep every field concise.`];
        continue;
      }
      return { ok: false, reason: 'model hit the token limit (stop_reason: max_tokens) even after retrying with fewer stories' };
    }

    const text = extractLastText(resp.json);
    if (!text) return { ok: false, reason: 'no text block found in the API response' };

    let payload;
    try {
      payload = JSON.parse(text);
    } catch (err) {
      return { ok: false, reason: `could not parse JSON from the response text block: ${err.message}` };
    }

    const payloadErrors = validatePayload(payload);
    if (payloadErrors.length) {
      // A structurally-valid response with bad content (seen live: a
      // schema-conforming payload with an empty stories array) deserves one
      // more attempt with the problems fed back, same as lint failures.
      if (!validationRetried) {
        validationRetried = true;
        notes = [...notes, `The previous attempt returned an unusable payload (${payloadErrors.join('; ')}). Fix these problems; in particular, always include at least one story with real web-search sources.`];
        continue;
      }
      return { ok: false, reason: `response payload failed validation even after a retry: ${payloadErrors.join('; ')}` };
    }

    const html = renderDigest(template, config, payload, meta);
    const lintErrors = checkDigest(html).filter((f) => f.level === 'error');
    if (lintErrors.length) {
      if (!lintRetried) {
        lintRetried = true;
        notes = [...notes, `The previous draft failed these content checks; fix them: ${lintErrors.map((f) => f.message).join('; ')}`];
        continue;
      }
      return { ok: false, reason: `generated digest still failed linting after a retry: ${lintErrors.map((f) => f.message).join('; ')}` };
    }

    return { ok: true, html };
  }

  return { ok: false, reason: 'exhausted generation retries' };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = await loadSiteConfig(ROOT);

  if (args['print-enabled']) {
    console.log(config.ai.enabled === true ? 'true' : 'false');
    return;
  }

  const isoDate = args.date || todayInTimeZone(config.timezone);
  const [year, month, day] = parseIsoParts(isoDate);
  const date = new Date(Date.UTC(year, month - 1, day));
  const displayDate = formatIsoDate(isoDate);
  const weekRange = formatWeekRange(date);
  const fileName = `${day} ${MONTHS[month - 1]} ${sanitizeFilePart(config.digestTitlePrefix)}.html`;
  const relPath = args.output || `${year}/${MONTHS[month - 1]}/${weekRange}/${fileName}`;
  const meta = { isoDate, displayDate, weekRange };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set; cannot generate an AI draft. Set the secret to enable AI drafts.');
    process.exit(2);
  }

  const prompt = buildPrompt(config, isoDate, displayDate);
  const body = buildRequestBody(config, prompt);

  if (args['dry-run']) {
    console.log(JSON.stringify(body, null, 2));
    return;
  }

  const template = await readFile(TEMPLATE_PATH, 'utf8');
  const result = await generateDigest({ config, template, meta, apiKey });

  if (!result.ok) {
    console.log(`::warning::AI draft generation failed: ${result.reason}`);
    process.exit(3);
  }

  const absPath = join(ROOT, relPath);
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, result.html, 'utf8');
  console.log(`::notice::Wrote AI draft to ${relPath}`);

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, 'ai_draft=true\n');
  }
}

// Only run when executed directly, so tests can import the exports above.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
