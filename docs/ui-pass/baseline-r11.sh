#!/bin/bash
# QUILL baselines for round 11. Four of the six screens are SHEETS -- three
# rooms of one wing -- because one Foyer cannot answer "does this wing feel
# stale". variant_sheet.py refuses to tile a panel that never drew.
set -u
cd "C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie" || exit 1
J="C:/UILOOP/r11/judging/r11/vary/QUILL"; mkdir -p "$J"
sheet () {
  python tools/variant_sheet.py "$1" --port 8777 --seeds "$2" --out "$J/sheet-$1.png" 2>&1 | tail -6
}
sheet foyer      parlor,gallery,landing
sheet ballroom   ballroom,mirrorhall,suite
sheet greenhouse conservatory,palmhouse,vinery
sheet graveyard  yard,plots,gate
# and the two single screens, retried until they actually drew
one () {
  n="$1"; shift
  for try in 1 2 3 4; do
    rm -f "shots/QUILL-$n.png" "shots/QUILL-$n.state.json"
    python tools/shot.py "QUILL-$n" --port 8777 "$@" >/dev/null 2>&1
    v=$(python -c "
import json
try:
    d=json.load(open('shots/QUILL-$n.state.json')); print(1 if d.get('void') else 0)
except Exception: print(1)")
    if [ "$v" = "0" ]; then cp "shots/QUILL-$n.png" "$J/$n.png"; echo "ok   $n"; return; fi
    echo "retry $n"; sleep 25
  done
  echo "FAILED $n"
}
one combat        --scene combat --encounter foyer-14 --seed 7 --companion bones --kid maya --wait 5
one combat-1280   --w 1280 --h 800 --scene combat --encounter foyer-14 --seed 7 --companion bones --kid maya --wait 5
one rest          --scene rest --seed 7 --companion bones --kid maya --wait 3
one rest-1280     --w 1280 --h 800 --scene rest --seed 7 --companion bones --kid maya --wait 3
echo "--- QUILL: $(ls "$J" | wc -l) files ---"; ls "$J"
