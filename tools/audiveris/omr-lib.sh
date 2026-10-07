#!/bin/sh
WIDTH=${WIDTH:-2480}

convert_pdf() {
  pdf=$1
  work=$2
  out=$3
  name=$(basename "$pdf" .pdf)
  rm -rf "$work"
  mkdir -p "$work"
  src="$work/clean.pdf"
  python3 /usr/local/bin/clean_pdf.py "$pdf" "$src" 2> "$work/clean.log" || src="$pdf"
  pdftoppm -gray -scale-to-x "$WIDTH" -scale-to-y -1 -png "$src" "$work/p"
  img2pdf --pagesize A4 -o "$work/$name.pdf" "$work"/p*.png
  /opt/audiveris/bin/Audiveris -batch -transcribe -export -output "$work" -- "$work/$name.pdf" > "$work/audiveris.log" 2>&1
  found=$(find "$work" -name "*.mxl" | head -1)
  [ -n "$found" ] || return 1
  cp "$found" "$out"
}
