// Trang xem thử nhân vật golfer 3D (golfer3d.js). Render qua render.js:
//   PAGE=golfer_preview.html QS='?rs=0.6667&view=iso' node render.js times 100,101,… <thư_mục>
// t < 100  : cú đánh – t là giây, address giữ 0,4 s rồi swing 2,2 s (u = (t−0,4)/2,2)
// t ≥ 100  : tư thế tĩnh thứ (t−100) trong POSE_LIST
// view=iso | front | dtl (down-the-line) | back | low ; club=iron|driver ; hand=R|L ; sheet=1 (lưới 12 tư thế)
import * as THREE from 'three';
import { createGolfer, POSES, SWING, placeGolfer } from './golfer3d.js';

const W = 1080, H = 1920;
const QS = new URLSearchParams(location.search);
const RS = parseFloat(QS.get('rs') || '1'), RW = Math.round(W * RS), RH = Math.round(H * RS);
const VIEW = QS.get('view') || 'iso', SHEET = QS.get('sheet') === '1', SWINGSHEET = QS.get('sheet') === 'swing';
export const POSE_LIST = ['address', 'addressDriver', 'takeaway', 'halfBack', 'top', 'transition', 'halfDown', 'impact', 'release', 'finish', 'watch', 'stand', 'drop', 'tee', 'mark', 'point', 'think', 'aim'];

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(RW, RH);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const out = document.createElement('canvas'); out.width = W; out.height = H; const ctx = out.getContext('2d');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#d9c7a6'); scene.fog = new THREE.FogExp2(new THREE.Color('#e4d2b0'), 0.02);
// trời đơn giản màu giờ vàng
const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { sunDir: { value: new THREE.Vector3(-0.45, 0.30, -0.84).normalize() } },
  vertexShader: `varying vec3 vD; void main(){ vD=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader: `uniform vec3 sunDir; varying vec3 vD; void main(){ vec3 d=normalize(vD); float e=d.y; vec3 c=mix(vec3(0.93,0.84,0.68), vec3(0.42,0.58,0.72), smoothstep(0.0,0.6,e)); c=mix(c, vec3(0.36,0.39,0.25), smoothstep(0.0,-0.1,e)); float s=max(dot(d,sunDir),0.0); c+=vec3(1.0,0.83,0.55)*(pow(s,6.0)*0.35+pow(s,60.0)*0.8); gl_FragColor=vec4(c,1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment> }` }));
scene.add(sky);
// nắng thấp ngược sáng (phía sau nhân vật, chếch), bầu trời xanh nhạt + đất xanh
const sun = new THREE.DirectionalLight('#ffd3a0', 3.0); sun.position.set(-9, 6, -17); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; const sc = sun.shadow.camera; sc.left = sc.bottom = -4; sc.right = sc.top = 4; sc.near = 5; sc.far = 40; scene.add(sun); scene.add(sun.target);
scene.add(new THREE.HemisphereLight('#c9d8e6', '#4f5a30', 1.0));
const fill = new THREE.DirectionalLight('#ffe9c8', 0.55); fill.position.set(6, 5, 9); scene.add(fill);
// mặt cỏ: đĩa lớn có sọc cắt cỏ nhạt
{ const size = 512, cv = document.createElement('canvas'); cv.width = cv.height = size; const c = cv.getContext('2d');
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const stripe = Math.floor(x / 64) % 2 ? 1 : 0.9; const n = 0.9 + 0.1 * Math.random(); c.fillStyle = `rgb(${(78 * stripe * n) | 0},${(118 * stripe * n) | 0},${(44 * stripe * n) | 0})`; c.fillRect(x, y, 1, 1); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(12, 12);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tex })); ground.receiveShadow = true; scene.add(ground); }
// bóng + tee tham chiếu
const ball = new THREE.Mesh(new THREE.SphereGeometry(0.0214, 20, 14), new THREE.MeshLambertMaterial({ color: '#fdfbf5' })); ball.castShadow = true; scene.add(ball);

const golfer = createGolfer({ club: QS.get('club') || 'iron', hand: QS.get('hand') || 'R' });
scene.add(golfer.group);
// đặt theo hình học stance của phim: bóng ở gốc, golfer đứng lùi 0,62 m theo dir
const BALL = new THREE.Vector3(0, 0.0214, 0), DIR = new THREE.Vector3(0, 0, 1), F = new THREE.Vector3(1, 0, 0);
placeGolfer(golfer, BALL, DIR, F, () => 0);
ball.position.copy(BALL);

const camera = new THREE.PerspectiveCamera(34, W / H, 0.05, 400);
function setCam(view, target) {
  const T = target || new THREE.Vector3(0, 0.95, -0.4);
  const views = { iso: [[2.9, 1.5, 3.4], 34], front: [[0, 1.1, 4.6], 30], dtl: [[4.9, 1.2, -0.35], 30], back: [[0.3, 1.3, -4.6], 30], low: [[2.4, 0.5, 3.0], 40], close: [[1.6, 1.35, 1.9], 38] };
  const v = views[view] || views.iso; camera.position.set(...v[0]); camera.fov = v[1]; camera.updateProjectionMatrix(); camera.lookAt(T);
}
function applyTime(t) {
  if (t >= 100) { const name = POSE_LIST[Math.round(t - 100) % POSE_LIST.length]; golfer.setPose(name); return name; }
  const u = Math.max(0, (t - 0.4) / 2.2); golfer.setSwing(u); return `swing u=${u.toFixed(2)}`;
}
function caption(txt) {
  ctx.save(); ctx.fillStyle = 'rgba(4,40,28,0.55)'; ctx.fillRect(0, H - 120, W, 120);
  ctx.fillStyle = '#E8D29A'; ctx.font = '500 40px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(txt, W / 2, H - 50); ctx.restore();
}
window.renderFrame = (t) => {
  if (SWINGSHEET) { // lưới 3×4: 12 khung đều nhau của cú đánh (u = 0 … 1)
    const cols = 3, rows = 4, cw = W / cols, ch = H / rows; ctx.fillStyle = '#04281C'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 12; i++) { const u = i / 11; golfer.setSwing(u); ball.position.copy(BALL); setCam(VIEW, new THREE.Vector3(0, 0.95, -0.4)); renderer.render(scene, camera);
      ctx.drawImage(renderer.domElement, 0, 0, RW, RH, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch);
      ctx.fillStyle = '#E8D29A'; ctx.font = '500 28px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('u=' + u.toFixed(2), (i % cols) * cw + 14, Math.floor(i / cols) * ch + ch - 16); }
    return out.toDataURL('image/jpeg', 0.92);
  }
  if (SHEET) { // lưới 3×4 tư thế, mỗi ô render riêng
    const cols = 3, rows = 4, cw = W / cols, ch = H / rows; ctx.fillStyle = '#04281C'; ctx.fillRect(0, 0, W, H);
    const list = POSE_LIST.slice(Math.round(t - 100), Math.round(t - 100) + 12);
    list.forEach((name, i) => { golfer.setPose(name); golfer.group.updateMatrixWorld(true); if (name === 'drop') ball.position.copy(golfer.joints.handL).add(new THREE.Vector3(0, -0.05, 0.02)).applyMatrix4(golfer.group.matrixWorld); else ball.position.copy(BALL); setCam(VIEW, new THREE.Vector3(0, 0.95, -0.4)); renderer.render(scene, camera);
      ctx.drawImage(renderer.domElement, 0, 0, RW, RH, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch);
      ctx.fillStyle = '#E8D29A'; ctx.font = '500 28px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(name, (i % cols) * cw + 14, Math.floor(i / cols) * ch + ch - 16); });
    return out.toDataURL('image/jpeg', 0.92);
  }
  const label = applyTime(t); setCam(VIEW);
  // bóng: trong tay khi thả bóng, còn lại nằm ở vị trí bóng
  if (golfer.pose === POSES.drop) ball.position.copy(golfer.joints.handL).add(new THREE.Vector3(0, -0.05, 0.02)).applyMatrix4(golfer.group.matrixWorld); else ball.position.copy(BALL);
  renderer.render(scene, camera);
  ctx.drawImage(renderer.domElement, 0, 0, RW, RH, 0, 0, W, H); caption(`${label} · ${VIEW}`);
  return out.toDataURL('image/jpeg', 0.92);
};
window.golfer = golfer; window.POSES = POSES; window.SWING = SWING;
window.ready = true;
