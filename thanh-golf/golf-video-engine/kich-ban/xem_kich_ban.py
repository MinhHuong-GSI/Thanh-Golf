# Xuất bảng duyệt kịch bản (Markdown) từ lines_<id>.json – để gửi người dùng duyệt trước khi tạo giọng.
# Dùng: python3 xem_kich_ban.py lines_3-3.json 3.3 > kich-ban_3-3.md
# Nếu đã tạo giọng (am-thanh/<mã>/timing.json), cột "Giây" và thời lượng lấy theo mốc thật; nếu chưa thì ước tính.
import json, os, re, sys

D = os.path.dirname(os.path.abspath(__file__))
lines = json.load(open(sys.argv[1], encoding="utf-8"))
sid = sys.argv[2] if len(sys.argv) > 2 else ""
data = json.load(open(os.path.join(D, "tinh-huong.json"), encoding="utf-8"))
item = next((it for ch in data["chuong"] for it in ch["tinh_huong"] if it["id"] == sid), None)

RATE, LEAD, TAIL, GI, GS = 4.6, 0.6, 1.8, 0.42, 0.9
syl = lambda s: len(re.findall(r"[^\s,.;:!?…()\"“”'–-]+", s))
t, rows = LEAD, []
for i, ln in enumerate(lines):
    d = syl(ln["tts"]) / (RATE * ln.get("speed", 1.0))
    rows.append((t, ln)); t += d
    last = i == len(lines) - 1
    t += TAIL if last else ln.get("gap", GS if lines[i + 1]["scene"] != ln["scene"] else GI)

TF = os.path.join(D, "am-thanh", sid.replace(".", "-"), "timing.json")
real = None
if os.path.exists(TF):
    T = json.load(open(TF, encoding="utf-8"))
    if [x["sub"] for x in T["lines"]] == [l["sub"] for l in lines]:     # chỉ dùng khi giọng khớp đúng kịch bản hiện tại
        real = T; rows = [(x["t0"], ln) for x, ln in zip(T["lines"], lines)]; t = T.get("film_dur", T["dur"])

def cell(x):
    if not x: return ""
    if isinstance(x, dict):
        tt = x.get("t", ""); tt = " / ".join(tt) if isinstance(tt, list) else tt
        s = f"**{x.get('k', '')}** · {tt}" + (f" · _{x['sub']}_" if x.get("sub") else "")
        if x.get("items"): s += " · " + " · ".join(f"({k + 1}) {v}" for k, v in enumerate(x["items"]))
        return s
    if isinstance(x, list): return " · ".join(x)
    return str(x)

esc = lambda s: s.replace("|", "\\|").replace("\n", " ")
print(f"# Kịch bản video – Tình huống {sid}" + (f": {item['ten']}" if item else ""))
if item:
    print(f"\n- **Căn cứ:** {item['q'][0]} · **Mức phạt:** {item['q'][1]}")
if real:
    print(f"- **Thời lượng (theo giọng AI đã tạo):** phim chính {t:.1f} s · cả video {real['dur']:.1f} s (không logo đầu, {real.get('logo_dur', 3.625):.1f} s logo cuối)")
    print(f"- **Nghe thử:** `am-thanh/{sid.replace('.', '-')}/narration_ttgolf.m4a`")
else:
    print(f"- **Thời lượng ước tính:** phim chính ≈ {t:.0f} s · cả video ≈ {t + 3.6:.0f} s (không logo đầu, 3,6 s logo cuối)")
print(f"- **Số câu:** {len(lines)} · **Số cảnh:** {len({l['scene'] for l in lines})} · **Tổng âm tiết:** {sum(syl(l['tts']) for l in lines)}")
print("\n| Cảnh | Giây | Lời thoại (phụ đề) | Hình ảnh & máy quay | Tiêu đề / thẻ luật | Nhãn & đồ hoạ |")
print("|---|---|---|---|---|---|")
for t0, ln in rows:
    title = cell(ln.get("card")) or cell(ln.get("title"))
    fx = " · ".join(filter(None, [cell(ln.get("label")), cell(ln.get("fx"))]))
    print(f"| {ln['scene']} | {t0:.1f} | {esc(ln['sub'])} | {esc(ln.get('shot', ''))} | {esc(title)} | {esc(fx)} |")
diff = [(ln["sub"], ln["tts"]) for _, ln in rows if ln["sub"] != ln["tts"]]
if diff:
    print("\n**Chữ đọc khác phụ đề (để giọng AI phát âm đúng):**\n")
    for s, r in diff: print(f"- {s}\n  → _{r}_")
AR = os.path.join(os.path.dirname(TF), "asr_report.json")
if real and os.path.exists(AR):
    bad = [r for r in json.load(open(AR, encoding="utf-8")) if r["loi"]]
    print(f"\n**Kiểm tra giọng bằng ASR:** {len(lines) - len(bad)}/{len(lines)} câu máy nghe khớp hoàn toàn." +
          (" Các câu dưới đây chị nên nghe kỹ (thường do máy nghe nhầm dấu thanh hoặc giọng Bắc):\n" if bad else ""))
    for r in bad: print(f"- Câu {r['i'] + 1}: _{r['tts']}_ → máy nghe: “{r['asr']}”")
print("\n**Câu kết trên logo cuối (cố định):** Hãy follow TTGolf để biết thêm nhiều kiến thức về golf nhé → _Hãy phô lô tê tê gôn, để biết thêm nhiều kiến thức về gôn nhé!_")
