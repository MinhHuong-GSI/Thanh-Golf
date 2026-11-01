// golfer3d.js – nhân vật golfer 3D tham số cho golf-video-engine (three.js 0.169)
//
// Dựng theo "mẫu" golfer cổ điển của kênh (golfer_cut.png): mũ lưỡi trai dẹt, áo gi-lê
// dệt kim, sơ mi tay dài, quần plus-fours, tất cao, giày da, găng tay trái, gậy sắt.
// Không dùng ảnh người thật. Tư thế được tham số hoá theo các mô tả kỹ thuật công khai
// về setup/swing của Rory McIlroy (xem docs/tu-the-golfer-3d.md) và số liệu cơ sinh học
// của golfer chuyên nghiệp: vai xoay ≈ 90–100°, hông ≈ 40–45° ở đỉnh backswing; hông mở
// ≈ 35–45° ở impact; thân trên gập ≈ 30–35° từ hông; cột sống hơi nghiêng xa mục tiêu.
//
// Hệ toạ độ cục bộ (golfer thuận tay phải): gốc = điểm giữa hai gót chân trên mặt đất,
// golfer nhìn về +Z (phía bóng), mục tiêu ở +X (bên trái người đánh). Tay thuận trái
// (bên "dẫn") là +X, tay phải (bên "theo") là −X. Người thuận tay trái: scale.x = −1.
//
// API:
//   const g = createGolfer({ club: 'iron'|'driver'|'none', hand: 'R'|'L', seed })
//   g.group          THREE.Group – thêm vào scene, đặt position/rotation.y
//   g.setPose(name)  tư thế tĩnh: xem POSES (address, addressDriver, top, impact, finish,
//                    stand, watch, drop, tee, point, think …)
//   g.setSwing(u)    u ∈ [0,1]: cú đánh đầy đủ (0 = address … 1 = finish), nội suy mượt
//   g.blend(a, b, k) trộn 2 tư thế tĩnh
//   g.joints         vị trí khớp hiện tại (toạ độ cục bộ) – ví dụ joints.handL để gắn bóng
//   g.club           { butt, head } toạ độ cục bộ của gậy
//   placeGolfer(g, ballPos, dir, f, heightAt)  đặt golfer đứng vào bóng theo hình học
//                    stance của các phim (feet() trong film_dieu16-1.js)
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const D2R = Math.PI / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;

// ------------------------------------------------------------------ kích thước (m, người cao ≈ 1,78 m)
export const DIM = {
  ankle: 0.08, thigh: 0.44, shank: 0.42, hipHalf: 0.165, hipDrop: 0.04,
  spine: 0.47, shoulderHalf: 0.205, neck: 0.07, headR: 0.105,
  upperArm: 0.30, foreArm: 0.26, handR: 0.042,
  club: { iron: 0.95, driver: 1.15 }, grip: 0.26,
};

// ------------------------------------------------------------------ trang phục (theo golfer_cut.png)
export const COSTUME = {
  cap: '#6a6962', capBand: '#5b5a54', vest: '#716d66', shirt: '#ebe4d6', collar: '#f3eee4',
  trousers: '#a99470', kneeBand: '#9a8762', socks: '#e8e1d1', shoes: '#3a2a1d',
  skin: '#d6ab86', glove: '#f1ede5', shaft: '#c8c9c7', grip: '#1c1c1c', head: '#9ea1a3',
};

function mat(color, extra = {}) { return new THREE.MeshLambertMaterial({ color, ...extra }); }

// hình con nhộng thuôn (bán kính đáy rb → đỉnh ra, dài L theo trục Y, đáy ở y=0)
function taperedCapsule(rb, ra, L, seg = 14) {
  const pts = [];
  for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + (Math.PI / 2) * i / 6; pts.push(new THREE.Vector2(Math.cos(a) * rb, rb + Math.sin(a) * rb)); }
  for (let i = 1; i <= 6; i++) { const a = (Math.PI / 2) * i / 6; pts.push(new THREE.Vector2(Math.cos(a) * ra, L - ra + Math.sin(a) * ra)); }
  return new THREE.LatheGeometry(pts, seg);
}
function lathe(profile, seg = 20) { return new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(p[0], p[1])), seg); }

// ------------------------------------------------------------------ IK hai đoạn
function ik2(A, T, l1, l2, pole) {
  const d0 = A.distanceTo(T), d = clamp(d0, Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.004);
  const u = T.clone().sub(A).normalize();
  const pv = pole.clone().sub(A); pv.addScaledVector(u, -pv.dot(u));
  if (pv.lengthSq() < 1e-8) pv.set(0, 0, 1).addScaledVector(u, -u.z);
  pv.normalize();
  const ca = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), sa = Math.sqrt(1 - ca * ca);
  const E = A.clone().addScaledVector(u, l1 * ca).addScaledVector(pv, l1 * sa);
  const Tc = A.clone().addScaledVector(u, d);
  return { E, T: Tc };
}
function basisQuat(right, up, fwd) { const m = new THREE.Matrix4().makeBasis(right, up, fwd); return new THREE.Quaternion().setFromRotationMatrix(m); }
function rotY(v, a) { return v.clone().applyAxisAngle(UP, a); }

