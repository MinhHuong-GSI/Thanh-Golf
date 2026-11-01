# Dựng video từ footage thật (HDR iPhone) + âm thanh có sẵn – tông bình minh

Dùng cho video kiểu "Chào buổi sáng" quay sân golf (không phải phim 3D luật golf).
Ví dụ đã làm: Chao-buoi-sang-thang-11_binh-minh-san-golf_TTGolf.mp4 (71 s, 20 cảnh).

1. Proxy SDR 540×960 để xem: zscale HLG→linear, tonemap, contact sheet theo giây.
2. Chép lời mp3 bằng sherpa-onnx zipformer-vi (tts/asr_check.py) → mốc từng chữ → đặt điểm cắt vào khoảng lặng.
3. edl.py: mỗi câu/cụm câu một cảnh: clip, giây nguồn, tốc độ (0,38–0,65 = quay chậm; nút [(t,v)…] = tua nhanh rồi chậm dần), zoom z0→z1 (1,0–1,2), cy/cx, mood (warm/cool/leak). `python3 edl.py` kiểm tra nguồn đủ dài.
4. grade.py: màu (bake thành LUT .cube cho từng clip, cân trắng riêng clip lạnh) + hoàn thiện không gian (ánh nắng góc phải trên, bloom, vignette, grain).
5. stage1.py: giải mã 4K HLG ở 1296×2304 → tonemap reinhard 0.6 → LUT → xoay → đổi tốc độ (trộn khung) → Ken Burns → shots/*.mp4 (resume được). ~6 phút/70 s.
6. stage2.py: crossfade 0,6 s, mood, light leak ở điểm chuyển ý, không logo đầu, khung 0 là cảnh luôn (không fade đen); thẻ kem viền vàng + logo phẳng ở 3 s cuối, phụ đề Be Vietnam Pro 48 (subs.py, '|' = xuống dòng). `preview t1 t2…` để xem khung, `full` ra 2 bản (có/không phụ đề). ~8 phút.
7. Ghép âm thanh: KHÔNG chép thẳng MP3 vào MP4 (iPhone và nhiều app phát không có tiếng). Mã hoá AAC: -c:a aac -b:a 256k -ar 44100, rồi so dạng sóng với mp3 gốc (tương quan ≥ 0,9999, lệch 0 mẫu, độ lớn bằng nhau). Nếu nguồn là AAC/m4a thì mới -c:a copy và so MD5.
8. Ảnh cover: cover.py <giây> <file.jpg> – khung đã chỉnh màu + kicker vàng, tiêu đề Cormorant, gạch vàng, câu phụ.
