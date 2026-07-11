// Pure helpers for scripts/generate-digest.mjs: prompt construction, the
// structured-output JSON schema, payload validation, and JSON -> HTML
// rendering. No network and no fs here so every piece is unit testable
// offline, consistent with the other scripts/lib/ modules.

import { darkLinkColor, escapeHtml, renderTemplate } from './digest.mjs';
import { DEFAULT_CONFIG } from '../config.mjs';

// JSON schema for the Messages API structured output. Structured outputs
// require additionalProperties:false at every object level, and reject
// array count constraints (minItems/maxItems), so limits like "5 bullets
// max" and "at least one source" are enforced by the prompt,
// validatePayload, and renderDigest instead of the schema.
export const DIGEST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['description', 'glanceBullets', 'stories'],
  properties: {
    description: { type: 'string' },
    glanceBullets: {
      type: 'array',
      items: { type: 'string' },
    },
    stories: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['category', 'when', 'headline', 'whyItMatters', 'detail', 'sources'],
        properties: {
          category: { type: 'string' },
          when: { type: 'string' },
          headline: { type: 'string' },
          whyItMatters: { type: 'string' },
          detail: { type: 'string' },
          sources: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['title', 'url'],
              properties: {
                title: { type: 'string' },
                url: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
};

// Builds the user message. `options.maxStories` overrides config.ai.maxStories
// (used by the max_tokens retry to ask for fewer stories); `options.notes` is
// an array of extra guidance lines appended verbatim (used by the retries).
export function buildPrompt(config, isoDate, displayDate, options = {}) {
  const ai = config.ai || {};
  const maxStories = options.maxStories ?? ai.maxStories ?? 4;
  const notes = options.notes || [];

  const lines = [
    `You are writing a daily news brief about ${config.topic} for ${config.audience}.`,
    `Cover the most important developments from the ${config.coverageWindow}, as of ${displayDate} (${isoDate}).`,
    'Use web search to research the news, and cite every factual claim with the URL of a source you actually found via search.',
    'Follow this Content Bar exactly:',
    `- Include at most ${maxStories} stories, ordered most important first.`,
    '- Provide at most 5 "at a glance" bullets, each a single tight sentence.',
    '- Lead every story with why it matters for the audience.',
    '- Every story must carry at least one source with a real http(s) URL.',
    '- Prefer primary and authoritative sources.',
    'Return the result as structured JSON matching the provided schema: a one-sentence "description" (used as the page meta description), the "glanceBullets", and the "stories" (each with category, when, headline, whyItMatters, detail, and sources[{title, url}]).',
  ];

  if (typeof ai.instructions === 'string' && ai.instructions.trim()) {
    lines.push('', 'Additional instructions from the site owner:', ai.instructions.trim());
  }

  for (const note of notes) {
    lines.push('', note);
  }

  return lines.join('\n');
}

// Structural validation with readable errors. Used before rendering.
export function validatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return ['payload must be an object'];
  }

  const errors = [];

  if (typeof payload.description !== 'string' || !payload.description.trim()) {
    errors.push('description must be a non-empty string');
  }

  if (!Array.isArray(payload.glanceBullets)) {
    errors.push('glanceBullets must be an array');
  } else {
    payload.glanceBullets.forEach((bullet, i) => {
      if (typeof bullet !== 'string') errors.push(`glanceBullets[${i}] must be a string`);
    });
  }

  if (!Array.isArray(payload.stories) || payload.stories.length === 0) {
    errors.push('stories must be a non-empty array');
  } else {
    payload.stories.forEach((story, i) => {
      if (!story || typeof story !== 'object' || Array.isArray(story)) {
        errors.push(`stories[${i}] must be an object`);
        return;
      }
      for (const field of ['category', 'when', 'headline', 'whyItMatters', 'detail']) {
        if (typeof story[field] !== 'string' || !story[field].trim()) {
          errors.push(`stories[${i}].${field} must be a non-empty string`);
        }
      }
      if (!Array.isArray(story.sources) || story.sources.length === 0) {
        errors.push(`stories[${i}].sources must be a non-empty array`);
      } else {
        story.sources.forEach((source, j) => {
          if (!source || typeof source !== 'object' || Array.isArray(source)) {
            errors.push(`stories[${i}].sources[${j}] must be an object`);
            return;
          }
          if (typeof source.title !== 'string' || !source.title.trim()) {
            errors.push(`stories[${i}].sources[${j}].title must be a non-empty string`);
          }
          if (typeof source.url !== 'string' || !source.url.trim()) {
            errors.push(`stories[${i}].sources[${j}].url must be a non-empty string`);
          }
        });
      }
    });
  }

  return errors;
}

