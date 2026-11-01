# Project instruction – Dựng lại video luật golf (phong cách sang trọng, minh hoạ 3D)

## Mục tiêu
Dựng lại video giải thích luật golf (khổ dọc 9:16, 1080×1920) thành phim minh hoạ 3D phong cách sang trọng, lấy cảm hứng từ phim golf của Rolex. Giữ nguyên âm thanh gốc và nội dung, chỉ làm lại phần hình. Không dùng logo, tên hay khẩu hiệu Rolex hoặc của thương hiệu khác.

## Quy trình bắt buộc
1. **Phân tích video gốc.** Dùng ffprobe xem thời lượng và thông số. Trích phụ đề bằng cách cắt vùng phụ đề ở 10 khung/giây và phát hiện chỗ đổi chữ để có mốc thời gian từng câu. Đọc nội dung thẻ luật, tiêu đề và nhịp cảnh từ khung hình ở 2 khung/giây. Hình mới phải giữ đúng các mốc thời gian này để khớp giọng đọc.
2. **Kiểm tra luật.** Đối chiếu với Rules of Golf. Không sửa lời thoại, nhưng nếu nội dung gốc dễ gây hiểu sai thì báo người dùng và làm rõ bằng hình hoặc nhãn chú thích. Hình học minh hoạ (điểm giải tỏa, vùng thả bóng, không gần hố hơn…) phải tính đúng luật, không vẽ ước chừng.
3. **Storyboard.** Mỗi câu thoại ứng với một cảnh. Chuyển cảnh bằng crossfade 0,4 giây đặt vào khoảng lặng. Mỗi nhịp có tiêu đề nhỏ gồm kicker và tiêu đề serif.
4. **Thử trước.** Render 8–15 khung đại diện và xem bằng contact sheet. Gửi người dùng ảnh xem trước rồi mới render toàn bộ.
5. **Render toàn bộ** chạy nền, có script tự tiếp tục nếu bị ngắt, theo dõi tiến độ.
6. **Đóng gói và kiểm tra.** Ghép âm thanh gốc bằng `-c:a copy`, so MD5 âm thanh gốc và mới (phải trùng), xem contact sheet khung hình chính. Gửi file MP4 kèm báo cáo ngắn: âm thanh đã xác minh, các lưu ý về luật.

## Video không có âm thanh gốc – kịch bản + giọng AI
Dùng cho loạt video theo *Cẩm nang giải cứu bóng ở thế khó* (92 tình huống, mã 1.1–9.8). Chi tiết: `KICH_BAN_VOICE.md`.
- **Dữ liệu:** `kich-ban/tinh-huong.json` (căn cứ luật, phương án, mức phạt, sai lầm hay gặp). Mẫu: `kich-ban/lines_3-3.json`, `kich-ban/kich-ban_3-3.md`.
- **Kịch bản:** 5 cảnh – Mở (câu hỏi móc) → Luật & phương án chính → Phương án còn lại / chi tiết then chốt → Bẫy sai lầm (“Câu trả lời là…”) → Chốt (thẻ luật + khẩu hiệu). 14–20 câu, 200–245 âm tiết, phim chính 55–64 s. Mỗi phương án nói rõ mức phạt; vùng thả nói đủ điểm tham chiếu, chiều dài gậy, không gần lỗ hơn.
- **File kịch bản** `kich-ban/lines_<mã>.json`: `scene`, `sub`, `tts` (chữ đọc đã chuẩn hoá: số điều luật viết thành chữ, golf → gôn, bunker → băng kơ…), `speed`, `gap`, và các trường hình `title`, `label`, `fx`, `card`, `shot`.
- **Trình tự:** `tts/check_script.py` → xuất bảng duyệt `kich-ban/xem_kich_ban.py` → **người dùng duyệt** → `make_tts.py 0.97` → `asr_check.py` → `assemble.py` → `timing.json` làm mốc dựng phim (thay cho bước 1 ở trên). Âm thanh tổng (3 s im lặng logo đầu + lời đọc + câu kết) là “âm thanh gốc” cho bước 6.
- **Logo & câu kết:** 3 s logo TTGolf bản bóng ở đầu, 3,6 s logo phẳng ở cuối (`bumper.js`), câu kết “Hãy follow TTGolf để biết thêm nhiều kiến thức về golf nhé” (`tts`: “Hãy phô lô tê tê gôn, để biết thêm nhiều kiến thức về gôn nhé!”) có phụ đề.

## Phong cách hình ảnh
- **Màu:** xanh lục bảo #0B4733 / #04281C, vàng kim #C9A55C / #E8D29A, kem #F6F1E6. Cọc vàng #E4B41F, cọc đỏ #BC2A30.
- **Chữ:**
  - Tiêu đề dùng Cormorant Garamond 500, khoảng 92px, màu kem, tâm ở y≈268, có gạch vàng mảnh bên dưới. Kicker phía trên dùng Be Vietnam Pro 500 25px, viết hoa, giãn chữ 9px, màu vàng.
  - Phụ đề dùng Be Vietnam Pro 400 48px màu kem, nền mờ tối phía sau, tối đa 2 dòng, đặt ở y≈1480–1550. Gộp các mẩu phụ đề ngắn thành câu trọn ý nhưng giữ mốc thời gian.
  - Nhãn chú thích là dạng viên thuốc nền xanh viền vàng, có đường dẫn tới điểm 3D, nằm trong vùng y 600–1360 để không đè tiêu đề hay phụ đề.
