// Unit tests for scripts/lib/generate.mjs (offline; no network).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DEFAULT_CONFIG } from '../scripts/config.mjs';
import { checkDigest, PLACEHOLDER_STRINGS } from '../scripts/lib/check.mjs';
import {
  assembleStreamedMessage,
  buildPrompt,
  DIGEST_SCHEMA,
  renderDigest,
  validatePayload,
} from '../scripts/lib/generate.mjs';
import { generateDigest } from '../scripts/generate-digest.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(__dirname, '..', 'templates', 'digest-template.html');

const CONFIG = {
  ...DEFAULT_CONFIG,
  topic: 'renewable energy policy',
  audience: 'clean-tech founders',
  coverageWindow: 'past week',
  ai: { enabled: true, model: 'claude-sonnet-5', maxStories: 3, instructions: 'Skip celebrity news.' },
};

const META = { isoDate: '2026-07-06', displayDate: '6 July 2026', weekRange: '6 July - 12 July' };

function goodPayload() {
  return {
    description: 'A concise brief on renewable energy policy for clean-tech founders.',
    glanceBullets: [
      'Grid interconnection reform advances in three states.',
      'Battery storage costs fall another 8 percent.',
      'New federal tax guidance clarifies credit transfers.',
    ],
    stories: [
      {
        category: 'Policy',
        when: '2026-07-05',
        headline: 'Interconnection reform clears committee',
        whyItMatters: 'Faster interconnection shortens project timelines for founders.',
        detail: 'The committee advanced a package streamlining queue processing.',
        sources: [
          { title: 'Grid Reform Report', url: 'https://example.org/grid-reform' },
          { title: 'Committee notes', url: 'https://news.example.com/committee' },
        ],
      },
      {
        category: 'Markets',
        when: 'this week',
        headline: 'Storage prices keep sliding',
        whyItMatters: 'Cheaper storage improves project economics.',
        detail: 'Analysts attribute the drop to new cell capacity.',
        sources: [
          { title: 'Price Index', url: 'https://data.example.com/storage' },
        ],
      },
    ],
  };
}

test('buildPrompt includes topic, audience, coverageWindow, maxStories, and appends instructions', () => {
  const prompt = buildPrompt(CONFIG, META.isoDate, META.displayDate);
  assert.ok(prompt.includes('renewable energy policy'));
  assert.ok(prompt.includes('clean-tech founders'));
  assert.ok(prompt.includes('past week'));
  assert.ok(prompt.includes('at most 3 stories'));
  assert.ok(prompt.includes('Skip celebrity news.'));
});

test('buildPrompt honors a maxStories override and appended notes', () => {
  const prompt = buildPrompt(CONFIG, META.isoDate, META.displayDate, {
    maxStories: 1,
    notes: ['Extra note here.'],
  });
  assert.ok(prompt.includes('at most 1 stories'));
  assert.ok(prompt.includes('Extra note here.'));
});

test('DIGEST_SCHEMA sets additionalProperties:false at every object level', () => {
  assert.equal(DIGEST_SCHEMA.additionalProperties, false);
  const story = DIGEST_SCHEMA.properties.stories.items;
  assert.equal(story.additionalProperties, false);
  const source = story.properties.sources.items;
  assert.equal(source.additionalProperties, false);
  // Required fields are present.
  assert.deepEqual(DIGEST_SCHEMA.required, ['description', 'glanceBullets', 'stories']);
  assert.deepEqual(story.required, ['category', 'when', 'headline', 'whyItMatters', 'detail', 'sources']);
  assert.deepEqual(source.required, ['title', 'url']);
});

test('DIGEST_SCHEMA avoids keywords the structured-output API rejects', () => {
  // The Messages API structured-output validator rejects array count
  // constraints, string length constraints, and numeric range constraints
  // (confirmed live: "For 'array' type, property 'maxItems' is not
  // supported"). Those limits live in the prompt, validatePayload, and
  // renderDigest instead.
  const banned = [
    'minItems', 'maxItems',
    'minLength', 'maxLength',
    'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
    'pattern', 'uniqueItems',
  ];
  const walk = (node, path) => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const key of Object.keys(node)) {
      assert.ok(!banned.includes(key), `${path}.${key} is not supported by structured outputs`);
      walk(node[key], `${path}.${key}`);
    }
  };
  walk(DIGEST_SCHEMA, 'DIGEST_SCHEMA');
});

test('validatePayload accepts a good fixture', () => {
  assert.deepEqual(validatePayload(goodPayload()), []);
});

