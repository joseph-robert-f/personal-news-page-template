# Sprint 7 — Portfolio Packaging (Presentation)

**Size:** Small (½ day of work + a 1–2 week content run that happens on its own)
**Suggested model:** Claude Haiku 4.5 (`claude-haiku-4-5`) for the mechanical
items; the README rewrite (7.2) benefits from Claude Sonnet 5
(`claude-sonnet-5`) if done in the same session, since it's writing quality
judgment rather than code.
**Depends on:** All six sprints merged and the gate review signed off.

## Goal

The six sprints make the project *work*; the gate review proves it. This
sprint makes it *show well*. A portfolio visitor gives a repo roughly 90
seconds: they read the README, maybe click the live site, and almost never run
the code. Every item here targets that 90-second window.

Success statement: a stranger landing on either the repo or the live site
understands within one screen what this is, sees it working with real content,
and can find evidence of engineering rigor (tests, CI, specs) without digging.

## Spec

### 7.1 Living demo (the prerequisite — start this first)

- Configure the owner's fork/instance for a real topic and audience in
  `site.config.json` and let the daily pipeline run for **at least 10
  publishing days** before sharing the link. The archive must show multiple
  months-or-weeks of genuine entries; the homepage must never show
  "No digests yet" to a visitor.
- At least a few published digests should come through the sprint-6 AI-draft
  path (with visible human edits in the PR history) so the feature has real,
  inspectable output — the merged PRs *are* the demo of the review workflow.
- Verify the live site, feed, and archive on mobile before calling this done.
- Note: this item is elapsed time, not effort — kick it off at the start of
  the sprint and do 7.2–7.5 while it accrues.

### 7.2 README as a landing page

Restructure `README.md` top-down for skimming; keep all current operational
content, but demote it below the fold:

1. **Title + one-line pitch**, then immediately: **live demo link** (the
   deployed Pages site) and a **CI status badge** for the deploy workflow
   (add the PR-checks badge too once it has history).
2. **Screenshot or GIF** — one composite image showing the digest page in
   light and dark mode (or a short GIF toggling). Store under
   `docs/assets/`; exclude `docs/` from the Pages artifact (already done in
   sprint 1.6 — verify).
3. **"How it works" section** (~10 lines): the architecture in prose —
   zero-dependency static site, manifest built from digest `<title>`s,
   draft-PR publishing gate, DST-safe scheduling, optional AI drafting with
   web-search grounding and lint-gated fallback. Link each claim to the file
   that implements it.
4. **"Engineering notes" section** (3–5 lines): point at `docs/roadmap/` as
   the spec-driven development record, the test suite, and the gate review.
   This is the differentiator — most portfolio repos show code; this one
   shows process. State the AI-assisted authorship plainly and factually
   (e.g. "developed spec-first with Claude; every change human-reviewed
   through the same PR gate the site itself uses").
5. Existing Setup / Daily Routine / Local Commands / Content Format sections
   follow, updated for everything sprints 1–6 added (`siteUrl`, `ai.*` keys,
   `node --test`, `check-digest`, `check-cron`, feed).

### 7.3 Repo metadata & template polish

- Mark the repository as a **Template repository** (Settings → General) so
  "Use this template" appears — this is the product, make the button exist.
- Set the GitHub **description** (one line, matches the README pitch, includes
  the live-demo URL) and **topics** (e.g. `github-pages`, `static-site`,
  `newsletter`, `github-actions`, `claude`, `zero-dependency`, `template`).
- Disable unused repo features (Wiki, Projects) so the repo page is clean.
- Add a `CONTRIBUTING.md` **only if** external contributions are actually
  wanted; otherwise a short "Forking vs. contributing" note in the README is
  more honest. Do not add empty ceremony (issue templates, code of conduct)
  to a personal template — reviewers can tell.

### 7.4 Roadmap docs become a record, not a promise

- Add a status line to the top of each sprint doc and the roadmap README
  (`Status: Shipped in #<PR> — <date>`, or `Descoped: <reason>`), so
  `docs/roadmap/` reads as a completed engineering record. Stale
  future-tense specs next to shipped code undermine the process story.
- Append gate-review results: link the findings table / sign-off (a
  `gate-review-results.md` or a closing section in `gate-review.md`).

### 7.5 Final link-and-claim audit

- Click every link in the README and roadmap docs (live site, feed, badges,
  file references) — zero 404s.
- Verify every README claim against the repo (every documented command runs
  verbatim; every config key exists; the screenshot matches the current UI).
- Check the repo's social preview (GitHub Settings → Social preview): upload
  the screenshot so shared links render with it.

## Plan

1. Day 1: configure the real topic and start the content run (7.1); do 7.3
   and 7.4 the same day (no dependencies).
2. Rewrite the README (7.2) once there is at least one real digest to
   screenshot.
3. After ~10 publishing days: capture final screenshots from the
   populated site, run the audit (7.5), set the social preview.
4. Optional finishing move: re-run gate 8 of the gate review (fresh-fork
   test) one last time against the final README, since 7.2 rewrote it.

## Acceptance criteria

- A first-time visitor can, from the repo page alone: understand the project
  in one screen, reach a live site with ≥10 real digests, and find the tests,
  CI, and spec docs within two clicks.
- The README shows a current screenshot, a working demo link, and at least
  one passing CI badge; every command in it runs verbatim on a fresh clone.
- The repo has the template flag, description, and topics set; social preview
  image renders on a shared link.
- Every doc in `docs/roadmap/` carries an accurate status line.
