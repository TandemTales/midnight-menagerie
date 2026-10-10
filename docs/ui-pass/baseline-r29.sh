#!/bin/bash
# BOMBAZINE baselines for round 29: four contact sheets (the Hedge Maze, the
# Sleeping Quarters, the Heart, the Greenhouse) and one fight at both sizes, ALL AT
# THE STEAM DECK'S TIER. Run from the commit round 29's worktrees are cut
# from, after round 28's graft has merged.
set -u
cd "C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie" || exit 1
curl -s -m 5 -o /dev/null http://localhost:8777/ || {
  echo "8777 is not answering. Start it:  python tools/devserver.py 8777"; exit 1; }
J="C:/UILOOP/r29/judging/r29/rooms/BOMBAZINE"; mkdir -p "$J"
sheet () {
  timeout 1500 python tools/variant_sheet.py "$1" --port 8777 --tier medium --seeds "$2" --out "$J/sheet-$1.png" 2>&1 | tail -3
}
sheet hedge      "hedge,fountain,walk"
sheet sleeping   "dormitory,bedroom"
sheet heart      "heart"
sheet greenhouse "conservatory,palmhouse,vinery"
KID="--seed 7 --companion bones --kid maya"
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
one () {
  n="$1"; shift
  for try in 1 2 3; do
    rm -f "shots/BOMBAZINE-$n.png" "shots/BOMBAZINE-$n.state.json"
    timeout 180 python tools/shot.py "BOMBAZINE-$n" --port 8777 "$@" --steps "$DECK|wait:3" >/dev/null 2>&1
    v=$(python -c "
import json
try:
    d=json.load(open('shots/BOMBAZINE-$n.state.json'))
    print(1 if d.get('errors') or d.get('void') or d.get('perf', {}).get('band', 99) < 12 else 0)
except Exception: print(1)")
    if [ "$v" = "0" ]; then cp "shots/BOMBAZINE-$n.png" "$J/$n.png"; echo "ok   $n"; return; fi
    echo "retry $n"; sleep 20
  done
  echo "FAILED $n"
}
for size in "" "-1280"; do
  S=""; [ -n "$size" ] && S="--w 1280 --h 800"
  one "fight-sleeping$size" $S --scene combat --region sleeping-quarters --encounter sq-1 $KID --wait 8
done
echo "--- BOMBAZINE: $(ls "$J" | wc -l) of 6 files ---"; ls "$J"