// ------------------------------------------------------------------ tư thế
// Mỗi tư thế: pelvis {rot, bend, side, x, z, h} (độ, m) · torso {rot, bend, side} (tương đối pelvis)
// head {yaw, pitch, roll} (tương đối torso) · feet {w, flareL, flareR, heelL, heelR, pitchR, zL, zR}
// swing {theta, wrist, plane, lift} (độ) khi arms='swing' · hands {L:[x,y,z], R:[x,y,z], poleL, poleR}
// club: 'swing' | 'trailHang' | 'leadHang' | 'rest' | 'none'
export const BALL_LOCAL = V(0.03, 0.0214, 0.72); // bóng so với gốc golfer: gót chân lùi 0,72 m sau bóng (gậy sắt trung bình), bóng hơi trước tâm stance
const BASE = {
  pelvis: { rot: 0, bend: 0, side: 0, x: 0, z: 0, h: 0.96 },
  torso: { rot: 0, bend: 0, side: 0 },
  head: { yaw: 0, pitch: 0, roll: 0 },
  feet: { w: 0.36, flareL: 20, flareR: 6, heelL: 0, heelR: 0, pitchR: 0, pitchL: 0, zL: 0, zR: 0 },
  // theta: góc quét cánh tay dẫn trong mặt phẳng swing (0 = buông xuống, + = backswing) · wrist: gập cổ tay trong mặt phẳng
  // tilt: xoay cánh tay quanh đường mục tiêu về phía thẳng đứng (address ≈ 15°, trên đỉnh ≈ 0) · out: xoay cán gậy quanh đường mục tiêu ra phía bóng
  // reach: độ duỗi tay (1 = thẳng) · aim: 1 = tự giải tilt/reach/wrist/out để đầu gậy chạm bóng · plane 0 = mặt phẳng qua tâm vai và bóng
  swing: { theta: 0, wrist: -12, plane: 0, lift: 0, aim: 0, reach: 0.96, tilt: 0, out: 0 },
  arms: 'swing', club: 'swing', hands: null,
};
const P = (o) => {
  const r = JSON.parse(JSON.stringify(BASE));
  for (const k of Object.keys(o)) { if (r[k] && typeof r[k] === 'object' && o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) Object.assign(r[k], o[k]); else r[k] = o[k]; }
  return r;
};

// --- cú đánh (gậy sắt) – khung hình chính, theo thứ tự thời gian, tỉ lệ thời gian ở SWING_T
export const SWING = [
  // address: gập từ hông ≈32°, gối hơi chùng, cột sống nghiêng xa mục tiêu ≈6°, tay hơi đi trước bóng
  P({ pelvis: { h: 0.90, bend: 10, side: 2 }, torso: { bend: 26, side: 6 }, head: { pitch: 20 }, swing: { theta: 12, wrist: -14, aim: 1 } }),
  // takeaway: gậy song song mặt đất, tay – vai – cẳng tay cùng một mặt phẳng, cổ tay ít động
  P({ pelvis: { h: 0.905, bend: 8, side: 2, rot: -8, x: -0.01 }, torso: { bend: 24, side: 6, rot: -26 }, head: { pitch: 22, yaw: 6 }, swing: { theta: 38, wrist: -28, tilt: 9, out: -8 } }),
  // nửa backswing: tay dẫn song song mặt đất, cổ tay gập
  P({ pelvis: { h: 0.905, bend: 8, side: 3, rot: -24, x: -0.02 }, torso: { bend: 25, side: 7, rot: -40 }, head: { pitch: 22, yaw: 10 }, swing: { theta: 92, wrist: -72, tilt: 4 } }),
  // đỉnh backswing: vai ≈ 95°, hông ≈ 42° (Rory đo được −40°), tay dẫn thẳng, gậy gần song song
  P({ pelvis: { h: 0.905, bend: 8, side: 4, rot: -42, x: -0.03 }, torso: { bend: 25, side: 8, rot: -53 }, head: { pitch: 22, yaw: 14 }, swing: { theta: 158, wrist: -96 } }),
  // chuyển tiếp: hông đã mở lại trước, vai còn đóng, người hơi hạ xuống, cột sống nghiêng thêm
  P({ pelvis: { h: 0.89, bend: 9, side: 6, rot: -12, x: 0.03 }, torso: { bend: 26, side: 13, rot: -42 }, head: { pitch: 24, yaw: 10 }, swing: { theta: 100, wrist: -100 } }),
  // nửa downswing: tay dẫn song song mặt đất, giữ lag
  P({ pelvis: { h: 0.895, bend: 9, side: 7, rot: 12, x: 0.05 }, torso: { bend: 26, side: 16, rot: -25 }, head: { pitch: 24, yaw: 6 }, swing: { theta: 60, wrist: -85, tilt: 4 } }),
  // impact: hông mở ≈ 38°, vai mở ≈ 20°, vai phải thấp, đầu ở sau bóng, chân trái duỗi, gót phải nhấc
  P({ pelvis: { h: 0.915, bend: 7, side: 8, rot: 38, x: 0.07 }, torso: { bend: 24, side: 20, rot: -14 }, head: { pitch: 24, yaw: 0 }, feet: { heelR: 0.05, pitchR: 20 }, swing: { theta: 12, wrist: -9, aim: 1 } }),
  // release: hai tay duỗi về mục tiêu, gậy đã quay qua
  P({ pelvis: { h: 0.93, bend: 5, side: 8, rot: 66, x: 0.09 }, torso: { bend: 16, side: 16, rot: 12 }, head: { pitch: 18, yaw: 25 }, feet: { heelR: 0.12, pitchR: 35, flareR: 25 }, swing: { theta: -64, wrist: 30, tilt: 8, out: 6 } }),
  // follow-through cao: ngực hướng mục tiêu
  P({ pelvis: { h: 0.95, bend: 2, side: 5, rot: 84, x: 0.10 }, torso: { bend: 4, side: 8, rot: 18 }, head: { pitch: 4, yaw: 20 }, feet: { heelR: 0.18, pitchR: 50, flareR: 50 }, swing: { theta: -128, wrist: 85, reach: 0.86, tilt: 3 } }),
  // finish: cân bằng trên chân trái, thân thẳng hơi ưỡn, gậy sau gáy, mũi chân phải chống đất
  P({ pelvis: { h: 0.955, bend: -2, side: 4, rot: 92, x: 0.11, z: -0.01 }, torso: { bend: -6, side: 6, rot: 22 }, head: { pitch: -4, yaw: -18 }, feet: { heelR: 0.21, pitchR: 58, flareR: 70, zR: -0.04 }, swing: { theta: -124, wrist: 188, lift: 0.10, reach: 0.66, tilt: -6, out: -25 } }),
];
export const SWING_T = [0, 0.16, 0.30, 0.46, 0.55, 0.62, 0.70, 0.78, 0.88, 1.0]; // mốc u của từng khung (backswing chậm, downswing nhanh)

