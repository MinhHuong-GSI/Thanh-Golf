#!/bin/bash
# Full render with the local server, two workers on disjoint frame ranges.
# Safe to re-run: frames already on disk are skipped.
cd "$(dirname "$0")"
python3 -m http.server 8765 >/dev/null 2>&1 &
SRV=$!; trap "kill $SRV 2>/dev/null" EXIT; sleep 1
N=1534; OUT=frames; mkdir -p $OUT
worker() {
  a=$1; b=$2
  for i in 1 2 3 4 5 6 7 8; do
    miss=0; for f in $(seq $a $((b-1))); do [ -f $OUT/f_$(printf %05d $f).jpg ] || { miss=1; break; }; done
    [ $miss = 0 ] && break
    PAGE=film_luat17-1d.html QS='?rs=0.6667' node render.js range $a $b $OUT 2>&1 | grep --line-buffered -E "frame|PAGEERR|rror|init" >> render_$a.log
  done
}
worker 0 767 & worker 767 $N & wait
echo "DONE $(ls $OUT | wc -l)" >> render.log
