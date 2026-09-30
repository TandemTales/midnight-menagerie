#!/bin/bash
# NANKEEN baselines for round 23: four contact sheets (the Bathhouse, the
# Lampworks, the Attic, the Kennels) and two fights at both sizes, ALL AT
# THE STEAM DECK'S TIER. Run from the commit round 23's worktrees are cut
# from, after round 22's graft has merged.
set -u
cd "C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie" || exit 1
curl -s -m 5 -o /dev/null http://localhost:8777/ || {
  echo "8777 is not answering. Start it:  python tools/devserver.py 8777"; exit 1; }
J="C:/UILOOP/r23/judging/r23/wings/NANKEEN"; mkdir -p "$J"
sheet () {
  python tools/variant_sheet.py "$1" --port 8777 --tier medium --seeds "$2" --out "$J/sheet-$1.png" 2>&1 | tail -3
}
sheet bathhouse "bathhouse,steam,pool"
sheet lampworks "lampworks,wax,reflector"
sheet attic     "attic,archive"
sheet kennels   "kennels,wash"
KID="--seed 7 --companion bones --kid maya"
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
one () {
  n="$1"; shift
  for try in 1 2 3; do
    rm -f "shots/NANKEEN-$n.png" "shots/NANKEEN-$n.state.json"
    python tools/shot.py "NANKEEN-$n" --port 8777 "$@" --steps "$DECK|wait:3" >/dev/null 2>&1
    v=$(python -c "
import json
try:
    d=json.load(open('shots/NANKEEN-$n.state.json'))
    print(1 if d.get('errors') or d.get('void') or d.get('perf', {}).get('band', 99) < 12 else 0)
except Exception: print(1)")
    if [ "$v" = "0" ]; then cp "shots/NANKEEN-$n.png" "$J/$n.png"; echo "ok   $n"; return; fi
    echo "retry $n"; sleep 20
  done
  echo "FAILED $n"
}
for size in "" "-1280"; do
  S=""; [ -n "$size" ] && S="--w 1280 --h 800"
  one "fight-bathhouse$size" $S --scene combat --region bathhouse --encounter bh-1 $KID --wait 8
  one "fight-lampworks$size" $S --scene combat --region lampworks --encounter lw-1 $KID --wait 8
done
echo "--- NANKEEN: $(ls "$J" | wc -l) of 8 files ---"; ls "$J"
