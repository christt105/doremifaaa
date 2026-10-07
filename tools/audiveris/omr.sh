#!/bin/sh
set -u
. /usr/local/bin/omr-lib.sh
IN=${IN:-/in}
OUT=${OUT:-/out}
mkdir -p "$OUT/tmp"
for pdf in "$IN"/*.pdf; do
  [ -f "$pdf" ] || continue
  name=$(basename "$pdf" .pdf)
  if [ -f "$OUT/$name.mxl" ] && [ -z "${FORCE:-}" ]; then
    echo "SKIP $name"
    continue
  fi
  work="$OUT/tmp/$name"
  if convert_pdf "$pdf" "$work" "$OUT/$name.mxl"; then
    echo "OK   $name"
  else
    echo "FAIL $name (see $work/audiveris.log)"
  fi
done
