# Lịch sử dự án "Thanh golf" (trên claude.ai, 28/10 – 01/11/2026)

Tóm tắt từ các cuộc trò chuyện trong project, để Claude Code nắm bối cảnh. Các video và file bàn giao **không** nằm trong thư mục này. Chúng được gửi trực tiếp cho chị qua từng cuộc trò chuyện.

## 1. Thử nghiệm đầu – Điều 16.1 (28–30/10)
- Có hai lần thử đầu tiên:
  - Video Điều 16.1 (bóng sát gốc cây, đường xe điện) dựng lại theo phong cách flyover 3D kiểu Rolex, dọc, bỏ logo.
  - Một video khác (logo GONTA/USGA) chuyển sang 3D "vui nhộn".
- Bài học:
  - Nhân vật mô hình 3D trông giả. Từ đó quy định **chỉ dùng ảnh người thật đã tách nền** (`golfer_cut.png`).
  - Cảnh cỏ quá chi tiết đẩy bitrate lên ~35 Mbps, khiến app và điện thoại phát bị dừng. Đã xuất lại với giới hạn bitrate, level 4.1, ~30 MB.
  - Video gốc không có bản chép lời thì phụ đề là do Claude tự viết. Phải nói rõ điều này với chị.

## 2. Bộ công cụ golf-video-engine (30/10)
- Chốt phong cách: lục bảo, vàng kim, kem; serif Cormorant + Be Vietnam Pro; giờ vàng.
- Chốt kỹ thuật: three.js trong Chromium headless, render 720×1280 có MSAA, phóng lên 1080×1920.
- Hai video mẫu:
  - **Quy tắc 17 – cọc đỏ & cọc vàng** (`film_quytac17.js`, có cảnh phiếu ghi điểm). Bóng và cờ được phóng to cho dễ nhìn.
  - **Điều 16.1 – thả bóng miễn phí** (`film_dieu16-1.js`). Tỉ lệ thật; NPCR và vùng thả tính bằng code; thẻ luật 16.1 và 16.1b.
- Viết `PROJECT_INSTRUCTION.md` và nội dung ô Project instructions.

## 3. Luật 17.1d – bunker → hồ cọc vàng, giọng AI (31/10)
- Chị gửi kịch bản 60 s có lời dẫn. Claude tạo giọng AI tiếng Việt offline (piper `vi_VN-vais1000-medium` qua sherpa-onnx) và kiểm phát âm bằng ASR.
- Video: `Luat-golf-17-1d_bunker-coc-vang_3D.mp4`, 70,4 s.
  - 3 s logo bóng ở đầu, 3,6 s logo phẳng ở cuối, câu kết "Hãy follow TTGolf…" có phụ đề.
  - MD5 âm thanh trùng.
- Luật thể hiện bằng hình:
  - Phương án 1 đánh lại từ bunker thì phải **thả** bóng (không đặt), trong bunker, không gần lỗ hơn.
  - Phương án 2 thả **trên** đường thẳng, trong 1 chiều dài gậy, ngoài khu vực phạt (bờ bên kia hồ).
  - Cọc vàng không có thả ngang 2 gậy.
- Render bị ngắt 2 lần do giới hạn 2 giờ chạy nền trên đám mây, phải chạy tiếp từ khung đã có. Từ đó có `run_full.sh` chạy được nhiều lần.
- Gợi ý còn để ngỏ: đặt logo đè lên cảnh mở đầu để lời đọc bắt đầu ngay. Sau đó chị chốt: **không logo đầu** (xem bên dưới).
- Lưu `bumper.js`, `bumper.html`, `logo_cut.py` vào project.

## 4. "Chào buổi sáng ngày đầu tháng 11" – footage thật (01/11)
- Dựng từ 4 clip HDR iPhone và `am_thanh_goc.mp3` (71 s, 20 cảnh); tông bình minh; có quay chậm, tua nhanh, Ken Burns.
- Sửa theo góp ý của chị:
  - **Bỏ logo đầu và bỏ fade đen.** Khung 0 là cảnh núi, hồ sương, làm thumbnail đẹp.
  - **Mất tiếng trên iPhone:** do chép thẳng MP3 vào MP4. Đã chuyển sang AAC 256 kbps và so dạng sóng (tương quan 0,99998).
  - Thêm **ảnh cover** (`cover.py`).
- Xuất 2 bản: có và không phụ đề, mỗi bản ~103 MB. Có thể nén bản 30–40 MB để gửi Zalo.
- Công cụ lưu trong `footage-edit/`.

## 5. Cẩm nang & kịch bản giọng AI (01/11)
- Soạn **Cẩm nang luật golf – Giải cứu bóng ở thế khó** (file Word, 92 tình huống, 9 chương, căn cứ Luật Golf 2023 + Luật địa phương mẫu 2026).
  - Dữ liệu dạng máy đọc được nằm ở `golf-video-engine/kich-ban/tinh-huong.json`.
  - File Word không có trong project. Nếu cần, xin chị gửi lại.
- Viết `KICH_BAN_VOICE.md` (khung 5 cảnh, 200–245 âm tiết) cùng các công cụ `check_script.py` và `xem_kich_ban.py`. `assemble.py` được nâng cấp để đọc `gap` của từng câu.
- **Kịch bản mẫu 3.3** (cọc đỏ – 3 phương án) đang **chờ chị duyệt**.
- Câu lệnh mẫu chị có thể dùng:
  - "Viết kịch bản tình huống 4.6 theo KICH_BAN_VOICE.md, gửi bảng duyệt, chưa tạo giọng."
  - "Viết kịch bản cả chương 3 để tôi duyệt."
  - "Kịch bản 4.6 đã duyệt – tạo giọng và dựng video."

## 6. Chuyển sang Claude Code (01/11)
- Toàn bộ 34 tài liệu và mã nguồn, 3 ảnh, ô Project instructions được chuyển vào thư mục này, chép nguyên văn từng byte và đã kiểm cú pháp.
- Bổ sung:
  - `CLAUDE.md`.
  - 3 skill (`/dung-video-3d`, `/kich-ban-giong-ai`, `/dung-video-footage`) và subagent `kiem-tra-luat-golf`.
  - Logo đã tách nền `golf-video-engine/logo_ttgolf_flat.png` và `logo_ttgolf_gloss.png`, tạo lại bằng `logo_cut.py`. Ghi chú: bản logo phẳng hơi trong khi đặt trên nền tối; trên thẻ kem thì đẹp.
- Bộ nhớ (memory) của project trên claude.ai không đọc được từ phiên chuyển đổi. Nếu có ghi nhớ quan trọng, chị dán vào `CLAUDE.md`.
