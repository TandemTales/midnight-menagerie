#!/bin/bash
# CALICO baselines for round 24: four contact sheets (the Nursery, the
# Sleeping Quarters, the Study & Library, the Crypt) and two fights at both sizes, ALL AT
# THE STEAM DECK'S TIER. Run from the commit round 24's worktrees are cut
# from, after round 23's graft has merged.
set -u
cd "C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie" || exit 1
curl -s -m 5 -o /dev/null http://localhost:8777/ || {
  echo "8777 is not answering. Start it:  python tools/devserver.py 8777"; exit 1; }
J="C:/UILOOP/r24/judging/r24/wings/CALICO"; mkdir -p "$J"
sheet () {
  python tools/variant_sheet.py "$1" --port 8777 --tier medium --seeds "$2" --out "$J/sheet-$1.png" 2>&1 | tail -3
}
sheet nursery  "nursery,sewing"
sheet sleeping "dormitory,bedroom"
sheet study    "library,fireplace"
sheet crypt    "catacomb,chapel,ossuary"
KID="--seed 7 --companion bones --kid maya"
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
one () {
  n="$1"; shift
  for try in 1 2 3; do
    rm -f "shots/CALICO-$n.png" "shots/CALICO-$n.state.json"
    python tools/shot.py "CALICO-$n" --port 8777 "$@" --steps "$DECK|wait:3" >/dev/null 2>&1
    v=$(python -c "
import json
try:
    d=json.load(open('shots/CALICO-$n.state.json'))
    print(1 if d.get('errors') or d.get('void') or d.get('perf', {}).get('band', 99) < 12 else 0)
except Exception: print(1)")
    if [ "$v" = "0" ]; then cp "shots/CALICO-$n.png" "$J/$n.png"; echo "ok   $n"; return; fi
    echo "retry $n"; sleep 20
  done
  echo "FAILED $n"
}
for size in "" "-1280"; do
  S=""; [ -n "$size" ] && S="--w 1280 --h 800"
  one "fight-nursery$size" $S --scene combat --region nursery --encounter nursery-1 $KID --wait 8
  one "fight-study$size" $S --scene combat --region study-library --encounter sl-1 $KID --wait 8
done
echo "--- CALICO: $(ls "$J" | wc -l) of 8 files ---"; ls "$J"
