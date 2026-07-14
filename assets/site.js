// Shared front-end helpers for index.html and archive.html.
//
// Plain script (no ES module) so it works from file: and http: without CORS
// or module-loading complications. Loaded via <script src="./assets/site.js">.
//
// Do NOT reference this file from templates/digest-template.html or generated
// digests -- digests must stay self-contained (see CLAUDE.md "Content Bar").
//
// NOTE: DEFAULT_CONFIG below is kept in sync with scripts/config.mjs (the
// Node-side source of truth) by test/site-js.test.mjs. If you change one,
// change the other.
(function () {
  var DEFAULT_CONFIG = {
    siteTitle: 'Personal News Digest',
    description: 'A personal daily news page for the topics you care about.',
    eyebrow: 'Daily Brief',
    digestTitlePrefix: 'Personal News Digest',
    topic: 'news you care about',
    audience: 'a personal daily reader',
    coverageWindow: 'last 24 hours',
    timezone: 'America/New_York',
    publishTimeLocal: '06:30',
    accentColor: '#2563eb',
    draftBranchPrefix: 'daily-digest',
    siteUrl: '',
    publishMode: 'review',
    ai: { enabled: true, model: 'claude-sonnet-5', maxStories: 4, effort: 'medium', instructions: '' }
  };

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  function formatDate(iso) {
    var parts = iso.split('-').map(Number);
    return parts[2] + ' ' + MONTHS[parts[1] - 1] + ' ' + parts[0];
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function encodePath(p) {
    return p.split('/').map(encodeURIComponent).join('/');
  }

  async function loadSiteConfig() {
    try {
      var res = await fetch('./site.config.json', { cache: 'no-cache' });
      if (!res.ok) return DEFAULT_CONFIG;
      var config = await res.json();
      return Object.assign({}, DEFAULT_CONFIG, config || {});
    } catch (err) {
      return DEFAULT_CONFIG;
    }
  }

  window.SiteCommon = {
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    MONTHS: MONTHS,
    formatDate: formatDate,
    escapeHtml: escapeHtml,
    encodePath: encodePath,
    loadSiteConfig: loadSiteConfig
  };
})();
