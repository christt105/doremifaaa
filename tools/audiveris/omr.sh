#!/bin/sh
set -u
IN=${IN:-/in}
OUT=${OUT:-/out}
WIDTH=${WIDTH:-2480}
mkdir -p "$OUT/tmp"
for pdf in "$IN"/*.pdf; do
  [ -f "$pdf" ] || continue
  name=$(basename "$pdf" .pdf)
  if [ -f "$OUT/$name.mxl" ] && [ -z "${FORCE:-}" ]; then
    echo "SKIP $name"
    continue
  fi
  work="$OUT/tmp/$name"
  rm -rf "$work"
  mkdir -p "$work"
  src="$work/clean.pdf"
  python3 /usr/local/bin/clean_pdf.py "$pdf" "$src" 2> "$work/clean.log" || src="$pdf"
  pdftoppm -gray -scale-to-x "$WIDTH" -scale-to-y -1 -png "$src" "$work/p"
  img2pdf --pagesize A4 -o "$work/$name.pdf" "$work"/p*.png
  /opt/audiveris/bin/Audiveris -batch -transcribe -export -output "$work" -- "$work/$name.pdf" > "$work/audiveris.log" 2>&1
  found=$(find "$work" -name "*.mxl" | head -1)
  if [ -n "$found" ]; then
    cp "$found" "$OUT/$name.mxl"
    echo "OK   $name"
  else
    echo "FAIL $name (see $work/audiveris.log)"
  fi
done
