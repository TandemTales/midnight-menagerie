#!/bin/bash
# SATEEN baselines for round 36: settings, lobby, shop, piles and combat-crowd at both sizes.
# Run from the commit round 36's worktrees are cut from.
set -u
cd "C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie" || exit 1
curl -s -m 5 -o /dev/null http://localhost:8777/ || {
  echo "8777 is not answering. Start it:  python tools/devserver.py 8777"; exit 1; }
J="C:/UILOOP/r36/judging/r36/controls/SATEEN"; mkdir -p "$J"
KID="--seed 7 --companion bones --kid maya"
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
one () {
  n="$1"; shift
  for try in 1 2 3; do
    rm -f "shots/SATEEN-$n.png" "shots/SATEEN-$n.state.json"
    timeout 600 python tools/shot.py "SATEEN-$n" --port 8777 "$@" >/dev/null 2>&1
    v=$(python -c "
import json
try:
    d=json.load(open('shots/SATEEN-$n.state.json'))
    print(1 if d.get('errors') else 0)
except Exception: print(1)")
    # void is NOT retried: the bright map trips shot.py's flash check. Look at it.
    if [ "$v" = "0" ]; then cp "shots/SATEEN-$n.png" "$J/$n.png"; echo "ok   $n"; return; fi
    echo "retry $n"; sleep 20
  done
  echo "FAILED $n"
}
for size in "" "-1280"; do
  S=""; [ -n "$size" ] && S="--w 1280 --h 800"
  one "settings$size"     $S --scene map $KID --wait 3 --steps "click:.mm-hud__settings|wait:1"
  one "lobby$size"        $S --scene lobby $KID --wait 3
  one "shop$size"         $S --scene shop $KID --wait 3
  one "piles$size"        $S --scene combat --encounter foyer-14 $KID --wait 5 --steps "click:#draw-pile|wait:1"
  one "combat-crowd$size" $S --scene combat --encounter foyer-boss $KID --wait 8 --script @tools/shot-scripts/combat-crowd.js --steps "$DECK|wait:3"
done
echo "--- SATEEN: $(ls "$J" | wc -l) of 10 files ---"; ls "$J"
