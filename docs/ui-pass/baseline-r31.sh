#!/bin/bash
# MOREEN baselines for round 31: four contact sheets (the Passages, the Hedge
# Maze, the Kitchens, the Graveyard) and one fight at both sizes, ALL AT
# THE STEAM DECK'S TIER. Run from the commit round 31's worktrees are cut
# from, after survey 4.
set -u
cd "C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie" || exit 1
curl -s -m 5 -o /dev/null http://localhost:8777/ || {
  echo "8777 is not answering. Start it:  python tools/devserver.py 8777"; exit 1; }
J="C:/UILOOP/r31/judging/r31/rooms/MOREEN"; mkdir -p "$J"
sheet () {
  timeout 1500 python tools/variant_sheet.py "$1" --port 8777 --tier medium --seeds "$2" --out "$J/sheet-$1.png" 2>&1 | tail -3
}
sheet passages  "passage,library,closet"
sheet hedge     "hedge,fountain,walk"
sheet kitchens  "kitchen,scullery"
sheet graveyard "yard,plots,gate"
KID="--seed 7 --companion bones --kid maya"
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
one () {
  n="$1"; shift
  for try in 1 2 3; do
    rm -f "shots/MOREEN-$n.png" "shots/MOREEN-$n.state.json"
    timeout 180 python tools/shot.py "MOREEN-$n" --port 8777 "$@" --steps "$DECK|wait:3" >/dev/null 2>&1
    v=$(python -c "
import json
try:
    d=json.load(open('shots/MOREEN-$n.state.json'))
    print(1 if d.get('errors') or d.get('void') or d.get('perf', {}).get('band', 99) < 12 else 0)
except Exception: print(1)")
    if [ "$v" = "0" ]; then cp "shots/MOREEN-$n.png" "$J/$n.png"; echo "ok   $n"; return; fi
    echo "retry $n"; sleep 20
  done
  echo "FAILED $n"
}
for size in "" "-1280"; do
  S=""; [ -n "$size" ] && S="--w 1280 --h 800"
  one "fight-kitchens$size" $S --scene combat --region kitchens-cellars --encounter kc-1 $KID --wait 8
done
echo "--- MOREEN: $(ls "$J" | wc -l) of 6 files ---"; ls "$J"
