#!/bin/bash
# DOWLAS baselines for round 26: four boards (reward, event, rest, gameover)
# and two dialogs (settings, piles), each at both sizes. Run from the commit
# round 26's worktrees are cut from, after round 25's graft has merged.
set -u
cd "C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie" || exit 1
curl -s -m 5 -o /dev/null http://localhost:8777/ || {
  echo "8777 is not answering. Start it:  python tools/devserver.py 8777"; exit 1; }
J="C:/UILOOP/r26/judging/r26/boards/DOWLAS"; mkdir -p "$J"
KID="--seed 7 --companion bones --kid maya"
one () {
  n="$1"; bright="$2"; shift 2
  for try in 1 2 3; do
    rm -f "shots/DOWLAS-$n.png" "shots/DOWLAS-$n.state.json"
    python tools/shot.py "DOWLAS-$n" --port 8777 "$@" >/dev/null 2>&1
    v=$(python -c "
import json
try:
    d=json.load(open('shots/DOWLAS-$n.state.json'))
    bad = bool(d.get('errors')) or ('$bright' != 'bright' and bool(d.get('void')))
    print(1 if bad else 0)
except Exception: print(1)")
    if [ "$v" = "0" ]; then cp "shots/DOWLAS-$n.png" "$J/$n.png"; echo "ok   $n"; return; fi
    echo "retry $n"; sleep 20
  done
  echo "FAILED $n"
}
for size in "" "-1280"; do
  S=""; [ -n "$size" ] && S="--w 1280 --h 800"
  for s in reward event rest gameover; do one "$s$size" - $S --scene "$s" $KID --wait 3; done
  one "settings$size" - $S --scene map $KID --wait 3 --steps "click:.mm-hud__settings|wait:1"
  one "piles$size"    - $S --scene combat --encounter foyer-14 $KID --wait 5 --steps "click:#draw-pile|wait:1"
done
echo "--- DOWLAS: $(ls "$J" | wc -l) of 12 files ---"; ls "$J"
