# TTGolf – Studio video luật golf (Claude Code)

Thư mục này chứa toàn bộ project "Thanh golf" từ claude.ai, đã sắp xếp lại để chạy bằng **Claude Code** trên máy của chị:
- Hướng dẫn cho Claude: `CLAUDE.md`.
- Quy trình làm video: 3 skill trong `.claude/skills/`.
- Subagent kiểm tra luật golf: `.claude/agents/`.
- Bộ công cụ dựng phim 3D: `golf-video-engine/`.
- Công cụ dựng footage: `footage-edit/`.

## 1. Cài đặt một lần (Windows)

Mở **PowerShell**, không cần quyền Administrator, rồi chạy từng dòng:

```powershell
winget install Git.Git
winget install OpenJS.NodeJS.LTS
winget install Python.Python.3.12
winget install Gyan.FFmpeg
irm https://claude.ai/install.ps1 | iex
```

Đóng PowerShell, mở lại, rồi kiểm tra: `claude --version`, `node -v`, `python --version`, `ffmpeg -version`.

> Claude Code cần tài khoản Pro, Max, Team hoặc Enterprise. Lần đầu gõ `claude`, trình duyệt sẽ mở để đăng nhập.
> Nếu không muốn dùng cửa sổ dòng lệnh, chị có thể dùng Claude Code ngay trong ứng dụng Claude trên máy tính và mở thư mục này.

## 2. Chuẩn bị bộ công cụ (một lần)

Mở **Git Bash** trong thư mục `thanh-golf`:

```bash
cd golf-video-engine
npm install                         # three.js 0.169 + phông chữ
npm install playwright              # trình duyệt headless để render
npx playwright install chromium
python -m venv ../.venv && source ../.venv/Scripts/activate
pip install numpy pillow opencv-python "rembg[cpu]" "sherpa-onnx<2"
```

Model giọng AI (khoảng 100 MB) chưa có trong thư mục. Lần đầu làm video giọng AI, Claude sẽ tự tải theo `golf-video-engine/tts/README.md`, hoặc chị bảo Claude: *"Cài đặt giọng AI theo tts/README.md"*.

> Cách nhanh hơn: mở `claude` trong thư mục `thanh-golf` và gõ *"Cài đặt môi trường theo README.md và kiểm tra mọi thứ chạy được"*. Claude sẽ tự làm và báo những gì còn thiếu.

## 3. Bắt đầu làm việc

```bash
cd thanh-golf
claude
```

Claude tự đọc `CLAUDE.md` mỗi phiên, nên chị không phải nhắc lại phong cách, quy trình hay bài học cũ. Câu lệnh mẫu:

| Việc | Gõ |
|---|---|
| Dựng lại video có âm thanh gốc | `/dung-video-3d D:\Videos\luat-19-2.mp4` hoặc *"Dựng lại video này theo phong cách TTGolf: …"* |
| Viết kịch bản tình huống cẩm nang | `/kich-ban-giong-ai 4.6` hoặc *"Viết kịch bản cả chương 3 để tôi duyệt"* |
| Kịch bản đã duyệt → làm video | *"Kịch bản 3.3 đã duyệt – tạo giọng và dựng video"* |
| Video footage + mp3 | `/dung-video-footage D:\Footage\thang-12 D:\Footage\loi-dan.mp3` |
| Soát luật một đoạn lời thoại | *"Dùng agent kiem-tra-luat-golf soát đoạn này: …"* |

Video thành phẩm và ảnh cover được lưu vào `xuat-ban/`.

## 4. Cấu trúc thư mục

```
thanh-golf/
├── CLAUDE.md                 ← hướng dẫn chính, Claude đọc mỗi phiên
├── README.md                 ← file này
├── .claude/
│   ├── settings.json         ← các lệnh được phép chạy không cần hỏi (ffmpeg, node, python…)
│   ├── skills/               ← /dung-video-3d · /kich-ban-giong-ai · /dung-video-footage
│   └── agents/               ← kiem-tra-luat-golf
├── golf-video-engine/        ← bộ công cụ phim 3D (nội dung gói golf-video-engine.zip cũ)
│   ├── film_*.js / .html     ← 3 phim mẫu: Quy tắc 17, Điều 16.1, Luật 17.1d
│   ├── render.js, render_all.sh, run_full.sh, encode.sh
│   ├── bumper.js/.html       ← logo TTGolf cuối video
│   ├── logo_ttgolf_*.png     ← logo đã tách nền · golfer_cut.png ← ảnh người chơi
│   ├── kich-ban/             ← 92 tình huống (tinh-huong.json), kịch bản 3.3, công cụ xem bảng duyệt
│   └── tts/                  ← giọng AI tiếng Việt offline
├── footage-edit/             ← dựng video từ footage HDR iPhone + mp3
├── assets/logo-goc/          ← 2 file logo gốc chị gửi
├── docs/                     ← bản gốc Project instructions, lịch sử dự án, tài liệu tham khảo
└── xuat-ban/                 ← video và ảnh cover bàn giao
```

## 5. Ghi chú
- Render phim 3D mất khoảng 1,5 giờ cho 60 giây video. Cần để máy không ngủ trong lúc render. Script tự chạy tiếp nếu bị ngắt.
- `.claude/settings.json` cho phép Claude chạy ffmpeg, node, python… mà không hỏi lại. Muốn Claude hỏi trước mỗi lệnh thì xoá dòng tương ứng.
- Muốn sao lưu hoặc dùng Claude Code trên web, có thể đưa thư mục lên GitHub. `.gitignore` đã loại các file lớn: khung hình, video, model giọng.
