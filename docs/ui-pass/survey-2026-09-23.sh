#!/bin/bash
# THE SURVEY, 2026-09-23: photograph every screen the loop has NOT judged since
# rounds 6-7, as the game stands now, so two blind judges can say what is owed.
#
# Every round from 8 to 18 was the WebGL room. The six boards, the dialogs and
# the Kids' places were last judged in rounds 6 and 7, when every judge named
# the ground behind them as the ceiling -- and that ground (the CSS room's
# black floor, tooth and falloff, 2026-09-16) has changed since. Their last fix
# lists are thirteen rounds old. So measure before briefing: this is a round's
# baseline with no builders.
#
# Run from dev's tip with 8777 up, and NOT while builders hold the GPU slot.
set -u
cd "C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie" || exit 1
curl -s -m 5 -o /dev/null http://localhost:8777/ || {
  echo "8777 is not answering. Start it:  python tools/devserver.py 8777"; exit 1; }
J="C:/UILOOP/survey/NOW"; mkdir -p "$J"
KID="--seed 7 --companion bones --kid maya"
one () {
  n="$1"; shift
  for try in 1 2 3; do
    rm -f "shots/SURVEY-$n.png" "shots/SURVEY-$n.state.json"
    python tools/shot.py "SURVEY-$n" --port 8777 "$@" >/dev/null 2>&1
    v=$(python -c "
import json
try:
    d=json.load(open('shots/SURVEY-$n.state.json'))
    print(1 if d.get('void') or d.get('errors') else 0)
except Exception: print(1)")
    if [ "$v" = "0" ]; then cp "shots/SURVEY-$n.png" "$J/$n.png"; echo "ok   $n"; return; fi
    echo "retry $n"; sleep 20
  done
  echo "FAILED $n"
}
for size in "" "-1280"; do
  S=""; [ -n "$size" ] && S="--w 1280 --h 800"
  for b in shop reward event map rest gameover; do
    one "$b$size" $S --scene "$b" $KID --wait 3
  done
  one "opening$size"  $S --scene tutorial --seed 7 --kid maya --wait 4
  one "settings$size" $S --scene map $KID --wait 3 --steps "click:.mm-hud__settings|wait:1"
  one "piles$size"    $S --scene combat --encounter foyer-14 $KID --wait 5 --steps "click:#draw-pile|wait:1"
  for k in lobby clubhouse atlas; do
    one "$k$size" $S --scene "$k" $KID --wait 3
  done
  one "combat-boss$size"  $S --scene combat --encounter foyer-boss $KID --wait 8
  one "combat-crowd$size" $S --scene combat --encounter foyer-boss $KID --wait 8 --script @tools/shot-scripts/combat-crowd.js --steps "wait:2.5"
done
echo "--- SURVEY: $(ls "$J" | wc -l) of 28 files ---"; ls "$J"
