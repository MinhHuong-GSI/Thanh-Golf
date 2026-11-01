# Kịch bản & giọng đọc AI cho video tình huống luật golf

Dùng khi video **không có âm thanh gốc**: mỗi video giải thích 1 tình huống trong *Cẩm nang giải cứu bóng ở thế khó* (92 tình huống, mã 1.1 – 9.8). Kịch bản là nguồn duy nhất cho cả giọng đọc, phụ đề và storyboard 3D. Phần dựng hình theo `PROJECT_INSTRUCTION.md`.

## 1. Đầu vào
- `kich-ban/tinh-huong.json`: dữ liệu từng tình huống – `r` căn cứ luật, `o` phương án [mức phạt, nội dung], `h` cách làm đúng, `tip` mẹo tuyển thủ, `err` sai lầm & phạt, `q` [điều luật, mức phạt].
- Mẫu đã làm: `kich-ban/lines_3-3.json` + `kich-ban/kich-ban_3-3.md` (cọc đỏ – 3 phương án); video gốc của định dạng: `tts/lines_luat17-1d.json`.
- Chỉ dùng nội dung có trong dữ liệu. Ý nào chưa có hoặc chưa chắc → đối chiếu randa.org (Rules of Golf, Committee Procedures mục 8) trước khi viết.

## 2. Quy trình
1. **Đọc tình huống** theo mã; chọn 1 ý “bẫy sai lầm” từ `err`/`tip`.
2. **Viết kịch bản** theo khung 5 cảnh (mục 3) → `kich-ban/lines_<mã>.json` (mã dùng gạch ngang: 3-3, 4-10).
3. **Tự kiểm**: `python3 tts/check_script.py kich-ban/lines_<mã>.json` – hết cảnh báo, phim chính 55–64 s.
4. **Gửi duyệt**: `python3 kich-ban/xem_kich_ban.py kich-ban/lines_<mã>.json <mã> > kich-ban/kich-ban_<mã>.md`, gửi bảng cho người dùng. **Chưa tạo giọng khi chưa được duyệt.**
5. **Tạo giọng** (mục 8), nghe lại bằng ASR, sửa chữ đọc nếu sai.
6. **Ghép âm** → `narration.m4a` + `timing.json` → dựng phim theo `PROJECT_INSTRUCTION.md` (SUBS, TITLES, LABELS, CARDS, SHOTS lấy từ các trường trong lines JSON).
7. Lưu `lines_<mã>.json` và `kich-ban_<mã>.md` bản cuối vào Project (`golf-video-engine/kich-ban/`).

Có thể viết kịch bản theo lô (cả một chương) để duyệt trước, rồi tạo giọng – dựng hình từng video.

## 3. Khung kịch bản 5 cảnh (mỗi cảnh ↔ một nhịp hình, chuyển cảnh crossfade 0,4 s vào khoảng nghỉ)
| Cảnh | Thời lượng | Nội dung | Số câu |
|---|---|---|---|
| 1. Mở | 6–9 s | Tình huống bằng hình → hệ quả → **câu hỏi móc** (“Theo luật golf, bạn xử lý thế nào?”) | 2–3 |
| 2. Luật & phương án chính | 20–28 s | Câu nêu điều luật + số phương án + mức phạt. Mỗi phương án: tên + điều luật → cách làm (điểm tham chiếu → đo → vùng thả → giới hạn) → mức phạt | 5–8 |
| 3. Phương án còn lại / chi tiết then chốt | 10–14 s | Phương án cuối, hoặc bước dễ sai nhất (NPCR, “thả trên đường thẳng”…) | 2–4 |
| 4. Bẫy sai lầm | 8–10 s | “Vậy có được…?” → “Câu trả lời là không/có!” → 1 câu giải thích đúng luật | 3 |
| 5. Chốt | 5–7 s | 1 câu tóm tắt (đi cùng thẻ luật) + 1 câu khẩu hiệu ngắn | 2 |

Tình huống ngắn (1 phương án) có thể gộp cảnh 2–3 (4 cảnh). Tình huống giải tỏa miễn phí dùng huy hiệu **KHÔNG PHẠT**; bắt buộc giải tỏa dùng **BẮT BUỘC**; có phạt dùng **+1 GẬY PHẠT / +2 GẬY PHẠT**.

