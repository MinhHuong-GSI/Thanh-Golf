---
name: kich-ban-giong-ai
description: Làm video tình huống luật golf theo Cẩm nang giải cứu bóng ở thế khó (92 tình huống, mã 1.1–9.8) – viết kịch bản 5 cảnh, gửi chị duyệt, rồi tạo giọng AI tiếng Việt và dựng phim 3D. Dùng khi chị nói "viết kịch bản tình huống X", "viết kịch bản cả chương N" hoặc "kịch bản X đã duyệt, dựng video".
argument-hint: "[mã tình huống, vd 4.6 | chương 3 | 3.3 đã duyệt]"
---

# Video tình huống cẩm nang: kịch bản → duyệt → giọng AI → phim 3D

Yêu cầu: $ARGUMENTS

Tài liệu gốc, đọc kỹ trước khi làm: `golf-video-engine/KICH_BAN_VOICE.md`. Dữ liệu: `golf-video-engine/kich-ban/tinh-huong.json`. Mẫu đã làm: `kich-ban/lines_3-3.json` và `kich-ban/kich-ban_3-3.md`; video gốc của định dạng: `tts/lines_luat17-1d.json`.

Việc chia làm hai giai đoạn, có **cổng duyệt** ở giữa.

## Giai đoạn A – Viết kịch bản (chưa tạo giọng)
1. Tra tình huống theo mã trong `tinh-huong.json`: căn cứ `r`, phương án `o`, cách làm `h`, mẹo `tip`, sai lầm `err`, điều luật và mức phạt `q`. Chọn 1 ý làm "bẫy sai lầm".
2. Viết theo khung 5 cảnh:
   - Mở (câu hỏi móc).
   - Luật & phương án chính.
   - Phương án còn lại hoặc chi tiết then chốt.
   - Bẫy sai lầm ("Câu trả lời là…").
   - Chốt (thẻ luật + khẩu hiệu).
3. Ràng buộc:
   - 14–20 câu, 200–245 âm tiết, phim chính 55–64 s.
   - Mỗi phương án nói rõ mức phạt.
   - Vùng thả nói đủ: điểm tham chiếu, 1 hay 2 chiều dài gậy, không gần lỗ hơn, giới hạn khu vực.
   - Luật địa phương mẫu luôn nói "nếu Ban tổ chức áp dụng".
4. Ghi ra `kich-ban/lines_<mã>.json`, mã dùng gạch ngang (3-3, 4-10). Trường `tts` chuẩn hoá theo mục 6 của KICH_BAN_VOICE: không chữ số, không ký hiệu, không từ tiếng Anh.
5. Tự kiểm: `python golf-video-engine/tts/check_script.py golf-video-engine/kich-ban/lines_<mã>.json`. Phải hết cảnh báo.
6. Giao subagent `kiem-tra-luat-golf` soát kịch bản với `tinh-huong.json` và Rules of Golf. Sửa theo các điểm nó xác nhận là sai.
7. Xuất bảng duyệt: `python golf-video-engine/kich-ban/xem_kich_ban.py golf-video-engine/kich-ban/lines_<mã>.json <mã> > golf-video-engine/kich-ban/kich-ban_<mã>.md`.
8. **Gửi chị bảng duyệt rồi dừng.** Không tạo giọng khi chưa được duyệt. Có thể viết theo lô (cả chương) để chị duyệt một lần.

## Giai đoạn B – Sau khi chị duyệt: giọng AI + phim
1. Cài đặt lần đầu theo `tts/README.md`:
   - `sherpa-onnx<2`.
   - Model `vits-piper-vi_VN-vais1000-medium` và `sherpa-onnx-zipformer-vi-int8-2025-04-20`, giải nén trong `tts/`.
2. Tạo giọng:
   - `cp kich-ban/lines_<mã>.json tts/lines.json`.
   - Chạy `python make_tts.py 0.97` rồi `python asr_check.py`. Câu nào ASR nghe sai thì sửa `tts` và chạy lại.
   - Chạy `python assemble.py` để ra `narration_raw.wav` và `timing.json`.
3. Âm thanh tổng: lời đọc phim, cộng 0,2 s, cộng câu kết *"Hãy phô lô tê tê gôn, để biết thêm nhiều kiến thức về gôn nhé!"* (speed 0,97 × 1,03), đệm đủ ~3 s logo cuối.
   - Theo quy tắc mới của chị, **không có logo đầu**: lời đọc bắt đầu ngay trên cảnh mở, khung 0 là cảnh phim.
   - Chuẩn hoá bằng `loudnorm` (lệnh trong `tts/README.md`) để ra `narration_ttgolf.m4a`. Đây là "âm thanh gốc" để so MD5.
4. Dựng phim theo skill `/dung-video-3d`, từ bước 3 (storyboard) trở đi. Mốc lấy từ `timing.json`; `SUBS`, `TITLES`, `LABELS`, `CARDS`, `SHOTS` lấy từ các trường `sub`, `title`, `label`, `fx`, `card`, `shot`. Mẫu gần nhất: `film_luat17-1d.js`.
5. Render thử 8–15 khung, gửi chị duyệt, rồi render toàn bộ, ghép `-c:a copy`, so MD5, tạo ảnh cover.
6. Bàn giao `Luat-golf-<mã>_<noi-dung-khong-dau>_3D.mp4` và cover vào `xuat-ban/`. Lưu `lines_<mã>.json` và `kich-ban_<mã>.md` bản cuối vào `kich-ban/`.
