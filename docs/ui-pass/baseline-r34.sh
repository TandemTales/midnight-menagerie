#!/bin/bash
# CHAMOIS baselines for round 34: four contact sheets (the Hedge Maze, the
# Foyer, the Greenhouse, the Kennels) and one fight at both sizes, ALL AT THE
# STEAM DECK'S TIER. Run from the commit round 34's worktrees are cut from,
# after survey 5.
set -u
cd "C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie" || exit 1
curl -s -m 5 -o /dev/null http://localhost:8777/ || {
  echo "8777 is not answering. Start it:  python tools/devserver.py 8777"; exit 1; }
J="C:/UILOOP/r34/judging/r34/rooms/CHAMOIS"; mkdir -p "$J"
sheet () {
  timeout 1500 python tools/variant_sheet.py "$1" --port 8777 --tier medium --seeds "$2" --out "$J/sheet-$1.png" 2>&1 | tail -3
}
sheet hedge      "hedge,fountain,walk"
sheet foyer      "parlor,gallery,landing"
sheet greenhouse "conservatory,palm,overgrown"
sheet kennels    "kennels,wash"
KID="--seed 7 --companion bones --kid maya"
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
one () {
  n="$1"; shift
  for try in 1 2 3; do
    rm -f "shots/CHAMOIS-$n.png" "shots/CHAMOIS-$n.state.json"
    timeout 180 python tools/shot.py "CHAMOIS-$n" --port 8777 "$@" --steps "$DECK|wait:3" >/dev/null 2>&1
    v=$(python -c "
import json
try:
    d=json.load(open('shots/CHAMOIS-$n.state.json'))
    print(1 if d.get('errors') or d.get('void') or d.get('perf', {}).get('band', 99) < 12 else 0)
except Exception: print(1)")
    if [ "$v" = "0" ]; then cp "shots/CHAMOIS-$n.png" "$J/$n.png"; echo "ok   $n"; return; fi
    echo "retry $n"; sleep 20
  done
  echo "FAILED $n"
}
for size in "" "-1280"; do
  S=""; [ -n "$size" ] && S="--w 1280 --h 800"
  one "fight-foyer$size" $S --scene combat --encounter foyer-14 $KID --wait 8
done
echo "--- CHAMOIS: $(ls "$J" | wc -l) of 6 files ---"; ls "$J"