- **Thẻ luật:** panel xanh lục bảo viền vàng kép. Gồm kicker "◆ ĐIỀU x ◆", tiêu đề serif 2 dòng, các ý đánh số trong vòng tròn vàng hiện lần lượt theo lời đọc, nút vàng có dấu tick. Nền là cảnh 3D làm mờ có bụi vàng bay nhẹ.
- **Ánh sáng và khí quyển:** giờ vàng, sương khí quyển (FogExp2), lớp sáng mờ (Orton) khoảng 0,2, vignette nhẹ và grain. Chọn hướng nắng sao cho chủ thể chính được chiếu sáng, không nằm trong bóng râm. Nhân vật nên được ngược sáng.
- **Phong cảnh tự nhiên:**
  - Cây tán lá thật dựng từ nhiều tấm lá quay về camera, có thân và cành, xen lẫn thông và bách. Dùng cây sồi lớn có vỏ nứt sâu và rễ thon khi cần cận cảnh.
  - Bầu trời có mây, dãy đồi xa mờ sương.
  - Mặt nước tĩnh, phản chiếu rõ cây và trời. Ven nước có cụm cỏ lau.
  - Fairway có vệt cắt cỏ nhạt, vùng cỏ dày có mảng xanh đậm và úa vàng.
  - Cận cảnh dùng cỏ từng lá: pháp tuyến hướng lên, hai mặt, trên tee box thì mảnh và ngắn.
- **Đồ hoạ giải thích:** dấu chân và đường vung gậy dạng bóng mờ vẽ 2D chiếu từ vị trí 3D. Màu đỏ là bị cản, cam là vướng chướng ngại, vàng hoặc xanh nhạt là hợp lệ. Có vòng đánh dấu điểm và đường gạch quỹ đạo. Vùng thả bóng tô bằng shader theo đúng điều kiện luật.
- **Tỉ lệ:** dùng tỉ lệ thật (mét): bóng 0,0214 m, gậy 1,15 m, tee 0,07 m, cờ 2,13 m. Video cũ (Quy tắc 17) có phóng to bóng và cờ cho dễ nhìn.

## Nhân vật
- Không dùng nhân vật hoạt hình hay ma-nơ-canh.
- Nếu cần người, dùng ảnh người chân thực do người dùng cung cấp:
  - Tách nền bằng rembg với model isnet-general-use. Sửa alpha các chi tiết mảnh như cán gậy và cắt bỏ thanh tiến trình hay vật thừa.
  - Đặt ảnh làm tấm quay về camera trong cảnh 3D, khung từ gối trở lên, hướng sáng khớp với ảnh.
- Các động tác khác (vung gậy, cắm tee, thả bóng) thể hiện bằng đồ vật 3D và đồ hoạ bóng mờ. Nếu cần thêm tư thế, hỏi xin người dùng ảnh.

## Kỹ thuật (bộ công cụ trong golf-video-engine.zip)
- **Nền tảng:** three.js 0.169 chạy trong Chromium headless (Playwright, WebGL phần mềm SwiftShader). Cài bằng `npm install` theo package.json, chạy `python3 -m http.server 8765` trong thư mục gói.
- **File mẫu:** `film_quytac17.js` cho video cọc vàng/đỏ, `film_dieu16-1.js` cho video thả bóng miễn phí, `film_luat17-1d.js` cho video dựng từ giọng AI (có logo đầu/cuối). Video mới nên sao chép file gần nhất rồi sửa các mảng SUBS, TITLES, LABELS, CARDS, SHOTS và các đạo cụ.
- **Render và ghép:**
  - Khung chính: `render.js` (biến PAGE, QS='?rs=0.6667', 24 fps). Toàn bộ video: `render_all.sh`. Ghép âm thanh và kiểm tra MD5: `encode.sh`.
  - Phần 3D render ở 720×1280 có khử răng cưa MSAA rồi phóng lên 1080×1920. Chữ và đồ hoạ vẽ ở độ phân giải đầy đủ.
  - Encode: libx264, preset veryfast, crf 20, yuv420p, faststart.
- **Hiệu năng:**
  - Vật liệu mờ dùng MeshLambertMaterial.
  - Cây chia ô để bỏ qua phần ngoài khung hình. Bóng đổ của tán cây dùng khối ẩn đơn giản.
  - Phản chiếu nước render ở 300×534. Cây xa và đồi xa đặt ở layer 1 để không vào phản chiếu.
  - Độ sâu trường ảnh (BokehPass) chỉ bật ở cận cảnh. Nền thẻ luật render một lần rồi lưu đệm.
  - Tốc độ khoảng 3–5 giây mỗi khung, tức khoảng 1,5 giờ cho 60 giây video.

## Bàn giao
- Tên file theo nội dung, ví dụ `Luat-golf-dieu-16-1_tha-bong-mien-phi_3D.mp4`; video theo cẩm nang: `Luat-golf-<mã>_<noi-dung>_3D.mp4`.
- Trả lời ngắn gọn bằng tiếng Việt: kết quả, xác nhận âm thanh giữ nguyên, lưu ý về luật nếu có, một gợi ý bước tiếp theo.
