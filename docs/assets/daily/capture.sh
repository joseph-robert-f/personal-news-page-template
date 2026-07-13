#!/usr/bin/env bash
# Daily screenshot capture for sprint 7 assets.
#
# Renders the owner's live instance (Northampton-County-News-) from its
# repo contents -- the deployed Pages site is byte-identical to main, and
# this sandbox cannot reach github.io directly. Captures home/digest/
# archive in light+dark and one mobile shot into docs/assets/daily/<date>/.
#
#   bash docs/assets/daily/capture.sh <instance-clone-dir> <output-root>
set -euo pipefail
SITE_DIR="${1:?instance clone dir}"
OUT_ROOT="${2:?output root}"
DATE="$(date -u +%F)"
OUT="$OUT_ROOT/$DATE"
mkdir -p "$OUT"

PORT=8123
(cd "$SITE_DIR" && python3 -m http.server "$PORT" >/dev/null 2>&1) &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
sleep 1

BASE="http://localhost:$PORT"
# Latest digest path from the manifest (already newest-first).
DIGEST_PATH="$(python3 -c "
import json, sys, urllib.parse
m = json.load(open('$SITE_DIR/digests.json'))
print(urllib.parse.quote(m['digests'][0]['path']))
")"

shot() { # url out extra-args...
  local url="$1" out="$2"; shift 2
  npx --yes playwright screenshot --wait-for-timeout=2500 "$@" "$url" "$out"
}

shot "$BASE/index.html"    "$OUT/home-light.png"    --viewport-size=1440,900
shot "$BASE/index.html"    "$OUT/home-dark.png"     --viewport-size=1440,900 --color-scheme=dark
shot "$BASE/$DIGEST_PATH"  "$OUT/digest-light.png"  --viewport-size=1440,900 --full-page
shot "$BASE/$DIGEST_PATH"  "$OUT/digest-dark.png"   --viewport-size=1440,900 --full-page --color-scheme=dark
shot "$BASE/archive.html"  "$OUT/archive-light.png" --viewport-size=1440,900
shot "$BASE/index.html"    "$OUT/mobile-home.png"   --viewport-size=390,844

echo "Captured $(ls "$OUT" | wc -l) screenshots into $OUT"