// --- tư thế tĩnh
export const POSES = {
  address: SWING[0],
  addressDriver: P({ pelvis: { h: 0.91, bend: 7, side: 6, x: -0.02 }, torso: { bend: 22, side: 10 }, head: { pitch: 20 }, feet: { w: 0.48 }, swing: { theta: 10, wrist: -14, aim: 1, ballX: 0.19 } }),
  takeaway: SWING[1], halfBack: SWING[2], top: SWING[3], transition: SWING[4], halfDown: SWING[5], impact: SWING[6], release: SWING[7], finish: SWING[9],
  // đứng nhìn bóng bay, tay trái che mắt (như ảnh golfer_cut.png), gậy cầm tay phải chống xuống đất
  watch: P({ pelvis: { h: 0.955 }, torso: { bend: 2, rot: 8 }, head: { yaw: 20, pitch: -6 }, feet: { w: 0.30, flareL: 14, flareR: 10 },
    arms: 'hands', club: 'trailHang', hands: { L: [0.09, 1.60, 0.14], poleL: [0.45, 1.30, -0.25] } }),
  // đứng thư thái, hai tay chồng lên đầu gậy dựng trước người
  stand: P({ pelvis: { h: 0.955 }, torso: { bend: 3 }, head: { pitch: 6 }, feet: { w: 0.28, flareL: 14, flareR: 10 },
    arms: 'hands', club: 'rest', hands: { L: [0.02, 0.98, 0.26], R: [-0.02, 1.03, 0.25], poleL: [0.40, 0.90, 0.05], poleR: [-0.40, 0.90, 0.05] } }),
  // thả bóng (Luật 14.3b): đứng thẳng, cánh tay dẫn đưa ra trước, bóng ở độ cao đầu gối
  drop: P({ pelvis: { h: 0.955 }, torso: { bend: 6, rot: -6 }, head: { pitch: 30 }, feet: { w: 0.30, flareL: 12, flareR: 10 },
    arms: 'hands', club: 'trailHang', hands: { L: [0.16, 0.52, 0.36], poleL: [0.42, 0.95, 0.20] } }),
  // cắm tee / đặt bóng: ngồi xổm thấp, tay phải chạm đất, tay trái tì gối
  tee: P({ pelvis: { h: 0.56, bend: 12, z: -0.16, side: 6 }, torso: { bend: 36, rot: -6 }, head: { pitch: 18 }, feet: { w: 0.34, flareL: 22, flareR: 20, zL: 0.12, zR: -0.42, heelR: 0.10, pitchR: 62 },
    arms: 'hands', club: 'none', hands: { L: [0.22, 0.50, 0.30], R: [-0.07, 0.06, 0.52], poleL: [0.45, 0.70, 0.05], poleR: [-0.36, 0.40, 0.30] } }),
  // nhặt bóng / đánh dấu bóng: cúi gập một gối
  mark: P({ pelvis: { h: 0.70, bend: 14, x: 0.03 }, torso: { bend: 40, rot: 12 }, head: { pitch: 20 }, feet: { w: 0.34, flareL: 20, flareR: 10, zR: -0.18, heelR: 0.10, pitchR: 35 },
    arms: 'hands', club: 'leadHang', hands: { R: [-0.02, 0.06, 0.45], poleR: [-0.36, 0.45, 0.20] } }),
  // chỉ tay về hướng mục tiêu / điểm thả
  point: P({ pelvis: { h: 0.955 }, torso: { bend: 2, rot: 25 }, head: { yaw: 40, pitch: -4 }, feet: { w: 0.30, flareL: 24, flareR: 6 },
    arms: 'hands', club: 'trailHang', hands: { L: [0.62, 1.34, 0.30], poleL: [0.30, 0.95, -0.10] } }),
  // suy nghĩ / cân nhắc: tay dẫn chống hông, gậy tay phải
  think: P({ pelvis: { h: 0.955, rot: 4 }, torso: { bend: 4, rot: -6 }, head: { pitch: 14, yaw: -10 }, feet: { w: 0.30, flareL: 14, flareR: 12 },
    arms: 'hands', club: 'trailHang', hands: { L: [0.21, 0.98, 0.06], poleL: [0.55, 1.05, -0.15] } }),
  // bước ra sau bóng ngắm hướng (pre-shot): đứng thẳng, gậy cầm trước ngực
  aim: P({ pelvis: { h: 0.955 }, torso: { bend: 4 }, head: { pitch: 4 }, feet: { w: 0.22, flareL: 10, flareR: 8 },
    arms: 'hands', club: 'aim', hands: { L: [0.06, 1.06, 0.30], R: [-0.05, 1.12, 0.30], poleL: [0.40, 0.95, 0.02], poleR: [-0.42, 0.95, 0.02] } }),
};