// Folds a complete SSE transcript from a streaming Messages API call into a
// plain message object shaped like a non-streaming response ({ stop_reason,
// content: [...] }), so downstream handling is identical either way. The
// request streams because a non-streaming call sends no response headers
// until the whole generation (minutes of web research) finishes, and Node's
// built-in fetch aborts after 300s without headers (UND_ERR_HEADERS_TIMEOUT).
// Returns { message, error } — `error` is set if the stream carried an error
// event or ended before message_stop.
export function assembleStreamedMessage(sseText) {
  const message = { stop_reason: null, content: [] };
  let sawStop = false;

  for (const rawEvent of String(sseText).split('\n\n')) {
    const dataLines = rawEvent
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim());
    if (!dataLines.length) continue;

    let event;
    try {
      event = JSON.parse(dataLines.join(''));
    } catch {
      continue; // tolerate partial/malformed frames (e.g. a truncated tail)
    }

    switch (event.type) {
      case 'error':
        return { message: null, error: event.error || { message: 'unknown stream error' } };
      case 'content_block_start':
        message.content[event.index] = { ...event.content_block };
        break;
      case 'content_block_delta': {
        const block = message.content[event.index];
        if (block && event.delta && event.delta.type === 'text_delta' && block.type === 'text') {
          block.text = (block.text || '') + event.delta.text;
        }
        break;
      }
      case 'message_delta':
        if (event.delta && event.delta.stop_reason) message.stop_reason = event.delta.stop_reason;
        break;
      case 'message_stop':
        sawStop = true;
        break;
      default:
        break; // message_start, content_block_stop, ping, unknown future events
    }
  }

  if (!sawStop) {
    return { message: null, error: { message: 'stream ended before message_stop (connection dropped mid-generation)' } };
  }
  // Sparse indexes (shouldn't happen, but be safe) become dropped entries.
  message.content = message.content.filter(Boolean);
  return { message, error: null };
}

// Returns the original URL string if it parses as an http(s) URL, else null.
function safeUrl(url) {
  if (typeof url !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return url.trim();
}

function renderStory(story) {
  const sourceItems = story.validSources
    .map((s) => `          <li><a href="${escapeHtml(s.url)}">${escapeHtml(s.title || s.url)}</a></li>`)
    .join('\n');
  return [
    '  <article class="story">',
    `    <div class="kicker"><span class="tag">${escapeHtml(story.category || '')}</span><span class="when">${escapeHtml(story.when || '')}</span></div>`,
    `    <h3>${escapeHtml(story.headline || '')}</h3>`,
    `    <p class="lead"><span class="wm">Why it matters:</span> ${escapeHtml(story.whyItMatters || '')}</p>`,
    '    <details>',
    '      <summary>Detail &amp; sources</summary>',
    '      <div class="detail">',
    `        <p>${escapeHtml(story.detail || '')}</p>`,
    '        <ul class="sources">',
    sourceItems,
    '        </ul>',
    '      </div>',
    '    </details>',
    '  </article>',
  ].join('\n');
}

// Renders the JSON payload into the full digest HTML. Starts from the template
// (standard placeholders filled via renderTemplate), then swaps the placeholder
// glance bullets and the single placeholder story article for generated
// content. All payload text is HTML-escaped; source URLs are validated
// (non-http(s) dropped) and a story with no valid sources left is dropped.
export function renderDigest(template, config, payload, meta = {}) {
  const { isoDate, displayDate } = meta;
  const maxStories = (config.ai && config.ai.maxStories) || 4;

  const html = renderTemplate(template, {
    ACCENT_COLOR: config.accentColor,
    ACCENT_COLOR_DARK: darkLinkColor(config.accentColor, DEFAULT_CONFIG.accentColor),
    AUDIENCE: config.audience,
    COVERAGE_WINDOW: config.coverageWindow,
    DATE_DISPLAY: displayDate,
    DESCRIPTION: payload.description,
    DIGEST_TITLE_PREFIX: config.digestTitlePrefix,
    EYEBROW: config.eyebrow,
    GENERATED_DATE: displayDate,
    ISO_DATE: isoDate,
    SITE_TITLE: config.siteTitle,
    TOPIC: config.topic,
  });

  // Cap defensively at 5 regardless of what the model returned.
  const bullets = (Array.isArray(payload.glanceBullets) ? payload.glanceBullets : []).slice(0, 5);
  const bulletItems = bullets.map((b) => `      <li>${escapeHtml(b)}</li>`).join('\n');
  const olReplacement = `<ol class="bullets" data-summary>\n${bulletItems}\n    </ol>`;

  const stories = (Array.isArray(payload.stories) ? payload.stories : [])
    .map((story) => {
      const validSources = (Array.isArray(story.sources) ? story.sources : [])
        .map((s) => ({ title: s && s.title, url: safeUrl(s && s.url) }))
        .filter((s) => s.url);
      return { ...story, validSources };
    })
    .filter((story) => story.validSources.length > 0)
    .slice(0, maxStories);

  const storiesHtml = stories.map(renderStory).join('\n');

  // Function replacers so a `$` in generated text/URLs is not treated as a
  // replacement pattern.
  return html
    .replace(/<ol\b[^>]*\bclass="[^"]*\bbullets\b[^"]*"[^>]*>[\s\S]*?<\/ol>/i, () => olReplacement)
    .replace(/<article\b[^>]*\bclass="[^"]*\bstory\b[^"]*"[^>]*>[\s\S]*?<\/article>/i, () => storiesHtml);
}
