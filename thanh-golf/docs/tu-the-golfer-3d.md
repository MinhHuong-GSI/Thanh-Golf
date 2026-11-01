# Nhân vật golfer 3D – tư thế chuẩn và cách dùng

Mô-đun: `golf-video-engine/golfer3d.js` · Trang xem thử: `golf-video-engine/golfer_preview.html`. Ngày 01/11/2026.

## 1. Mục tiêu và nguyên tắc
- Dựng golfer 3D **tham số** (không mô hình tải sẵn) để thay thế hoặc bổ sung tấm ảnh `golfer_cut.png`, dùng được ở mọi góc máy và mọi động tác: address, cú đánh đầy đủ, thả bóng, cắm tee, chỉ tay, đứng nhìn bóng…
- **Không dùng hình ảnh người thật.** Chỉ học *tư thế và dáng đứng* từ các mô tả kỹ thuật công khai về setup/swing của Rory McIlroy và từ số liệu cơ sinh học của golfer chuyên nghiệp. Nhân vật không có khuôn mặt, không tái tạo ngoại hình hay trang phục của bất kỳ ai.
- Trang phục theo đúng "mẫu" golfer cổ điển của kênh (ảnh `golfer_cut.png`): mũ lưỡi trai dẹt, gi-lê dệt kim xám, sơ mi kem tay dài, quần plus-fours màu kaki, tất cao kem, giày da nâu, găng tay trái, gậy sắt.

## 2. Tư thế tham khảo (từ mô tả công khai)
Nguồn tìm được qua tìm kiếm web (các trang golf không mở được trực tiếp trong phiên này, chỉ dùng phần tóm tắt kết quả tìm kiếm):

| Giai đoạn | Mô tả rút ra | Tham số trong `golfer3d.js` |
|---|---|---|
| Setup / address | Gối hơi chùng, thân trên gập về phía bóng khoảng 30°; cột sống nghiêng nhẹ **xa mục tiêu** (vai phải thấp hơn); bóng gậy sắt hơi trước tâm stance, driver ở trong gót chân trái; tay hơi đi trước bóng; stance driver rộng hơn | `pelvis.bend 10 + torso.bend 26` (≈36° tổng), `torso.side 6`, `feet.w 0,36` (sắt) / `0,48` (driver), `swing.aim 1` tự giải để đầu gậy chạm bóng |
| Takeaway | Đưa gậy ra bằng cánh tay, ít dùng cổ tay; vai – cánh tay – cẳng tay giữ chung một mặt phẳng | `theta 38`, `wrist −28`, vai `−34`, hông `−8` |
| Đỉnh backswing | Rất "đặc", không thừa động tác; cánh tay trái phẳng, cổ tay hơi ngửa; đo 3D: xương chậu ≈ −40° (Golf Monthly / Ged Walters); golfer chuyên nghiệp: vai ≈ 90–100°, hông ≈ 45° | `pelvis.rot −42`, `torso.rot −53` (vai ≈ −95°), `theta 158`, `wrist −96` |
| Chuyển tiếp | Hông mở lại trước khi vai mở; người hơi hạ xuống; cột sống nghiêng thêm | `pelvis.rot −12`, `torso.rot −42`, `pelvis.h −0,015` |
| Impact | Hông quay tổng cộng ≈ 70° từ đỉnh tới impact; hông mở, vai phải thấp, đầu ở sau bóng, tay đi trước bóng, chân trái duỗi, gót phải nhấc | `pelvis.rot 38`, `torso.rot −14` (vai ≈ +24°), `torso.side 20`, `feet.heelR 0,05`, `aim 1` |
| Finish | Cân bằng hoàn toàn trên chân trái, ngực hướng mục tiêu, thân thẳng hơi ưỡn, gậy sau gáy, mũi chân phải chống đất | `pelvis.rot 92`, `torso.rot 22`, `torso.bend −6`, `feet.pitchR 58`, `theta −124`, `wrist 162`, `reach 0,66` |
| Pre-shot / ngắm | Đứng sau bóng chọn mục tiêu, một cú vung thử, bước vào, nhìn mục tiêu rồi đánh | tư thế `aim`, `point`, `think` |

Nguồn (tóm tắt kết quả tìm kiếm): Golf Monthly – "5 Rory McIlroy driver swing keys" (Clive Tucker) và phân tích 3D của Ged Walters; Golf.com – "Rory McIlroy five game changers" và "three secrets to drive high and long"; NBC/Golf Channel – "Swing sequence: Rory McIlroy"; Today's Golfer – "Six key moves you can learn from Rory McIlroy"; Meister et al., *Rotational Biomechanics of the Elite Golf Swing* (số liệu vai/hông); mô tả pre-shot routine trên GolfWRX và Golf Monthly. Các con số là **ước lượng để dựng hình**, không phải số đo chính xác của bất kỳ cá nhân nào.

