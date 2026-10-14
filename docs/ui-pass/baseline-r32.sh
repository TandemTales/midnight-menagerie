#!/bin/bash
# GINGHAM baselines for round 32: combat-boss, combat-crowd and combat at both sizes.
# Run from the commit round 32's worktrees are cut from.
set -u
cd "C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie" || exit 1
curl -s -m 5 -o /dev/null http://localhost:8777/ || {
  echo "8777 is not answering. Start it:  python tools/devserver.py 8777"; exit 1; }
J="C:/UILOOP/r32/judging/r32/fight/GINGHAM"; mkdir -p "$J"
KID="--seed 7 --companion bones --kid maya"
one () {
  n="$1"; shift
  for try in 1 2 3; do
    rm -f "shots/GINGHAM-$n.png" "shots/GINGHAM-$n.state.json"
    timeout 180 python tools/shot.py "GINGHAM-$n" --port 8777 "$@" >/dev/null 2>&1
    v=$(python -c "
import json
try:
    d=json.load(open('shots/GINGHAM-$n.state.json'))
    print(1 if d.get('errors') else 0)
except Exception: print(1)")
    # void is NOT retried: the bright map trips shot.py's flash check. Look at it.
    if [ "$v" = "0" ]; then cp "shots/GINGHAM-$n.png" "$J/$n.png"; echo "ok   $n"; return; fi
    echo "retry $n"; sleep 20
  done
  echo "FAILED $n"
}
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
for size in "" "-1280"; do
  S=""; [ -n "$size" ] && S="--w 1280 --h 800"
  one "combat-boss$size"  $S --scene combat --encounter foyer-boss $KID --wait 8 --steps "$DECK|wait:3"
  one "combat-crowd$size" $S --scene combat --encounter foyer-boss $KID --wait 8 --script @tools/shot-scripts/combat-crowd.js --steps "$DECK|wait:3"
  one "combat$size"       $S --scene combat --encounter foyer-14 $KID --wait 8 --steps "$DECK|wait:3"
done
echo "--- GINGHAM: $(ls "$J" | wc -l) of 6 files ---"; ls "$J"
