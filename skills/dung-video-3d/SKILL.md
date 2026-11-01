---
name: dung-video-3d
description: Dựng lại một video luật golf có sẵn âm thanh gốc thành phim minh hoạ 3D sang trọng (1080×1920), giữ nguyên âm thanh. Dùng khi chị Claire gửi video mp4/mov cần làm lại phần hình theo phong cách TTGolf.
argument-hint: "[đường dẫn video gốc]"
---

# Dựng lại video luật golf bằng phim 3D – giữ nguyên âm thanh

Video gốc: $ARGUMENTS

Đọc trước: `CLAUDE.md` (quy tắc và phong cách), `golf-video-engine/PROJECT_INSTRUCTION.md`. Lập danh sách việc (task list) theo các bước dưới đây. Bước cuối là kiểm tra.

## 1. Phân tích video gốc
- `ffprobe` để xem thời lượng, fps, codec âm thanh (AAC hay MP3) và kích thước.
- **Trích phụ đề có mốc thời gian:**
  - Cắt vùng phụ đề ở 10 khung/giây và phát hiện chỗ chữ đổi để có t0/t1 từng câu. Đọc chữ bằng cách xem các khung đã cắt.
  - Nếu không có phụ đề, dùng ASR (sherpa-onnx zipformer-vi, xem `golf-video-engine/tts/asr_check.py`) để lấy mốc. Khi đó báo chị rằng phụ đề là do mình viết.
- Xuất khung ở 2 khung/giây kèm contact sheet. Đọc thẻ luật, tiêu đề, nhịp cảnh; tìm logo hay thương hiệu cần bỏ.
- Đo khoảng lặng bằng `silencedetect` để đặt điểm chuyển cảnh.

## 2. Kiểm tra luật
- Giao subagent `kiem-tra-luat-golf` soát lời thoại và chữ trên màn hình theo Rules of Golf. Đưa cho nó nguyên văn lời thoại và các thẻ luật, không đưa kết luận của mình.
- **Không sửa lời thoại.** Chỗ nào dễ hiểu sai thì ghi lại để báo chị và làm rõ bằng hình hoặc nhãn.
- Hình học (điểm giải tỏa, NPCR, vùng thả, "không gần lỗ hơn", điểm cắt mép) phải tính trong code và tự kiểm bằng log `CHECK`, giống `film_luat17-1d.js`.

## 3. Storyboard
- Mỗi câu thoại là một cảnh: máy quay, hành động, nhãn, đồ hoạ.
- Crossfade 0,4 s đặt vào khoảng lặng. Mỗi nhịp có kicker và tiêu đề serif. Câu nêu điều luật đi với thẻ luật (`CARDS`).
- Khung 0 phải là cảnh phim, không phải màn trắng hay thẻ trống. Các file mẫu đang có dòng fade từ nền lục bảo ở đầu `renderFrame`: `const st = sstep(0, 0.3x, t); if (st < 1) {…}`. Dòng này làm khung 0 thành nền xanh trơn, nên **bỏ dòng đó** khi sao chép mẫu.
- Chọn file mẫu gần nhất, sao chép thành `film_<ten>.js` và `.html`:
  - `film_quytac17.js`: cọc vàng/đỏ.
  - `film_dieu16-1.js`: giải tỏa miễn phí.
  - `film_luat17-1d.js`: khu vực phạt, chia đôi màn hình.
- Sửa `SUBS`, `TITLES`, `LABELS`, `CARDS`, `SHOTS`, đạo cụ và `DUR`. Mốc thời gian phải khớp kết quả bước 1.

## 4. Render thử – chờ chị duyệt
- Chạy server trong `golf-video-engine/`: `python -m http.server 8765` (chạy nền).
- Render 8–15 khung đại diện: `PAGE=film_<ten>.html QS='?rs=0.6667' node render.js times 0.5,3.2,… preview_<ten>`.
- Tự xem từng khung: luật, chữ không đè nhau, nhãn trong vùng y 600–1360, ánh sáng, không có logo lạ.
- Ghép contact sheet và **gửi chị xem**. **Chưa được duyệt thì chưa render toàn bộ.**

## 5. Render toàn bộ
- Số khung = round(thời lượng × 24).
- Chạy nền: `./render_all.sh film_<ten>.html <N> frames_<ten>`, hoặc sửa `run_full.sh` để chạy 2 worker. Script tự bỏ qua khung đã có nên ngắt rồi chạy lại vẫn tiếp tục được.
- Theo dõi `render*.log`. Có `PAGEERR` thì dừng lại sửa.

## 6. Logo cuối + câu kết giọng AI
- Thêm 3 s logo phẳng TTGolf ở cuối: `bumper.html?m=outro&img=frames_<ten>/f_<khung_cuối>.jpg`, render 24 fps.
- Câu kết: tạo giọng *"Hãy phô lô tê tê gôn, để biết thêm nhiều kiến thức về gôn nhé!"* bằng piper `vi_VN-vais1000-medium`, speed 0,97 × 1,03. Phụ đề: "Hãy follow TTGolf để biết thêm\nnhiều kiến thức về golf nhé".
- **Âm thanh:** giữ nguyên âm thanh gốc trong phần phim. Âm thanh tổng là âm thanh gốc nối thêm câu kết. Lưu lại bản âm thanh tổng để làm mốc so sánh.
  - Phần âm thanh gốc phải kiểm được là còn nguyên: so MD5 của luồng âm thanh gốc với đoạn tương ứng, hoặc so dạng sóng (tương quan ≥ 0,9999, lệch 0 mẫu).
  - Ghi rõ cách đã kiểm trong báo cáo.

## 7. Ghép & kiểm tra
- `encode.sh <frames> <âm_thanh> <file.mp4>`.
  - Nguồn AAC: `-c:a copy`, hai dòng MD5 phải trùng.
  - Nguồn MP3: mã hoá AAC 256k 44,1 kHz rồi so dạng sóng (xem CLAUDE.md, mục Bài học).
- Giới hạn bitrate đỉnh (`-maxrate 12M -bufsize 24M -level 4.1`) và kiểm tra bitrate theo từng giây.
- Xem contact sheet toàn video. Giải mã trọn file không lỗi (`ffmpeg -v error -i out.mp4 -f null -`).
- Tạo ảnh cover `.jpg` (mẫu `footage-edit/cover.py`): khung đẹp + kicker + tiêu đề + gạch vàng.

## 8. Bàn giao
- Đặt tên theo mẫu `Luat-golf-dieu-16-1_tha-bong-mien-phi_3D.mp4`, lưu vào `xuat-ban/` cùng ảnh cover.
- Trả lời ngắn bằng tiếng Việt:
  - Kết quả (thời lượng, file).
  - Xác nhận âm thanh giữ nguyên và đã kiểm bằng cách nào.
  - Lưu ý luật.
  - Một gợi ý bước tiếp theo.
- Nếu làm thêm được công cụ dùng lại cho video sau, lưu vào `golf-video-engine/` và cập nhật `CLAUDE.md` (Trạng thái, Bài học).
