#!/bin/bash
# GROSGRAIN baselines for round 35: four contact sheets (the Attic, the Sleeping
# Quarters, the Graveyard, the Crypt) and one fight at both sizes, ALL AT THE
# STEAM DECK'S TIER. Run from the commit round 35's worktrees are cut from.
set -u
cd "C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie" || exit 1
curl -s -m 5 -o /dev/null http://localhost:8777/ || {
  echo "8777 is not answering. Start it:  python tools/devserver.py 8777"; exit 1; }
J="C:/UILOOP/r35/judging/r35/rooms/GROSGRAIN"; mkdir -p "$J"
sheet () {
  timeout 1500 python tools/variant_sheet.py "$1" --port 8777 --tier medium --seeds "$2" --out "$J/sheet-$1.png" 2>&1 | tail -3
}
sheet attic     "attic,library"
sheet sleeping  "dormitory,bedroom"
sheet graveyard "yard,plots,gate"
sheet crypt     "catacomb,family,ossuary"
KID="--seed 7 --companion bones --kid maya"
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
one () {
  n="$1"; shift
  for try in 1 2 3; do
    rm -f "shots/GROSGRAIN-$n.png" "shots/GROSGRAIN-$n.state.json"
    timeout 600 python tools/shot.py "GROSGRAIN-$n" --port 8777 "$@" --steps "$DECK|wait:3" >/dev/null 2>&1
    v=$(python -c "
import json
try:
    d=json.load(open('shots/GROSGRAIN-$n.state.json'))
    print(1 if d.get('errors') or d.get('void') or d.get('perf', {}).get('band', 99) < 12 else 0)
except Exception: print(1)")
    if [ "$v" = "0" ]; then cp "shots/GROSGRAIN-$n.png" "$J/$n.png"; echo "ok   $n"; return; fi
    echo "retry $n"; sleep 20
  done
  echo "FAILED $n"
}
for size in "" "-1280"; do
  S=""; [ -n "$size" ] && S="--w 1280 --h 800"
  one "fight-graveyard$size" $S --scene combat --region graveyard --encounter gy-1 $KID --wait 8
done
echo "--- GROSGRAIN: $(ls "$J" | wc -l) of 6 files ---"; ls "$J"
