<!-- Bản sao nguyên văn ô "Project instructions" của project "Thanh golf" trên claude.ai (lấy ngày 01/11/2026). Không sửa file này; quy tắc đang áp dụng nằm trong CLAUDE.md. -->

# Dựng lại video luật golf – phong cách sang trọng, minh hoạ 3D

MỤC TIÊU
Dựng lại video luật golf khổ dọc 1080×1920 thành phim minh hoạ 3D sang trọng, lấy cảm hứng từ phim golf của Rolex. GIỮ NGUYÊN âm thanh gốc và nội dung, chỉ làm lại phần hình. Không dùng logo, tên hay khẩu hiệu Rolex hoặc thương hiệu khác.

QUY TRÌNH
1. Phân tích video gốc: ffprobe; trích phụ đề (cắt vùng phụ đề ở 10 khung/giây, phát hiện chỗ đổi chữ) để có mốc thời gian từng câu; đọc thẻ luật, tiêu đề, nhịp cảnh. Hình mới phải khớp đúng các mốc này.
2. Kiểm tra luật theo Rules of Golf. Không sửa lời thoại; nếu nội dung gốc dễ hiểu sai thì báo tôi và làm rõ bằng hình hoặc nhãn. Điểm giải tỏa, vùng thả bóng, "không gần hố hơn" phải tính đúng luật.
3. Storyboard: mỗi câu thoại một cảnh; crossfade 0,4 giây đặt vào khoảng lặng; mỗi nhịp có kicker và tiêu đề serif.
4. Render thử 8–15 khung đại diện, gửi tôi ảnh xem trước rồi mới render toàn bộ (chạy nền, tự tiếp tục nếu bị ngắt).
5. Ghép âm thanh gốc bằng -c:a copy, so MD5 âm thanh (phải trùng), xem contact sheet, rồi gửi MP4 kèm báo cáo ngắn.
6. Sử dụng logo TTgolf (theo 2 ảnh ở trong project files) cho 3 giây cuối của video.
7. Thêm đoạn thoại (voice) vào cuối video, nội dung "Hãy follow TTGolf để biết thêm nhiều kiến thức về golf nhé" (sử dụng giọng AI tương ứng)
8. Tạo ảnh cover cho video, tránh để mấy giây đầu của video là ảnh trắng.

PHONG CÁCH
- Màu: xanh lục bảo #0B4733/#04281C, vàng kim #C9A55C/#E8D29A, kem #F6F1E6; cọc vàng #E4B41F, cọc đỏ #BC2A30.
- Tiêu đề: Cormorant Garamond 500 ~92px màu kem (y≈268), gạch vàng mảnh bên dưới; kicker phía trên Be Vietnam Pro 500 25px viết hoa, giãn 9px, màu vàng.
- Phụ đề: Be Vietnam Pro 48px màu kem, nền mờ tối, tối đa 2 dòng, y≈1480–1550; gộp thành câu trọn ý, giữ mốc thời gian.
- Nhãn chú thích: dạng viên thuốc nền xanh viền vàng, đặt trong vùng y 600–1360.
- Thẻ luật: panel lục bảo viền vàng kép, "◆ ĐIỀU x ◆", tiêu đề serif, ý đánh số trong vòng tròn vàng hiện lần lượt theo lời đọc, nút vàng có dấu tick; nền là cảnh 3D làm mờ có bụi vàng.
- Ánh sáng: giờ vàng, sương khí quyển, lớp sáng mờ mềm, vignette và grain nhẹ. Hướng nắng chiếu sáng chủ thể chính; nhân vật ngược sáng.
- Phong cảnh tự nhiên: cây tán lá thật có thân và cành; bầu trời có mây; đồi xa mờ sương; mặt nước tĩnh phản chiếu rõ; cỏ lau ven nước; fairway sọc cắt cỏ nhạt; cận cảnh có cỏ từng lá.
- Đồ hoạ giải thích: dấu chân và đường vung gậy dạng bóng mờ (đỏ = bị cản, cam = vướng chướng ngại, vàng/xanh nhạt = hợp lệ), vòng đánh dấu, đường gạch quỹ đạo, vùng thả bóng tô theo đúng luật.
- Tỉ lệ thật: bóng 0,0214 m, gậy 1,15 m, tee 0,07 m, cờ 2,13 m.

NHÂN VẬT
Không dùng nhân vật hoạt hình hay ma-nơ-canh. Nếu cần người: dùng ảnh người chân thực tôi cung cấp, tách nền (rembg, model isnet-general-use), sửa chi tiết mảnh như cán gậy, đặt vào cảnh 3D như tấm ảnh quay về camera (khung từ gối trở lên, hướng sáng khớp ảnh). Các động tác khác thể hiện bằng đồ vật 3D và đồ hoạ bóng mờ; cần tư thế khác thì hỏi tôi xin ảnh.

KỸ THUẬT (dùng gói golf-video-engine.zip trong Project files)
- three.js 0.169 trong Chromium headless (Playwright). Cài bằng npm install theo package.json; chạy python3 -m http.server 8765 trong thư mục gói.
- Mẫu sẵn: film_quytac17.js (cọc vàng/đỏ), film_dieu16-1.js (thả bóng miễn phí). Video mới: sao chép file gần nhất, sửa SUBS, TITLES, LABELS, CARDS, SHOTS và đạo cụ.
- render.js (QS='?rs=0.6667', 24 fps): 3D ở 720×1280 có MSAA rồi phóng lên 1080×1920; chữ vẽ ở độ phân giải đầy đủ. render_all.sh để render toàn bộ; encode.sh để ghép âm thanh và kiểm tra MD5 (libx264 veryfast, crf 20).
- Hiệu năng: vật liệu mờ dùng Lambert; cây chia ô; bóng tán cây dùng khối ẩn; phản chiếu nước 300×534; độ sâu trường ảnh chỉ ở cận cảnh. Khoảng 1,5 giờ cho 60 giây video.

BÀN GIAO
Tên file theo nội dung (vd. Luat-golf-dieu-16-1_tha-bong-mien-phi_3D.mp4). Trả lời ngắn bằng tiếng Việt: kết quả, xác nhận âm thanh giữ nguyên, lưu ý luật nếu có, một gợi ý bước tiếp theo.
