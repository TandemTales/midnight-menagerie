#!/bin/bash
# CHINTZ baselines for round 21: five fights in four wings, each at both sizes,
# ALL AT THE STEAM DECK'S TIER (medium, render scale 0.8, calibration off).
# RUN FROM THE COMMIT ROUND 21'S WORKTREES ARE CUT FROM -- after round 20's
# graft (dc30164) -- or the judges score a field that was never the game.
#
# A board with no room behind it means the warm-up timed out: retried while
# void or while perf.band < 20. The Greenhouse is a dark room and bands ~26,
# so round 18's 28 floor would reject a good frame here. Look at every frame.
set -u
cd "C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie" || exit 1
curl -s -m 5 -o /dev/null http://localhost:8777/ || {
  echo "8777 is not answering. Start it:  python tools/devserver.py 8777"; exit 1; }
J="C:/UILOOP/r21/judging/r21/floor/CHINTZ"; mkdir -p "$J"
KID="--seed 7 --companion bones --kid maya"
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
one () {
  n="$1"; shift
  for try in 1 2 3; do
    rm -f "shots/CHINTZ-$n.png" "shots/CHINTZ-$n.state.json"
    python tools/shot.py "CHINTZ-$n" --port 8777 "$@" --steps "$DECK|wait:3" >/dev/null 2>&1
    v=$(python -c "
import json
try:
    d=json.load(open('shots/CHINTZ-$n.state.json'))
    print(1 if d.get('errors') or d.get('void') or d.get('perf', {}).get('band', 99) < 20 else 0)
except Exception: print(1)")
    if [ "$v" = "0" ]; then cp "shots/CHINTZ-$n.png" "$J/$n.png"; echo "ok   $n"; return; fi
    echo "retry $n"; sleep 20
  done
  echo "FAILED $n"
}
for size in "" "-1280"; do
  S=""; [ -n "$size" ] && S="--w 1280 --h 800"
  one "combat$size"           $S --scene combat --encounter foyer-14   $KID --wait 8
  one "combat-boss$size"      $S --scene combat --encounter foyer-boss $KID --wait 8
  one "fight-greenhouse$size" $S --scene combat --region greenhouse --encounter gh-1 $KID --wait 8
  one "fight-graveyard$size"  $S --scene combat --region graveyard  --encounter gy-1 $KID --wait 8
  one "fight-ballroom$size"   $S --scene combat --region ballroom   --encounter br-1 $KID --wait 8
done
echo "--- CHINTZ: $(ls "$J" | wc -l) of 10 files ---"; ls "$J"
