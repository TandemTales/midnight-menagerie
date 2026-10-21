#!/bin/bash
# TARLATAN baselines for round 43: four contact sheets (the Hedge, the Attic,
# the Crypt, the Bathhouse) and one fight at both sizes, ALL AT THE
# STEAM DECK'S TIER. Run from the commit round 43's worktrees are cut from.
set -u
cd "C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie" || exit 1
curl -s -m 5 -o /dev/null http://localhost:8777/ || {
  echo "8777 is not answering. Start it:  python tools/devserver.py 8777"; exit 1; }
J="C:/UILOOP/r43/judging/r43/rooms/TARLATAN"; mkdir -p "$J"
sheet () {
  timeout 1500 python tools/variant_sheet.py "$1" --port 8777 --tier medium --seeds "$2" --out "$J/sheet-$1.png" 2>&1 | tail -3
}
sheet hedge    "hedge,fountain,walk"
sheet attic     "attic,library"
sheet crypt     "catacomb,family,ossuary"
sheet bathhouse "bathhouse,steam,pool"
KID="--seed 7 --companion bones --kid maya"
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
one () {
  n="$1"; shift
  for try in 1 2 3; do
    rm -f "shots/TARLATAN-$n.png" "shots/TARLATAN-$n.state.json"
    timeout 600 python tools/shot.py "TARLATAN-$n" --port 8777 "$@" --steps "$DECK|wait:3" >/dev/null 2>&1
    v=$(python -c "
import json
try:
    d=json.load(open('shots/TARLATAN-$n.state.json'))
    print(1 if d.get('errors') or d.get('void') or d.get('perf', {}).get('band', 99) < 12 else 0)
except Exception: print(1)")
    if [ "$v" = "0" ]; then cp "shots/TARLATAN-$n.png" "$J/$n.png"; echo "ok   $n"; return; fi
    echo "retry $n"; sleep 20
  done
  echo "FAILED $n"
}
for size in "" "-1280"; do
  S=""; [ -n "$size" ] && S="--w 1280 --h 800"
  one "fight-crypt$size" $S --scene combat --region crypt --encounter cr-1 $KID --wait 8
done
echo "--- TARLATAN: $(ls "$J" | wc -l) of 6 files ---"; ls "$J"
