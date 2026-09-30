// Pure helpers for auto-publish health, used by scripts/check-freshness.mjs
// (the daily workflow's failure alert). Side-effect-free like the other
// lib/ modules: callers pass in the manifest and the date to measure from.
//
// Auto mode fails quietly by design -- a failed generation publishes nothing
// and the run stays green. One failed firing is normal (the late twin firing
// retries), so the alert keys on the outcome that matters: how long the site
// has gone without a new digest.

// Alert once this many days have passed since the newest published digest:
// 2 means today's and yesterday's digests are both missing.
export const STALE_ALERT_DAYS = 2;

const MS_PER_DAY = 86_400_000;

// Newest digest date (YYYY-MM-DD) in a digests.json manifest, or '' when the
// manifest has no digests. Does not assume the manifest is sorted.
export function latestDigestDate(manifest) {
  const dates = (manifest?.digests ?? [])
    .map((entry) => entry?.date)
    .filter((date) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date));
  return dates.sort().at(-1) ?? '';
}

// Whole days from the newest digest to `isoDate`; Infinity when there is no
// digest yet (a new instance whose first generation failed should alert).
export function daysSinceLatestDigest(manifest, isoDate) {
  const latest = latestDigestDate(manifest);
  if (!latest) return Infinity;
  return Math.round((Date.parse(`${isoDate}T00:00:00Z`) - Date.parse(`${latest}T00:00:00Z`)) / MS_PER_DAY);
}

export function shouldAlert(manifest, isoDate, thresholdDays = STALE_ALERT_DAYS) {
  return daysSinceLatestDigest(manifest, isoDate) >= thresholdDays;
}