test('validatePayload rejects missing/invalid fields', () => {
  const noStories = goodPayload();
  noStories.stories = [];
  assert.ok(validatePayload(noStories).some((e) => e.includes('stories must be a non-empty array')));

  const badStory = goodPayload();
  delete badStory.stories[0].headline;
  assert.ok(validatePayload(badStory).some((e) => e.includes('stories[0].headline')));

  const noDescription = goodPayload();
  noDescription.description = '';
  assert.ok(validatePayload(noDescription).some((e) => e.includes('description')));

  const noSources = goodPayload();
  noSources.stories[1].sources = [];
  assert.ok(validatePayload(noSources).some((e) => e.includes('stories[1].sources')));

  assert.ok(validatePayload(null).length > 0);
});

test('renderDigest produces HTML that passes checkDigest with 0 errors and 0 placeholder warnings', async () => {
  const template = await readFile(TEMPLATE_PATH, 'utf8');
  const html = renderDigest(template, CONFIG, goodPayload(), META);
  const findings = checkDigest(html);
  assert.deepEqual(findings.filter((f) => f.level === 'error'), [], JSON.stringify(findings));
  assert.deepEqual(findings.filter((f) => f.level === 'warning'), [], JSON.stringify(findings));
  // Sanity: none of the placeholder strings survived.
  for (const placeholder of PLACEHOLDER_STRINGS) {
    assert.ok(!html.includes(placeholder), `placeholder leaked: ${placeholder}`);
  }
  // The description is used as the meta description.
  assert.ok(html.includes(goodPayload().description));
});

test('renderDigest HTML-escapes a headline containing a script tag', async () => {
  const template = await readFile(TEMPLATE_PATH, 'utf8');
  const payload = goodPayload();
  payload.stories[0].headline = '<script>alert(1)</script>';
  const html = renderDigest(template, CONFIG, payload, META);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  // The only raw <script in the document is the template's own reading-time
  // block (src-less). The injected headline must not add another.
  const rawScripts = (html.match(/<script\b/gi) || []).length;
  assert.equal(rawScripts, 1);
  // And that lone script has no src attribute (self-contained).
  assert.ok(!/<script\b[^>]*\bsrc=/i.test(html));
});

test('renderDigest drops a javascript: source and drops a story whose sources all filter out', async () => {
  const template = await readFile(TEMPLATE_PATH, 'utf8');
  const payload = goodPayload();
  // Story 0: one bad source, one good — should keep the good one, drop the bad.
  payload.stories[0].sources = [
    { title: 'Evil', url: 'javascript:alert(1)' },
    { title: 'Good', url: 'https://example.org/ok' },
  ];
  // Story 1: all sources invalid — the whole story should be dropped.
  payload.stories[1].sources = [
    { title: 'Bad', url: 'javascript:alert(1)' },
    { title: 'Also bad', url: 'not a url' },
  ];
  const html = renderDigest(template, CONFIG, payload, META);
  assert.ok(!html.includes('javascript:alert(1)'));
  assert.ok(html.includes('https://example.org/ok'));
  const storyCount = (html.match(/<article\b[^>]*\bclass="[^"]*\bstory\b/gi) || []).length;
  assert.equal(storyCount, 1);
  // Still passes the linter (the surviving story has an https source).
  assert.deepEqual(checkDigest(html).filter((f) => f.level === 'error'), []);
});

test('renderDigest caps bullets at 5 and stories at config.ai.maxStories', async () => {
  const template = await readFile(TEMPLATE_PATH, 'utf8');
  const payload = goodPayload();
  payload.glanceBullets = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  payload.stories = Array.from({ length: 6 }, (_, i) => ({
    category: 'Cat',
    when: '2026-07-05',
    headline: `Story ${i}`,
    whyItMatters: 'Matters.',
    detail: 'Detail.',
    sources: [{ title: 'S', url: `https://example.com/${i}` }],
  }));
  const html = renderDigest(template, CONFIG, payload, META); // maxStories: 3
  const bulletCount = (html.match(/<ol\b[^>]*\bbullets[\s\S]*?<\/ol>/i)[0].match(/<li\b/gi) || []).length;
  assert.equal(bulletCount, 5);
  const storyCount = (html.match(/<article\b[^>]*\bclass="[^"]*\bstory\b/gi) || []).length;
  assert.equal(storyCount, 3);
});

// --- Streaming SSE assembly (assembleStreamedMessage) ---

