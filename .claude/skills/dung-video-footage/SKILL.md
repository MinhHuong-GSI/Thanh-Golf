---
name: dung-video-footage
description: Dựng video dọc 1080×1920 từ footage quay thật (thường là HDR iPhone .mov) ghép với một file âm thanh lời dẫn có sẵn (mp3/m4a) – chọn cảnh khớp lời, quay chậm/tua nhanh/zoom, chỉnh màu bình minh, phụ đề, logo TTGolf cuối và ảnh cover. Dùng cho các video kiểu "Chào buổi sáng", không phải phim 3D luật golf.
argument-hint: "[thư mục footage] [file âm thanh]"
---

# Dựng video từ footage thật + âm thanh có sẵn

Nguồn: $ARGUMENTS

Tài liệu và code mẫu: `footage-edit/README.md` cùng `edl.py`, `grade.py`, `stage1.py`, `stage2.py`, `subs.py`, `cover.py`. Video mẫu đã làm: "Chao-buoi-sang-thang-11_binh-minh-san-golf_TTGolf.mp4" (71 s, 20 cảnh). Làm việc trong một thư mục riêng (ví dụ `footage-edit/<ten-video>/`), sao chép các script mẫu vào đó rồi sửa.

## Các bước
1. **Phân tích:** `ffprobe` từng clip (HDR HLG? xoay? 60 fps?) và file âm thanh. Làm proxy SDR 540×960 (zscale HLG→linear, tonemap) và contact sheet theo giây.
2. **Chép lời có mốc từng chữ:** dùng sherpa-onnx zipformer-vi (`golf-video-engine/tts/asr_check.py` làm mẫu). Đặt điểm cắt vào khoảng lặng.
3. **`edl.py`:** mỗi câu hoặc cụm câu là một cảnh. Khai báo:
   - Clip và giây nguồn.
   - Tốc độ: 0,38–0,65 là quay chậm; dạng nút `[(t,v)…]` là tua nhanh rồi chậm dần.
   - Zoom z0→z1 (1,0–1,2), `cy`/`cx`, mood (warm/cool/leak).
   - Chạy `python edl.py` để kiểm nguồn đủ dài.
4. **`grade.py`:** chỉnh màu bình minh, xuất thành LUT `.cube` cho từng clip, cân trắng riêng các clip lạnh. Hoàn thiện không gian: nắng góc phải trên, bloom, vignette, grain. Thử trên vài khung trước.
5. **`stage1.py`:** giải mã 4K HLG → tonemap → LUT → xoay → đổi tốc độ → Ken Burns → `shots/*.mp4`. Chạy lại được.
6. **`stage2.py`:**
   - Crossfade 0,6 s, mood, light leak ở điểm chuyển ý.
   - **Không logo đầu, khung 0 là cảnh luôn** (không fade đen).
   - Thẻ kem viền vàng kèm logo phẳng ở ~3 s cuối.
   - Phụ đề Be Vietnam Pro 48 (`subs.py`, `|` là xuống dòng).
   - `preview t1 t2…` để gửi chị xem khung trước. `full` xuất 2 bản: có và không phụ đề.
   - Cần sẵn: `logo/logo_ttgolf_flat.png` và `logo_ttgolf_gloss.png` (chép từ `golf-video-engine/`); thư mục `fonts/` gồm BeVietnamPro-Regular/Medium/Light.ttf và CormorantGaramond.ttf (variable), tải từ Google Fonts.
7. **Ghép âm thanh:**
   - **Không chép thẳng MP3 vào MP4.** Mã hoá AAC `-c:a aac -b:a 256k -ar 44100`, rồi so dạng sóng với file gốc: tương quan ≥ 0,9999, lệch 0 mẫu, độ lớn bằng nhau.
   - Nguồn AAC/m4a thì dùng `-c:a copy` và so MD5.
8. **Ảnh cover:** `python cover.py <giây> <file.jpg>`. Sửa kicker, tiêu đề và câu phụ theo nội dung video.
9. **Kiểm tra & bàn giao:**
   - Contact sheet, giải mã trọn file, bitrate đỉnh (giới hạn `-maxrate 12M -bufsize 24M -level 4.1`).
   - Gửi 2 bản (có/không phụ đề) kèm cover vào `xuat-ban/`.
   - Nếu chị cần gửi Zalo, xuất thêm một bản nhẹ 30–40 MB.