## 4. Ngân sách thời lượng (đo từ video 17.1d: 249 âm tiết → phim 63,9 s)
- Giọng piper vi_VN ở speed 0,97 đọc **≈ 4,6 âm tiết/giây**; tính cả khoảng nghỉ **≈ 3,9 âm tiết/giây**.
- **Phim chính 55–64 s ⇒ 200–245 âm tiết, 14–20 câu.** Cả video = 3 s logo đầu + phim + 3,6 s logo cuối ≈ 62–70 s.
- Mỗi câu 5–22 âm tiết (tối đa 28); phụ đề ≤ 90 ký tự (≤ 2 dòng khi hiển thị). Câu dài → tách thành 2 câu, nối bằng `gap` 0,12–0,2.
- `check_script.py` ước tính lệch < 1 s so với thực tế (đã đối chiếu video 17.1d).

## 5. Văn phong & độ chính xác luật
- Xưng **“bạn”**; giọng huấn luyện viên điềm tĩnh, chắc chắn; câu ngắn, chủ động, mỗi câu một ý; không cường điệu.
- Thuật ngữ thống nhất với cẩm nang: khu vực phạt, bẫy cát, khu vực chung, vùng thả bóng, chiều dài gậy, điểm tham chiếu, điểm giải tỏa hoàn toàn gần nhất, đánh lại từ vị trí cũ, lùi trên đường thẳng, thả bên, bóng dự phòng, ngoài biên. Dùng **“giải tỏa”** nhất quán trong một video.
- Thuật ngữ tiếng Anh quen thuộc (bunker, fairway, green, putter, Stroke and Distance) được dùng trong phụ đề, nhưng **trường `tts` phải phiên âm** (mục 6). Mỗi video tối đa 1 cụm tiếng Anh dài.
- Phụ đề ghi điều luật dạng **“Luật 17.1d(3)”**; kicker “Phương án 1 · Luật 17.1d(1)”; thẻ luật “◆ ĐIỀU 17.1d ◆”.
- **Mỗi phương án phải nói rõ mức phạt.** Mô tả vùng thả luôn đủ: điểm tham chiếu, 1 hay 2 chiều dài gậy, “không gần lỗ hơn”, giới hạn khu vực (ví dụ “ngoài khu vực phạt”, “trong bẫy cát”).
- Lùi trên đường thẳng (từ 2023): bóng **thả ngay trên đường thẳng**, dừng trong 1 chiều dài gậy quanh điểm chạm đất.
- Luật địa phương mẫu (E-5, F-5, B-2, E-3…): luôn nói “nếu Ban tổ chức áp dụng…”, không trình bày như luật chung.
- Không đưa con số, ví dụ, tên tuyển thủ chưa kiểm chứng. Mẹo kỹ thuật (không phải luật) phải nói là “kinh nghiệm”.

## 6. Chuẩn hoá chữ đọc (`tts`)
Đã dùng và kiểm bằng ASR ở các video trước: golf → **gôn**; bunker → **băng kơ**; Stroke and Distance → **xì trốc, en, đít tần** (speed 0,98); 17.1d(1) → **mười bảy chấm một đê một**; follow TTGolf → **phô lô tê tê gôn**; rough → **ráp**; fairway → **phe uây**.

Quy tắc chung (kiểm lại bằng `asr_check.py` khi tạo giọng):
| Loại | Cách viết trong `tts` |
|---|---|
| Số điều luật | 16.1b → mười sáu chấm một bê · 14.3c(2) → mười bốn chấm ba xê hai · 6.2b(5) → sáu chấm hai bê năm |
| Chữ cái | a → a · b → bê · c → xê · d → đê · e → e · f → ép |
| Luật địa phương | LĐP mẫu E-5 → luật địa phương mẫu e năm · F-23 → ép hai mươi ba |
| Số & phạt | 2 chiều dài gậy → hai chiều dài gậy · +1 gậy → một gậy phạt · 3 phút → ba phút · 10 giây → mười giây · 95% → chín mươi lăm phần trăm |
| Từ tiếng Anh | green → grin · tee → ti · putter → pút tơ · driver → đờ rai vơ · caddie → ca đi · drop → thả bóng · OB → ngoài biên · GUR → khu vực đang sửa chữa · provisional → bóng dự phòng |
| Nhịp đọc | Thêm dấu phẩy ở chỗ cần ngắt hơi; dấu hai chấm trong phụ đề → dấu phẩy trong `tts` |

`tts` không được còn chữ số, ký hiệu `()%/+`, chữ viết tắt in hoa hay từ tiếng Anh – `check_script.py` sẽ báo.

