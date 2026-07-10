# Sprint 3 — UI Polish & Front-End Consolidation

**Size:** Small/medium (1 day)
**Suggested model:** Claude Sonnet 5 (`claude-sonnet-5`)
**Rationale for model:** Coordinated CSS/JS changes across three pages plus a
template, with visual-design judgment (dark palette, contrast) — a good fit
for Sonnet 5. Haiku 4.5 could handle items 3.3–3.4 alone if the sprint is
split.

## Goal

Modernize the reading experience (dark mode, accessibility, 404 page) and
remove the triplicated front-end config that will otherwise drift.

## Spec

### 3.1 Dark mode

- Add `@media (prefers-color-scheme: dark)` overrides for the CSS custom
  properties (`--ink`, `--muted`, `--faint`, `--line`, `--bg`, `--panel`) in
  `index.html`, `archive.html`, and `templates/digest-template.html`.
- Replace remaining hard-coded colors with variables first (e.g. `#f4f5f7`
  nav-hover in `index.html`, `#3b3f47` summary in `archive.html`, `#2c2f36` /
  `#33363d` body text and `#b42318` error color in the template/pages) so the
  dark palette applies everywhere.
- Add `<meta name="color-scheme" content="light dark">` to all three files.
- The accent color stays user-configured; verify the default `#2563eb` passes
  WCAG AA contrast on the chosen dark background, and note in the README that
  users picking a custom accent should check both modes.
- Digests must remain self-contained (Content Bar rule): the dark-mode CSS is
  duplicated into the template, not shared.

### 3.2 Shared front-end config module

- `DEFAULT_CONFIG` and `loadConfig()` are duplicated in `index.html` and
  `archive.html` (and mirrored in `scripts/config.mjs`). Create
  `assets/site.js` exposing `window.loadSiteConfig()` (defaults + fetch +
  merge) and the shared `MONTHS` / `formatDate` / `escapeHtml` / `encodePath`
  helpers; load it with a plain `<script src="./assets/site.js">` from both
  pages.
- Do **not** import it from digest files (they must stay self-contained).
- `scripts/config.mjs` remains the Node-side source of truth; add a comment in
  both files pointing at each other, and (optional, if sprint 2 landed) a unit
  test asserting the two `DEFAULT_CONFIG` objects stay equal by parsing
  `assets/site.js`.
- Update sprint 1.6's `_site/` staging list (and it, in turn, this sprint) to
  include `assets/`.

### 3.3 `404.html`

- Add a minimal, styled 404 page matching the site look, with links to the
  latest digest (`./`) and the archive. GitHub Pages picks up root `404.html`
  automatically.

### 3.4 Accessibility pass

- `index.html`: give the status region `role="status"` / `aria-live="polite"`;
  add a visible focus style for nav links; add a "Skip to digest" skip link.
- `archive.html`: `aria-live` on the loading status; focus styles on entry
  links.
- Template: ensure `summary` elements have visible focus; add
  `lang`-appropriate semantics already present — verify headings order
  (h1 → h2 → h3) is intact.

## Plan

1. Variable-ize stray colors; add dark palettes + `color-scheme` meta (3.1).
2. Extract `assets/site.js`; refactor both pages to use it (3.2).
3. Add `404.html` (3.3) and the accessibility fixes (3.4).
4. Verify: serve locally, toggle OS dark mode (or DevTools emulation), check
   index, archive, a generated digest, and 404 in both modes; run a Lighthouse
   accessibility pass; regenerate nothing — no script changes.

## Acceptance criteria

- All four pages render correctly in light and dark mode with no hard-coded
  light-only colors remaining.
- `index.html` and `archive.html` contain no inline copy of `DEFAULT_CONFIG`.
- Digest files still pass the sprint-2 self-containment lint.
- Keyboard-only navigation reaches every interactive element with a visible
  focus indicator.
