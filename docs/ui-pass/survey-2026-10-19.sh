#!/bin/bash
# THE SURVEY, 2026-10-19: every screen and all seventeen rooms after rounds
# 34-38 and their grafts (all seventeen wings' near floor, the last web
# controls and the crowded hand, the map's stamps and the atlas), AT THE
# STEAM DECK'S TIER, so two blind judges can say what is owed next.
#
# The four painting boards pass --hash pics=1 (Josh's paintings hang at
# random); the lobby's password is typed in (it is random per load); the
# atlas is photographed with one wing surveyed AND with all (#all=1).
#
# Run from dev's tip with 8777 up, and NOT while builders hold the GPU slot.
set -u
cd "C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie" || exit 1
curl -s -m 5 -o /dev/null http://localhost:8777/ || {
  echo "8777 is not answering. Start it:  python tools/devserver.py 8777"; exit 1; }
J="C:/UILOOP/survey6/NOW"; mkdir -p "$J/rooms"
KID="--seed 7 --companion bones --kid maya"
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
one () {
  n="$1"; shift
  [ -f "$J/$n.png" ] && { echo "have $n"; return; }   # resumable: a killed run picks up where it stopped
  for try in 1 2 3; do
    rm -f "shots/SURVEY-$n.png" "shots/SURVEY-$n.state.json"
    timeout 180 python tools/shot.py "SURVEY-$n" --port 8777 "$@" >/dev/null 2>&1   # a crashed page must not hang the job
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
  for b in shop map; do
    one "$b$size" $S --scene "$b" $KID --wait 3
  done
  for b in reward event rest gameover; do
    one "$b$size" $S --scene "$b" $KID --wait 3 --hash pics=1
  done
  one "opening$size"  $S --scene tutorial --seed 7 --kid maya --wait 4
  one "settings$size" $S --scene map $KID --wait 3 --steps "click:.mm-hud__settings|wait:1"
  one "piles$size"    $S --scene combat --encounter foyer-14 $KID --wait 5 --steps "click:#draw-pile|wait:1"
  one "lobby$size" $S --scene lobby $KID --wait 3 --steps "js:(i=>{i.value='whispering-hideout';i.dispatchEvent(new Event('input',{bubbles:true}))})(document.querySelector('input[aria-label=Password]'))|wait:1"
  for k in clubhouse atlas; do
    one "$k$size" $S --scene "$k" $KID --wait 3
  done
  one "atlas-house$size" $S --scene atlas $KID --wait 3 --hash all=1
  one "hud-late$size"     $S --scene map $KID --wait 3 --script @tools/shot-scripts/hud-late.js --steps "wait:1"
  one "combat-boss$size"  $S --scene combat --encounter foyer-boss $KID --wait 8 --steps "$DECK|wait:3"
  one "combat-crowd$size" $S --scene combat --encounter foyer-boss $KID --wait 8 --script @tools/shot-scripts/combat-crowd.js --steps "$DECK|wait:3"
done
[ "${1:-}" = "--rooms" ] || { echo "screens done; rooms: bash $0 --rooms"; exit 0; }
# The seventeen wings' fight rooms, empty, at the Deck's tier and size.
# SEEDED, each wing's main room: a fight always passes its room's name as the
# seed and every wing maps a name onto one of its BUILT rooms (ROOM_KINDS);
# unseeded, setMood draws the wing's bare base shell, which no player ever
# sees. Surveys 3 and 4 first photographed that shell, and both judges then
# reported beds, beams and far walls "missing" that rounds 28-29 had built.
ROOMS="foyer:parlor,nursery:nursery,sleeping:dormitory,kitchens:kitchen,greenhouse:conservatory,graveyard:yard,study:library,attic:attic,lampworks:lampworks,ballroom:ballroom,crypt:catacomb,hedge:hedge,passages:passage,bathhouse:bathhouse,kennels:kennels,pumpkin:courtyard,heart:heart"
python tools/room_batch.py --port 8777 --rooms "$ROOMS" --tier medium --w 1280 --h 800 \
  --prefix SURVEY-room- --sheet "$J/rooms-sheet.png" --cols 4 2>&1 | tail -4
cp shots/SURVEY-room-*.png "$J/rooms/" 2>/dev/null
echo "--- SURVEY: $(ls "$J"/*.png | wc -l) screens, $(ls "$J/rooms" | wc -l) rooms ---"; ls "$J"
