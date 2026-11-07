#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
output="$PWD/.run"
photos="$PWD/datasets/pack-photos/repo/fixtures/photos"
label="$PWD/datasets/pack-photos/repo/evals/intake/photos/L01_D01.sim.png"
session="telusur-d01-$$"
mkdir -p "$output"
browser() { agent-browser --session "$session" "$@"; }
trap 'browser close >/dev/null 2>&1 || true' EXIT
submit_pack() {
  local photo_input="${2:-images}"
  browser upload ".pack-form input[name=$photo_input]" "$1"
  browser check '.pack-form input[name=confirmed_current]'
  browser click '.pack-form button[type=submit]'
}

url="${TELUSUR_URL:-http://127.0.0.1:4173}"
if [[ -n "${TELUSUR_MIC_WAV:-}" ]]; then
  browser --args "--use-fake-ui-for-media-stream,--use-fake-device-for-media-stream,--use-file-for-fake-audio-capture=$TELUSUR_MIC_WAV" open "$url"
  browser click '#record'
  browser wait '.voice-note[data-state=recording]'
  browser screenshot "$output/d01-mic-recording.png"
  browser wait 28000
  browser click '#record'
  browser wait '.voice-note[data-state=ready]'
  browser eval 'document.querySelector("#record-preview").play().then(() => true)'
  browser screenshot "$output/d01-mic-preview.png"
else
  browser open "$url"
  browser upload 'input[name=audio]' "$PWD/demo/d01-bahasa-synthetic.mp3"
fi
browser upload 'input[name=label]' "$label"
browser click '#start-form button[type=submit]'
browser wait '#confirm-form'
browser screenshot "$output/d01-guided-review.png"
browser click '#confirm-form button[type=submit]'
oil='.ledger > li:has(h3:text("minyak goreng")) button[data-kind=pack]'
seasoning='.ledger > li:has(h3:text("bumbu balado")) button[data-kind=pack]'
browser wait "$oil"
test "$(browser get count '.ledger button[data-kind=pack]')" = 2

browser click "$oil"
submit_pack "$PWD/demo/d01-sentosa.png"
browser wait '#workspace:not([aria-busy=true])'
browser click "$seasoning"
submit_pack "$photos/D01_pack_pedas.png" capture
browser wait --text 'permintaan 2 dari 2'
browser screenshot "$output/d01-pack-rejected.png"
submit_pack "$photos/D01_pack_original.png"
browser wait '.ledger button[data-kind=offer]'
browser screenshot --full "$output/d01-evidence-map.png"
browser click '.ledger button[data-kind=offer]'
browser wait 'button[data-decision=approve]'
browser screenshot "$output/d01-pending.png"
browser click 'button[data-decision=approve]'
browser wait --text 'Disetujui, belum dipakai'
browser download '.export[data-format=html]' "$output/d01-evidence.html"
browser click 'details:not([open]):has(.export[data-format=json]) > summary'
browser download '.export[data-format=json]' "$output/d01-packet.json"
browser click 'details:not([open]):has(.export[data-format=trace]) > summary'
browser download '.export[data-format=trace]' "$output/d01-trace.json"
node --input-type=module - "$output/d01-trace.json" "$output/d01-packet.json" > "$output/d01-export.json" <<'JS'
import { readFileSync } from 'node:fs';
const [tracePath, packetPath] = process.argv.slice(2);
const { case: trace } = JSON.parse(readFileSync(tracePath, 'utf8'));
const packet = JSON.parse(readFileSync(packetPath, 'utf8'));
console.log(JSON.stringify({ case: trace, packet }, null, 2));
JS
npm run grade:d01 -- "$output/d01-export.json"
browser errors