// ------------------------------------------------------------------ dựng nhân vật
export function createGolfer(opts = {}) {
  const clubKind = opts.club || 'iron', hand = opts.hand || 'R';
  const C = Object.assign({}, COSTUME, opts.costume || {});
  const group = new THREE.Group(); group.name = 'golfer3d';
  if (hand === 'L') group.scale.x = -1;
  const parts = {};
  const add = (name, geo, m, opt = {}) => { const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true; mesh.receiveShadow = false; mesh.name = name; group.add(mesh); parts[name] = mesh; return mesh; };
  const mats = { skin: mat(C.skin), shirt: mat(C.shirt), vest: mat(C.vest), trousers: mat(C.trousers), socks: mat(C.socks), shoes: mat(C.shoes), cap: mat(C.cap), glove: mat(C.glove), grip: mat(C.grip), shaft: mat(C.shaft), head: mat(C.head), collar: mat(C.collar), kneeBand: mat(C.kneeBand) };
  const D = DIM;
  // thân: gi-lê trên sơ mi (cắt ngang hơi dẹt)
  const torsoProfile = [[0.155, -0.02], [0.165, 0.06], [0.150, 0.16], [0.160, 0.26], [0.185, 0.36], [0.195, 0.43], [0.14, 0.49], [0.06, 0.52], [0.0, 0.525]];
  add('torso', lathe(torsoProfile, 24), mats.shirt).scale.set(1, 1, 0.68);
  const vestProfile = [[0.160, 0.03], [0.172, 0.08], [0.158, 0.17], [0.168, 0.27], [0.192, 0.37], [0.199, 0.415], [0.188, 0.445], [0.148, 0.472], [0.0, 0.472]];
  add('vest', lathe(vestProfile, 24), mats.vest).scale.set(1, 1, 0.69);
  add('collar', lathe([[0.062, 0.47], [0.082, 0.50], [0.084, 0.545], [0.064, 0.55], [0.0, 0.55]], 16), mats.collar);
  // khung chậu (quần)
  add('pelvis', lathe([[0.0, -0.17], [0.12, -0.16], [0.165, -0.10], [0.178, 0.0], [0.168, 0.06], [0.0, 0.07]], 24), mats.trousers).scale.set(1, 1, 0.72);
  // chân: plus-fours phồng (đùi), dải gối, tất, giày
  for (const s of ['L', 'R']) {
    add('thigh' + s, taperedCapsule(0.105, 0.098, D.thigh + 0.04), mats.trousers);
    add('knee' + s, new THREE.CylinderGeometry(0.062, 0.066, 0.05, 16), mats.kneeBand);
    add('shank' + s, taperedCapsule(0.058, 0.046, D.shank + 0.02), mats.socks);
    add('shoe' + s, new THREE.SphereGeometry(1, 18, 12), mats.shoes).scale.set(0.048, 0.032, 0.135);
    add('upper' + s, taperedCapsule(0.056, 0.047, D.upperArm + 0.03), mats.shirt);
    add('fore' + s, taperedCapsule(0.048, 0.036, D.foreArm + 0.02), mats.shirt);
    add('hand' + s, new THREE.SphereGeometry(1, 14, 10), s === 'L' ? mats.glove : mats.skin).scale.set(0.040, 0.050, 0.030);
  }
  // cổ, đầu, mũ lưỡi trai dẹt
  add('neck', new THREE.CylinderGeometry(0.052, 0.06, D.neck + 0.08, 14), mats.skin);
  add('head', new THREE.SphereGeometry(D.headR, 24, 18), mats.skin).scale.set(0.92, 1.08, 1.0);
  add('cap', new THREE.SphereGeometry(D.headR * 1.12, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), mats.cap).scale.set(1.08, 0.78, 1.24);
  add('capBrim', new THREE.CylinderGeometry(0.125, 0.125, 0.018, 20, 1, false, -0.9, 1.8), mats.cap).scale.set(1, 1, 0.78);
  add('capBand', new THREE.TorusGeometry(D.headR * 1.05, 0.012, 8, 24), mat(C.capBand));
  // gậy
  const clubLen = D.club[clubKind] || D.club.iron;
  const clubG = new THREE.Group(); group.add(clubG); parts.clubGroup = clubG;
  if (clubKind !== 'none') {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0075, clubLen - D.grip, 10), mats.shaft); shaft.position.y = -(D.grip + (clubLen - D.grip) / 2); shaft.castShadow = true; clubG.add(shaft);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0105, D.grip, 10), mats.grip); grip.position.y = -D.grip / 2; grip.castShadow = true; clubG.add(grip);
    const head = new THREE.Group(); head.position.y = -clubLen; clubG.add(head);
    if (clubKind === 'driver') {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), mat('#2a2a2e')); h.scale.set(1.9, 1.0, 1.5); h.position.set(0.045, 0.015, 0.0); h.castShadow = true; head.add(h);
    } else {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.048, 0.012), mats.head); blade.position.set(0.045, 0.02, 0.0); blade.rotation.z = -0.1; blade.rotation.x = 0.35; blade.castShadow = true; head.add(blade);
      const hosel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.06, 8), mats.head); hosel.position.y = 0.02; head.add(hosel);
    }
  }
  const S = { group, parts, hand, clubKind, clubLen, joints: {}, club: { butt: V(0, 0, 0), head: V(0, 0, 0), dir: V(0, -1, 0) }, pose: null };

  // --- cập nhật hình học từ tư thế
  const seg = (name, a, b, L, extraOffset = 0) => {
    const m = parts[name]; const d = b.clone().sub(a); const len = d.length();
    m.position.copy(a).addScaledVector(d, -extraOffset / Math.max(len, 1e-6));
    m.quaternion.setFromUnitVectors(UP, d.normalize()); m.scale.y = (len + extraOffset * 2) / L;
  };
  S.apply = (p) => {
    S.pose = p;
    const J = S.joints; const pel = p.pelvis, tor = p.torso, hd = p.head, ft = p.feet;
    // chậu
    const pelQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(pel.bend * D2R, pel.rot * D2R, -pel.side * D2R, 'YXZ'));
    const pelR = V(1, 0, 0).applyQuaternion(pelQ), pelU = V(0, 1, 0).applyQuaternion(pelQ), pelF = V(0, 0, 1).applyQuaternion(pelQ);
    const Pc = V(pel.x, pel.h, pel.z);
    J.pelvis = Pc; J.hipL = Pc.clone().addScaledVector(pelR, D.hipHalf).addScaledVector(pelU, -D.hipDrop); J.hipR = Pc.clone().addScaledVector(pelR, -D.hipHalf).addScaledVector(pelU, -D.hipDrop);
    // thân trên (gập từ hông, xoay, nghiêng bên) – xoay quanh trục của chậu rồi gập thêm
    const torQ = pelQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(tor.bend * D2R, tor.rot * D2R, -tor.side * D2R, 'YXZ')));
    const torR = V(1, 0, 0).applyQuaternion(torQ), torU = V(0, 1, 0).applyQuaternion(torQ), torF = V(0, 0, 1).applyQuaternion(torQ);
    const Sc = Pc.clone().addScaledVector(pelU, 0.05).addScaledVector(torU, D.spine - 0.05);
    J.chest = Sc; J.shL = Sc.clone().addScaledVector(torR, D.shoulderHalf).addScaledVector(torF, 0.01); J.shR = Sc.clone().addScaledVector(torR, -D.shoulderHalf).addScaledVector(torF, 0.01);
    // đầu
    const headQ = torQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(hd.pitch * D2R, hd.yaw * D2R, -hd.roll * D2R, 'YXZ')));
    const hU = V(0, 1, 0).applyQuaternion(headQ), hF = V(0, 0, 1).applyQuaternion(headQ);
    J.neck = Sc.clone().addScaledVector(torU, 0.05); J.head = J.neck.clone().addScaledVector(torU, D.neck).addScaledVector(hU, D.headR * 0.95);
    // bàn chân
    const ankle = (side) => { const sx = side === 'L' ? 1 : -1; const flare = (side === 'L' ? ft.flareL : ft.flareR) * D2R * sx; const heel = side === 'L' ? ft.heelL : ft.heelR; const pitch = (side === 'L' ? ft.pitchL : ft.pitchR) * D2R;
      const zoff = side === 'L' ? ft.zL : ft.zR; const fdir = V(Math.sin(flare), 0, Math.cos(flare));
      const base = V(sx * ft.w / 2, 0, zoff); const toe = base.clone().addScaledVector(fdir, 0.20);
      // gót nhấc: bàn chân xoay quanh mũi
      const ank = toe.clone().addScaledVector(fdir, -0.14 * Math.cos(pitch)).add(V(0, D.ankle + 0.14 * Math.sin(pitch) + heel * 0, 0));
      return { ank, fdir, toe, pitch, flare }; };
    const fL = ankle('L'), fR = ankle('R'); J.ankleL = fL.ank; J.ankleR = fR.ank;
    // chân IK (gối hướng về phía mũi chân, hơi ra ngoài)
    const kneeL = ik2(J.hipL, J.ankleL, D.thigh, D.shank, J.ankleL.clone().addScaledVector(fL.fdir, 0.5).add(V(0.12, 0.3, 0)));
    const kneeR = ik2(J.hipR, J.ankleR, D.thigh, D.shank, J.ankleR.clone().addScaledVector(fR.fdir, 0.5).add(V(-0.12, 0.3, 0)));
    J.kneeL = kneeL.E; J.kneeR = kneeR.E;
    // gậy & tay
    let butt, sdir; // vị trí đầu cán và hướng cán → đầu gậy
    let handL, handR, poleL, poleR;
    if (p.arms === 'swing') {
      const sw = p.swing, e1 = V(1, 0, 0), hub = J.shL.clone().addScaledVector(torF, 0.03); // tâm swing = ổ vai dẫn (tay dẫn gần thẳng suốt cú đánh)
      // mặt phẳng swing: chứa đường mục tiêu (X) qua bóng và đi qua vai dẫn
      const ballL = V(sw.ballX || BALL_LOCAL.x, BALL_LOCAL.y, sw.ballZ || BALL_LOCAL.z);
      const beta = sw.plane > 0 && !(sw.aim > 0.5) ? sw.plane * D2R : Math.atan2(hub.y - ballL.y, -(hub.z - ballL.z));
      const e2 = V(0, Math.sin(beta), -Math.cos(beta)), n = e1.clone().cross(e2);
      const w = sw.wrist * D2R, armLen0 = D.upperArm + D.foreArm + 0.02;
      const chain = (th, ww = w, rq = sw.reach, tilt = sw.tilt * D2R, out = sw.out * D2R) => {
        const a = e2.clone().multiplyScalar(-Math.cos(th)).addScaledVector(e1, -Math.sin(th)).applyAxisAngle(e1, tilt); const np = n.clone().applyAxisAngle(e1, tilt);
        const hL = hub.clone().addScaledVector(a, armLen0 * rq).add(V(0, sw.lift, 0));
        const sd = a.clone().applyAxisAngle(np, ww).applyAxisAngle(e1, out).normalize(); const bt = hL.clone().addScaledVector(sd, -0.07);
        return { a, np, hL, sd, bt, head: bt.clone().addScaledVector(sd, clubLen) }; };
      let th = sw.theta * D2R, wq = w, reachQ = sw.reach, tiltQ = sw.tilt * D2R, outQ = sw.out * D2R;
      if (sw.aim > 0.5) { // giải: tay buông (tilt) và độ duỗi (reach) sao cho |bóng − tay| = chiều dài gậy; rồi suy ra góc cổ tay (wrist, out)
        const want = clubLen - 0.07; const f = (tl, rq) => chain(th, 0, rq, tl, 0).hL.distanceTo(ballL) - want;
        let found = false;
        for (const rq of [0.97, 0.94, 0.99, 0.91, 0.88, 0.85, 0.82]) { let lo = -8 * D2R, hi = 45 * D2R, flo = f(lo, rq), fhi = f(hi, rq);
          if (flo * fhi > 0) continue; for (let it = 0; it < 40; it++) { const m = (lo + hi) / 2, fm = f(m, rq); if (fm * flo <= 0) { hi = m; fhi = fm; } else { lo = m; flo = fm; } }
          tiltQ = (lo + hi) / 2; reachQ = rq; found = true; break; }
        if (!found) { let best = 1e9; for (const rq of [0.97, 0.94, 0.99, 0.91, 0.88, 0.85, 0.82]) for (let tl = -8; tl <= 45; tl += 1) { const e = Math.abs(f(tl * D2R, rq)); if (e < best) { best = e; tiltQ = tl * D2R; reachQ = rq; } } }
        const c0 = chain(th, 0, reachQ, tiltQ, 0); const sd0 = ballL.clone().sub(c0.hL).normalize();
        // out: xoay quanh đường mục tiêu sao cho cán gậy nằm trong mặt phẳng (e1, a); wrist: góc trong mặt phẳng đó
        const g = (o) => c0.np.dot(sd0.clone().applyAxisAngle(e1, -o));
        let lo = -Math.PI / 2, hi = Math.PI / 2, glo = g(lo); if (g(lo) * g(hi) > 0) { lo = -Math.PI / 2; hi = 0; glo = g(lo); }
        for (let it = 0; it < 50; it++) { const m = (lo + hi) / 2, gm = g(m); if (gm * glo <= 0) { hi = m; } else { lo = m; glo = gm; } }
        outQ = (lo + hi) / 2; const u = sd0.clone().applyAxisAngle(e1, -outQ);
        wq = Math.atan2(c0.a.clone().cross(u).dot(c0.np), c0.a.dot(u));
        S.solvedTheta = th / D2R; S.solvedWrist = wq / D2R; S.solvedReach = reachQ; S.solvedTilt = tiltQ / D2R; S.solvedOut = outQ / D2R;
      }
      const c = chain(th, wq, reachQ, tiltQ, outQ); handL = c.hL;
      { const dL = handL.distanceTo(J.shL), mx = D.upperArm + D.foreArm - 0.004; if (dL > mx) handL = J.shL.clone().lerp(handL, mx / dL); } sdir = c.sd; butt = c.bt; handR = butt.clone().addScaledVector(sdir, 0.16);
      // khuỷu: tay dẫn hướng ra ngoài/xuống, tay theo gập xuống về phía thân
      poleL = handL.clone().lerp(J.shL, 0.5).add(c.np.clone().multiplyScalar(-0.5)).add(V(0.15, -0.3, 0));
      poleR = handR.clone().lerp(J.shR, 0.5).add(c.np.clone().multiplyScalar(-0.6)).add(V(-0.2, -0.35, 0));
    } else {
      const hs = p.hands || {}; const toV = (x) => x ? V(x[0], x[1], x[2]) : null;
      handL = toV(hs.L); handR = toV(hs.R); poleL = toV(hs.poleL); poleR = toV(hs.poleR);
      const ground = 0.0;
      if (p.club === 'trailHang') { // gậy cầm tay phải, đầu gậy chống xuống đất cạnh chân phải
        handR = handR || J.hipR.clone().add(V(-0.09, -0.02, 0.10)); poleR = poleR || handR.clone().add(V(-0.3, 0.1, -0.3));
        const headP = V(-0.34, ground + 0.01, 0.22); sdir = headP.clone().sub(handR).normalize(); butt = handR.clone().addScaledVector(sdir, -0.08);
      } else if (p.club === 'leadHang') {
        handL = handL || J.hipL.clone().add(V(0.09, -0.02, 0.10)); poleL = poleL || handL.clone().add(V(0.3, 0.1, -0.3));
        const headP = V(0.34, ground + 0.01, 0.22); sdir = headP.clone().sub(handL).normalize(); butt = handL.clone().addScaledVector(sdir, -0.08);
      } else if (p.club === 'rest') { // gậy dựng thẳng trước người, hai tay chồng lên đầu cán
        const headP = V(0.0, ground + 0.01, 0.30); const top = V(0.0, 0.94, 0.27); sdir = headP.clone().sub(top).normalize(); butt = top;
        handL = handL || top.clone().add(V(0.02, 0.04, 0)); handR = handR || top.clone().add(V(-0.02, 0.09, 0));
      } else if (p.club === 'aim') { // gậy cầm ngang trước ngực bằng hai tay, đầu gậy hướng mục tiêu
        const hL = toV(hs.L) || V(0.06, 1.06, 0.30), hR = toV(hs.R) || V(-0.05, 1.12, 0.30); sdir = hL.clone().sub(hR).normalize(); butt = hR.clone().addScaledVector(sdir, -0.06);
      } else { butt = null; }
      handL = handL || J.shL.clone().add(V(0.04, -0.56, 0.05)); handR = handR || J.shR.clone().add(V(-0.04, -0.56, 0.05));
      poleL = poleL || J.shL.clone().add(V(0.25, -0.3, -0.35)); poleR = poleR || J.shR.clone().add(V(-0.25, -0.3, -0.35));
    }
    const eL = ik2(J.shL, handL, D.upperArm, D.foreArm, poleL), eR = ik2(J.shR, handR, D.upperArm, D.foreArm, poleR);
    J.elbowL = eL.E; J.elbowR = eR.E; J.handL = eL.T; J.handR = eR.T;
    // --- đặt lưới
    const torsoQ = torQ, pelvisQ = pelQ;
    parts.torso.position.copy(Pc).addScaledVector(pelU, 0.05); parts.torso.quaternion.copy(torsoQ);
    parts.vest.position.copy(parts.torso.position); parts.vest.quaternion.copy(torsoQ);
    parts.collar.position.copy(parts.torso.position); parts.collar.quaternion.copy(torsoQ);
    parts.pelvis.position.copy(Pc); parts.pelvis.quaternion.copy(pelvisQ);
    parts.neck.position.copy(J.neck).addScaledVector(torU, D.neck / 2); parts.neck.quaternion.copy(torsoQ);
    parts.head.position.copy(J.head); parts.head.quaternion.copy(headQ);
    parts.cap.position.copy(J.head).addScaledVector(hU, 0.040).addScaledVector(hF, -0.006); parts.cap.quaternion.copy(headQ).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), 0.16));
    parts.capBrim.position.copy(J.head).addScaledVector(hU, 0.036).addScaledVector(hF, 0.075); parts.capBrim.quaternion.copy(headQ).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), 0.38));
    parts.capBand.position.copy(J.head).addScaledVector(hU, 0.045); parts.capBand.quaternion.copy(headQ).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.PI / 2));
    for (const s of ['L', 'R']) {
      const f = s === 'L' ? fL : fR;
      seg('thigh' + s, J['hip' + s], J['knee' + s], D.thigh + 0.04, 0.02);
      parts['knee' + s].position.copy(J['knee' + s]); parts['knee' + s].quaternion.setFromUnitVectors(UP, J['ankle' + s].clone().sub(J['knee' + s]).normalize());
      seg('shank' + s, J['knee' + s], J['ankle' + s], D.shank + 0.02, 0.01);
      const shoe = parts['shoe' + s]; const sq = new THREE.Quaternion().setFromAxisAngle(UP, f.flare).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -f.pitch));
      shoe.quaternion.copy(sq); shoe.position.copy(J['ankle' + s]).add(V(0, -0.045, 0).applyQuaternion(sq)).add(f.fdir.clone().multiplyScalar(0.05).applyAxisAngle(V(1, 0, 0).applyAxisAngle(UP, f.flare), -f.pitch));
      seg('upper' + s, J['sh' + s], J['elbow' + s], D.upperArm + 0.03, 0.015);
      seg('fore' + s, J['elbow' + s], J['hand' + s], D.foreArm + 0.02, 0.01);
      parts['hand' + s].position.copy(J['hand' + s]); parts['hand' + s].quaternion.setFromUnitVectors(UP, J['hand' + s].clone().sub(J['elbow' + s]).normalize());
    }
    if (butt && clubKind !== 'none') { clubG.visible = true; clubG.position.copy(butt); clubG.quaternion.setFromUnitVectors(V(0, -1, 0), sdir);
      // xoay mặt gậy về phía bóng (quanh trục cán)
      const face = V(0, 0, 1); const faceNow = V(1, 0, 0).applyQuaternion(clubG.quaternion); const proj = faceNow.clone().addScaledVector(sdir, -faceNow.dot(sdir)).normalize();
      const want = face.clone().addScaledVector(sdir, -face.dot(sdir)).normalize(); let ang = Math.atan2(proj.clone().cross(want).dot(sdir), proj.dot(want));
      clubG.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(sdir, ang));
      S.club.butt.copy(butt); S.club.dir.copy(sdir); S.club.head.copy(butt).addScaledVector(sdir, clubLen);
    } else { clubG.visible = false; }
    return S;
  };
  // --- nội suy tư thế
  const mix = (A, B, k) => {
    if (A === B || k <= 0) return A; if (k >= 1) return B;
    const r = JSON.parse(JSON.stringify(A));
    for (const sec of ['pelvis', 'torso', 'head', 'feet', 'swing']) for (const key of Object.keys(r[sec])) r[sec][key] = lerp(A[sec][key], B[sec][key], k);
    if (A.arms === 'hands' && B.arms === 'hands') { r.hands = {}; for (const key of ['L', 'R', 'poleL', 'poleR']) { const a = A.hands && A.hands[key], b = B.hands && B.hands[key]; if (a && b) r.hands[key] = [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]; else r.hands[key] = (k < 0.5 ? a : b) || a || b; } }
    else if (k >= 0.5) { r.arms = B.arms; r.hands = B.hands; r.club = B.club; }
    return r;
  };
  // "nướng" các tư thế có aim: giải một lần, ghi theta/cổ tay vào bản sao để nội suy mượt
  const bake = (p) => { if (!(p.arms === 'swing' && p.swing.aim > 0.5)) return p; S.apply(p); const q = JSON.parse(JSON.stringify(p)); q.swing.theta = S.solvedTheta; q.swing.wrist = S.solvedWrist; q.swing.reach = S.solvedReach; q.swing.tilt = S.solvedTilt; q.swing.out = S.solvedOut; q.swing.aim = 0; q.swing.plane = 0; return q; };
  S.SWING = SWING.map(bake); S.POSES = {}; for (const k of Object.keys(POSES)) { const i = SWING.indexOf(POSES[k]); S.POSES[k] = i >= 0 ? S.SWING[i] : bake(POSES[k]); }
  const get = (x) => typeof x === 'string' ? S.POSES[x] : x;
  S.setPose = (name) => S.apply(get(name));
  S.blend = (a, b, k) => S.apply(mix(get(a), get(b), k));
  S.setSwing = (u) => { u = clamp(u); let i = 0; while (i < SWING_T.length - 2 && u > SWING_T[i + 1]) i++;
    const k0 = (u - SWING_T[i]) / (SWING_T[i + 1] - SWING_T[i]); const k = k0 * k0 * (3 - 2 * k0); // smoothstep từng đoạn
    return S.apply(mix(S.SWING[i], S.SWING[i + 1], k)); };
  S.setPose('address');
  return S;
}

// Đặt golfer đứng vào bóng theo hình học stance của các phim: bóng tại ballPos, dir = hướng từ
// chân tới bóng (stanceDir), f = vector đường chân (hF). Gốc golfer = ballPos − dir·0.62 (như feet()).
// heightAt(x,z) trả độ cao mặt đất. Trả về vị trí gốc.
export function placeGolfer(g, ballPos, dir, f, heightAt, back = BALL_LOCAL.z) {
  const base = ballPos.clone().addScaledVector(dir, -back); base.y = heightAt ? heightAt(base.x, base.z) : ballPos.y;
  g.group.position.copy(base);
  // cục bộ +Z phải trùng dir (hướng về bóng). Người thuận tay trái đã lật scale.x nên +X cục bộ ≡ −f.
  g.group.rotation.y = Math.atan2(dir.x, dir.z);
  return base;
}