## 7. Định dạng `lines_<mã>.json`
Mảng các câu theo thứ tự đọc (make_tts.py chỉ đọc `tts`, `speed`; assemble.py đọc `scene`, `gap`; các trường hình ảnh dùng khi dựng phim):
| Trường | Bắt buộc | Ý nghĩa |
|---|---|---|
| `scene` | ✓ | Số cảnh 1–5 |
| `sub` | ✓ | Phụ đề, giữ nguyên lời thoại, chính tả chuẩn |
| `tts` | ✓ | Chữ cho giọng AI đọc (đã chuẩn hoá mục 6) |
| `speed` |  | Hệ số tốc độ câu: 1,0 mặc định; **1,03** cho câu hỏi, câu “Câu trả lời là…”, cảnh 4–5; 0,98 cho câu có từ phiên âm |
| `gap` |  | Nghỉ sau câu (s). Mặc định 0,42 trong cảnh, 0,9 khi sang cảnh; 0,12–0,2 khi câu sau nối tiếp ý |
| `title` |  | Tiêu đề nhịp mới: `{"k": kicker, "t": "tiêu đề" hoặc ["dòng 1","dòng 2"], "sub": phụ đề nghiêng}` – tiêu đề ≤ 22 ký tự/dòng |
| `label` |  | Nhãn viên thuốc gắn vào điểm 3D, ≤ 28 ký tự, tối đa 2 nhãn cùng lúc |
| `fx` |  | Đồ hoạ giải thích: vùng thả, đường gạch, dấu chân/đường vung (đỏ = bị cản, cam = vướng, vàng/xanh nhạt = hợp lệ), huy hiệu phạt |
| `card` |  | Thẻ luật: `{"k": "◆ ĐIỀU x ◆", "t": [...], "items": [≤ 4 ý, ≤ 34 ký tự]}` – ý hiện lần lượt theo lời đọc |
| `shot` | ✓ | Máy quay & hành động: flycam/cận cảnh, cái gì chuyển động. Ưu tiên đạo cụ 3D + đồ hoạ; ảnh golfer chỉ cho cảnh phản ứng (ngược sáng, từ gối trở lên) |

Ví dụ một câu:
```json
{"scene": 3, "sub": "Từ điểm cắt mép, đo hai chiều dài gậy bằng cây gậy dài nhất, trừ putter.",
 "tts": "Từ điểm cắt mép, đo hai chiều dài gậy bằng cây gậy dài nhất, trừ pút tơ.",
 "shot": "Gậy dài nhất đặt hai lần từ X, vòng 2 gậy mở ra.",
 "fx": ["Gậy đo x2", "Vòng bán kính 2 chiều dài gậy"], "label": ["2 chiều dài gậy"]}
```

## 8. Tạo giọng & ghép âm (thư mục `tts/`, xem `tts/README.md`)
```bash
cp ../kich-ban/lines_<mã>.json lines.json
python3 make_tts.py 0.97          # từng câu → wav/, durs.json
python3 asr_check.py              # nghe lại bằng nhận dạng giọng nói; sửa tts nếu đọc sai rồi chạy lại
python3 assemble.py               # ghép + khoảng nghỉ (gap) → narration_raw.wav, timing.json
```
Câu kết đọc riêng cho logo cuối: `tts` = “Hãy phô lô tê tê gôn, để biết thêm nhiều kiến thức về gôn nhé!”, speed 0,97 × 1,03, bắt đầu 0,2 s sau khi vào logo cuối. Âm thanh tổng = 3 s im lặng (logo đầu) + lời đọc phim + câu kết → `loudnorm` → `narration_ttgolf.m4a` (âm thanh gốc cho `encode.sh`, so MD5).

## 9. Kiểm tra trước khi gửi duyệt
- [ ] Đúng điều luật, đúng mức phạt từng phương án; khớp `tinh-huong.json`.
- [ ] Vùng thả mô tả đủ: điểm tham chiếu, 1/2 chiều dài gậy, không gần lỗ hơn, giới hạn khu vực.
- [ ] Có câu hỏi móc ở cảnh 1 và bẫy sai lầm ở cảnh 4.
- [ ] `check_script.py` không cảnh báo; phim chính 55–64 s.
- [ ] Mỗi câu có `shot`; mỗi nhịp mới có `title`; cảnh 5 có `card`.
- [ ] Luật địa phương được nói rõ “nếu Ban tổ chức áp dụng”.

## 10. Đặt tên
- Kịch bản: `kich-ban/lines_3-3.json`, `kich-ban/kich-ban_3-3.md`.
- Video: `Luat-golf-<mã>_<noi-dung-khong-dau>_3D.mp4`, ví dụ `Luat-golf-3-3_khu-vuc-phat-do-3-phuong-an_3D.mp4`.
