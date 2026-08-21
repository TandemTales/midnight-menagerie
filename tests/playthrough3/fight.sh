#!/bin/sh
# Play out a Scuffle with real keyboard input until the scene changes.
# usage: sh fight.sh [maxturns]
cd "$(dirname "$0")/../.." || exit 1
MAX=${1:-14}
i=0
while [ $i -lt $MAX ]; do
  OUT=$(python tests/playthrough3/mm.py \
    "movexy:1400,150" \
    "key:Tab" "key:Enter" "wait:0.6" "key:Enter" "wait:0.7" \
    "key:Tab" "key:Enter" "wait:0.6" "key:Enter" "wait:0.7" \
    "key:Tab" "key:Enter" "wait:0.6" "key:Enter" "wait:0.7" \
    "key:Tab" "key:Enter" "wait:0.6" "key:Enter" "wait:0.7" \
    "key:e" "wait:2.6" \
    "jsawait:JSON.stringify({sc:window.MM.state().scene,c:window.MM.state().run.courage})")
  echo "$OUT" | grep -o '"r": ".*"' | tail -1
  case "$OUT" in
    *'reward'*|*'gameover'*|*'map'*) break ;;
  esac
  i=$((i+1))
done
