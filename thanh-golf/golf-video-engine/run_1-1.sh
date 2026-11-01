#!/bin/bash
# Render toàn bộ video tình huống 1.1: 1516 khung phim (63,18 s) + 87 khung logo cuối (3,625 s), 24 fps.
# Chạy lại được nhiều lần: khung đã có trên đĩa sẽ được bỏ qua. Theo dõi: tail -f render_1-1.log
# Trên Windows (Git Bash): PY=python ./run_1-1.sh
cd "$(dirname "$0")"
PY=${PY:-python3}
curl -s -o /dev/null http://localhost:8765/film_1-1.html || { $PY -m http.server 8765 >/dev/null 2>&1 & SRV=$!; trap "kill $SRV 2>/dev/null" EXIT; sleep 1; }
N=1516; OUT=frames_1-1; NW=${NW:-3}; mkdir -p $OUT
worker() {
  a=$1; b=$2
  for i in 1 2 3 4 5 6 7 8; do
    miss=0; for f in $(seq $a $((b-1))); do [ -f $OUT/f_$(printf %05d $f).jpg ] || { miss=1; break; }; done
    [ $miss = 0 ] && break
    PAGE=film_1-1.html QS='?rs=0.6667' node render.js range $a $b $OUT 2>&1 | grep --line-buffered -E "frame|PAGEERR|rror|init" >> render_1-1_$a.log
  done
}
step=$(( (N + NW - 1) / NW ))
for ((k=0; k<NW; k++)); do a=$((k*step)); b=$(( (k+1)*step < N ? (k+1)*step : N )); worker $a $b & done
wait
echo "FILM $(ls $OUT | wc -l)/$N $(date -Is)" >> render_1-1.log
# logo cuối: crossfade 0,4 s từ khung phim cuối, câu kết bắt đầu 0,2 s, phụ đề tới 3,335 s
mkdir -p frames_1-1_outro
PAGE="bumper.html" QS="?m=outro&img=$OUT/f_01515.jpg&s0=0.2&s1=3.335" node render.js range 0 87 frames_1-1_outro 2>&1 | grep -E "PAGEERR|rror" >> render_1-1.log
for f in $(seq 0 86); do cp frames_1-1_outro/f_$(printf %05d $f).jpg $OUT/f_$(printf %05d $((N+f))).jpg; done
echo "DONE $(ls $OUT | wc -l)/$((N+87)) $(date -Is)" >> render_1-1.log
