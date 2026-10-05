#!/bin/bash
# TICKING baselines for round 28: five contact sheets (the Passages, the
# Pumpkin Grounds, the Graveyard, the Kitchens, the Kennels) and one fight at both sizes, ALL AT
# THE STEAM DECK'S TIER. Run from the commit round 28's worktrees are cut
# from, after round 27's graft has merged.
set -u
cd "C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie" || exit 1
curl -s -m 5 -o /dev/null http://localhost:8777/ || {
  echo "8777 is not answering. Start it:  python tools/devserver.py 8777"; exit 1; }
J="C:/UILOOP/r28/judging/r28/rooms/TICKING"; mkdir -p "$J"
sheet () {
  timeout 180 python tools/variant_sheet.py "$1" --port 8777 --tier medium --seeds "$2" --out "$J/sheet-$1.png" 2>&1 | tail -3
}
sheet passages  "passage,library,closet"
sheet pumpkin   "courtyard,patch,pond"
sheet graveyard "yard,plots,gate"
sheet kitchens  "kitchen,scullery"
sheet kennels   "kennels,wash"
KID="--seed 7 --companion bones --kid maya"
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
one () {
  n="$1"; shift
  for try in 1 2 3; do
    rm -f "shots/TICKING-$n.png" "shots/TICKING-$n.state.json"
    timeout 180 python tools/shot.py "TICKING-$n" --port 8777 "$@" --steps "$DECK|wait:3" >/dev/null 2>&1
    v=$(python -c "
import json
try:
    d=json.load(open('shots/TICKING-$n.state.json'))
    print(1 if d.get('errors') or d.get('void') or d.get('perf', {}).get('band', 99) < 12 else 0)
except Exception: print(1)")
    if [ "$v" = "0" ]; then cp "shots/TICKING-$n.png" "$J/$n.png"; echo "ok   $n"; return; fi
    echo "retry $n"; sleep 20
  done
  echo "FAILED $n"
}
for size in "" "-1280"; do
  S=""; [ -n "$size" ] && S="--w 1280 --h 800"
  one "fight-passages$size" $S --scene combat --region secret-passages --encounter sp-1 $KID --wait 8
done
echo "--- TICKING: $(ls "$J" | wc -l) of 7 files ---"; ls "$J"
