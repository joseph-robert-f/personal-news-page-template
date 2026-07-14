# Lessons Learned

A working log of what building, gate-reviewing, and live-testing this
template taught us. Kept as a living document — add to it when reality
teaches something new. Dates refer to the first live deployment cycle
(10–12 July 2026), when a real instance ran the pipeline against the real
Anthropic API and real GitHub infrastructure for the first time.

The headline: **offline testing proved the code; only live runs proved the
system.** Seven defects survived a 100+‑test suite, a nine-gate adversarial
review, and sabotage-tested CI — because every one of them lived in a
contract with an external system (the Anthropic API, Node's HTTP stack,
GitHub Actions) that no offline test exercises. All seven were found within
three days of live operation, each fixed within minutes of diagnosis, and
each now has a regression test. No failure ever published bad content on
its own.

---

## 1. The API contract is not what you remember — verify it live

**What happened:** The structured-output JSON schema used `minItems` /
`maxItems`. The Messages API rejects those keywords (HTTP 400:
`For 'array' type, property 'maxItems' is not supported`). Every offline
test passed because the schema was only ever *read*, never *submitted*.

**Lessons:**
- A gate review can mark an external contract "unverifiable offline" (ours
  did — finding 7), but that label is a scheduled failure, not a pass.
  Budget a live smoke test for every such item before calling a system done.
- Enforce limits where you control them. The 5-bullet and ≥1-source rules
  now live in three layers we own — the prompt, `validatePayload`, and
  `renderDigest` — instead of one layer we don't (the API's schema
  validator).
- Turn the discovered contract into a test: `test/generate.test.mjs` now
  bans every JSON Schema keyword the structured-output API rejects, so the
  class of bug can't return.

## 2. Long LLM calls must stream — the transport will kill you before the model does

**What happened:** A non-streaming Messages API call sends **no response
bytes at all** until the entire generation is finished. A digest with live
web search runs many minutes; Node's built-in `fetch` (undici) aborts any
request whose response *headers* haven't arrived within 300 seconds
(`UND_ERR_HEADERS_TIMEOUT`). Every long generation was doomed regardless of
our own generous timeout.

**Lessons:**
- For any LLM call that can exceed ~4 minutes, `stream: true` is not a UX
  nicety, it is a *transport requirement*. Headers arrive instantly and
  bytes flow continuously, so no intermediary timeout fires.
- Reassemble the SSE transcript into the non-streaming response shape at
  the edge (`assembleStreamedMessage`) so the rest of the pipeline doesn't
  care how the bytes arrived.
- Know your runtime's hidden timeouts. Ours was undici's 300s headers
  timeout — invisible in code, absent from most docs, and it presents as a
  generic `TypeError: fetch failed`.

## 3. Time out on silence, not on effort

**What happened:** After streaming worked, our own 10-minute-per-attempt
cap aborted two healthy generations mid-write. The model legitimately
needed longer; the cap conflated "slow" with "stuck".

**Lessons:**
- For unattended batch work, patience is free. The per-attempt ceiling is
  now 30 minutes.
- The signal that a connection is dead is **silence**, not duration: a
  healthy stream delivers constant events. A 3-minute *idle* abort catches
  real failures within minutes without ever killing honest work.
- Name your timers in the abort reason. "This operation was aborted" cost a
  diagnostic round trip; "stream idle for 3 minutes (connection presumed
  dead)" would not have.

## 4. A reused branch runs *its own* code, not yours

**What happened:** The daily workflow reuses an existing `daily-digest/*`
branch so in-flight drafts survive re-runs. But every script step executes
from the checked-out working tree — so a branch pushed before a bug fix
re-ran the *buggy* code, even though `main` was fixed. The run "tested the
fix" without ever executing it.

**Lessons:**
- In any workflow that checks out a non-default ref, ask: *whose code is
  now running?* If the answer isn't "the default branch's", merge
  `origin/main` into the working tree before executing anything
  (the checkout step now does exactly that).
- Watch for the near-miss diagnosis: the run's `head_sha` showed the fixed
  commit (the workflow *file* came from main) while the *scripts* came from
  the stale branch. The two can differ.

## 5. "Does a PR exist?" almost never means what `gh pr view` answers

**What happened:** `gh pr view <branch>` matches the branch's most recent
PR **including merged and closed ones**. After a day's draft PR merged, the
existence check treated the merged PR as "already open" and silently
swallowed every subsequent draft for that date.

**Lessons:**
- Always query PR *state*, not PR *existence*:
  `gh pr view --json state --jq .state` and compare to `OPEN`.
- Pair the state check with a content check (`git diff --quiet
  origin/main...HEAD`) so the workflow also declines to open an empty PR —
  `gh pr create` on a no-diff branch fails loudly at the worst time.

## 6. GitHub cron is a suggestion, not an appointment

