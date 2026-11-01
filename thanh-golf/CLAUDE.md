# TTGolf – Studio video luật golf (project "Thanh golf")

Chuyển từ project "Thanh golf" trên claude.ai sang Claude Code ngày 01/11/2026. Bản gốc nguyên văn của ô Project instructions nằm ở `docs/project-instructions-claude-ai.md`. Các quy tắc đang áp dụng là những gì ghi trong file này.

## Người dùng & cách trả lời
- Người dùng: **chị Claire**, chủ kênh **TTGolf**. Xưng "chị", trả lời **ngắn gọn bằng tiếng Việt**.
- Khi bàn giao, báo theo 4 ý: kết quả · xác nhận âm thanh giữ nguyên · lưu ý về luật (nếu có) · một gợi ý bước tiếp theo. Không kể lại từng bước đã làm.
- Gặp quyết định không đảo ngược được hoặc chưa rõ ý chị, hỏi trước. Mọi việc khác cứ làm rồi báo.

## Mục tiêu
Sản xuất video dọc 1080×1920 giải thích luật golf. Hình là phim minh hoạ 3D sang trọng, lấy cảm hứng từ phim golf của Rolex. **Không** dùng logo, tên hay khẩu hiệu Rolex hoặc của thương hiệu khác. Kênh có ba loại việc, mỗi loại có một skill:

| Việc | Skill | Khi nào |
|---|---|---|
| Dựng lại video luật golf **có sẵn âm thanh gốc** thành phim 3D | `/dung-video-3d` | Chị gửi một video (mp4/mov) cần làm lại phần hình |
| Video theo **Cẩm nang giải cứu bóng ở thế khó** (92 tình huống, mã 1.1–9.8): viết kịch bản → soát luật → **tạo giọng AI ngay** (không chờ duyệt) → chị nghe & duyệt → phim 3D | `/kich-ban-giong-ai` | "Viết kịch bản tình huống 4.6", "4.6 đã duyệt, dựng video" |
| Dựng video từ **footage quay thật + file mp3** (ví dụ "Chào buổi sáng") | `/dung-video-footage` | Chị gửi các clip .mov và một file âm thanh |

Bước kiểm tra luật giao cho subagent **`kiem-tra-luat-golf`** để soát độc lập, không tự chấm bài của mình.

Skill và agent nằm ở `.claude/` **ở gốc repo** (cạnh thư mục `thanh-golf/`), không nằm trong `thanh-golf/.claude/`. Xem `../CLAUDE.md`.

## Quy tắc bắt buộc
1. **Giữ nguyên âm thanh và lời thoại gốc.** Chỉ làm lại phần hình. Không sửa lời thoại. Nếu nội dung gốc dễ hiểu sai, báo chị và làm rõ bằng hình hoặc nhãn.
2. **Luật phải đúng theo Rules of Golf (R&A/USGA 2023, Luật địa phương mẫu 2026).** Điểm giải tỏa, vùng thả bóng, "không gần lỗ hơn" phải **tính bằng hình học trong code**, không vẽ ước chừng (xem hằng số `CHECK` trong `film_luat17-1d.js`).
3. **Mỗi câu thoại là một cảnh.** Crossfade 0,4 s đặt vào khoảng lặng. Mỗi nhịp có kicker và tiêu đề serif. Hình mới phải khớp đúng mốc thời gian của lời đọc.
4. **Render thử 8–15 khung đại diện, gửi chị xem trước**, được duyệt mới render toàn bộ. Render toàn bộ chạy nền, tự tiếp tục nếu bị ngắt.
5. **Kiểm tra âm thanh trước khi bàn giao.** Nguồn AAC/m4a: ghép bằng `-c:a copy` rồi so MD5 (phải trùng). Nguồn MP3: xem mục Bài học.
6. **Logo TTGolf chỉ ở 3 giây cuối** (logo phẳng, trên thẻ kem viền vàng kép), kèm câu thoại giọng AI: *"Hãy follow TTGolf để biết thêm nhiều kiến thức về golf nhé"*. Chữ đưa vào giọng đọc: *"Hãy phô lô tê tê gôn, để biết thêm nhiều kiến thức về gôn nhé!"*. Có phụ đề.
7. **Mấy giây đầu không được là màn hình trắng hay thẻ trống.** Khung 0 phải là cảnh phim, dùng được làm thumbnail. Không fade từ đen ở khung đầu.
8. **Luôn kèm ảnh cover** (jpg 1080×1920): một khung đẹp đã chỉnh màu, thêm kicker vàng, tiêu đề Cormorant Garamond, gạch vàng, câu phụ. Mẫu: `footage-edit/cover.py`.

