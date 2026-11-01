# Kiểm tra kịch bản trước khi tạo giọng: chữ đọc (tts), độ dài câu, ước tính thời lượng từng cảnh.
# Dùng: python3 check_script.py ../kich-ban/lines_3-3.json [tốc_độ=0.97]
# Tốc độ đọc đo từ video 17.1d: ~4,6 âm tiết/giây khi đọc ở speed 0.97 (chưa tính khoảng nghỉ).
import json, re, sys

RATE_097 = 4.6                    # âm tiết / giây ở speed 0.97
LEAD, TAIL = 0.6, 1.8             # giống assemble.py
GAP_IN, GAP_SCENE = 0.42, 0.9     # nghỉ mặc định trong cảnh / khi sang cảnh mới
FILM_MIN, FILM_MAX = 45, 64       # thời lượng phim chính (chưa gồm 3 s logo đầu + 3,6 s logo cuối)
EN_WORDS = r"\b(golf|bunker|green|fairway|rough|tee|putter|driver|caddie|drop|follow|stroke|distance|provisional|relief|lateral|line|back|out|bounds|penalty|ttgolf)\b"

def syllables(s):
    return len(re.findall(r"[^\s,.;:!?…()\"“”'–-]+", s))

def main():
    path = sys.argv[1]; speed = float(sys.argv[2]) if len(sys.argv) > 2 else 0.97
    L = json.load(open(path, encoding="utf-8"))
    warn, t, scene_t = [], LEAD, {}
    print(f"{'#':>2} {'cảnh':>4} {'âm tiết':>7} {'giây':>5} {'bắt đầu':>7}  lời đọc")
    for i, ln in enumerate(L):
        tts, sub = ln.get("tts", ""), ln.get("sub", "")
        n = syllables(tts); sp = speed * ln.get("speed", 1.0)
        d = n / (RATE_097 * sp / 0.97)
        scene_t.setdefault(ln["scene"], [t, t])
        print(f"{i:>2} {ln['scene']:>4} {n:>7} {d:>5.1f} {t:>7.1f}  {tts[:70]}")
        t += d; scene_t[ln["scene"]][1] = t
        last = i == len(L) - 1
        gap = ln.get("gap", 0 if last else (GAP_SCENE if L[i + 1]["scene"] != ln["scene"] else GAP_IN))
        t += TAIL if last else gap
        # kiểm tra chữ đọc
        if re.search(r"\d", tts): warn.append(f"câu {i}: tts còn chữ số → viết thành chữ")
        if re.search(r"[()%/+=&]", tts): warn.append(f"câu {i}: tts còn ký hiệu ()%/+=& → đọc thành chữ")
        if re.search(r"\b[A-ZĐ]{2,}\b", tts): warn.append(f"câu {i}: tts có chữ viết tắt in hoa → viết cách đọc")
        m = re.findall(EN_WORDS, tts, flags=re.I)
        if m: warn.append(f"câu {i}: tts còn từ tiếng Anh {sorted(set(m))} → phiên âm (xem bảng chuẩn hoá)")
        if n > 30: warn.append(f"câu {i}: {n} âm tiết – quá dài, nên tách (≤ 28)")
        if len(sub) > 95: warn.append(f"câu {i}: phụ đề {len(sub)} ký tự – nên tách câu (≤ 90)")
        if not sub or not tts: warn.append(f"câu {i}: thiếu sub hoặc tts")
    print("\nCảnh  bắt đầu  kết thúc")
    for s, (a, b) in scene_t.items(): print(f"{s:>4} {a:>8.1f} {b:>9.1f}")
    print(f"\nTổng âm tiết: {sum(syllables(l.get('tts', '')) for l in L)}  |  phim chính ≈ {t:.1f} s  |  "
          f"cả video ≈ {t + 3.0 + 3.6:.1f} s (thêm 3 s logo đầu, 3,6 s logo cuối)")
    if t > FILM_MAX: warn.append(f"phim chính ~{t:.0f} s > {FILM_MAX} s → rút gọn")
    if t < FILM_MIN: warn.append(f"phim chính ~{t:.0f} s < {FILM_MIN} s → có thể thêm ý")
    print("\n" + ("\n".join("⚠ " + w for w in warn) if warn else "✓ Không có cảnh báo"))

if __name__ == "__main__":
    main()
