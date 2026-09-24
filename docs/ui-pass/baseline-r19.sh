#!/bin/bash
# BAIZE baselines for round 19: the six boards, two dialogs and the crowded
# fight, each at both sizes. RUN FROM THE COMMIT ROUND 19'S WORKTREES ARE CUT
# FROM -- after the cold-start fix, the 48-frame animations and round 18's
# graft have merged -- or the judges score a field that was never the game.
#
# THE MAP IS CHECKED FOR ERRORS ONLY: shot.py marks bright paper screens VOID
# (the map's parchment trips its white-flash check), so retrying it on void
# fails every time. Look at the map's frame by eye.
set -u
cd "C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie" || exit 1
curl -s -m 5 -o /dev/null http://localhost:8777/ || {
  echo "8777 is not answering. Start it:  python tools/devserver.py 8777"; exit 1; }
J="C:/UILOOP/r19/judging/r19/boards/BAIZE"; mkdir -p "$J"
KID="--seed 7 --companion bones --kid maya"
one () {
  n="$1"; bright="$2"; shift 2
  for try in 1 2 3; do
    rm -f "shots/BAIZE-$n.png" "shots/BAIZE-$n.state.json"
    python tools/shot.py "BAIZE-$n" --port 8777 "$@" >/dev/null 2>&1
    v=$(python -c "
import json
try:
    d=json.load(open('shots/BAIZE-$n.state.json'))
    bad = bool(d.get('errors')) or ('$bright' != 'bright' and bool(d.get('void')))
    print(1 if bad else 0)
except Exception: print(1)")
    if [ "$v" = "0" ]; then cp "shots/BAIZE-$n.png" "$J/$n.png"; echo "ok   $n"; return; fi
    echo "retry $n"; sleep 20
  done
  echo "FAILED $n"
}
for size in "" "-1280"; do
  S=""; [ -n "$size" ] && S="--w 1280 --h 800"
  for b in shop reward event rest gameover; do one "$b$size" - $S --scene "$b" $KID --wait 3; done
  one "map$size" bright $S --scene map $KID --wait 3
  one "settings$size" - $S --scene map $KID --wait 3 --steps "click:.mm-hud__settings|wait:1"
  one "piles$size"    - $S --scene combat --encounter foyer-14 $KID --wait 5 --steps "click:#draw-pile|wait:1"
  one "combat-crowd$size" - $S --scene combat --encounter foyer-boss $KID --wait 8 --script @tools/shot-scripts/combat-crowd.js --steps "wait:2.5"
done
echo "--- BAIZE: $(ls "$J" | wc -l) of 18 files ---"; ls "$J"