> **Lưu ý chưa thống nhất:** phần âm thanh trong `KICH_BAN_VOICE.md`, `PROJECT_INSTRUCTION.md` và `tts/` đã bỏ 3 s lặng của logo đầu (01/11/2026). Riêng `bumper.js` và các phim mẫu vẫn còn logo bóng **ở đầu** video (cách làm của video 17.1d). Quy tắc 6–7 ở trên là chỉ đạo mới hơn của chị nên được ưu tiên: không dùng logo đầu, trừ khi chị yêu cầu.

## Phong cách hình ảnh
- **Màu:** xanh lục bảo `#0B4733` / `#04281C`; vàng kim `#C9A55C` / `#E8D29A`; kem `#F6F1E6`; cọc vàng `#E4B41F`; cọc đỏ `#BC2A30`.
- **Tiêu đề:** Cormorant Garamond 500, khoảng 92px, màu kem, tâm y≈268, có gạch vàng mảnh bên dưới. Kicker phía trên: Be Vietnam Pro 500 25px, viết hoa, giãn chữ 9px, màu vàng.
- **Phụ đề:** Be Vietnam Pro 48px màu kem, nền mờ tối, tối đa 2 dòng, y≈1480–1550. Gộp các mẩu ngắn thành câu trọn ý nhưng giữ mốc thời gian.
- **Nhãn chú thích:** dạng viên thuốc nền xanh viền vàng, có đường dẫn tới điểm 3D, nằm trong vùng y 600–1360.
- **Thẻ luật:** panel lục bảo viền vàng kép với kicker "◆ ĐIỀU x ◆" và tiêu đề serif. Các ý đánh số trong vòng tròn vàng, hiện lần lượt theo lời đọc. Có nút vàng kèm dấu tick. Nền là cảnh 3D làm mờ có bụi vàng.
- **Ánh sáng:** giờ vàng, sương khí quyển (FogExp2), lớp sáng mờ (Orton ≈0,2), vignette và grain nhẹ. Nắng chiếu sáng chủ thể chính. Nhân vật được ngược sáng.
- **Phong cảnh:**
  - Cây tán lá thật, có thân và cành; xen thông và bách.
  - Trời có mây, đồi xa mờ sương.
  - Mặt nước tĩnh, phản chiếu rõ; cỏ lau ven nước.
  - Fairway có sọc cắt cỏ nhạt.
  - Cận cảnh có cỏ từng lá.
- **Đồ hoạ giải thích:** dấu chân và đường vung gậy dạng bóng mờ (đỏ = bị cản, cam = vướng chướng ngại, vàng/xanh nhạt = hợp lệ). Có vòng đánh dấu điểm, đường gạch quỹ đạo. Vùng thả bóng tô bằng shader theo đúng điều kiện luật.
- **Tỉ lệ thật (mét):** bóng 0,0214 (bán kính) · gậy 1,15 · tee 0,07 · cờ 2,13.

## Nhân vật
- Không dùng nhân vật hoạt hình hay ma-nơ-canh.
- Cần người thì dùng ảnh người thật chị cung cấp (hiện có `golf-video-engine/golfer_cut.png`, đã tách nền):
  - Tách nền bằng rembg, model `isnet-general-use` (`tach_nen_rembg.py`). Sửa alpha các chi tiết mảnh như cán gậy.
  - Đặt vào cảnh như tấm ảnh quay về camera, khung từ gối trở lên, hướng sáng khớp ảnh.
