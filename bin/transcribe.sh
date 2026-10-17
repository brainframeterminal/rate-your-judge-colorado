#!/bin/bash
# transcribe.sh <audio-file> → prints the transcript. Used by server.js (voice comments).
# Private temp dir, 60-second cap on the audio, no logging of content. Needs ffmpeg + whisper.cpp (whisper-cli) + a ggml model.
set -euo pipefail
IN="${1:?usage: transcribe.sh <audio-file>}"
MODEL="${WHISPER_MODEL:-$HOME/models/ggml-small.bin}"
[ -f "$MODEL" ] || MODEL="$(cd "$(dirname "$0")/.." && pwd)/models/ggml-small.bin"
WB="${WHISPER_BIN:-/opt/homebrew/bin/whisper-cli}"; [ -x "$WB" ] || WB="$(command -v whisper-cli || true)"
[ -f "$MODEL" ] && [ -n "$WB" ] || { echo "whisper model or binary missing" >&2; exit 3; }
D="$(mktemp -d "${TMPDIR:-/tmp}/jxw.XXXXXX")"; chmod 700 "$D"; trap 'rm -rf "$D"' EXIT
ffmpeg -nostdin -loglevel error -y -t 60 -i "$IN" -ar 16000 -ac 1 -c:a pcm_s16le "$D/a.wav" >&2
"$WB" -m "$MODEL" -f "$D/a.wav" -t "${WHISPER_THREADS:-4}" ${WHISPER_EXTRA:-} -nt -np -l "${WHISPER_LANG:-auto}" 2>/dev/null | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' | awk 'NF' | paste -sd' ' - | sed -E 's/[[:space:]]+/ /g'
