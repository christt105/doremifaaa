#!/bin/sh
set -u
. /usr/local/bin/omr-lib.sh
DIR=${OMR_DIR:-/data/omr}
INTERVAL=${INTERVAL:-5}
mkdir -p "$DIR/queue" "$DIR/work" "$DIR/done" "$DIR/failed"
trap 'exit 0' TERM INT
echo "watching $DIR/queue"
while :; do
  for job in "$DIR"/queue/*.pdf; do
    [ -f "$job" ] || continue
    id=$(basename "$job" .pdf)
    claimed="$DIR/work/$id.pdf"
    mv "$job" "$claimed" 2>/dev/null || continue
    if convert_pdf "$claimed" "$DIR/work/$id" "$DIR/work/$id.mxl"; then
      mv "$DIR/work/$id.mxl" "$DIR/done/$id.mxl"
      echo "OK   $id"
    else
      { echo "Audiveris did not recognise a score in this PDF"; tail -n 20 "$DIR/work/$id/audiveris.log" 2>/dev/null; } > "$DIR/failed/.$id.tmp"
      mv "$DIR/failed/.$id.tmp" "$DIR/failed/$id.log"
      echo "FAIL $id"
    fi
    rm -rf "$DIR/work/$id" "$claimed"
  done
  sleep "$INTERVAL" &
  wait $!
done