- Các động tác khác (vung gậy, cắm tee, thả bóng) thể hiện bằng đồ vật 3D và đồ hoạ bóng mờ. Cần tư thế khác thì **hỏi chị xin ảnh**.

## Kỹ thuật – `golf-video-engine/`
- three.js 0.169 chạy trong Chromium headless (Playwright). Phục vụ trang bằng `python -m http.server 8765` **trong thư mục `golf-video-engine/`**.
- **File mẫu** (video mới: sao chép file gần nhất, sửa `SUBS`, `TITLES`, `LABELS`, `CARDS`, `SHOTS` và đạo cụ):
  - `film_quytac17.js`: cọc vàng/đỏ, có cảnh phiếu ghi điểm.
  - `film_dieu16-1.js`: thả bóng miễn phí cạnh gốc cây và đường xe điện; có thẻ luật `CARDS`.
  - `film_luat17-1d.js`: dựng từ giọng AI; bunker → hồ cọc vàng; có chia đôi màn hình và hình học luật tự kiểm (`CHECK`).
  - `film_1-1.js`: tình huống 1.1, dựng từ giọng AI, không logo đầu. Gồm khu vực phát bóng tính bằng hình học (mốc tee, sâu 2 chiều dài gậy), tee gỗ 7 cm, đầu driver 3D (`makeDriver`/`poseDriver`), cú vung dạng con lắc, bộ đếm gậy, huy hiệu KHÔNG PHẠT, phiếu ghi điểm (lấy từ `film_quytac17.js`), thẻ luật. Có `window.camTest` và `window.H` để thử góc máy.
- **Render:**
  - `render.js`: `PAGE=<film>.html QS='?rs=0.6667' node render.js times t1,t2,… <thư_mục>` để render khung thử; `… range <đầu> <cuối> <thư_mục>` để render một dải khung.
  - 3D render ở 720×1280 có MSAA rồi phóng lên 1080×1920; chữ vẽ ở độ phân giải đầy đủ. 24 fps.
  - Toàn bộ video: `render_all.sh` hoặc `run_full.sh` (2 worker, chạy lại được, bỏ qua khung đã có).
- **Ghép:** `encode.sh` (libx264 veryfast, crf 20, yuv420p, faststart, ghép âm thanh và in 2 dòng MD5).
- **Logo cuối:** `bumper.html?m=outro` (`bumper.js`) dùng `logo_ttgolf_flat.png`. Logo đã tách nền sẵn; tạo lại từ `assets/logo-goc/` bằng `logo_cut.py`.
- **Hiệu năng:**
  - Vật liệu mờ dùng Lambert; cây chia ô; bóng đổ tán cây dùng khối ẩn.
  - Phản chiếu nước 300×534; cây và đồi xa đặt ở layer 1.
  - Độ sâu trường ảnh (Bokeh) chỉ bật ở cận cảnh; nền thẻ luật render một lần rồi lưu đệm.
  - Khoảng 3–5 giây mỗi khung, tức khoảng 1,5 giờ cho 60 giây video (SwiftShader). Máy có GPU thường nhanh hơn.
- **Giọng AI** (`golf-video-engine/tts/`): sherpa-onnx < 2 + piper `vi_VN-vais1000-medium`, offline. Quy trình: `check_script.py` → `make_tts.py 0.97` → `chon_ban_tot.py` (ASR chấm từng câu, tạo lại câu lệch, giữ bản khớp nhất) → `assemble.py` → `ghep_tong.py kich-ban/am-thanh/<mã>` (câu kết + loudnorm → `narration_ttgolf.m4a`, `timing.json`). Chi tiết trong `tts/README.md` và `KICH_BAN_VOICE.md`.
- **Lưu âm thanh vào git:** môi trường đám mây bị xoá sau mỗi phiên, nên âm thanh đã tạo (`narration_ttgolf.m4a`, `timing.json`, `lines.json`, `asr_report.json`) được lưu trong `golf-video-engine/kich-ban/am-thanh/<mã>/` và commit. Lúc dựng phim thì dùng lại các file này, không tạo giọng lại.

