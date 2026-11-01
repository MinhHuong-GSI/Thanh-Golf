# Repo Thanh-Golf (kênh TTGolf)

Project chính nằm trong thư mục `thanh-golf/`. Toàn bộ quy tắc, phong cách và quy trình ở `thanh-golf/CLAUDE.md` (nạp tự động bên dưới).

- **Mọi đường dẫn** trong `thanh-golf/CLAUDE.md`, trong các skill và agent đều **tính từ `thanh-golf/`**. Ví dụ `golf-video-engine/tts/` nghĩa là `thanh-golf/golf-video-engine/tts/`. Lệnh chạy script thì `cd` vào thư mục tương ứng trong `thanh-golf/` trước.
- Skill và agent đặt ở `.claude/` **ngay gốc repo**, để phiên Claude Code trên web (mở ở gốc repo) nhận được ngay khi khởi động. Khi mở Claude trong `thanh-golf/` của bản clone, Claude Code cũng tự tìm lên thư mục cha.
  - Skill: `/kich-ban-giong-ai`, `/dung-video-3d`, `/dung-video-footage`.
  - Agent soát luật: `kiem-tra-luat-golf`.
  - Quyền chạy lệnh: `.claude/settings.json`.
- `Cam-nang-luat-golf_giai-cuu-bong-the-kho.docx` ở gốc repo là bản Word của cẩm nang. Dữ liệu máy đọc được nằm ở `thanh-golf/golf-video-engine/kich-ban/tinh-huong.json`.
- Tải file lên bằng trang web GitHub sẽ **bỏ mất thư mục có dấu chấm** (`.claude/`, `.gitignore`). Muốn sửa skill hay agent, hãy nhờ Claude sửa trực tiếp trong repo.

@thanh-golf/CLAUDE.md
