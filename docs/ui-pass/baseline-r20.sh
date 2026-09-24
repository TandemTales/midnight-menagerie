#!/bin/bash
# DAMASK baselines for round 20: the run strip full (hud-late), the map, the
# shop and three fights, each at both sizes. RUN FROM THE COMMIT ROUND 20'S
# WORKTREES ARE CUT FROM -- after round 19's graft has merged -- or the judges
# score a field that was never the game.
#
# THE MAP (and hud-late, which is the map) ARE CHECKED FOR ERRORS ONLY: shot.py
# marks bright paper screens VOID, so retrying them on void fails every time.
# Look at those frames by eye.
set -u
cd "C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie" || exit 1
curl -s -m 5 -o /dev/null http://localhost:8777/ || {
  echo "8777 is not answering. Start it:  python tools/devserver.py 8777"; exit 1; }
J="C:/UILOOP/r20/judging/r20/rail/DAMASK"; mkdir -p "$J"
KID="--seed 7 --companion bones --kid maya"
one () {
  n="$1"; bright="$2"; shift 2
  for try in 1 2 3; do
    rm -f "shots/DAMASK-$n.png" "shots/DAMASK-$n.state.json"
    python tools/shot.py "DAMASK-$n" --port 8777 "$@" >/dev/null 2>&1
    v=$(python -c "
import json
try:
    d=json.load(open('shots/DAMASK-$n.state.json'))
    bad = bool(d.get('errors')) or ('$bright' != 'bright' and bool(d.get('void')))
    print(1 if bad else 0)
except Exception: print(1)")
    if [ "$v" = "0" ]; then cp "shots/DAMASK-$n.png" "$J/$n.png"; echo "ok   $n"; return; fi
    echo "retry $n"; sleep 20
  done
  echo "FAILED $n"
}
for size in "" "-1280"; do
  S=""; [ -n "$size" ] && S="--w 1280 --h 800"
  one "hud-late$size" bright $S --scene map $KID --wait 3 --script @tools/shot-scripts/hud-late.js --steps "wait:1"
  one "map$size"      bright $S --scene map $KID --wait 3
  one "shop$size"     -      $S --scene shop $KID --wait 3
  one "combat$size"   -      $S --scene combat --encounter foyer-14 $KID --wait 5
  one "combat-boss$size" -   $S --scene combat --encounter foyer-boss $KID --wait 8
  one "combat-crowd$size" -  $S --scene combat --encounter foyer-boss $KID --wait 8 --script @tools/shot-scripts/combat-crowd.js --steps "wait:2.5"
done
echo "--- DAMASK: $(ls "$J" | wc -l) of 12 files ---"; ls "$J"