## Chạy trên máy Windows của chị
- Lệnh Bash chạy trong **Git Bash**. Trên Windows dùng `python` (hoặc `py -3`) thay cho `python3`; khi chạy các script `.sh` hay lệnh trong tài liệu có ghi `python3`, đổi lại cho phù hợp (ví dụ `PY=python`), đừng sửa file gốc chỉ vì lý do này.
- Cần có: Node.js LTS, Python 3.10+, ffmpeg, Git for Windows. Lần đầu chạy trong `golf-video-engine/`: `npm install`, `npm install playwright`, `npx playwright install chromium`. Xem `README.md`.
- `pip install --break-system-packages` chỉ dùng trên Linux. Trên Windows dùng `pip install`, nên đặt trong virtualenv `.venv`.
- Render dài nên chạy nền và theo dõi bằng log. Máy tính không bị giới hạn 2 giờ như môi trường đám mây cũ, nhưng cần tắt chế độ ngủ khi render.
- File lớn (frames, shots, mp4, model giọng) không đưa vào git (xem `.gitignore`). Video bàn giao lưu trong `xuat-ban/`.

## Bàn giao
- Tên file theo nội dung:
  - Video dựng lại: `Luat-golf-dieu-16-1_tha-bong-mien-phi_3D.mp4`.
  - Video theo cẩm nang: `Luat-golf-<mã>_<noi-dung-khong-dau>_3D.mp4`.
- Kèm ảnh cover cùng tên `.jpg` và contact sheet các khung chính.
- Trước khi gửi:
  - Xem contact sheet.
  - Kiểm tra âm thanh (MD5 hoặc so dạng sóng).
  - Kiểm tra bitrate đỉnh (xem Bài học).

## Bài học từ các video trước (đừng lặp lại)
- **MP3 → MP4:** không chép thẳng MP3 vào MP4 vì iPhone và nhiều app phát không có tiếng.
  - Cách làm: mã hoá AAC `-c:a aac -b:a 256k -ar 44100`, rồi so dạng sóng với mp3 gốc. Yêu cầu: tương quan ≥ 0,9999, lệch 0 mẫu, độ lớn bằng nhau.
  - Chỉ nguồn AAC/m4a mới dùng `-c:a copy` và so MD5.
- **Bitrate đỉnh:** cảnh cỏ chi tiết từng làm video vọt lên ~35 Mbps, khiến app và điện thoại phát bị dừng.
  - Khi xuất bản giới hạn đỉnh, ví dụ `-maxrate 12M -bufsize 24M -profile:v high -level 4.1`.
  - Kiểm tra bitrate theo từng giây trước khi gửi. Bản nhẹ để gửi Zalo: khoảng 30–40 MB.
- **Thời lượng:** giọng AI cộng logo làm video dài hơn kịch bản (17.1d: 70,4 s so với 60 s dự kiến). Ước tính bằng `check_script.py` (≈4,6 âm tiết/giây ở speed 0,97).
- **Phát âm đã kiểm bằng ASR:** gôn · băng kơ · phô lô tê tê gôn · xì trốc, en, đít tần · mười bảy chấm một đê một · sáu chấm hai bê năm · ti (tee). Các cách đọc grin, pút tơ, đờ rai vơ **chưa kiểm**, phải chạy `chon_ban_tot.py`.
- **Giọng AI có yếu tố ngẫu nhiên** (tình huống 1.1): mỗi lần tạo, cùng một câu có thể đọc hơi khác, nên `chon_ban_tot.py` tạo lại câu lệch và giữ bản khớp nhất.
  - **"ti"** đứng ngay sau "lên" hay bị nuốt ("lên ti" thành "laty"). Viết "đặt bóng lại **trên** ti" và đặt speed 0,95.
  - Cụm "không tính gậy" ASR nghe thành "không tin cậy". Viết "không tính là một gậy". Viết "nộp thẻ điểm thiếu…" thay cho "ghi thiếu" (ASR nghe thành "khi thiếu").
  - ASR hay nghe nhầm "vung" thành "vùng", "gậy" thành "cậy", "truất" thành "chuốt", "gôn" thành "gồm". Nhiều khả năng đó là do ASR nghe giọng Bắc (đổi cách viết thế nào cũng vẫn lệch), nhưng chưa nghe bằng tai để xác nhận. Câu nào còn lệch thì ghi vào báo cáo để chị nghe lại.
