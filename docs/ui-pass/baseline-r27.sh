#!/bin/bash
# SHANTUNG baselines for round 27: the card -- two fights, reward, shop and
# the pile viewer, each at both sizes. Run from the commit round 27's
# worktrees are cut from.
set -u
cd "C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie" || exit 1
curl -s -m 5 -o /dev/null http://localhost:8777/ || {
  echo "8777 is not answering. Start it:  python tools/devserver.py 8777"; exit 1; }
J="C:/UILOOP/r27/judging/r27/card/SHANTUNG"; mkdir -p "$J"
KID="--seed 7 --companion bones --kid maya"
one () {
  n="$1"; bright="$2"; shift 2
  for try in 1 2 3; do
    rm -f "shots/SHANTUNG-$n.png" "shots/SHANTUNG-$n.state.json"
    # a crashed page must not hang the job (2026-10-03: one did, for half an hour)
    timeout 180 python tools/shot.py "SHANTUNG-$n" --port 8777 "$@" >/dev/null 2>&1
    v=$(python -c "
import json
try:
    d=json.load(open('shots/SHANTUNG-$n.state.json'))
    bad = bool(d.get('errors')) or ('$bright' != 'bright' and bool(d.get('void')))
    print(1 if bad else 0)
except Exception: print(1)")
    if [ "$v" = "0" ]; then cp "shots/SHANTUNG-$n.png" "$J/$n.png"; echo "ok   $n"; return; fi
    echo "retry $n"; sleep 20
  done
  echo "FAILED $n"
}
for size in "" "-1280"; do
  S=""; [ -n "$size" ] && S="--w 1280 --h 800"
  one "combat-boss$size"  - $S --scene combat --encounter foyer-boss $KID --wait 8
  one "combat-crowd$size" - $S --scene combat --encounter foyer-boss $KID --wait 8 --script @tools/shot-scripts/combat-crowd.js --steps "wait:2.5"
  for s in reward shop; do one "$s$size" - $S --scene "$s" $KID --wait 3; done
  one "piles$size"        - $S --scene combat --encounter foyer-14 $KID --wait 5 --steps "click:#draw-pile|wait:1"
done
echo "--- SHANTUNG: $(ls "$J" | wc -l) of 10 files ---"; ls "$J"
