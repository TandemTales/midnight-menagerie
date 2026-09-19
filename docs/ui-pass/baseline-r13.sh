#!/bin/bash
# BUCKRAM baselines for round 13: the coach, the handoff veil and the toast, as
# they are on dev, each at both sizes. Retried until the capture is not void.
# (No band check: the veil covers the board on purpose, and the coach's note
# is bright on purpose, so the board's band means nothing on these three.)
set -u
cd "C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie" || exit 1
J="C:/UILOOP/r13/judging/r13/chrome/BUCKRAM"; mkdir -p "$J"
BOARD="--scene combat --encounter foyer-14 --companion bones --kid maya --seed 7 --wait 5"
one () {
  n="$1"; shift
  for try in 1 2 3 4; do
    rm -f "shots/BUCKRAM-$n.png" "shots/BUCKRAM-$n.state.json"
    python tools/shot.py "BUCKRAM-$n" --port 8777 "$@" >/dev/null 2>&1
    v=$(python -c "
import json
try:
    d=json.load(open('shots/BUCKRAM-$n.state.json'))
    print(1 if d.get('void') or d.get('errors') else 0)
except Exception: print(1)")
    if [ "$v" = "0" ]; then cp "shots/BUCKRAM-$n.png" "$J/$n.png"; echo "ok   $n"; return; fi
    echo "retry $n"; sleep 25
  done
  echo "FAILED $n"
}
for size in "" "-1280"; do
  S=""; [ -n "$size" ] && S="--w 1280 --h 800"
  one "coach$size"   $S --scene combat --encounter foyer-1 --companion marmalade --kid maya --seed 7 --region foyer --hash "tutorial=1" --wait 7
  one "handoff$size" $S $BOARD --script @tools/shot-scripts/chrome-handoff.js
  one "toast$size"   $S $BOARD --script @tools/shot-scripts/chrome-toast.js
done
echo "--- BUCKRAM: $(ls "$J" | wc -l) files ---"; ls "$J"
