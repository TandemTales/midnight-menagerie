#!/bin/bash
# TAFFETA baselines for round 17: four contact sheets (three rooms of one wing
# each) and the combat board at both sizes.
#
# RUN THIS FROM THE COMMIT ROUND 17'S WORKTREES ARE CUT FROM -- round 16 is
# merged, so that is dev's tip. A baseline that is not the tree the builders
# start from makes the judges score a field that was never the game.
#
# variant_sheet.py refuses a sheet with a panel that never drew; the board is
# retried while void or while its band says there is no room behind it.
set -u
cd "C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie" || exit 1
# Fail in one second, not twenty minutes. On 2026-09-23 the main dev server
# died with the session that owned it, and this script retried every capture
# against a dead port and reported "0 files" at the end.
curl -s -m 5 -o /dev/null http://localhost:8777/ || {
  echo "8777 is not answering. Start it:  python tools/devserver.py 8777"; exit 1; }
J="C:/UILOOP/r17/judging/r17/rooms/TAFFETA"; mkdir -p "$J"
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
    rm -f "shots/TAFFETA-$n.png" "shots/TAFFETA-$n.state.json"
    python tools/shot.py "TAFFETA-$n" --port 8777 "$@" >/dev/null 2>&1
    v=$(python -c "
import json
try:
    d=json.load(open('shots/TAFFETA-$n.state.json'))
    print(1 if d.get('void') or d.get('perf', {}).get('band', 99) < 28 else 0)
except Exception: print(1)")
    if [ "$v" = "0" ]; then cp "shots/TAFFETA-$n.png" "$J/$n.png"; echo "ok   $n"; return; fi
    echo "retry $n"; sleep 25
  done
  echo "FAILED $n"
}
one combat      --scene combat --encounter foyer-14 --seed 7 --companion bones --kid maya --wait 5
one combat-1280 --w 1280 --h 800 --scene combat --encounter foyer-14 --seed 7 --companion bones --kid maya --wait 5
echo "--- TAFFETA: $(ls "$J" | wc -l) files ---"; ls "$J"