function sse(events) {
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n`).join('\n') + '\n';
}

test('assembleStreamedMessage folds text deltas into a non-streaming-shaped message', () => {
  const half = JSON.stringify(goodPayload());
  const events = [
    { type: 'message_start', message: { content: [] } },
    { type: 'ping' },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: half.slice(0, 40) } },
    { type: 'ping' },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: half.slice(40) } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
    { type: 'message_stop' },
  ];
  const { message, error } = assembleStreamedMessage(sse(events));
  assert.equal(error, null);
  assert.equal(message.stop_reason, 'end_turn');
  assert.equal(message.content.length, 1);
  assert.deepEqual(JSON.parse(message.content[0].text), goodPayload());
});

test('assembleStreamedMessage ignores non-text blocks and their deltas', () => {
  const events = [
    { type: 'message_start', message: { content: [] } },
    { type: 'content_block_start', index: 0, content_block: { type: 'server_tool_use', id: 't1', name: 'web_search' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query":' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'result' } },
    { type: 'content_block_stop', index: 1 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
    { type: 'message_stop' },
  ];
  const { message, error } = assembleStreamedMessage(sse(events));
  assert.equal(error, null);
  const textBlocks = message.content.filter((b) => b.type === 'text');
  assert.equal(textBlocks.length, 1);
  assert.equal(textBlocks[textBlocks.length - 1].text, 'result');
});

test('assembleStreamedMessage surfaces a stream error event', () => {
  const events = [
    { type: 'message_start', message: { content: [] } },
    { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } },
  ];
  const { message, error } = assembleStreamedMessage(sse(events));
  assert.equal(message, null);
  assert.equal(error.message, 'Overloaded');
});

test('assembleStreamedMessage flags a stream that ends without message_stop', () => {
  const events = [
    { type: 'message_start', message: { content: [] } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'partial' } },
  ];
  const { message, error } = assembleStreamedMessage(sse(events));
  assert.equal(message, null);
  assert.match(error.message, /message_stop/);
});

// --- generateDigest network-error handling ---

function successResponse() {
  return {
    ok: true,
    status: 200,
    json: { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(goodPayload()) }] },
    text: '',
  };
}

test('generateDigest retries once after a thrown network error, then succeeds', async () => {
  const template = await readFile(TEMPLATE_PATH, 'utf8');
  let calls = 0;
  const call = async () => {
    calls += 1;
    if (calls === 1) throw new TypeError('fetch failed');
    return successResponse();
  };
  const result = await generateDigest({ config: CONFIG, template, meta: META, apiKey: 'test-key', call });
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
});

test('generateDigest soft-fails (not crashes) when the network error persists', async () => {
  const template = await readFile(TEMPLATE_PATH, 'utf8');
  const err = new TypeError('fetch failed');
  err.cause = { code: 'UND_ERR_HEADERS_TIMEOUT' };
  const call = async () => { throw err; };
  const result = await generateDigest({ config: CONFIG, template, meta: META, apiKey: 'test-key', call });
  assert.equal(result.ok, false);
  assert.match(result.reason, /network error/);
  assert.match(result.reason, /UND_ERR_HEADERS_TIMEOUT/);
});

test('generateDigest retries once with feedback when the payload fails validation', async () => {
  const template = await readFile(TEMPLATE_PATH, 'utf8');
  const empty = { ...goodPayload(), stories: [] };
  const prompts = [];
  let calls = 0;
  const call = async (body) => {
    calls += 1;
    prompts.push(body.messages[0].content);
    return {
      ok: true,
      status: 200,
      json: {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(calls === 1 ? empty : goodPayload()) }],
      },
      text: '',
    };
  };
  const result = await generateDigest({ config: CONFIG, template, meta: META, apiKey: 'test-key', call });
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  // The retry prompt carries the validation feedback.
  assert.match(prompts[1], /unusable payload/);
  assert.match(prompts[1], /stories must be a non-empty array/);
});

test('generateDigest fails cleanly when validation errors persist after the retry', async () => {
  const template = await readFile(TEMPLATE_PATH, 'utf8');
  const empty = { ...goodPayload(), stories: [] };
  const call = async () => ({
    ok: true,
    status: 200,
    json: { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(empty) }] },
    text: '',
  });
  const result = await generateDigest({ config: CONFIG, template, meta: META, apiKey: 'test-key', call });
  assert.equal(result.ok, false);
  assert.match(result.reason, /failed validation even after a retry/);
});

test('buildPrompt forbids an empty stories array', () => {
  const prompt = buildPrompt(CONFIG, META.isoDate, META.displayDate);
  assert.match(prompt, /at least one story/i);
  assert.match(prompt, /Never return an empty stories array/);
});

test('buildPrompt demands article-level source URLs', () => {
  const prompt = buildPrompt(CONFIG, META.isoDate, META.displayDate);
  assert.match(prompt, /specific article, document, or record/);
  assert.match(prompt, /never a homepage or section front/);
});
