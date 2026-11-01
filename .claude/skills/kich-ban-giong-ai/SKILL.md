---
name: kich-ban-giong-ai
description: Làm video tình huống luật golf theo Cẩm nang giải cứu bóng ở thế khó (92 tình huống, mã 1.1–9.8) – viết kịch bản 5 cảnh, soát luật, tạo giọng AI tiếng Việt ngay (không chờ duyệt), gửi chị nghe; chị duyệt thì dựng phim 3D. Dùng khi chị nói "viết kịch bản tình huống X", "viết kịch bản cả chương N" hoặc "X đã duyệt, dựng video".
argument-hint: "[mã tình huống, vd 4.6 | chương 3 | 3.3 đã duyệt]"
---

# Video tình huống cẩm nang: kịch bản → giọng AI → chị duyệt → phim 3D

Yêu cầu: $ARGUMENTS

Tài liệu gốc, đọc kỹ trước khi làm: `golf-video-engine/KICH_BAN_VOICE.md`. Dữ liệu: `golf-video-engine/kich-ban/tinh-huong.json`. Mẫu đã làm: `kich-ban/lines_3-3.json` và `kich-ban/kich-ban_3-3.md`; video gốc của định dạng: `tts/lines_luat17-1d.json`.

Việc chia làm hai giai đoạn. **Không chờ duyệt trước khi tạo giọng** (chị chốt ngày 01/11/2026): viết xong, soát luật xong là tạo giọng luôn. Cổng duyệt nằm **sau** khi có giọng, trước khi dựng phim.

Đường dẫn tính từ `thanh-golf/` (xem `CLAUDE.md` ở gốc repo).

## Giai đoạn A – Viết kịch bản + tạo giọng AI (làm liền một mạch)
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
7. **Tạo giọng ngay**, không chờ duyệt. Làm trong `golf-video-engine/tts/`:
   - Cài đặt lần đầu theo `tts/README.md`: `sherpa-onnx<2`, model `vits-piper-vi_VN-vais1000-medium` và `sherpa-onnx-zipformer-vi-int8-2025-04-20` giải nén trong `tts/` (không đưa vào git).
   - `cp ../kich-ban/lines_<mã>.json lines.json`, rồi `python make_tts.py 0.97`.
   - `python chon_ban_tot.py 0.97 8`: ASR chấm từng câu; câu lệch được tạo lại tối đa 8 lần, giữ bản khớp nhất.
   - Câu vẫn lệch ở từ quan trọng (số điều luật, "ti", mức phạt) thì đổi cách viết `tts` (và `sub` nếu đổi chữ) trong `lines_<mã>.json`, rồi chạy lại. Xem mục Bài học trong `CLAUDE.md`.
   - Nếu đổi chữ, chạy lại `check_script.py`. Đổi ý thì giao `kiem-tra-luat-golf` soát lại câu đó.
   - `python assemble.py`, rồi `python ghep_tong.py ../kich-ban/am-thanh/<mã>`. Lệnh sau ghép câu kết vào logo cuối, chuẩn hoá loudnorm, ra `narration_ttgolf.m4a` + `timing.json`, và chép bản lưu vào `kich-ban/am-thanh/<mã>/`.
   - **Không có logo đầu**: lời đọc bắt đầu ngay ở khung 0 (quy tắc 6–7).
8. Xuất bảng duyệt: `python golf-video-engine/kich-ban/xem_kich_ban.py golf-video-engine/kich-ban/lines_<mã>.json <mã> > golf-video-engine/kich-ban/kich-ban_<mã>.md`. Nếu đã có `kich-ban/am-thanh/<mã>/timing.json`, cột "Giây" lấy mốc thật.
9. Commit `lines_<mã>.json`, `kich-ban_<mã>.md` và `kich-ban/am-thanh/<mã>/`, rồi push. Phiên đám mây bị xoá sau khi kết thúc, nên phải lưu lại để lúc dựng phim còn dùng.
10. **Gửi chị bảng kịch bản kèm file nghe thử `narration_ttgolf.m4a` rồi dừng.** Báo các câu ASR còn lệch để chị nghe kỹ. Chị góp ý thì sửa lời và tạo lại giọng (chỉ vài phút). Viết theo lô (cả chương) cũng tạo giọng luôn cho từng tình huống.

## Giai đoạn B – Sau khi chị duyệt (kịch bản + giọng): dựng phim
1. Dùng lại `kich-ban/am-thanh/<mã>/narration_ttgolf.m4a` và `timing.json`. **Không tạo giọng lại**, vì giọng có yếu tố ngẫu nhiên nên bản mới sẽ khác bản chị đã nghe.
2. Dựng phim theo skill `/dung-video-3d`, từ bước 3 (storyboard) trở đi. Mốc lấy từ `timing.json`; `SUBS`, `TITLES`, `LABELS`, `CARDS`, `SHOTS` lấy từ các trường `sub`, `title`, `label`, `fx`, `card`, `shot`. Mẫu gần nhất: `film_luat17-1d.js`.
3. Render thử 8–15 khung, gửi chị duyệt, rồi render toàn bộ, ghép `-c:a copy`, so MD5, tạo ảnh cover.
4. Bàn giao `Luat-golf-<mã>_<noi-dung-khong-dau>_3D.mp4` và cover vào `xuat-ban/`. Lưu `lines_<mã>.json` và `kich-ban_<mã>.md` bản cuối vào `kich-ban/`.
