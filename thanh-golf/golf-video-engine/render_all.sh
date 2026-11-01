#!/bin/bash
# Usage: ./render_all.sh <page.html> <so_khung = round(thoi_luong*24)> <thu_muc_frames>
# Chay may chu truoc:  python3 -m http.server 8765   (trong thu muc nay)
cd "$(dirname "$0")"
PAGE=$1; N=$2; OUT=$3
for i in 1 2 3 4 5 6; do
  have=$(ls $OUT 2>/dev/null | wc -l); [ "$have" -ge "$N" ] && break
  PAGE=$PAGE QS='?rs=0.6667' node render.js range 0 $N $OUT 2>&1 | grep --line-buffered -E "frame|PAGEERR|rror|init" >> render.log
done
echo "DONE $(ls $OUT | wc -l)" >> render.log