- **Khung đầu của phim mẫu:** cả 3 file `film_*.js` mở đầu bằng fade từ nền lục bảo (dòng `const st = sstep(0, 0.3x, t); if (st < 1) …` trong `renderFrame`), nên khung 0 là màu trơn. Bỏ dòng này ở video mới để khung 0 là cảnh phim (quy tắc 7).
- **Logo bóng** (`TTGolf_logo-bong_nen-caro.png`) có nền caro in sẵn trong ảnh, phải tách nền như ảnh chụp (`logo_cut.py`).
- **Phụ đề tự viết:** nếu video gốc không có bản chép lời, nói rõ với chị rằng phụ đề là do mình viết.

## Trạng thái (01/11/2026)
- Đã bàn giao:
  - Quy tắc 17 – cọc đỏ & cọc vàng (3D, âm thanh gốc).
  - Điều 16.1 – thả bóng miễn phí cạnh gốc cây (3D, âm thanh gốc).
  - Luật 17.1d – bunker → hồ cọc vàng (3D, giọng AI, 70,4 s).
  - "Chào buổi sáng ngày đầu tháng 11" (footage, 71 s, có/không phụ đề + cover).
- Đang chờ chị nghe và duyệt:
  - **Tình huống 1.1**: bóng rơi khỏi tee hoặc bị chạm rơi trước khi đánh (Luật 6.2b(5)–(6)). Kịch bản và giọng đã được duyệt. Phim `film_1-1.js` đang chờ chị duyệt 15 khung thử (`xem-truoc/contact-sheet_1-1.jpg`). Duyệt xong thì render toàn bộ 1516 khung + 87 khung logo cuối (`bumper.html?m=outro&img=frames_1-1/f_01515.jpg&s0=0.2&s1=3.335`).
  - **Tình huống 3.3**: cọc đỏ – 3 phương án (`kich-ban/kich-ban_3-3.md`). Mới có kịch bản, chưa tạo giọng.
- Từ 01/11/2026: **tạo giọng AI ngay sau khi viết và soát luật kịch bản**, không chờ chị duyệt. Chị nghe bản giọng rồi mới duyệt để dựng phim.
- Lịch sử chi tiết: `docs/lich-su-du-an.md`.

## Bản đồ tài liệu
- `golf-video-engine/PROJECT_INSTRUCTION.md`: hướng dẫn kỹ thuật đầy đủ.
- `golf-video-engine/KICH_BAN_VOICE.md`: viết kịch bản và giọng AI (khung 5 cảnh, ngân sách thời lượng, chuẩn hoá chữ đọc, định dạng `lines_<mã>.json`).
- `golf-video-engine/kich-ban/tinh-huong.json`: dữ liệu 92 tình huống (căn cứ luật, phương án, phạt, mẹo, sai lầm).
- `golf-video-engine/tts/README.md`: cài đặt và chạy giọng AI.
- `footage-edit/README.md`: dựng video từ footage HDR iPhone.
- `docs/project-instructions-claude-ai.md`: bản gốc ô Project instructions trên claude.ai.
- `docs/tham-khao/`: tài liệu tham khảo khác (prompt giao việc cho GitHub Copilot coding agent với repo Thanh-Golf).
