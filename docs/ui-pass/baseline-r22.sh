#!/bin/bash
# MUSLIN baselines for round 22: five contact sheets (the Hedge Maze, the
# Kitchens, the Secret Passages, the Pumpkin Grounds, the Heart) and two
# fights at both sizes, ALL AT THE STEAM DECK'S TIER. Run from the commit
# round 22's worktrees are cut from, after the 1280 fixes have merged.
set -u
cd "C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie" || exit 1
curl -s -m 5 -o /dev/null http://localhost:8777/ || {
  echo "8777 is not answering. Start it:  python tools/devserver.py 8777"; exit 1; }
J="C:/UILOOP/r22/judging/r22/wings/MUSLIN"; mkdir -p "$J"
sheet () {
  python tools/variant_sheet.py "$1" --port 8777 --tier medium --seeds "$2" --out "$J/sheet-$1.png" 2>&1 | tail -3
}
sheet hedge    "hedge,fountain,walk"
sheet kitchens "kitchen,scullery"
sheet passages "passage,library,closet"
sheet pumpkin  "courtyard,patch,pond"
sheet heart    "heart"
KID="--seed 7 --companion bones --kid maya"
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
one () {
  n="$1"; shift
  for try in 1 2 3; do
    rm -f "shots/MUSLIN-$n.png" "shots/MUSLIN-$n.state.json"
    python tools/shot.py "MUSLIN-$n" --port 8777 "$@" --steps "$DECK|wait:3" >/dev/null 2>&1
    v=$(python -c "
import json
try:
    d=json.load(open('shots/MUSLIN-$n.state.json'))
    print(1 if d.get('errors') or d.get('void') or d.get('perf', {}).get('band', 99) < 12 else 0)
except Exception: print(1)")
    if [ "$v" = "0" ]; then cp "shots/MUSLIN-$n.png" "$J/$n.png"; echo "ok   $n"; return; fi
    echo "retry $n"; sleep 20
  done
  echo "FAILED $n"
}
for size in "" "-1280"; do
  S=""; [ -n "$size" ] && S="--w 1280 --h 800"
  one "fight-hedge$size"   $S --scene combat --region hedge-maze      --encounter hm-1 $KID --wait 8
  one "fight-pumpkin$size" $S --scene combat --region pumpkin-grounds --encounter pk-1 $KID --wait 8
done
echo "--- MUSLIN: $(ls "$J" | wc -l) of 9 files ---"; ls "$J"
