# Giọng đọc AI tiếng Việt (offline) – dùng khi kịch bản không có âm thanh gốc

Cách viết kịch bản: xem `../KICH_BAN_VOICE.md`. Kịch bản nằm ở `../kich-ban/lines_<mã>.json`.

1. `pip install --break-system-packages "sherpa-onnx<2"` (bản 2.x bỏ bộ phiên âm espeak, không đọc được tiếng Việt).
2. Tải giọng (GitHub, chạy được trong sandbox):
   `https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-vi_VN-vais1000-medium.tar.bz2` rồi giải nén cạnh các script.
   Kiểm tra phát âm (nên làm): `.../asr-models/sherpa-onnx-zipformer-vi-int8-2025-04-20.tar.bz2`, chạy `asr_check.py`.
3. Kiểm tra kịch bản trước khi tạo giọng: `python3 check_script.py ../kich-ban/lines_<mã>.json` (chữ đọc, độ dài câu, thời lượng ước tính từng cảnh; ~4,6 âm tiết/giây ở speed 0,97).
4. `cp ../kich-ban/lines_<mã>.json lines.json`. Trường dùng: `sub` = phụ đề giữ nguyên lời thoại, `tts` = chữ đã chuẩn hoá để đọc
   (17.1d(1) → "mười bảy chấm một đê một", bunker → "băng kơ", golf → "gôn", Stroke and Distance → "xì trốc, en, đít tần"), `speed` tuỳ câu, `gap` = nghỉ sau câu.
5. `python3 make_tts.py 0.97` → `python3 asr_check.py` → `python3 assemble.py`
   (nghỉ sau câu lấy từ `gap`; mặc định 0,42 s trong cảnh, 0,9 s khi sang cảnh mới).
6. Câu kết cho logo cuối (cùng giọng): "Hãy phô lô tê tê gôn, để biết thêm nhiều kiến thức về gôn nhé!", speed 0,97 × 1,03.
   Âm thanh tổng = 3 s im lặng (logo đầu) + `narration_raw.wav` (đệm đủ độ dài phim) + 0,2 s + câu kết (đệm đủ 3,625 s logo cuối).
7. Chuẩn hoá và mã hoá: `ffmpeg -i narration_ttgolf_raw.wav -af "highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000" -ac 2 -c:a aac -b:a 192k narration_ttgolf.m4a`.
   `timing.json` cho mốc từng câu → dựng SUBS/TITLES/SHOTS; `narration_ttgolf.m4a` là "âm thanh gốc" cho encode.sh (MD5).
