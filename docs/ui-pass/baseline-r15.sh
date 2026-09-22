#!/bin/bash
# DIMITY baselines for round 15: four contact sheets (three rooms of one wing
# each) and the combat board at both sizes.
#
# RUN THIS ONLY AFTER ROUND 14'S BATHHOUSE GRAFT AND ROUND 13'S TOAST GRAFT
# HAVE MERGED, and cut round 15's worktrees from the same commit: the baseline
# must be the tree the builders start from, or the judges score a field that
# was never the game.
#
# variant_sheet.py refuses a sheet with a panel that never drew; the board is
# retried while void or while its band says there is no room behind it.
set -u
cd "C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie" || exit 1
J="C:/UILOOP/r15/judging/r15/rooms/DIMITY"; mkdir -p "$J"
sheet () {
  python tools/variant_sheet.py "$1" --port 8777 --seeds "$2" --out "$J/sheet-$1.png" 2>&1 | tail -6
}
sheet foyer      "parlor,gallery,landing"
sheet ballroom   "ballroom,mirrorhall,suite"
sheet greenhouse "conservatory,palmhouse,vinery"
sheet graveyard  "yard,plots,gate"
one () {
  n="$1"; shift
  for try in 1 2 3 4; do
    rm -f "shots/DIMITY-$n.png" "shots/DIMITY-$n.state.json"
    python tools/shot.py "DIMITY-$n" --port 8777 "$@" >/dev/null 2>&1
    v=$(python -c "
import json
try:
    d=json.load(open('shots/DIMITY-$n.state.json'))
    print(1 if d.get('void') or d.get('perf', {}).get('band', 99) < 28 else 0)
except Exception: print(1)")
    if [ "$v" = "0" ]; then cp "shots/DIMITY-$n.png" "$J/$n.png"; echo "ok   $n"; return; fi
    echo "retry $n"; sleep 25
  done
  echo "FAILED $n"
}
one combat      --scene combat --encounter foyer-14 --seed 7 --companion bones --kid maya --wait 5
one combat-1280 --w 1280 --h 800 --scene combat --encounter foyer-14 --seed 7 --companion bones --kid maya --wait 5
echo "--- DIMITY: $(ls "$J" | wc -l) files ---"; ls "$J"
