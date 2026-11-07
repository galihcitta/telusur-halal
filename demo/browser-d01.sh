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
  local form=$1
  browser upload "$form input[name=images]" "$2"
  browser check "$form input[name=confirmed_current]"
  browser click "$form button[type=submit]"
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
browser wait '.pack-form'
test "$(browser get count '.pack-form')" = 2

submit_pack '.ledger > li:has(h3:text("minyak goreng"))' "$PWD/demo/d01-sentosa.png"
browser wait --text 'ID-SIM-0101'
submit_pack '.pack-form' "$photos/D01_pack_pedas.png"
browser wait --text 'permintaan 2 dari 2'
browser screenshot "$output/d01-pack-rejected.png"
submit_pack '.pack-form' "$photos/D01_pack_original.png"
browser wait --text 'Setujui sebagai rencana'
browser screenshot "$output/d01-pending.png"
browser find role button click --name 'Setujui sebagai rencana' --exact
browser wait --text 'Disetujui sebagai rencana, menunggu penerapan'
browser eval '(() => {
  const original = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await original(...args);
    if (String(args[0]).endsWith("/export")) window.__d01Export = await response.clone().json();
    return response;
  };
})()' >/dev/null
browser download '.export[data-format=html]' "$output/d01-evidence.html"
browser download '.export[data-format=json]' "$output/d01-packet.json"
browser eval 'JSON.stringify(window.__d01Export)' |
  node --input-type=module -e 'import {readFileSync} from "node:fs"; console.log(JSON.parse(readFileSync(0, "utf8")))' > "$output/d01-export.json"
npm run grade:d01 -- "$output/d01-export.json"
browser errors
