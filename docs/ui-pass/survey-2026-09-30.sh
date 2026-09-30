#!/bin/bash
# THE SURVEY, 2026-09-30: every screen, as the game stands after rounds 19-21,
# AT THE STEAM DECK'S TIER, so two blind judges can say what is owed next.
#
# Rounds 19 and 20 rebuilt the boards, the controls, the run rail and the hand
# from the 09-23 survey; round 21 inked the fight's room and put everyone on
# its floor. And rounds 8-18 judged the ROOMS at --tier high, while this
# machine and the Deck both run MEDIUM (render scale 0.8): thirteen of the
# seventeen wings have never been judged as a player sees them. So measure
# before briefing: a round's baseline with no builders.
#
# Run from dev's tip with 8777 up, and NOT while builders hold the GPU slot.
set -u
cd "C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie" || exit 1
curl -s -m 5 -o /dev/null http://localhost:8777/ || {
  echo "8777 is not answering. Start it:  python tools/devserver.py 8777"; exit 1; }
J="C:/UILOOP/survey2/NOW"; mkdir -p "$J/rooms"
KID="--seed 7 --companion bones --kid maya"
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
one () {
  n="$1"; shift
  for try in 1 2 3; do
    rm -f "shots/SURVEY-$n.png" "shots/SURVEY-$n.state.json"
    python tools/shot.py "SURVEY-$n" --port 8777 "$@" >/dev/null 2>&1
    v=$(python -c "
import json
try:
    d=json.load(open('shots/SURVEY-$n.state.json'))
    print(1 if d.get('errors') else 0)
except Exception: print(1)")
    # void is NOT retried: shot.py marks bright paper screens void. Look at them.
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
  one "hud-late$size"     $S --scene map $KID --wait 3 --script @tools/shot-scripts/hud-late.js --steps "wait:1"
  one "combat-boss$size"  $S --scene combat --encounter foyer-boss $KID --wait 8 --steps "$DECK|wait:3"
  one "combat-crowd$size" $S --scene combat --encounter foyer-boss $KID --wait 8 --script @tools/shot-scripts/combat-crowd.js --steps "$DECK|wait:3"
done
# The seventeen wings' fight rooms, empty, at the Deck's tier and size.
python tools/room_batch.py --port 8777 --regions all --tier medium --w 1280 --h 800 \
  --prefix SURVEY-room- --sheet "$J/rooms-sheet.png" --cols 4 2>&1 | tail -4
cp shots/SURVEY-room-*.png "$J/rooms/" 2>/dev/null
echo "--- SURVEY: $(ls "$J"/*.png | wc -l) screens, $(ls "$J/rooms" | wc -l) rooms ---"; ls "$J"
