#!/bin/bash
# Usage: ./encode.sh <thu_muc_frames> <video_goc_lay_am_thanh> <file_ra.mp4>
ffmpeg -y -v error -framerate 24 -i "$1/f_%05d.jpg" -i "$2" -map 0:v -map 1:a \
  -vf "noise=alls=2:allf=t,vignette=angle=PI/7" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p \
  -c:a copy -shortest -movflags +faststart "$3"
# Kiem tra am thanh giu nguyen (2 dong MD5 phai trung nhau):
ffmpeg -v error -i "$2" -map 0:a -c copy -f md5 -; ffmpeg -v error -i "$3" -map 0:a -c copy -f md5 -
