// Pure helpers for DST-safe scheduling, used by scripts/should-run-now.mjs
// (the cron guard) and scripts/check-cron.mjs (the CI drift check). Kept
// side-effect-free (no fs, no process.argv, no wall-clock reads except via
// the `date` values callers pass in) so the DST math can be pinned with
// fixed-instant unit tests, consistent with lib/digest.mjs and lib/feed.mjs.

import { localDateTimeToUtcIso } from './feed.mjs';

const MINUTES_PER_DAY = 1440;

// Returns the wall-clock minutes-since-midnight for the instant `date` (a JS
// Date) as observed in `timezone`, via Intl.DateTimeFormat.
//
// Some ICU builds format local midnight as hour "24" rather than "00" when
// hour12: false is used without an explicit hourCycle; normalize that edge
// defensively so callers never see a 1440-1479 range.
export function localMinutesOfDay(timezone, date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((part) => [part.type, part.value]));
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  const minute = Number(parts.minute);
  return hour * 60 + minute;
}

// True when `nowMinutes` is within `toleranceMinutes` of `targetMinutes`,
// treating the day as a 1440-minute circle so a target near midnight (e.g.
// 00:10) correctly counts 23:50 as 20 minutes away rather than 1410.
export function withinWindow(nowMinutes, targetMinutes, toleranceMinutes) {
  const diff = Math.abs(nowMinutes - targetMinutes) % MINUTES_PER_DAY;
  const wrapped = Math.min(diff, MINUTES_PER_DAY - diff);
  return wrapped <= toleranceMinutes;
}

// Asymmetric variant for the daily-draft guard. GitHub cron firings are
// routinely delayed well past their slot (60-120 minutes observed live on a
// busy :30 slot), so a symmetric +/-35m window can miss BOTH daily firings
// and silently skip the day's draft. The guard therefore accepts a firing
// from `earlyMinutes` before the target up to `lateMinutes` after it (a
// catch-up horizon), on the same 1440-minute circle. Duplicate work from
// two proceeding firings is prevented by the workflow itself: a scheduled
// run that finds today's draft already on the branch leaves it untouched.
export function withinCatchupWindow(nowMinutes, targetMinutes, earlyMinutes, lateMinutes) {
  const after = (((nowMinutes - targetMinutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  if (after <= lateMinutes) return true;
  const before = MINUTES_PER_DAY - after;
  return before <= earlyMinutes;
}

// Returns the UTC minutes-since-midnight (0-1439) that wall-clock `timeHHMM`
// in `timezone` maps to on `dateIso` (YYYY-MM-DD). Built on sprint 4's
// localDateTimeToUtcIso, which already resolves DST correctly via a two-pass
// offset lookup. Note this reports minutes-of-day only -- a zone offset that
// pushes the UTC instant onto the previous or next calendar day (e.g. Tokyo)
// is reflected in which UTC day the instant falls on, not in this value.
export function utcMinutesForLocalTime(dateIso, timeHHMM, timezone) {
  const utcIso = localDateTimeToUtcIso(dateIso, timeHHMM, timezone);
  const utcDate = new Date(utcIso);
  return utcDate.getUTCHours() * 60 + utcDate.getUTCMinutes();
}

// Extracts `- cron: "M H * * *"` entries from workflow YAML text (a simple
// regex scan, consistent with build-manifest.mjs's regex-based parsing).
// Entries whose day-of-month/month/day-of-week fields are not `*` are
// skipped -- this tool only reasons about schedules that fire every day.
export function parseCronLines(yamlText) {
  const entries = [];
  const re = /-\s*cron:\s*["']([^"']+)["']/g;
  let match;
  while ((match = re.exec(yamlText))) {
    const raw = match[1].trim();
    const fields = raw.split(/\s+/);
    if (fields.length !== 5) continue;
    const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
    if (dayOfMonth !== '*' || month !== '*' || dayOfWeek !== '*') continue;
    if (!/^\d+$/.test(minute) || !/^\d+$/.test(hour)) continue;
    entries.push({ minute: Number(minute), hour: Number(hour), raw });
  }
  return entries;
}

// True when at least one parsed cron entry fires within `toleranceMinutes`
// of the UTC time that config.publishTimeLocal/config.timezone maps to on
// `dateIso`.
export function cronCoversDate(cronEntries, config, dateIso, toleranceMinutes) {
  const targetMinutes = utcMinutesForLocalTime(dateIso, config.publishTimeLocal, config.timezone);
  return cronEntries.some((entry) => (
    withinWindow(entry.hour * 60 + entry.minute, targetMinutes, toleranceMinutes)
  ));
}

// Builds the `M H * * *` cron lines that would cover config.publishTimeLocal
// on the given sample dates (typically one January, one July date), so a
// drift failure can print copy-pasteable lines. Deduplicated, since a
// no-DST zone produces the same line for both samples.
export function suggestCronLines(config, sampleDatesIso) {
  const lines = sampleDatesIso.map((dateIso) => {
    const minutes = utcMinutesForLocalTime(dateIso, config.publishTimeLocal, config.timezone);
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return `${minute} ${hour} * * *`;
  });
  return [...new Set(lines)];
}