Luật liên quan tới các tư thế tình huống: thả bóng từ **độ cao đầu gối**, thả thẳng xuống, do chính người chơi thả (Luật 14.3b) → tư thế `drop` (tay trái duỗi ra trước, bóng ở độ cao ≈0,5 m).

## 3. Mô hình kỹ thuật
- Khung người tỉ lệ thật (cao ≈1,78 m): mắt cá 0,08 · đùi 0,44 · cẳng chân 0,42 · cột sống 0,47 · nửa vai 0,205 · cánh tay 0,30 + 0,26 m. Gậy sắt 0,95 m, driver 1,15 m (đúng `PROJECT_INSTRUCTION.md`).
- Mỗi tư thế là một bộ tham số: `pelvis` (xoay, gập, nghiêng, dịch chuyển, độ cao), `torso` (tương đối chậu), `head`, `feet` (độ rộng, xoè, nhấc gót, xoay bàn chân), `swing` (góc quét tay `theta`, gập cổ tay `wrist`, `tilt`, `out`, độ duỗi `reach`).
- **Chân và tay giải bằng IK hai đoạn**: bàn chân cố định trên đất, tay bám vào cán gậy. Với address/impact (`aim: 1`) mô-đun tự giải để **đầu gậy chạm đúng bóng** (tay buông tự nhiên, cổ tay và góc cán tự suy ra), kết quả được "nướng" vào tư thế khi tạo nhân vật nên nội suy không bị giật.
- Cú đánh: 10 khung chính (`SWING`) với mốc thời gian `SWING_T` (backswing chậm, downswing nhanh), nội suy smoothstep từng đoạn: `g.setSwing(u)`, u ∈ [0,1]. Thời lượng gợi ý: 2,2 s cho cả cú đánh (impact ở u ≈ 0,70).
- Người thuận tay trái: `createGolfer({ hand: 'L' })` (lật `scale.x`).
- Vật liệu Lambert, đổ bóng thật (`castShadow`), hợp với ánh sáng giờ vàng ngược sáng của các phim.

## 4. Cách dùng trong phim
```js
import { createGolfer, placeGolfer } from './golfer3d.js';
const g = createGolfer({ club: 'iron', hand: 'R' });   // hoặc club: 'driver' | 'none'
scene.add(g.group);
// đứng vào bóng theo hình học stance của phim (dir = stanceDir(hand), f = hF, gót lùi 0,72 m)
placeGolfer(g, ballPos, dir, hF, heightAt);
g.setPose('address');            // tư thế tĩnh
g.setSwing(prog(t, t0, t0 + 2.2)); // cú đánh theo thời gian
g.blend('watch', 'point', k);    // trộn hai tư thế tĩnh
// vị trí tay để gắn bóng khi thả: g.joints.handL (toạ độ cục bộ) → .applyMatrix4(g.group.matrixWorld)
```
Tư thế có sẵn: `address`, `addressDriver`, `takeaway`, `halfBack`, `top`, `transition`, `halfDown`, `impact`, `release`, `finish`, `watch` (che mắt nhìn bóng, như ảnh cũ), `stand`, `drop`, `tee`, `mark`, `point`, `think`, `aim`.

`film_dieu16-1.js` đã có tuỳ chọn `?g3d=1`: thay tấm ảnh golfer ở cảnh 15,0–18,6 s bằng nhân vật 3D (tư thế `watch`, quay chếch 28° so với máy quay, bóng đổ thật). Mặc định vẫn dùng ảnh.

## 5. Xem thử
Chạy `python -m http.server 8765` trong `golf-video-engine/` rồi:
```bash
PAGE=golfer_preview.html QS='?rs=0.5&view=iso&sheet=1'    node render.js times 100,106 xem/tu-the   # lưới 12 tư thế, 2 trang
PAGE=golfer_preview.html QS='?rs=0.5&view=front&sheet=swing' node render.js times 0 xem/swing      # 12 khung cú đánh
PAGE=golfer_preview.html QS='?rs=0.6667&view=dtl'          node render.js times 1.9 xem/impact      # 1 khung, t = giây (swing bắt đầu ở 0,4 s)
```
`view`: `iso` · `front` (nhìn thẳng) · `dtl` (down-the-line) · `back` · `low` · `close`. `club=driver`, `hand=L` cũng là tham số URL.

## 6. Hạn chế và việc nên làm tiếp
- Nhân vật là hình khối trơn (không mặt, không nếp vải). Nên dùng **ngược sáng, khung từ gối trở lên hoặc toàn thân ở xa**, có sương và DOF như các phim, tránh cận mặt.
- Chưa có chuyển động phụ (tóc, vải, ngón tay). Ngón tay là khối trơn; nếu cần bóng trong tay thì đặt bóng ở `joints.handL`.
- Có thể thêm tư thế mới bằng cách sao chép một mục trong `POSES` và chỉnh số; render bằng trang xem thử để kiểm tra.