**What happened:** Both daily firings arrived 67 and 102 minutes late
(routine congestion for popular `:30` cron slots). The DST guard's
symmetric ±35-minute window — designed to pick the *correct* of two
firings — rejected *both*, and the day's draft silently never happened.

**Lessons:**
- Design schedule guards for GitHub's real delay distribution (tens of
  minutes to hours), not the cron spec. The window is now asymmetric:
  35 minutes early, up to 4 hours late.
- A wide window means both daily firings can proceed, so proceeding must be
  **idempotent**: a scheduled firing that finds today's draft already on
  the branch does nothing. Idempotency is what makes generous retry windows
  safe — including safe from double-billing the API.
- Bonus: the late firing became a free retry. A failed 6:30 generation now
  gets a second attempt when the delayed twin fires.

## 7. Tell the model what "empty-handed" should look like

**What happened:** With transport fixed, the model returned a perfectly
schema-valid payload containing an **empty stories array** — a quiet news
day for a county-level topic, and nothing in the prompt said that was
unacceptable. Validation rejected it with no second chance.

**Lessons:**
- Schemas constrain *shape*, not *substance*. Every "must have at least
  one" rule needs to be in the prompt in words, with an explicit fallback
  behavior ("if the window was quiet, widen to the most recent notable
  developments and say so").
- Give the model its errors back. A payload-validation failure now retries
  once with the specific problems quoted in the prompt — the same
  feedback-retry pattern the lint gate already used, and it works.
- Citation quality also needs words: "cite sources" produced section-front
  links; "cite the specific article, document, or record — never a homepage
  or section front" produced a county DA press-release PDF.

## 8. Fail-safe design is what buys you the right to iterate

**What happened:** Seven defects, five failed live runs — and the workflow
never crashed, never force-published, never lost a day's placeholder, and
never opened a bogus PR. Every failure degraded to "keep the placeholder,
open the draft PR, log a notice."

**Lessons:**
- The soft-skip exit-code contract (0 success / 2 no key / 3 failed, with
  the workflow treating non-zero as "keep the placeholder") is the single
  design decision that made a week of live debugging low-stakes.
- But green runs hide soft failures. A run that "succeeded" while the
  digest silently stayed a placeholder cost us a merged placeholder on the
  live site. If a soft-skip is at all likely, make it *loud* — the
  `::warning::` annotation is the only honest line in a green log.
- The human review gate is real, and it is also the weakest link: the one
  bad publish of the whole exercise was a routine-looking PR merged without
  a close read. Checklists in the PR body exist for exactly that moment.
  (For owners who won't review daily, `publishMode: "auto"` now trades the
  human gate for a publish-only-on-full-success rule — an explicit,
  documented trade rather than an accidental one.)

## 9. Process notes

- **Live shakedown is a phase, not an accident.** Plan for it the way this
  project planned sprints and the gate review: expect the first days of
  real operation to surface contract bugs, staff it (fast diagnose-fix-test
  loops), and write every fix down with a regression test. Seven findings
  in three days is a *good* outcome, not a failure of the prior review.
- **Fix the class, not the instance.** Each defect's fix came with a test
  or guard against its whole category (banned-keyword walker, idle-abort,
  state-checked PR queries, idempotent firings) — which is why the count
  went down instead of around in circles.
- **Keep the template generic; teach through it.** Every fix discovered on
  one person's instance was ported to the template the same hour, so every
  future fork starts past these lessons.

## 10. LLM cost lives in the loop, not the price sheet (added 14 July 2026)

**What happened:** $20 of API credit lasted four days. Two causes: the
shakedown's timeout bugs paid for ~6–8 complete generations whose responses
were discarded client-side — the API bills for work already done, so an
aborted request costs the same as a kept one — and each generation costs
**dollars, not cents**. The per-token price sheet misleads: web-search
results are re-injected as input tokens on *every iteration* of the
server-side research loop, and Sonnet 5's adaptive thinking defaults to
effort `high`, billed at output rates throughout the loop.

**Lessons:**
- Estimate agentic-loop cost as (context × iterations), not (prompt +
  response). A 6-search research turn can process hundreds of thousands of
  input tokens before writing a word.
- `effort` is the dominant cost lever on thinking models — a daily news
  brief does not need `high`. The template now defaults `ai.effort` to
  `medium` and caps searches at 6.
- Client-side aborts are not refunds. Timeout and retry policy is *spend*
  policy: every retry class doubles the worst-case bill, which is why each
  failure class gets exactly one retry.
- Document measured costs, not theoretical ones — the README's original "a
  few cents per run" claim was wrong by ~50×. And set a spend alert in the
  provider console: the failure mode of an empty balance is a silently
  missing morning edition.

---

*Add new entries above this line with a date and the run or incident that
taught them.*
