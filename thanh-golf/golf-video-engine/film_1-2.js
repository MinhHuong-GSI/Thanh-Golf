import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Tình huống 1.2 – Phát bóng từ ngoài khu vực phát bóng (Luật 6.1b; bẫy: dời mốc tee, Luật 6.2b(4)); dựng từ giọng AI.
// Khung dựng từ film_1-1.js (sân, khu vực phát bóng tính bằng hình học, driver 3D, phiếu ghi điểm, thẻ luật).

// ------------------------------------------------------------------ basics
const W = 1080, H = 1920;
const GOLD = '#C9A55C', GOLD_L = '#E8D29A', CREAM = '#F6F1E6', EMER = '#0B4733', EMER_D = '#04281C';
const YEL = '#E4B41F', RED = '#BC2A30';
let _s = 20261031;
const rnd = () => { _s = (_s * 16807) % 2147483647; return (_s - 1) / 2147483646; };
const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const eio = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const esin = t => -(Math.cos(Math.PI * t) - 1) / 2;
const eout = t => 1 - Math.pow(1 - t, 3);
const eback = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const prog = (t, a, b) => clamp((t - a) / (b - a));
const win = (t, a, b, fi = .35, fo = .35) => Math.min(sstep(a, a + fi, t), 1 - sstep(b - fo, b, t));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

const QS = new URLSearchParams(location.search);
const RS = parseFloat(QS.get('rs') || '1'), AA = QS.get('aa') !== '0', RW = Math.round(W * RS), RH = Math.round(H * RS);
const renderer = new THREE.WebGLRenderer({ antialias: AA, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(RW, RH);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = parseFloat(QS.get('ex') || '1.08');
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const out = document.createElement('canvas'); out.width = W; out.height = H;
const ctx = out.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 2400); camera.layers.enable(1);

const rtc = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: AA ? 4 : 0 });
const composer = new EffectComposer(renderer, rtc); composer.setPixelRatio(1); composer.setSize(RW, RH);
const renderPass = new RenderPass(new THREE.Scene(), camera);
const bokeh = new BokehPass(new THREE.Scene(), camera, { focus: 5, aperture: 0.002, maxblur: 0.01 });
composer.addPass(renderPass); composer.addPass(bokeh); composer.addPass(new OutputPass());
const pmrem = new THREE.PMREMGenerator(renderer);

// ------------------------------------------------------------------ noise helpers
function vnoise(size, cells, oct) {
  const o = new Float32Array(size * size); let amp = 1, tot = 0, c = cells;
  for (let k = 0; k < oct; k++) {
    const g = new Float32Array(c * c); for (let i = 0; i < c * c; i++) g[i] = rnd();
    for (let y = 0; y < size; y++) {
      const fy = y / size * c, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty), y1 = (y0 + 1) % c;
      for (let x = 0; x < size; x++) {
        const fx = x / size * c, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx), x1 = (x0 + 1) % c;
        o[y * size + x] += amp * lerp(lerp(g[y0 * c + x0], g[y0 * c + x1], sx), lerp(g[y1 * c + x0], g[y1 * c + x1], sx), sy);
      }
    }
    tot += amp; amp *= .5; c *= 2;
  }
  for (let i = 0; i < o.length; i++) o[i] /= tot; return o;
}
function canvasFrom(size, fn) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size; const c = cv.getContext('2d');
  const id = c.createImageData(size, size);
  for (let i = 0; i < size * size; i++) { const v = fn(i); id.data[i * 4] = v[0]; id.data[i * 4 + 1] = v[1]; id.data[i * 4 + 2] = v[2]; id.data[i * 4 + 3] = 255; }
  c.putImageData(id, 0, 0); return cv;
}
function texFrom(cv, srgb = true, repeat = false) {
  const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8; if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } return t;
}
function normalFromHeight(h, size, k) {
  return canvasFrom(size, i => {
    const x = i % size, y = (i / size) | 0;
    const l = h[y * size + (x - 1 + size) % size], r = h[y * size + (x + 1) % size];
    const u = h[((y - 1 + size) % size) * size + x], d = h[((y + 1) % size) * size + x];
    let nx = (l - r) * k, ny = (u - d) * k, nz = 1; const L = Math.hypot(nx, ny, nz);
    return [(nx / L * .5 + .5) * 255, (ny / L * .5 + .5) * 255, (nz / L * .5 + .5) * 255];
  });
}

// ------------------------------------------------------------------ sky + environment (golden hour, sun low in the south-west)
const SUN = V(-0.55, 0.43, 0.72).normalize();
const SKYTIME = { value: 0 };
const SKY = { top: new THREE.Color('#6a93b3'), mid: new THREE.Color('#b9cdd2'), hor: new THREE.Color('#ead7b4'), sun: new THREE.Color('#ffd496'), gnd: new THREE.Color('#5d6440') };
function makeSky(radius) {
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: SKY.top }, mid: { value: SKY.mid }, hor: { value: SKY.hor }, sunc: { value: SKY.sun }, gnd: { value: SKY.gnd }, sunDir: { value: SUN }, time: SKYTIME },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top,mid,hor,sunc,gnd,sunDir; uniform float time; varying vec3 vDir;
      float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hsh(i),hsh(i+vec2(1.0,0.0)),f.x), mix(hsh(i+vec2(0.0,1.0)),hsh(i+vec2(1.0,1.0)),f.x), f.y); }
      float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<6;i++){ s+=a*vn(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
      void main(){ vec3 d=normalize(vDir); float e=d.y;
        vec3 c=mix(hor,mid,smoothstep(0.0,0.22,e)); c=mix(c,top,smoothstep(0.22,0.8,e));
        c=mix(c,gnd*0.5+hor*0.5,smoothstep(0.0,-0.12,e));
        float s=max(dot(d,sunDir),0.0);
        if(e>0.0){
          vec2 uv=d.xz/(e+0.10)*0.9+vec2(time*0.004,0.0);
          float n=fbm(uv*1.15), n2=fbm(uv*2.3+vec2(5.2,1.3));
          float cov=smoothstep(0.50,0.74,n)*smoothstep(0.015,0.10,e)*(1.0-smoothstep(0.45,0.9,e));
          vec2 sh=normalize(sunDir.xz);
          float lit=clamp(0.45+0.35*dot(normalize(d.xz+1e-5),sh)+(n2-0.5)*0.9+(n-0.6)*0.8,0.0,1.0);
          vec3 cc=mix(vec3(0.55,0.58,0.66), vec3(1.05,0.95,0.80), lit);
          cc=mix(cc, hor*1.05, smoothstep(0.12,0.0,e)*0.6);
          c=mix(c, cc, cov*0.92);
        }
        c+=sunc*(pow(s,5.0)*0.30+pow(s,40.0)*0.65+pow(s,900.0)*7.0);
        gl_FragColor=vec4(c,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
}
const envScene = new THREE.Scene(); envScene.add(makeSky(50));
{ const g = new THREE.Mesh(new THREE.CircleGeometry(48, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#4d5a30' })); g.position.y = -2; envScene.add(g); }
const envTex = pmrem.fromScene(envScene, 0.02).texture;

// ------------------------------------------------------------------ course layout (metres)
// north = -z (towards the green), south = +z (towards the tee)
const HOLE = { x: 0, z: -58 }, TEE = { x: 0, z: 60 };
function sdBox(px, pz, cx, cz, hx, hz, r) {
  const qx = Math.abs(px - cx) - hx + r, qz = Math.abs(pz - cz) - hz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}
// pond behind/right of the green (yellow penalty area)
const POND = { x: 19, z: -73, a: 0.927, hx: 15, hz: 8, r: 5 };
function pondSD(x, z) {
  const dx = x - POND.x, dz = z - POND.z, c = Math.cos(POND.a), s = Math.sin(POND.a);
  const u = dx * c + dz * s, v = -dx * s + dz * c;
  const qx = Math.abs(u) - POND.hx + POND.r, qz = Math.abs(v) - POND.hz + POND.r;
  const box = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - POND.r;
  return box + 1.5 * Math.sin(u * 0.27 + 1.1) * Math.sin(v * 0.37 + 0.3) + 0.8 * Math.sin(u * 0.55 - v * 0.23 + 0.7) + 0.35 * Math.sin(u * 1.05 + v * 0.62);
}
const waterSD = pondSD;
const PEN = 0.6;                                   // the yellow line (edge of the penalty area) runs 0.6 m outside the water line
const penSD = (x, z) => pondSD(x, z) - PEN;        // < 0 : inside the penalty area
function fwHalf(z) {
  let h = 12.4 + 1.3 * Math.sin(clamp((z + 46) / 100) * Math.PI);
  if (z > 47) h *= Math.sqrt(Math.max(0, 1 - Math.pow((z - 47) / 7, 2)));
  if (z < -36) h *= Math.sqrt(Math.max(0, 1 - Math.pow((-36 - z) / 10.6, 2)));
  return h;
}
function fairwaySD(x, z) { if (z < -46.5 || z > 54) return 30; return Math.abs(x) - fwHalf(z); }
const teeSD = (x, z) => sdBox(x, z, 0, 60.4, 4.8, 3.2, 0.9);
const TEE_H = 0.98;                                 // the tee box is built flat
const BUNKERS = [{ x: -12.0, z: -49.4, rx: 4.6, rz: 3.0, a: 0.55, d: 0.6 }, { x: 10.8, z: -47.2, rx: 2.8, rz: 1.8, a: -0.5 }, { x: -13.2, z: 24, rx: 2.4, rz: 4.4, a: 0.12 }];
function bunkerSD(b, x, z) {
  const dx = x - b.x, dz = z - b.z, c = Math.cos(b.a), s = Math.sin(b.a);
  const u = (dx * c - dz * s) / b.rx, v = (dx * s + dz * c) / b.rz;
  return (Math.hypot(u, v) - 1) * Math.min(b.rx, b.rz);
}
const HB = BUNKERS[0];
const PATH = new THREE.CatmullRomCurve3([V(-5, 0, 70), V(-17, 0, 55), V(-20, 0, 20), V(-22, 0, -12), V(-28, 0, -27), V(-37, 0, -33), V(-38, 0, -45), V(-31, 0, -58), V(-22, 0, -70)]);
const PATHPTS = PATH.getSpacedPoints(300);
function pathDist(x, z) { let m = 1e9; for (const p of PATHPTS) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < m) m = d; } return Math.sqrt(m); }

function heightAt(x, z) {
  const sd = pondSD(x, z);
  if (sd < 0) return -1.45 * sstep(0, 1.9, -sd);
  const fw = 1 - sstep(-2, 4, fairwaySD(x, z));
  const dg = Math.hypot(x - HOLE.x, z - HOLE.z);
  const gm = 1 - sstep(9, 15, dg);
  const roll = 0.55 * Math.sin(x * 0.071 + 1.3) * Math.sin(z * 0.052 + 0.4) + 0.35 * Math.sin(x * 0.13 + z * 0.09 + 2.0) + 0.2 * Math.sin(x * 0.31 - z * 0.23);
  let h = (0.55 + roll * 0.6 * (1 - 0.75 * fw) * (1 - gm)) * sstep(0, 6, sd);
  h += 0.42 * (1 - sstep(0, 1.1, teeSD(x, z)));
  h += 0.35 * Math.pow(1 - clamp(dg / 11), 2);
  for (const b of BUNKERS) h -= (b.d || 0.5) * (1 - sstep(-0.4, 0.5, bunkerSD(b, x, z)));
  { const tf = 1 - sstep(-0.5, 0.9, teeSD(x, z)); if (tf > 0) h = lerp(h, TEE_H, tf); }
  const r = Math.hypot(x, z * 0.85);
  h += 16 * sstep(100, 300, r) * (0.65 + 0.35 * Math.sin(Math.atan2(z, x) * 3 + 1));
  return h;
}
const WATER_Y = -0.45;
function onGround(v, lift = 0) { return V(v.x, heightAt(v.x, v.z) + lift, v.z); }
function onSurface(v, lift = 0) { return V(v.x, Math.max(heightAt(v.x, v.z), WATER_Y + 0.02) + lift, v.z); }
const distH = p => Math.hypot(p.x - HOLE.x, p.z - HOLE.z);

// ================================================================== rule geometry (computed, not eyeballed)
const CL = 1.15;                // one club-length (longest club other than the putter)
const BALL_R = 0.0214;
const HV = V(HOLE.x, 0, HOLE.z);
const TEE_PEG = { len: 0.07, out: 0.022 };          // wooden tee 7 cm long, 2.2 cm above the turf
const TEE_SEAT = Math.sqrt(BALL_R * BALL_R - 0.0062 * 0.0062);   // ball centre above the rim of the 6.2 mm tee cup
const MARK_R = 0.075;                               // tee-marker spheres
const MK = [V(-2.25, 0, 58.4), V(2.25, 0, 58.4)];   // the two tee-markers set by the Committee (play is towards -z)
// Teeing area (Definitions): a rectangle two club-lengths deep. Front edge = the line between the forward-most
// points of the two tee-markers; side edges = the lines back from the outside points of the tee-markers.
const TA = (() => {
  const z0 = Math.min(...MK.map(m => m.z - MARK_R));                 // forward-most points (nearest the hole)
  const x0 = Math.min(...MK.map(m => m.x)) - MARK_R, x1 = Math.max(...MK.map(m => m.x)) + MARK_R;   // outside points
  return { x0, x1, z0, z1: z0 + 2 * CL };
})();
const inTA = p => p.x >= TA.x0 && p.x <= TA.x1 && p.z >= TA.z0 && p.z <= TA.z1;
const TAC = V((TA.x0 + TA.x1) / 2, 0, (TA.z0 + TA.z1) / 2);
// 1.2 positions (play is towards -z; TA.z0 is the front edge, nearest the hole)
// Definitions, "teeing area": the ball is in the teeing area when any part of the ball touches or is above it,
// i.e. when the ball's vertical projection (a disc of radius BALL_R) meets the rectangle.
const ballInTA = p => { const cx = clamp(p.x, TA.x0, TA.x1), cz = clamp(p.z, TA.z0, TA.z1); return Math.hypot(p.x - cx, p.z - cz) <= BALL_R + 1e-9; };
const PF = V(1.3, 0, TA.z0 - 0.32);                 // teed in front of the line between the markers (whole ball ahead)
const PS = V(TA.x1 + 0.14, 0, 59.2);                 // teed outside the right side edge
const PI = V(0.3, 0, 59.45);                        // a correct position, well inside
const PE = V(-0.15, 0, TA.z0 - 0.6 * BALL_R);       // straddling the front edge: centre 1.3 cm ahead, rear of the ball above the area
const PR = V(0.25, 0, 59.0);                        // replay from inside the teeing area (Rule 6.1b)
const PL = V(TA.x0 + 0.12, 0, 59.6);                // ball inside near the left edge, the player stands outside (allowed)
const PM = V(-2.0, 0, 58.55);                       // ball near the left marker: the marker is in the way of the stance
const MKMOVE = V(-0.12, 0, -0.75);                  // where the marker would be dragged (breach of Rule 6.2b(4))
const LAND = V(1.0, 0, 6.0);                        // where the tee shot from PF comes to rest (match play, not cancelled)
const MX = TAC.x + 0.3;                             // line along which the two club-lengths are measured
const CHECK = {
  TA: [TA.x0, TA.x1, TA.z0, TA.z1].map(v => +v.toFixed(3)), depth_is_2CL: Math.abs(TA.z1 - TA.z0 - 2 * CL) < 1e-9,
  front_through_marker_fronts: MK.every(m => Math.abs(m.z - MARK_R - TA.z0) < 1e-9),
  sides_through_marker_outsides: Math.abs(TA.x0 - (MK[0].x - MARK_R)) < 1e-9 && Math.abs(TA.x1 - (MK[1].x + MARK_R)) < 1e-9,
  PF_out: !ballInTA(PF), PF_ahead_of_front_m: +(TA.z0 - PF.z - BALL_R).toFixed(3),
  PS_out: !ballInTA(PS), PS_outside_side_m: +(PS.x - TA.x1 - BALL_R).toFixed(3),
  PE_centre_ahead: PE.z < TA.z0, PE_in: ballInTA(PE), PE_part_over_m: +(PE.z + BALL_R - TA.z0).toFixed(4),
  PI_in: ballInTA(PI), PR_in: ballInTA(PR), PL_in: ballInTA(PL), PM_in: ballInTA(PM), MX_in: MX > TA.x0 && MX < TA.x1
};

// ------------------------------------------------------------------ ground texture
const GT = 4096, GS = 200, PX = GT / GS;
function paintGround() {
  const cv = document.createElement('canvas'); cv.width = cv.height = GT; const g = cv.getContext('2d');
  g.setTransform(PX, 0, 0, PX, 100 * PX, 100 * PX);
  g.fillStyle = '#4f6c2d'; g.fillRect(-100, -100, 200, 200);
  for (let i = 0; i < 6000; i++) {
    g.globalAlpha = 0.05 + rnd() * 0.06; g.fillStyle = rnd() < .5 ? '#3f5b24' : '#62803a';
    g.beginPath(); g.arc(-100 + rnd() * 200, -100 + rnd() * 200, 0.6 + rnd() * 5, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
  g.strokeStyle = '#cbbf9f'; g.lineWidth = 2.2; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); PATHPTS.forEach((p, i) => i ? g.lineTo(p.x, p.z) : g.moveTo(p.x, p.z)); g.stroke();
  g.strokeStyle = '#b6aa89'; g.lineWidth = 0.15; g.stroke();
  // fairway
  const fw = new Path2D(); const zs = [];
  for (let z = -46.5; z <= 54; z += 0.25) zs.push(z);
  zs.forEach((z, i) => { const x = -fwHalf(z); i ? fw.lineTo(x, z) : fw.moveTo(x, z); });
  [...zs].reverse().forEach(z => fw.lineTo(fwHalf(z), z)); fw.closePath();
  g.strokeStyle = '#668a36'; g.lineWidth = 3.2; g.stroke(fw);
  g.fillStyle = '#7fa646'; g.fill(fw);
  g.save(); g.clip(fw);
  for (let x = -18, k = 0; x < 18; x += 3, k++) { g.fillStyle = k % 2 ? 'rgba(255,255,230,0.05)' : 'rgba(20,40,0,0.05)'; g.fillRect(x, -50, 3, 110); }
  for (let z = -50, k = 0; z < 60; z += 6, k++) { g.fillStyle = k % 2 ? 'rgba(255,255,230,0.018)' : 'rgba(20,40,0,0.018)'; g.fillRect(-20, z, 40, 6); }
  g.restore();
  // apron + green (mown in stripes)
  g.beginPath(); g.arc(HOLE.x, HOLE.z, 12.2, 0, 7); g.fillStyle = '#76a043'; g.fill();
  g.beginPath(); g.arc(HOLE.x, HOLE.z, 10, 0, 7); g.fillStyle = '#76a344'; g.fill();
  g.beginPath(); g.arc(HOLE.x, HOLE.z, 8.4, 0, 7); g.fillStyle = '#8cbd51'; g.fill();
  g.save(); g.clip();
  for (let k = -20; k < 20; k++) { g.save(); g.translate(HOLE.x, HOLE.z); g.rotate(0.6); g.fillStyle = k % 2 ? 'rgba(255,255,220,0.07)' : 'rgba(0,30,0,0.06)'; g.fillRect(k * 1.3, -12, 1.3, 24); g.restore(); }
  g.restore();
  // tee box (flat, mown in stripes)
  g.save(); g.fillStyle = '#86b04b'; g.beginPath(); g.roundRect(-4.8, 57.2, 9.6, 6.4, 0.9); g.fill(); g.clip();
  g.fillStyle = '#7ea645'; g.fillRect(-5, 57, 10, 7);
  for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? 'rgba(255,255,215,0.13)' : 'rgba(0,30,0,0.12)'; g.fillRect(-4.8 + k * 1.2, 57, 1.2, 7); }
  g.restore();
  // bunkers
  for (const b of BUNKERS) {
    g.save(); g.translate(b.x, b.z); g.rotate(-b.a);
    g.fillStyle = '#a8955f'; g.beginPath(); g.ellipse(0, 0, b.rx + 0.25, b.rz + 0.25, 0, 0, 7); g.fill();
    g.fillStyle = '#c9b487'; g.beginPath(); g.ellipse(0, 0, b.rx, b.rz, 0, 0, 7); g.fill(); g.restore();
  }
  // water banks + rough mottling + grain (pixel pass)
  g.setTransform(1, 0, 0, 1, 0, 0);
  const id = g.getImageData(0, 0, GT, GT), d = id.data;
  const tn = vnoise(512, 10, 5), tn2 = vnoise(512, 40, 3);
  const dry = [146, 150, 78], lush = [52, 84, 34];
  const bankA = [86, 98, 50], bankB = [62, 66, 38], bed = [34, 44, 30];
  for (let py = 0; py < GT; py++) {
    const z = py / PX - 100;
    for (let px = 0; px < GT; px++) {
      const i = (py * GT + px) * 4; const x = px / PX - 100;
      const n = (rnd() - .5) * 14;
      if (z > -100 && z < -46 && x > -4 && x < 46) {
        const sd = pondSD(x, z);
        if (sd < 0.5) {
          let col;
          if (sd > 0) { const k = sd / 0.5; col = [lerp(bankA[0], d[i], k), lerp(bankA[1], d[i + 1], k), lerp(bankA[2], d[i + 2], k)]; }
          else if (sd > -1.0) { const k = -sd; col = [lerp(bankA[0], bankB[0], k), lerp(bankA[1], bankB[1], k), lerp(bankA[2], bankB[2], k)]; }
          else col = bed;
          d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2];
        }
      }
      {
        const fs = fairwaySD(x, z), dg = Math.hypot(x - HOLE.x, z - HOLE.z);
        const rough = sstep(0.8, 3.0, fs) * sstep(12.4, 14.5, dg) * sstep(0.5, 2, teeSD(x, z)) * sstep(0.3, 1.2, pondSD(x, z));
        if (rough > 0) {
          const k1 = tn[((py >> 3) & 511) * 512 + ((px >> 3) & 511)], k2 = tn2[((py >> 2) & 511) * 512 + ((px >> 2) & 511)];
          const a = rough * sstep(0.45, 0.75, k1) * 0.45, b = rough * sstep(0.55, 0.25, k1) * 0.35;
          d[i] = lerp(lerp(d[i], dry[0], a), lush[0], b); d[i + 1] = lerp(lerp(d[i + 1], dry[1], a), lush[1], b); d[i + 2] = lerp(lerp(d[i + 2], dry[2], a), lush[2], b);
          const m = 0.88 + 0.24 * k2; d[i] *= m; d[i + 1] *= m; d[i + 2] *= m;
        }
      }
      d[i] += n; d[i + 1] += n; d[i + 2] += n * .6;
    }
  }
  g.putImageData(id, 0, 0);
  g.fillStyle = '#4f6c2d'; const b = 24; g.fillRect(0, 0, GT, b); g.fillRect(0, GT - b, GT, b); g.fillRect(0, 0, b, GT); g.fillRect(GT - b, 0, b, GT);
  return cv;
}

// ------------------------------------------------------------------ scene
const scene = new THREE.Scene();
scene.environment = envTex; scene.environmentIntensity = 0.55;
scene.fog = new THREE.FogExp2(SKY.hor.clone(), 0.00165);
const sky = makeSky(1800); scene.add(sky);
const sun = new THREE.DirectionalLight(new THREE.Color('#ffd7a3'), 3.1);
sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight('#c4d6e6', '#5c6634', 1.05));
function aimShadow(c, size) {
  sun.position.copy(c).addScaledVector(SUN, 300); sun.target.position.copy(c); sun.target.updateMatrixWorld();
  const sc = sun.shadow.camera; sc.left = -size; sc.right = size; sc.top = size; sc.bottom = -size; sc.near = 150; sc.far = 460; sc.updateProjectionMatrix();
}
let detailTex, groundMat;
const C = {};

function buildCourse() {
  const groundTex = texFrom(paintGround()); groundTex.wrapS = groundTex.wrapT = THREE.ClampToEdgeWrapping;
  const dn = vnoise(512, 16, 4), dn2 = vnoise(512, 64, 2);
  detailTex = texFrom(canvasFrom(512, i => [dn[i] * 255, dn2[i] * 255, 0]), false, true);
  groundMat = new THREE.MeshLambertMaterial({ map: groundTex });
  groundMat.onBeforeCompile = sh => {
    sh.uniforms.detailMap = { value: detailTex };
    sh.fragmentShader = 'uniform sampler2D detailMap;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float dn = texture2D(detailMap, vMapUv*95.0).r*0.55 + texture2D(detailMap, vMapUv*380.0).g*0.45;
      diffuseColor.rgb *= mix(0.80, 1.17, dn);
      float dh = texture2D(detailMap, vMapUv*41.0).g;
      diffuseColor.rgb *= mix(vec3(1.07,1.01,0.84), vec3(0.94,1.02,1.07), dh);`);
  };
  function terrain(size, seg, lower) {
    const g = new THREE.PlaneGeometry(size, size, seg, seg); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i); let y = heightAt(x, z);
      if (lower && Math.abs(x) < 99 && Math.abs(z) < 99) y -= 3;
      p.setY(i, y); uv.setXY(i, (x + 100) / 200, 1 - (z + 100) / 200);
    }
    g.computeVertexNormals(); return g;
  }
  const core = new THREE.Mesh(terrain(200, 320, false), groundMat); core.receiveShadow = true; scene.add(core);
  const outer = new THREE.Mesh(terrain(1700, 170, true), groundMat); outer.receiveShadow = true; outer.layers.set(1); scene.add(outer);

  // water (still, reflective)
  const wh = vnoise(512, 6, 5);
  const wn = texFrom(normalFromHeight(wh, 512, 40), false, true);
  const water = new Water(new THREE.PlaneGeometry(64, 64), {
    textureWidth: 300, textureHeight: 534, waterNormals: wn, sunDirection: SUN.clone(),
    sunColor: 0xf3e2c2, waterColor: 0x123f3e, distortionScale: 0.22, fog: true, alpha: 1
  });
  water.rotation.x = -Math.PI / 2; water.position.set(POND.x, WATER_Y, POND.z); scene.add(water);
  C.water = water;

  // yellow line on the edge of the penalty area + yellow stakes
  const contour = [];
  for (let k = 0; k <= 720; k++) {
    const a = k / 720 * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
    let lo = 0, hi = 40; for (let j = 0; j < 40; j++) { const m = (lo + hi) / 2; if (penSD(POND.x + dx * m, POND.z + dz * m) < 0) lo = m; else hi = m; }
    contour.push([POND.x + dx * lo, POND.z + dz * lo]);
  }
  C.contour = contour;
  function strip(pts, w, mat, lift = 0.03) {
    const pos = [], idx = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
      const nx = -tz, nz = tx, [x, z] = pts[i];
      for (const s of [-1, 1]) { const px = x + nx * w / 2 * s, pz = z + nz * w / 2 * s; pos.push(px, Math.max(heightAt(px, pz), WATER_Y + 0.01) + lift, pz); }
      if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m); return m;
  }
  C.yLineMat = new THREE.MeshStandardMaterial({ color: YEL, roughness: 0.7, emissive: new THREE.Color(YEL), emissiveIntensity: 0.05, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  strip(contour, 0.12, C.yLineMat);
  const glowTex = texFrom(canvasFrom(64, i => { const y = ((i / 64) | 0) / 63; const v = Math.pow(Math.sin(y * Math.PI), 2) * 255; return [v, v, v]; }), false);
  C.yGlow = strip(contour, 1.1, new THREE.MeshBasicMaterial({ color: '#ffd86a', alphaMap: glowTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }), 0.05);
  { const uv = []; const n = C.yGlow.geometry.attributes.position.count; for (let i = 0; i < n; i++) uv.push(i % 2, i % 2); C.yGlow.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); C.yGlow.receiveShadow = false; C.yGlow.renderOrder = 5; }
  const stakeGeo = mergeGeometries([new THREE.CylinderGeometry(0.03, 0.034, 0.95, 14).translate(0, 0.475, 0), new THREE.SphereGeometry(0.03, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.95, 0)]);
  C.yMat = new THREE.MeshStandardMaterial({ color: YEL, roughness: 0.42, metalness: 0.05, emissive: new THREE.Color(YEL), emissiveIntensity: 0 });
  const sp = []; let acc = 0, next = 2.0;
  for (let i = 1; i < contour.length; i++) {
    acc += Math.hypot(contour[i][0] - contour[i - 1][0], contour[i][1] - contour[i - 1][1]);
    if (acc >= next) { next += 5.5; const [x, z] = contour[i]; const gx = x - POND.x, gz = z - POND.z, gl = Math.hypot(gx, gz); const p = [x + gx / gl * 0.3, z + gz / gl * 0.3];
      sp.push(p); }
  }
  const sm = new THREE.InstancedMesh(stakeGeo, C.yMat, sp.length); const o = new THREE.Object3D();
  sp.forEach(([x, z], i) => { o.position.set(x, heightAt(x, z) - 0.04, z); o.rotation.set((rnd() - .5) * 0.06, rnd() * 6, (rnd() - .5) * 0.06); o.updateMatrix(); sm.setMatrixAt(i, o.matrix); });
  sm.castShadow = true; sm.receiveShadow = true; scene.add(sm); C.stakes = sp;

  // flag + cup (real size: pin 2.13 m)
  const pinY = heightAt(HOLE.x, HOLE.z);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 2.13, 12).translate(0, 1.065, 0), new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.35 }));
  pin.position.set(HOLE.x, pinY, HOLE.z); pin.castShadow = true; scene.add(pin);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.9, roughness: 0.25 }));
  knob.position.set(HOLE.x, pinY + 2.14, HOLE.z); scene.add(knob);
  const cup = new THREE.Mesh(new THREE.CircleGeometry(0.054, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#111', roughness: 1, polygonOffset: true, polygonOffsetFactor: -4 }));
  cup.position.set(HOLE.x, pinY + 0.02, HOLE.z); scene.add(cup);
  const fg = new THREE.PlaneGeometry(0.5, 0.34, 18, 8).translate(0.25, 0, 0);
  C.flagBase = fg.attributes.position.array.slice();
  C.flag = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ color: '#f3ead2', roughness: 0.8, side: THREE.DoubleSide }));
  C.flag.position.set(HOLE.x + 0.012, pinY + 1.94, HOLE.z); C.flag.rotation.y = 2.2; C.flag.castShadow = true; scene.add(C.flag);
  buildTee();
  buildTrees();
}

// ------------------------------------------------------------------ trees (foliage cards)
function paint(g, fn) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3), col = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(p.getX(i), p.getY(i), p.getZ(i), col); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
function trunkGeo(r0, r1, h) { const g = new THREE.CylinderGeometry(r1, r0, h, 8, 1).translate(0, h / 2, 0); g.deleteAttribute('uv'); return paint(g, (x, y, z, c) => c.set('#5a4532')); }
function leafAtlasTex() {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * 256, oy = (v >> 1) * 256;
    g.save(); g.beginPath(); g.rect(ox + 2, oy + 2, 252, 252); g.clip();
    g.strokeStyle = 'rgb(70,60,50)'; g.lineWidth = 2.2; g.lineCap = 'round';
    for (let k = 0; k < 4; k++) { const a = rnd() * 6.28; g.beginPath(); g.moveTo(ox + 128, oy + 128); g.quadraticCurveTo(ox + 128 + Math.cos(a + 0.4) * 50, oy + 128 + Math.sin(a + 0.4) * 50, ox + 128 + Math.cos(a) * 95, oy + 128 + Math.sin(a) * 95); g.stroke(); }
    const n = 520 + v * 30;
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.283, rr = Math.pow(rnd(), 0.62);
      const edge = 0.82 + 0.18 * Math.sin(a * 5 + v) * Math.sin(a * 3 + 1.7 * v);
      const r = 116 * rr * edge;
      const x = ox + 128 + Math.cos(a) * r, y = oy + 128 + Math.sin(a) * r * 0.94;
      const lx = (x - ox - 128) / 110, ly = (y - oy - 128) / 110;
      const light = 0.78 + 0.22 * clamp(0.5 - 0.45 * (lx * 0.5 + ly * 0.85)) - 0.18 * (1 - rr);
      const k = Math.min(255, (light * (0.8 + 0.28 * rnd())) * 255) | 0;
      g.fillStyle = `rgb(${k},${Math.min(255, k + 6)},${Math.max(0, k - 14)})`;
      g.save(); g.translate(x, y); g.rotate(rnd() * 6.28);
      const L = 7 + rnd() * 7, Wd = 3.2 + rnd() * 2.6;
      g.beginPath(); g.moveTo(-L, 0); g.quadraticCurveTo(0, -Wd * 1.6, L, 0); g.quadraticCurveTo(0, Wd * 1.6, -L, 0); g.fill(); g.restore();
    }
    g.restore();
  }
  const t = texFrom(cv); t.anisotropy = 4; return t;
}
const BILLBOARD = `
  vec3 cC = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float cS = length(instanceMatrix[0].xyz);
  float cr = cos(aRot), sr = sin(aRot);
  vec2 qv = vec2(position.x * cr - position.y * sr, position.x * sr + position.y * cr) * cS;
  vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 cW = (modelMatrix * vec4(cC, 1.0)).xyz + camR * qv.x + camU * qv.y;
  vec4 mvPosition = viewMatrix * vec4(cW, 1.0);
  gl_Position = projectionMatrix * mvPosition;`;
function patchCard(sh, depth) {
  sh.vertexShader = 'attribute vec3 aN;\nattribute vec2 aAtlas;\nattribute float aRot;\n' + sh.vertexShader
    .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = uv * 0.5 + aAtlas;\n#endif')
    .replace('#include <project_vertex>', BILLBOARD);
  if (!depth) sh.vertexShader = sh.vertexShader
    .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = aN;')
    .replace('#include <worldpos_vertex>', 'vec4 worldPosition = vec4(cW, 1.0);');
}
function cardMaterials(tex) {
  const m = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.42, alphaToCoverage: true });
  m.onBeforeCompile = sh => patchCard(sh, false);
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.42 });
  d.onBeforeCompile = sh => patchCard(sh, true);
  return [m, d];
}
function cardMesh(cards, mats, layer) {
  const geo = new THREE.PlaneGeometry(1, 1), n = cards.length;
  const aN = new Float32Array(n * 3), aA = new Float32Array(n * 2), aR = new Float32Array(n);
  const m = new THREE.InstancedMesh(geo, mats[0], n), M = new THREE.Matrix4(), col = new THREE.Color();
  cards.forEach((c, i) => {
    M.makeScale(c.s, c.s, c.s); M.setPosition(c.x, c.y, c.z); m.setMatrixAt(i, M);
    aN[i * 3] = c.nx; aN[i * 3 + 1] = c.ny; aN[i * 3 + 2] = c.nz;
    aA[i * 2] = (c.v % 2) * 0.5; aA[i * 2 + 1] = (1 - (c.v >> 1)) * 0.5; aR[i] = c.r;
    col.setRGB(c.cr, c.cg, c.cb); m.setColorAt(i, col);
  });
  geo.setAttribute('aN', new THREE.InstancedBufferAttribute(aN, 3));
  geo.setAttribute('aAtlas', new THREE.InstancedBufferAttribute(aA, 2));
  geo.setAttribute('aRot', new THREE.InstancedBufferAttribute(aR, 1));
  m.customDepthMaterial = mats[1]; m.castShadow = false; m.receiveShadow = false;
  m.computeBoundingSphere(); m.boundingSphere.radius += 3;
  if (layer === 1) m.layers.set(1);
  scene.add(m); return m;
}
function cardColor(base, shade, o) { const j = 0.9 + rnd() * 0.2; o.cr = base.r * shade * j; o.cg = base.g * shade * j; o.cb = base.b * shade * j * (0.92 + rnd() * 0.12); }
function sphereDir() { const u = rnd() * 2 - 1, th = rnd() * 6.283, q = Math.sqrt(1 - u * u); return [q * Math.cos(th), u, q * Math.sin(th)]; }
function genDeciduous(x, z, s, o) {
  const y0 = heightAt(x, z) - 0.1;
  const base = new THREE.Color().setHSL(0.19 + rnd() * 0.08, 0.40 + rnd() * 0.22, 0.30 + rnd() * 0.10);
  const Hh = (4.6 + rnd() * 1.6) * s, R = (2.3 + rnd() * 0.5) * s;
  const lumps = [[0, Hh, 0, R]]; const nl = 3 + (rnd() * 3 | 0);
  for (let i = 0; i < nl; i++) { const a = rnd() * 6.28, d = (0.9 + rnd() * 0.9) * s; lumps.push([Math.cos(a) * d * 1.3, Hh + (rnd() - 0.55) * 1.8 * s, Math.sin(a) * d * 1.3, (1.25 + rnd() * 0.6) * s]); }
  lumps.push([(rnd() - .5) * s, Hh + 1.5 * s, (rnd() - .5) * s, 1.5 * s]);
  for (const [lx, ly, lz, r] of lumps) {
    const n = Math.round(7 + r / s * 2.6);
    for (let i = 0; i < n; i++) {
      const [dx, dy, dz] = sphereDir(); const rr = r * (0.45 + 0.55 * Math.sqrt(rnd()));
      const px = x + lx + dx * rr, py = y0 + ly + dy * rr * 0.82, pz = z + lz + dz * rr;
      let nx = px - x, ny = (py - y0 - Hh) * 1.1 + 0.9 * s, nz = pz - z; const L = Math.hypot(nx, ny, nz) || 1;
      const c = { x: px, y: py, z: pz, s: r * (0.88 + rnd() * 0.4), nx: nx / L, ny: ny / L, nz: nz / L, v: (rnd() * 4) | 0, r: (rnd() - .5) * 0.9 };
      cardColor(base, (0.62 + 0.38 * rr / r) * (0.8 + 0.2 * (dy * 0.5 + 0.5)), c); o.push(c);
    }
  }
  return { H: Hh };
}
function genConifer(x, z, s, o) {
  const y0 = heightAt(x, z) - 0.1;
  const base = new THREE.Color().setHSL(0.30 + rnd() * 0.06, 0.32 + rnd() * 0.15, 0.20 + rnd() * 0.06);
  const Hh = (6.8 + rnd() * 1.8) * s, R = (2.0 + rnd() * 0.5) * s, h0 = 1.4 * s;
  for (let i = 0; i < 38; i++) {
    const t = Math.min(0.9, rnd()), h = h0 + t * (Hh - h0), rad = (R * (1 - t) + 0.25 * s) * (0.55 + 0.45 * rnd()), a = rnd() * 6.283;
    let nx = Math.cos(a), ny = 0.55, nz = Math.sin(a); const L = Math.hypot(nx, ny, nz);
    const c = { x: x + Math.cos(a) * rad, y: y0 + h, z: z + Math.sin(a) * rad, s: (0.85 + (1 - t) * 1.35) * s, nx: nx / L, ny: ny / L, nz: nz / L, v: (rnd() * 4) | 0, r: (rnd() - .5) * 0.6 };
    cardColor(base, 0.7 + 0.3 * rad / (R + 0.1), c); o.push(c);
  }
  return { H: Hh };
}
function genCypress(x, z, s, o) {
  const y0 = heightAt(x, z) - 0.1;
  const base = new THREE.Color().setHSL(0.27 + rnd() * 0.05, 0.34, 0.2 + rnd() * 0.05);
  const Hh = (8.5 + rnd() * 2.5) * s, R = 1.05 * s;
  for (let i = 0; i < 20; i++) {
    const t = rnd(), h = 1.0 * s + t * (Hh - 1.0 * s), prof = Math.sin(Math.PI * Math.pow(t, 0.8)) * R + 0.15 * s, a = rnd() * 6.283, rad = prof * (0.5 + 0.5 * rnd());
    let nx = Math.cos(a), ny = 0.3, nz = Math.sin(a); const L = Math.hypot(nx, ny, nz);
    const c = { x: x + Math.cos(a) * rad, y: y0 + h, z: z + Math.sin(a) * rad, s: (0.95 + 0.5 * rnd()) * s, nx: nx / L, ny: ny / L, nz: nz / L, v: (rnd() * 4) | 0, r: (rnd() - .5) * 0.5 };
    cardColor(base, 0.72 + 0.28 * rad / (prof + 0.01), c); o.push(c);
  }
  return { H: Hh };
}
function genFar(x, z, s, o) {
  const y0 = heightAt(x, z) - 0.1;
  const base = new THREE.Color().setHSL(0.21 + rnd() * 0.08, 0.38 + rnd() * 0.15, 0.27 + rnd() * 0.08);
  const Hh = 5.5 * s, R = 3.0 * s;
  for (let i = 0; i < 6; i++) {
    const [dx, dy, dz] = sphereDir(); const rr = R * (0.4 + 0.6 * rnd());
    const c = { x: x + dx * rr, y: y0 + Hh + dy * rr * 0.8, z: z + dz * rr, s: R * (1.0 + rnd() * 0.4), nx: dx * 0.6, ny: 0.8, nz: dz * 0.6, v: (rnd() * 4) | 0, r: (rnd() - .5) * 0.6 };
    cardColor(base, 0.75 + 0.25 * rr / R, c); o.push(c);
  }
  return { H: Hh };
}
function trunkGeo2() {
  const parts = [new THREE.CylinderGeometry(0.14, 0.3, 4.2, 9).translate(0, 2.1, 0)];
  for (const [a, tilt, y, L] of [[0.3, 0.8, 2.3, 2.0], [2.4, 0.7, 2.7, 1.8], [4.3, 0.9, 3.0, 1.6], [5.5, 0.55, 3.4, 1.3]]) {
    const b = new THREE.CylinderGeometry(0.05, 0.11, L, 6).translate(0, L / 2, 0); b.rotateZ(tilt); b.rotateY(a); b.translate(0, y, 0); parts.push(b);
  }
  parts.forEach(g => g.deleteAttribute('uv'));
  return paint(mergeGeometries(parts), (x, y, z, c) => c.set('#4b3c2e').multiplyScalar(0.8 + 0.25 * clamp(y / 4)));
}
function segDist(x, z, a, b) { const abx = b.x - a.x, abz = b.z - a.z, t = clamp(((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz)); return Math.hypot(x - a.x - abx * t, z - a.z - abz * t); }
function buildTrees() {
  const lists = { d: [], c: [], y: [], f: [] };
  const ok = (x, z) => pondSD(x, z) > 6 && fairwaySD(x, z) > 3.2 && Math.hypot(x - HOLE.x, z - HOLE.z) > 24 && teeSD(x, z) > 6 && pathDist(x, z) > 2.6 &&
    !(x > -16 && x < 16 && z > 62 && z < 74) && BUNKERS.every(b => bunkerSD(b, x, z) > 3);
  for (let gx = -120; gx <= 120; gx += 5.6) for (let gz = -120; gz <= 120; gz += 5.6) {
    const x = gx + (rnd() - .5) * 4.2, z = gz + (rnd() - .5) * 4.2;
    if (!ok(x, z)) continue;
    const r = rnd(); const s = 0.8 + rnd() * 0.55;
    (r < 0.66 ? lists.d : r < 0.9 ? lists.c : lists.y).push([x, z, s]);
  }
  for (let gx = -280; gx <= 280; gx += 11) for (let gz = -280; gz <= 280; gz += 11) {
    const x = gx + (rnd() - .5) * 8, z = gz + (rnd() - .5) * 8; if (Math.abs(x) < 122 && Math.abs(z) < 122) continue;
    if (Math.hypot(x, z) > 300) continue; lists.f.push([x, z, 1 + rnd() * 0.8]);
  }
  const mats = cardMaterials(leafAtlasTex());
  const gens = { d: genDeciduous, c: genConifer, y: genCypress, f: genFar };
  const buckets = {}, trunks = [];
  for (const k of ['d', 'c', 'y', 'f']) for (const [x, z, s] of lists[k]) {
    const cell = k === 'f' ? 110 : 34, key = k + (k === 'f' ? 'F' : 'N') + Math.floor(x / cell) + ',' + Math.floor(z / cell);
    const arr = (buckets[key] = buckets[key] || { far: k === 'f', cards: [] });
    const info = gens[k](x, z, s, arr.cards);
    if (k !== 'f') trunks.push([x, z, s, info.H, k]);
  }
  C.treeMeshes = [];
  for (const b of Object.values(buckets)) C.treeMeshes.push(cardMesh(b.cards, mats, b.far ? 1 : 0));
  { const pm = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    const pg = { d: new THREE.IcosahedronGeometry(2.6, 1).scale(1.25, 0.95, 1.25), c: new THREE.ConeGeometry(1.8, 7, 8).translate(0, 4.6, 0), y: new THREE.SphereGeometry(1, 8, 6).scale(1.1, 4.2, 1.1).translate(0, 5.2, 0) };
    for (const k of ['d', 'c', 'y']) {
      const L = trunks.filter(t => t[4] === k); const m = new THREE.InstancedMesh(pg[k], pm, L.length); const o2 = new THREE.Object3D();
      L.forEach(([x, z, s, Hh], i) => { o2.position.set(x, heightAt(x, z) + (k === 'd' ? Hh + 0.3 * s : 0), z); o2.rotation.set(0, rnd() * 6.28, 0); o2.scale.setScalar(s); o2.updateMatrix(); m.setMatrixAt(i, o2.matrix); });
      m.castShadow = true; m.receiveShadow = false; m.renderOrder = -1; scene.add(m);
    }
  }
  const tmat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const tg = { d: trunkGeo2(), c: trunkGeo(0.22, 0.1, 3.0), y: trunkGeo(0.18, 0.1, 2.0) };
  const o = new THREE.Object3D();
  for (const k of ['d', 'c', 'y']) {
    const L = trunks.filter(t => t[4] === k); const m = new THREE.InstancedMesh(tg[k], tmat, L.length);
    L.forEach(([x, z, s, Hh], i) => { o.position.set(x, heightAt(x, z) - 0.15, z); o.rotation.set(0, rnd() * 6.28, 0); o.scale.set(s, k === 'd' ? Hh * 0.82 / 4.2 : s, s); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    m.castShadow = true; m.receiveShadow = true; scene.add(m);
  }
}

// ------------------------------------------------------------------ props
let dimpleTex;
function makeDimples() {
  const w = 512, h = 256, pts = []; const N = 380, ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) { const y = 1 - (i + .5) / N * 2, r = Math.sqrt(1 - y * y), th = ga * i; pts.push([Math.cos(th) * r, y, Math.sin(th) * r]); }
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d'); const id = c.createImageData(w, h);
  const ang = 0.085;
  for (let py = 0; py < h; py++) {
    const lat = Math.PI / 2 - (py + .5) / h * Math.PI, cy = Math.sin(lat), cr = Math.cos(lat);
    for (let px = 0; px < w; px++) {
      const lon = (px + .5) / w * Math.PI * 2; const dx = cr * Math.cos(lon), dz = cr * Math.sin(lon);
      let best = 9, bp = null; for (const p of pts) { const d = (p[0] - dx) ** 2 + (p[1] - cy) ** 2 + (p[2] - dz) ** 2; if (d < best) { best = d; bp = p; } }
      const dist = Math.sqrt(best); let nx = 0, ny = 0;
      if (dist < ang) {
        const k = Math.sin(dist / ang * Math.PI) * 0.9;
        const dlon = Math.atan2(bp[2], bp[0]); let dl = lon - dlon; if (dl > Math.PI) dl -= 2 * Math.PI; if (dl < -Math.PI) dl += 2 * Math.PI;
        const dla = lat - Math.asin(bp[1]); const L = Math.hypot(dl * cr, dla) || 1;
        nx = -dl * cr / L * k; ny = -dla / L * k;
      }
      const L = Math.hypot(nx, ny, 1); const i = (py * w + px) * 4;
      id.data[i] = (nx / L * .5 + .5) * 255; id.data[i + 1] = (ny / L * .5 + .5) * 255; id.data[i + 2] = (1 / L * .5 + .5) * 255; id.data[i + 3] = 255;
    }
  }
  c.putImageData(id, 0, 0); dimpleTex = texFrom(cv, false);
}
function ballMesh(r) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), new THREE.MeshPhysicalMaterial({ color: '#fbfbf7', roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.2, normalMap: dimpleTex, normalScale: new THREE.Vector2(0.9, 0.9) }));
  m.castShadow = true; scene.add(m); return m;
}
let glowTexS;
function addGlow(b, size = 1.2) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexS, color: '#ffe7b0', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
  sp.scale.set(size, size, 1); b.add(sp); b.userData.glow = sp; return sp;
}
function fatLine(pts, color, opts = {}) {
  const g = new LineGeometry(); g.setPositions(pts.flatMap(p => [p.x, p.y, p.z]));
  const m = new LineMaterial({ color, linewidth: opts.w || 4, worldUnits: false, dashed: !!opts.dashed, dashSize: opts.dash || 1.2, gapSize: opts.gap || 0.8, transparent: true, opacity: 1, depthWrite: false, toneMapped: false });
  m.resolution.set(RW, RH);
  const l = new Line2(g, m); l.computeLineDistances(); l.renderOrder = 10; l.userData.n = pts.length - 1; scene.add(l); return l;
}
function revealLine(l, f) { l.geometry.instanceCount = Math.max(0, Math.floor(l.userData.n * clamp(f))); l.visible = f > 0.001; }
function traj(S, L, peak, n) { const a = []; for (let i = 0; i <= n; i++) { const s = i / n; a.push(S.clone().lerp(L, s).add(V(0, 4 * peak * s * (1 - s), 0))); } return a; }
function makeClub(len) {
  const g = new THREE.Group();
  const shaftM = new THREE.MeshStandardMaterial({ color: '#c8ccd0', metalness: 0.9, roughness: 0.28 });
  const gripM = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.75 });
  const headM = new THREE.MeshPhysicalMaterial({ color: '#151a18', metalness: 0.5, roughness: 0.22, clearcoat: 1 });
  const goldM = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.25 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0075, len - 0.27, 12).rotateZ(Math.PI / 2).translate(0.27 + (len - 0.27) / 2, 0, 0), shaftM);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0125, 0.27, 16).rotateZ(Math.PI / 2).translate(0.135, 0, 0), gripM);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20).scale(0.055, 0.03, 0.06), headM); head.position.set(len, 0.0, 0.03);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.002, 8, 20).rotateY(Math.PI / 2), goldM); band.position.x = len - 0.05;
  [shaft, grip, head, band].forEach(m => { m.castShadow = true; g.add(m); }); scene.add(g); return g;
}
function grassPatch(N, okFn, center, radius, h0, h1, w0 = 0.006, bz = 0) {
  const seg = 4, pos = [], col = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const h = i / seg, w = w0 * (1 - h * 0.9), bend = 0.2 * h * h;
    pos.push(-w, h, bend, w, h, bend); const c = 0.58 + 0.42 * h; col.push(c, c, c, c, c, c);
    if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2, k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  const nrm = []; for (let i = 0; i < pos.length / 3; i++) nrm.push(0, 1, 0); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  const m = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), N);
  const o = new THREE.Object3D(), c = new THREE.Color(); let n = 0, guard = 0;
  const greens = ['#6f9a3c', '#86ad4a', '#9cbf5c', '#7aa344', '#a9b866', '#8fb350', '#b5b874', '#7f9f46'].map(x => new THREE.Color(x));
  while (n < N && guard++ < N * 40) {
    const a = rnd() * 6.283, r = Math.sqrt(rnd()) * radius, x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
    let k = okFn(x, z); if (!k) continue; k = (typeof k === 'number' ? k : 1) * (0.25 + 0.75 * sstep(radius, radius * 0.6, r)); if (rnd() > 0.35 + 0.65 * sstep(radius, radius * 0.75, r)) continue;
    o.position.set(x, heightAt(x, z) - 0.004, z); o.rotation.set((rnd() - .5) * 0.6, rnd() * 6.28, (rnd() - .5) * 0.6);
    const hh = (h0 + rnd() * (h1 - h0)) * k; o.scale.set(0.6 + rnd() * 0.7, hh, bz ? hh * bz : 1); o.updateMatrix(); m.setMatrixAt(n, o.matrix);
    c.copy(greens[(rnd() * greens.length) | 0]).multiplyScalar(0.85 + rnd() * 0.3); m.setColorAt(n, c); n++;
  }
  m.count = n; m.receiveShadow = true; m.visible = false; scene.add(m); return m;
}
function clumpTex() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 512; const g = cv.getContext('2d');
  for (let i = 0; i < 120; i++) {
    const a = (rnd() - .5) * 1.3, L = 300 + rnd() * 190, x0 = 128 + (rnd() - .5) * 26;
    const x1 = x0 + Math.sin(a) * L * 0.55, y1 = 512 - Math.cos(a) * L * 0.75, xe = x0 + Math.sin(a) * L * 0.9, ye = 512 - Math.cos(a * 1.2) * L;
    const k = 0.55 + rnd() * 0.45;
    const gr = g.createLinearGradient(0, 512, 0, ye); gr.addColorStop(0, `rgb(${70 * k | 0},${96 * k | 0},${44 * k | 0})`); gr.addColorStop(0.6, `rgb(${150 * k | 0},${160 * k | 0},${92 * k | 0})`); gr.addColorStop(1, `rgb(${222 * k | 0},${205 * k | 0},${150 * k | 0})`);
    g.strokeStyle = gr; g.lineWidth = 2 + rnd() * 2.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, 512); g.quadraticCurveTo(x1, y1, xe, Math.max(8, ye)); g.stroke();
  }
  for (let p = 0; p < 7; p++) {
    const a = (rnd() - .5) * 0.9, L = 380 + rnd() * 110, cx = 128 + Math.sin(a) * L * 0.6, cy = 512 - Math.cos(a) * L;
    for (let i = 0; i < 70; i++) { const t = rnd(); const x = cx + Math.sin(a) * t * 70 + (rnd() - .5) * 16, y = cy + t * 90 + (rnd() - .5) * 10; const k = 200 + rnd() * 50 | 0; g.fillStyle = `rgba(${k},${k - 18},${k - 70},0.9)`; g.beginPath(); g.ellipse(x, y, 2.4, 7, a, 0, 7); g.fill(); }
  }
  return texFrom(cv);
}
// ------------------------------------------------------------------ teeing-area props (real sizes)
function makeTeePeg() {             // wooden tee: 7 cm long, pushed in so that 2.2 cm shows; 6.2 mm cup
  const m = new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 0.55 });
  const g = new THREE.Group(), L = TEE_PEG.len, out = TEE_PEG.out;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0011, L - 0.006, 14).translate(0, out - 0.006 - (L - 0.006) / 2, 0), m);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.0062, 0.0028, 0.006, 24).translate(0, out - 0.003, 0), m);
  [shaft, cup].forEach(o => { o.castShadow = true; o.receiveShadow = true; g.add(o); }); g.visible = false; scene.add(g); return g;
}
function makeMarker() {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.85, roughness: 0.3 });
  const em = new THREE.MeshPhysicalMaterial({ color: '#0c4a34', roughness: 0.25, clearcoat: 1 });
  const s = new THREE.Mesh(new THREE.SphereGeometry(MARK_R, 40, 24), gold); s.position.y = MARK_R * 0.92;
  const band = new THREE.Mesh(new THREE.TorusGeometry(MARK_R * 1.0, MARK_R * 0.1, 10, 48).rotateX(Math.PI / 2), em); band.position.y = MARK_R * 0.92;
  [s, band].forEach(o => { o.castShadow = true; g.add(o); }); scene.add(g); return g;
}
function divotTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const q = cv.getContext('2d');
  const gr = q.createRadialGradient(64, 64, 6, 64, 64, 62); gr.addColorStop(0, 'rgba(192,176,132,0.85)'); gr.addColorStop(0.55, 'rgba(170,156,112,0.7)'); gr.addColorStop(0.85, 'rgba(120,124,72,0.35)'); gr.addColorStop(1, 'rgba(110,128,64,0)');
  q.fillStyle = gr; q.beginPath(); q.ellipse(64, 64, 62, 30, 0, 0, 7); q.fill();
  for (let i = 0; i < 220; i++) { const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 54; const k = 170 + rnd() * 60 | 0; q.fillStyle = `rgba(${k},${k - 14},${k - 50},${0.25 + rnd() * 0.3})`; q.beginPath(); q.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r * 0.5, 0.8 + rnd() * 1.6, 0, 7); q.fill(); }
  return texFrom(cv);
}
// teeing area furniture: the two markers set by the Committee
function buildTee() {
  C.markers = MK.map(m => { const k = makeMarker(); k.position.copy(onGround(m)); return k; });
}
// driver for the address / whiff (club frame: origin = hosel, +Y up the shaft, +Z = face normal, -X = towards the toe)
const HEAD_OFF = V(-0.052, -0.012, -0.012);
function makeDriver() {
  const g = new THREE.Group(); g.matrixAutoUpdate = false; const L = 1.12;
  const shaftM = new THREE.MeshStandardMaterial({ color: '#c8ccd0', metalness: 0.9, roughness: 0.28 });
  const gripM = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.75 });
  const headM = new THREE.MeshPhysicalMaterial({ color: '#111513', metalness: 0.55, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 });
  const goldM = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.25 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0075, L - 0.27, 12).translate(0, 0.03 + (L - 0.27) / 2, 0), shaftM);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0105, 0.27, 16).translate(0, 0.03 + L - 0.27 + 0.135, 0), gripM);
  const hosel = new THREE.Mesh(new THREE.CylinderGeometry(0.0072, 0.0085, 0.05, 12).translate(0, 0.012, 0), headM);
  const soleM = new THREE.MeshStandardMaterial({ color: '#b9bdc2', metalness: 0.95, roughness: 0.32 });
  const faceM = new THREE.MeshStandardMaterial({ color: '#3a3f44', metalness: 0.85, roughness: 0.42 });
  const head = new THREE.Group(); head.position.copy(HEAD_OFF);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(0.058, 0.031, 0.05), headM);
  const sole = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 14, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45).scale(0.058, 0.031, 0.05), soleM);
  const face = new THREE.Mesh(new THREE.CircleGeometry(1, 40).scale(0.04, 0.021, 1), faceM); face.position.z = 0.0496;
  const line = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 6, 64).scale(0.0584, 0.0504, 0.06).rotateX(Math.PI / 2), goldM); line.position.y = -0.0048;
  [crown, sole, face, line].forEach(m => { m.castShadow = true; head.add(m); });
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.0082, 0.0016, 8, 20).rotateX(Math.PI / 2), goldM); band.position.y = 0.05;
  [shaft, grip, hosel, head, band].forEach(m => { m.castShadow = true; g.add(m); }); g.visible = false; scene.add(g); return g;
}
function poseDriver(club, headC, hands, face) {
  let hosel = headC.clone(), X, Y, Z;
  for (let k = 0; k < 3; k++) {
    Y = hands.clone().sub(hosel).normalize(); Z = face.clone().addScaledVector(Y, -face.dot(Y)).normalize(); X = Y.clone().cross(Z);
    hosel = headC.clone().addScaledVector(X, -HEAD_OFF.x).addScaledVector(Y, -HEAD_OFF.y).addScaledVector(Z, -HEAD_OFF.z);
  }
  club.matrix.makeBasis(X, Y, Z).setPosition(hosel); club.matrixWorldNeedsUpdate = true;
}
// teeing-area tint (rectangle from the rule geometry above)
function makeTeeZone() {
  const U = { R: { value: new THREE.Vector4(TA.x0, TA.x1, TA.z0, TA.z1) }, op: { value: 0 }, rim: { value: 0 } };
  const pad = 0.1, w = TA.x1 - TA.x0 + 2 * pad, d = TA.z1 - TA.z0 + 2 * pad;
  const zg = new THREE.PlaneGeometry(w, d, 48, 24).rotateX(-Math.PI / 2).translate(TAC.x, 0, TAC.z);
  const zp = zg.attributes.position; for (let i = 0; i < zp.count; i++) zp.setY(i, heightAt(zp.getX(i), zp.getZ(i)) + 0.006);
  const m = new THREE.Mesh(zg, new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
    vertexShader: `varying vec2 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform vec4 R; uniform float op, rim; varying vec2 vW;
      void main(){ if(vW.x<R.x||vW.x>R.y||vW.y<R.z||vW.y>R.w) discard;
        float e=min(min(vW.x-R.x,R.y-vW.x),min(vW.y-R.z,R.w-vW.y));
        float edge=1.0-smoothstep(0.0,0.045,e);
        vec4 c=vec4(0.97,0.86,0.55,0.17+edge*(0.55+0.4*rim));
        gl_FragColor=vec4(c.rgb,c.a*op);
        #include <colorspace_fragment>
      }` }));
  m.renderOrder = 7; m.visible = false; scene.add(m); return { m, U };
}
const segPts = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a.clone().lerp(b, i / n));
function ghostBall() { const b = ballMesh(BALL_R); b.material = b.material.clone(); b.material.transparent = true; b.material.opacity = 0.4; b.material.depthWrite = false; b.castShadow = false; b.visible = false; return b; }
const ballOnTee = p => onGround(p, TEE_PEG.out + TEE_SEAT);
// a ball teed at p (ball + wooden tee), shown/hidden together
function teedBall(p) { const b = ballMesh(BALL_R); b.position.copy(ballOnTee(p)); b.visible = false; const t = makeTeePeg(); t.position.copy(onGround(p)); return { b, t, p }; }
function buildProps() {
  makeDimples();
  { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,240,200,0.55)'); gr.addColorStop(1, 'rgba(255,220,150,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); glowTexS = texFrom(cv); }
  C.ball = ballMesh(BALL_R); addGlow(C.ball, 0.35);              // the ball that is played from PF
  C.teeF = makeTeePeg(); C.teeF.position.copy(onGround(PF));
  C.ghostF = ghostBall();                                           // where the stroke from outside was played
  C.S = { F: teedBall(PF), S: teedBall(PS), I: teedBall(PI), E: teedBall(PE), R: teedBall(PR), L: teedBall(PL), M: teedBall(PM) };
  C.zone = makeTeeZone();
  const P = (x, z) => onGround(V(x, 0, z), 0.014);
  C.eFront = fatLine(segPts(P(TA.x0, TA.z0), P(TA.x1, TA.z0), 60), GOLD_L, { w: 4, dashed: true, dash: 0.1, gap: 0.07 });
  C.eL = fatLine(segPts(P(TA.x0, TA.z0), P(TA.x0, TA.z1), 40), GOLD_L, { w: 3 });
  C.eR = fatLine(segPts(P(TA.x1, TA.z0), P(TA.x1, TA.z1), 40), GOLD_L, { w: 3 });
  C.eB = fatLine(segPts(P(TA.x0, TA.z1), P(TA.x1, TA.z1), 60), GOLD_L, { w: 3 });
  C.clubM1 = makeClub(CL); C.clubM2 = makeClub(CL); C.clubM1.visible = C.clubM2.visible = false;
  C.driver = makeDriver();
  // golfer (photographic cut-out supplied by the client) as a camera-facing card
  { const tex = new THREE.TextureLoader().load('golfer_cut.png'); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const hgt = 958 * 0.0018, wid = 616 * 0.0018;
    C.golfer = new THREE.Mesh(new THREE.PlaneGeometry(wid, hgt).translate(0, hgt / 2, 0), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.03, toneMapped: false, color: '#efe8de' }));
    const f = tgtDir(PR), d = V(-f.z, 0, f.x);
    C.golferPos = PR.clone().addScaledVector(d, -0.95).addScaledVector(f, -0.35); C.golferPos.y = heightAt(C.golferPos.x, C.golferPos.z) + 0.02;
    C.golfer.position.copy(C.golferPos); C.golfer.visible = false; C.golfer.renderOrder = 20; scene.add(C.golfer);
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.25, depthWrite: false }));
    sh.scale.set(1, 1, 0.55); sh.position.copy(C.golferPos).setY(C.golferPos.y - 0.012); sh.visible = false; scene.add(sh); C.golferShadow = sh; }
  // short, fine tee-box grass blades for the close shots
  const onTee = (x, z) => teeSD(x, z) < -0.15 ? 1 : 0;
  C.gT = grassPatch(50000, onTee, TAC, 4.6, 0.008, 0.018, 0.0022, 1.2);
  C.gD = [PF, PE, PM].map(c => grassPatch(36000, onTee, c, 0.85, 0.007, 0.016, 0.0016, 1.2));
}
function buildClumps() {
  const tex = clumpTex();
  const parts = [0, Math.PI / 3, 2 * Math.PI / 3].flatMap(a => [new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateY(a), new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateY(a + Math.PI)]);
  const geo = mergeGeometries(parts); const nr = geo.attributes.normal; for (let i = 0; i < nr.count; i++) nr.setXYZ(i, 0, 1, 0);
  const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.4, alphaToCoverage: true });
  const pts = []; const cont = C.contour;
  for (let i = 0; i < cont.length; i += 3) {
    if (rnd() > 0.55) continue;
    const [x, z] = cont[i]; const gx = x - POND.x, gz = z - POND.z, gl = Math.hypot(gx, gz); const off = 0.5 + rnd() * 1.6;
    const p = [x + gx / gl * off, z + gz / gl * off];
    if (Math.hypot(p[0] - HOLE.x, p[1] - HOLE.z) < 13) continue;
    pts.push(p);
  }
  for (let i = 0; i < 22; i++) pts.push([-24 - rnd() * 10, -40 - rnd() * 6]);
  const m = new THREE.InstancedMesh(geo, mat, pts.length); const o = new THREE.Object3D(), c = new THREE.Color();
  pts.forEach(([x, z], i) => { const h = 1.0 + rnd() * 0.9, w = 0.9 + rnd() * 0.7; o.position.set(x, heightAt(x, z) - 0.05, z); o.rotation.set(0, rnd() * 6.28, 0); o.scale.set(w, h, w); o.updateMatrix(); m.setMatrixAt(i, o.matrix); c.setRGB(0.9 + rnd() * 0.2, 0.9 + rnd() * 0.15, 0.85 + rnd() * 0.1); m.setColorAt(i, c); });
  m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.4 });
  m.castShadow = true; m.receiveShadow = true; scene.add(m);
}
function buildHills() {
  const layers = [{ r: 520, h: 58, col: '#6a8264', sd: 1.3 }, { r: 690, h: 105, col: '#7f948a', sd: 2.7 }];
  for (const L of layers) {
    const N = 400, pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const a = i / N * Math.PI * 2;
      const ridge = L.h * (0.42 + 0.28 * Math.sin(a * 3 + L.sd) + 0.17 * Math.sin(a * 7 + 2 * L.sd) + 0.09 * Math.sin(a * 17 + L.sd * 3) + 0.04 * Math.sin(a * 43 + L.sd));
      const r = L.r * (1 + 0.07 * Math.sin(a * 5 + L.sd));
      pos.push(Math.cos(a) * r, -5, Math.sin(a) * r, Math.cos(a) * r, Math.max(10, ridge), Math.sin(a) * r);
      if (i < N) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: L.col, side: THREE.DoubleSide, fog: true }));
    m.layers.set(1); scene.add(m);
  }
}

// ------------------------------------------------------------------ typography & overlays
function fade(t, a, b, fi = 0.4, fo = 0.4) { return win(t, a, b, fi, fo); }
function spaced(g, text, x, y, sp) { g.letterSpacing = sp + 'px'; g.fillText(text, x + (g.textAlign === 'center' ? sp / 2 : 0), y); g.letterSpacing = '0px'; }
function drawTitle(o, t) {
  const a = fade(t, o.t0, o.t1, o.fi || 0.5, 0.45); if (a <= 0) return;
  const rise = (1 - eout(prog(t, o.t0, o.t0 + 0.9))) * 18;
  ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center';
  const y = o.y || 268; const size = o.size || 92; const lines = Array.isArray(o.title) ? o.title : [o.title]; const lh = size * 1.02;
  ctx.shadowColor = 'rgba(0,18,10,0.55)'; ctx.shadowBlur = 26;
  ctx.fillStyle = GOLD_L; ctx.font = '500 25px "Be Vietnam Pro"'; spaced(ctx, o.k.toUpperCase(), W / 2, y + rise, 9);
  ctx.fillStyle = CREAM; ctx.font = `500 ${size}px "Cormorant Garamond"`;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, y + 10 + size + i * lh + rise));
  ctx.shadowBlur = 0;
  const ly = y + 44 + size + (lines.length - 1) * lh;
  const rw = 70 * eout(prog(t, o.t0 + 0.2, o.t0 + 1.0)); ctx.fillStyle = GOLD; ctx.fillRect(W / 2 - rw, ly + rise, rw * 2, 2);
  if (o.sub) { ctx.shadowBlur = 20; ctx.fillStyle = CREAM; ctx.font = 'italic 500 46px "Cormorant Garamond"'; ctx.fillText(o.sub, W / 2, ly + 62 + rise); }
  ctx.restore();
}
// projection with an optional split-screen mapping
const PJ = { x0: 0, w: W, x1: W };
function project(p) { const v = p.clone().project(camera); return { x: PJ.x0 + (v.x + 1) / 2 * PJ.w, y: (1 - v.y) / 2 * H, ok: v.z < 1 && v.z > -1 }; }
function drawLabel(l, t) {
  const a = fade(t, l.t0, l.t1, 0.35, 0.3); if (a <= 0) return;
  const p = project(typeof l.p === 'function' ? l.p() : l.p); if (!p.ok) return;
  const dx = l.dx ?? 70; let dy = l.dy ?? -110;
  if (p.y + dy < 600) dy = Math.abs(dy); if (p.y + dy > 1360) dy = -Math.abs(dy);
  const ex = p.x + dx, ey = p.y + dy;
  const grow = eout(prog(t, l.t0, l.t0 + 0.5));
  ctx.save(); ctx.globalAlpha = a;
  ctx.strokeStyle = l.c || GOLD_L; ctx.fillStyle = l.c || GOLD_L; ctx.lineWidth = 2;
  if (!l.noDot) { ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 7); ctx.fill(); }
  ctx.beginPath(); ctx.moveTo(p.x + dx * 0.12, p.y + dy * 0.12); ctx.lineTo(lerp(p.x, ex, grow), lerp(p.y, ey, grow)); ctx.stroke();
  ctx.font = `500 ${l.fs || 31}px "Be Vietnam Pro"`; ctx.letterSpacing = '1px';
  const tw = ctx.measureText(l.text).width; const right = dx >= 0; const bx = clamp(right ? ex : ex - tw - 44, PJ.x0 + 24, PJ.x1 - 24 - tw - 44), by = ey - 30;
  ctx.globalAlpha = a * grow;
  ctx.fillStyle = 'rgba(4,40,28,0.82)'; ctx.beginPath(); ctx.roundRect(bx, by, tw + 44, 60, 30); ctx.fill();
  ctx.strokeStyle = l.c || GOLD; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = CREAM; ctx.textAlign = 'left'; ctx.fillText(l.text, bx + 22, by + 41);
  ctx.restore();
}
function wrapLines(text, maxW) {
  const out2 = []; for (const para of text.split('\n')) {
    const words = para.split(' '); let line = '';
    for (const w of words) { const test = line ? line + ' ' + w : w; if (ctx.measureText(test).width > maxW && line) { out2.push(line); line = w; } else line = test; }
    out2.push(line);
  } return out2;
}
function drawSubs(t) {
  const s = SUBS.find(s => t >= s[0] - 0.05 && t < s[1] + 0.05); if (!s) return;
  const a = Math.min(sstep(s[0] - 0.05, s[0] + 0.12, t), 1 - sstep(s[1] - 0.08, s[1] + 0.05, t));
  ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.font = '400 48px "Be Vietnam Pro"'; ctx.letterSpacing = '0.5px';
  const lines = wrapLines(s[2], 960); const lh = 66; const base = 1548 - (lines.length - 1) * lh;
  ctx.save(); ctx.filter = 'blur(20px)'; ctx.fillStyle = 'rgba(2,22,15,0.5)';
  lines.forEach((ln, i) => { const w = ctx.measureText(ln).width; ctx.fillRect(W / 2 - w / 2 - 30, base + i * lh - 48, w + 60, 66); });
  ctx.restore();
  ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 16; ctx.fillStyle = CREAM;
  lines.forEach((ln, i) => ctx.fillText(ln, W / 2, base + i * lh));
  ctx.restore();
}
function drawScrims(t) {
  let g = ctx.createLinearGradient(0, H - 720, 0, H); g.addColorStop(0, 'rgba(3,26,18,0)'); g.addColorStop(0.55, 'rgba(3,26,18,0.42)'); g.addColorStop(1, 'rgba(3,22,15,0.72)');
  ctx.fillStyle = g; ctx.fillRect(0, H - 720, W, 720);
  const ta = Math.max(...TITLES.map(o => fade(t, o.t0 - 0.2, o.t1 + 0.2, 0.6, 0.6)), 0);
  if (ta > 0) { g = ctx.createLinearGradient(0, 0, 0, 760); g.addColorStop(0, `rgba(3,30,20,${0.62 * ta})`); g.addColorStop(1, 'rgba(3,30,20,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, 760); }
}
function drawCheck(x, y, s, color, lw) { ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(x - s * 0.5, y); ctx.lineTo(x - s * 0.12, y + s * 0.38); ctx.lineTo(x + s * 0.55, y - s * 0.42); ctx.stroke(); ctx.restore(); }
function drawCross(x, y, s, color, lw) { ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke(); ctx.restore(); }
// medallions: "KHÔNG PHẠT" (gold tick) and the stroke counter "SỐ GẬY n"
function drawMedal(x, y, a, big, small, opts = {}) {
  if (a <= 0) return; const p = eback(clamp(a * 1.25)); const pop = opts.pop ? 1 + 0.18 * Math.sin(clamp(opts.pop) * Math.PI) : 1;
  ctx.save(); ctx.globalAlpha = clamp(a * 1.5); ctx.translate(x, y); ctx.scale((0.7 + 0.3 * p) * pop, (0.7 + 0.3 * p) * pop);
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 30; ctx.fillStyle = 'rgba(7,54,38,0.94)'; ctx.beginPath(); ctx.arc(0, 0, 92, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
  ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.stroke(); ctx.strokeStyle = 'rgba(201,165,92,0.55)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, 80, 0, 7); ctx.stroke();
  ctx.textAlign = 'center';
  if (big === '✓') drawCheck(0, -2, 64, GOLD_L, 8);
  else { ctx.fillStyle = GOLD_L; ctx.font = '300 72px "Be Vietnam Pro"'; ctx.fillText(big, 0, 22); }
  ctx.fillStyle = CREAM; ctx.font = '500 19px "Be Vietnam Pro"'; spaced(ctx, small, 0, 54, 4);
  ctx.restore();
  if (opts.note && opts.noteA > 0) { ctx.save(); ctx.globalAlpha = a * opts.noteA; ctx.textAlign = 'center'; ctx.shadowColor = 'rgba(0,18,10,0.8)'; ctx.shadowBlur = 14;
    ctx.fillStyle = CREAM; ctx.font = 'italic 500 34px "Cormorant Garamond"'; ctx.fillText(opts.note, x - 10, y + 136); ctx.restore(); }
}
function drawRing3(p, r, color, alpha, lw = 3) {
  if (alpha <= 0) return; ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.beginPath();
  for (let i = 0; i <= 64; i++) { const a = i / 64 * 6.283; const q = project(onSurface(V(p.x + Math.cos(a) * r, 0, p.z + Math.sin(a) * r), 0.02)); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }
  ctx.stroke(); ctx.restore();
}
function drawPulse(p, color, a, base = 14) {
  if (a <= 0) return; const q = project(p); if (!q.ok) return;
  ctx.save(); ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 14;
  for (let i = 0; i < 2; i++) { const ph = ((performance.now() * 0 + CURT * 0.8 + i * 0.5) % 1); ctx.globalAlpha = a * (1 - ph); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(q.x, q.y, base + ph * 34, 0, 7); ctx.stroke(); }
  ctx.globalAlpha = a; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(q.x, q.y, 6, 0, 7); ctx.fill(); ctx.restore();
}
const SOLE = [[0, -0.145], [0.03, -0.14], [0.042, -0.11], [0.045, -0.06], [0.05, 0.0], [0.055, 0.05], [0.055, 0.09], [0.048, 0.12], [0.03, 0.142], [0.0, 0.148], [-0.03, 0.142], [-0.045, 0.12], [-0.048, 0.08], [-0.04, 0.04], [-0.03, 0.0], [-0.032, -0.05], [-0.038, -0.1], [-0.03, -0.137]];
const tgtDir = p => HV.clone().sub(p).setY(0).normalize();
function feet(p) { const f = tgtDir(p), d = V(-f.z, 0, f.x), base = p.clone().addScaledVector(d, -0.62); return [base.clone().addScaledVector(f, 0.26), base.clone().addScaledVector(f, -0.26), d, f]; }
function drawFeet(p, color, alpha) {
  if (alpha <= 0) return; const [fa, fb, dir, f] = feet(p);
  ctx.save(); ctx.globalAlpha = alpha; ctx.lineWidth = 3; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12;
  [[fa, 1], [fb, -1]].forEach(([c, side]) => {
    const toe = dir.clone().multiplyScalar(Math.cos(0.2)).addScaledVector(f, side * Math.sin(0.2)).normalize();
    let xa = V(toe.z, 0, -toe.x); if (xa.dot(f) * side < 0) xa.negate();
    ctx.beginPath();
    SOLE.forEach(([lx, ly], i) => { const w = c.clone().addScaledVector(xa, lx).addScaledVector(toe, ly); const q = project(onGround(w, 0.012)); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
    ctx.closePath(); ctx.globalAlpha = alpha * 0.3; ctx.fill(); ctx.globalAlpha = alpha; ctx.stroke();
  });
  ctx.restore();
}
function clubAt(p, th) {
  const f = tgtDir(p), d = V(-f.z, 0, f.x);
  const Hp = p.clone().addScaledVector(d, -0.36); Hp.y = heightAt(p.x, p.z) + 0.78;
  const head0 = V(p.x, heightAt(p.x, p.z) + 0.025, p.z).addScaledVector(d, -0.03);
  const v0 = head0.clone().sub(Hp); let n = v0.clone().cross(f).normalize();
  const test = v0.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(n, 0.1)); if (test.dot(f) > v0.dot(f)) n.negate();
  const v = v0.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(n, th)); return { hands: Hp, head: Hp.clone().add(v) };
}
function drawClub(p, th, color, alpha, arcFrom = null) {
  if (alpha <= 0) return; const c = clubAt(p, th); const a = project(c.hands), b = project(c.head);
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 14; ctx.lineCap = 'round';
  if (arcFrom !== null) { ctx.setLineDash([10, 9]); ctx.lineWidth = 3; ctx.globalAlpha = alpha * 0.8; ctx.beginPath();
    const n = 40; for (let i = 0; i <= n; i++) { const tt = lerp(arcFrom, th, i / n); const q = project(clubAt(p, tt).head); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); } ctx.stroke(); ctx.setLineDash([]); }
  ctx.globalAlpha = alpha; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  const ang = Math.atan2(b.y - a.y, b.x - a.x); ctx.translate(b.x, b.y); ctx.rotate(ang + Math.PI / 2); ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, 0, 16, 8, 0, 0, 7); ctx.fill();
  ctx.restore();
}
function wrapW(text, maxW) { const words = text.split(' '); const lines = []; let line = ''; for (const w of words) { const tst = line ? line + ' ' + w : w; if (ctx.measureText(tst).width > maxW && line) { lines.push(line); line = w; } else line = tst; } lines.push(line); return lines; }
function motes(a, t, t0) {
  ctx.save(); for (let i = 0; i < 46; i++) { const sx = ((i * 0.6180339) % 1) * W + Math.sin(t * 0.4 + i) * 24, sy = H + 120 - (((t - t0) * (18 + (i % 7) * 6) + i * 211) % (H + 240)); const r = 1.5 + (i % 5) * 0.9;
    ctx.globalAlpha = a * (0.18 + 0.3 * (0.5 + 0.5 * Math.sin(t * 2 + i))); ctx.fillStyle = GOLD_L; ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.fill(); } ctx.restore();
}
// rule card (same layout as film_dieu16-1.js)
function drawCard(cd, t) {
  const a = fade(t, cd.t0, cd.t1, 0.5, 0.45); if (a <= 0) return;
  motes(a, t, cd.t0);
  const sc = 0.94 + 0.06 * eout(prog(t, cd.t0, cd.t0 + 0.8));
  ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, 920); ctx.scale(sc, sc); ctx.translate(-W / 2, -920);
  const x0 = 84, x1 = W - 84, pw = x1 - x0;
  ctx.font = '400 36px "Be Vietnam Pro"'; const blines = cd.bullets.map(b => wrapW(b[1], pw - 210));
  const bh = blines.reduce((s, l) => s + l.length * 52 + 38, 0);
  const top = 440, hgt = 400 + bh + 150, bot = top + hgt;
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 50; ctx.fillStyle = 'rgba(7,54,38,0.93)'; ctx.fillRect(x0, top, pw, hgt); ctx.shadowBlur = 0;
  ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.strokeRect(x0 + 0.5, top + 0.5, pw - 1, hgt - 1); ctx.strokeStyle = 'rgba(201,165,92,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(x0 + 14, top + 14, pw - 28, hgt - 28);
  const ta = sstep(cd.tt, cd.tt + 0.5, t), tr = (1 - eout(prog(t, cd.tt, cd.tt + 0.8))) * 14;
  ctx.globalAlpha = a * ta; ctx.textAlign = 'center'; ctx.fillStyle = GOLD_L; ctx.font = '600 26px "Be Vietnam Pro"'; spaced(ctx, cd.k, W / 2, top + 98 + tr, 8);
  const kw = ctx.measureText(cd.k).width + 8 * cd.k.length; for (const s of [-1, 1]) { ctx.save(); ctx.translate(W / 2 + s * (kw / 2 + 26), top + 89 + tr); ctx.rotate(Math.PI / 4); ctx.fillRect(-5, -5, 10, 10); ctx.restore(); }
  ctx.fillStyle = CREAM; ctx.font = '600 66px "Cormorant Garamond"'; cd.title.forEach((l, i) => ctx.fillText(l, W / 2, top + 190 + i * 74 + tr));
  const rw = 90 * eout(prog(t, cd.tt + 0.3, cd.tt + 1.1)); ctx.fillStyle = GOLD; ctx.fillRect(W / 2 - rw, top + 318, rw * 2, 2);
  let y = top + 400; ctx.textAlign = 'left';
  cd.bullets.forEach((b, i) => { const ba = sstep(b[0], b[0] + 0.45, t), bx = (1 - eout(prog(t, b[0], b[0] + 0.7))) * 26; ctx.globalAlpha = a * ba;
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x0 + 92 + bx, y - 12, 22, 0, 7); ctx.stroke();
    ctx.fillStyle = GOLD_L; ctx.font = '600 28px "Cormorant Garamond"'; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), x0 + 92 + bx, y - 3); ctx.textAlign = 'left';
    ctx.fillStyle = CREAM; ctx.font = '400 36px "Be Vietnam Pro"'; blines[i].forEach((l, k) => ctx.fillText(l, x0 + 138 + bx, y + k * 52)); y += blines[i].length * 52 + 38; });
  { const [tb, label] = cd.button; const ba = sstep(tb, tb + 0.4, t), bs = 0.85 + 0.15 * eback(prog(t, tb, tb + 0.6)); ctx.globalAlpha = a * ba;
    ctx.save(); ctx.translate(W / 2, bot - 96); ctx.scale(bs, bs); ctx.font = '600 30px "Be Vietnam Pro"'; const lw = ctx.measureText(label).width + label.length * 4 + 70; const bw = Math.max(440, lw + 40);
    ctx.fillStyle = '#dcc287'; ctx.beginPath(); ctx.roundRect(-bw / 2, -40, bw, 80, 6); ctx.fill(); ctx.strokeStyle = 'rgba(255,240,200,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = EMER_D; ctx.textAlign = 'center'; spaced(ctx, label, 22, 11, 4); drawCheck(-lw / 2 + 30, 0, 26, EMER_D, 4.5); ctx.restore(); }
  ctx.restore();
}
function drawEnd(t) {
  const o = { t0: 61.0, t1: 99, k: 'Luật golf chuẩn', title: ['Bóng trong khu vực,', 'người được đứng ngoài'], size: 72, sub: 'Căn cứ: Luật 6.1b, 6.2b(4)', fi: 0.7 };
  drawTitle(o, t);
}
// ------------------------------------------------------------------ scene B (scorecard)
const sceneB = new THREE.Scene();
const B = {};
const CW = 1120, CH = 1720, CS = 2;  // card design px
function hand(ctx2, strokes, prog01, lw, col) {
  // strokes: arrays of [x,y]; draw up to cumulative fraction
  const lens = strokes.map(s => { let L = 0; for (let i = 1; i < s.length; i++) L += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]); return L; });
  const tot = lens.reduce((a, b) => a + b, 0); let rem = prog01 * tot; let tip = null;
  ctx2.lineCap = 'round'; ctx2.lineJoin = 'round'; ctx2.strokeStyle = col; ctx2.lineWidth = lw;
  strokes.forEach((s, k) => {
    if (rem <= 0) return; ctx2.beginPath(); ctx2.moveTo(s[0][0], s[0][1]); tip = s[0];
    for (let i = 1; i < s.length; i++) {
      const d = Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
      if (rem >= d) { ctx2.lineTo(s[i][0], s[i][1]); rem -= d; tip = s[i]; }
      else { const f = rem / d; tip = [lerp(s[i - 1][0], s[i][0], f), lerp(s[i - 1][1], s[i][1], f)]; ctx2.lineTo(tip[0], tip[1]); rem = 0; break; }
    }
    ctx2.stroke();
  });
  return tip;
}
const sampleCurve = (fn, n) => { const a = []; for (let i = 0; i <= n; i++) a.push(fn(i / n)); return a; };
function digit(d, cx, cy, s) {
  const P = (x, y) => [cx + (x - 0.5) * s * 0.7, cy + (y - 0.5) * s];
  if (d === 4) return [[P(0.2, 0), P(0.05, 0.64), P(0.92, 0.62)], [P(0.66, 0.12), P(0.63, 1.0)]];
  if (d === 3) return [sampleCurve(u => { const a = lerp(-2.6, 1.57, u); return P(0.45 + 0.33 * Math.cos(a), 0.27 + 0.25 * Math.sin(a)); }, 24).concat(sampleCurve(u => { const a = lerp(-1.57, 2.6, u); return P(0.45 + 0.36 * Math.cos(a), 0.74 + 0.25 * Math.sin(a)); }, 24))];
  if (d === 5) return [[P(0.85, 0.02), P(0.25, 0.02), P(0.17, 0.46)].concat(sampleCurve(u => { const a = lerp(-2.4, 2.5, u); return P(0.47 + 0.34 * Math.cos(a), 0.7 + 0.29 * Math.sin(a)); }, 30))];
  if (d === 6) return [sampleCurve(u => { const q = [[0.78, 0.02], [0.18, 0.18], [0.14, 0.7]]; const a = (1 - u) ** 2, b = 2 * u * (1 - u), c = u * u; return P(a * q[0][0] + b * q[1][0] + c * q[2][0], a * q[0][1] + b * q[1][1] + c * q[2][1]); }, 20).concat(sampleCurve(u => { const a = lerp(Math.PI, -Math.PI, u); return P(0.46 + 0.32 * Math.cos(a), 0.7 + 0.29 * Math.sin(a)); }, 40))];
  return [];
}
const TBL = { x0: 70, x1: 1050, lab: 170, rowH: [78, 70, 130] };
TBL.col = (TBL.x1 - TBL.x0 - TBL.lab) / 9;
function cellRect(table, row, colI) { const top = table === 0 ? 470 : 860; const ys = [top, top + TBL.rowH[0], top + TBL.rowH[0] + TBL.rowH[1], top + TBL.rowH[0] + TBL.rowH[1] + TBL.rowH[2]]; return { x: TBL.x0 + TBL.lab + colI * TBL.col, y: ys[row], w: TBL.col, h: ys[row + 1] - ys[row] }; }
function paintCard() {
  const cv = document.createElement('canvas'); cv.width = CW * CS; cv.height = CH * CS; const g = cv.getContext('2d'); g.scale(CS, CS);
  g.fillStyle = '#f6f0e1'; g.fillRect(0, 0, CW, CH);
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(120,100,60,${rnd() * 0.05})`; g.fillRect(rnd() * CW, rnd() * CH, 1 + rnd() * 2, 1 + rnd() * 2); }
  g.strokeStyle = GOLD; g.lineWidth = 3; g.strokeRect(36, 36, CW - 72, CH - 72); g.lineWidth = 1.2; g.strokeRect(48, 48, CW - 96, CH - 96);
  // emblem
  g.save(); g.translate(CW / 2, 150); g.strokeStyle = GOLD; g.lineWidth = 2.5; g.beginPath(); g.arc(0, 0, 46, 0, 7); g.stroke();
  g.lineWidth = 1; g.beginPath(); g.arc(0, 0, 39, 0, 7); g.stroke();
  g.fillStyle = EMER; g.fillRect(-2, -26, 4, 50); g.beginPath(); g.moveTo(2, -26); g.lineTo(28, -16); g.lineTo(2, -6); g.closePath(); g.fillStyle = GOLD; g.fill();
  g.fillStyle = EMER; g.beginPath(); g.ellipse(0, 25, 18, 4, 0, 0, 7); g.fill(); g.restore();
  g.textAlign = 'center'; g.fillStyle = EMER; g.font = '600 92px "Cormorant Garamond"'; g.fillText('PHIẾU GHI ĐIỂM', CW / 2, 300);
  g.fillStyle = GOLD; g.font = '500 25px "Be Vietnam Pro"'; g.letterSpacing = '10px'; g.fillText('SCORECARD  ·  CHAMPIONSHIP COURSE', CW / 2 + 5, 352); g.letterSpacing = '0px';
  g.fillStyle = GOLD; g.fillRect(CW / 2 - 70, 385, 140, 2);
  const pars = [[4, 4, 3, 5, 4, 3, 4, 5, 4], [4, 5, 3, 4, 4, 4, 3, 5, 4]];
  for (let t = 0; t < 2; t++) {
    const top = t === 0 ? 470 : 860;
    const tot = TBL.rowH.reduce((a, b) => a + b, 0);
    g.fillStyle = EMER; g.fillRect(TBL.x0, top, TBL.x1 - TBL.x0, TBL.rowH[0]);
    g.strokeStyle = 'rgba(11,71,51,0.7)'; g.lineWidth = 1.5; g.strokeRect(TBL.x0, top, TBL.x1 - TBL.x0, tot);
    let y = top; for (const h of TBL.rowH) { y += h; g.beginPath(); g.moveTo(TBL.x0, y); g.lineTo(TBL.x1, y); g.stroke(); }
    for (let i = 0; i <= 9; i++) { const x = TBL.x0 + TBL.lab + i * TBL.col; g.beginPath(); g.moveTo(x, top); g.lineTo(x, top + tot); g.stroke(); }
    g.font = '600 26px "Be Vietnam Pro"'; g.letterSpacing = '4px'; g.textAlign = 'left';
    g.fillStyle = GOLD_L; g.fillText('HỐ', TBL.x0 + 22, top + 50);
    g.fillStyle = EMER; g.fillText('PAR', TBL.x0 + 22, top + TBL.rowH[0] + 46);
    g.fillText('SỐ GẬY', TBL.x0 + 22, top + TBL.rowH[0] + TBL.rowH[1] + 76); g.letterSpacing = '0px';
    g.textAlign = 'center';
    for (let i = 0; i < 9; i++) {
      const cx = TBL.x0 + TBL.lab + (i + .5) * TBL.col;
      g.fillStyle = CREAM; g.font = '500 40px "Cormorant Garamond"'; g.fillText(String(t * 9 + i + 1), cx, top + 53);
      g.fillStyle = EMER; g.font = '500 38px "Cormorant Garamond"'; g.fillText(String(pars[t][i]), cx, top + TBL.rowH[0] + 48);
    }
  }
  // pre-written pencil scores
  const pre = [4, 5, 3, 5];          // holes 1-4; hole 5 is being played
  pre.forEach((d, i) => { const r = cellRect(0, 2, i); const dx = i === 4 ? -14 : 0; g.save(); g.globalAlpha = 0.85; hand(g, digit(d, r.x + r.w / 2 + dx, r.y + r.h / 2 + 4, 70), 1, 5.5, '#36383d'); g.restore(); });
  g.textAlign = 'left'; g.fillStyle = EMER; g.font = 'italic 500 34px "Cormorant Garamond"';
  g.fillText('Người chơi', 90, 1330); g.fillText('Ngày', 640, 1330); g.fillText('Chữ ký người ghi', 90, 1460);
  g.strokeStyle = 'rgba(11,71,51,0.5)'; g.lineWidth = 1.2;
  [[250, 1332, 590], [720, 1332, 1030], [350, 1462, 1030]].forEach(([a, y, b]) => { g.beginPath(); g.moveTo(a, y); g.lineTo(b, y); g.stroke(); });
  g.textAlign = 'center'; g.fillStyle = GOLD; g.font = '500 22px "Be Vietnam Pro"'; g.letterSpacing = '8px'; g.fillText('LUẬT GOLF  ·  LUẬT 6.1b', CW / 2 + 4, 1600); g.letterSpacing = '0px';
  return cv;
}
// strokes on hole-5 cell, in card design px
const C5 = cellRect(0, 2, 4);
const C5c = { x: C5.x + C5.w / 2 - 14, y: C5.y + C5.h / 2 + 4 };
const STROKE_REGION = { x: C5.x - 80, y: C5.y - 70, w: 300, h: 280 };
const STR = {
  x1: [[[C5c.x - 30, C5c.y - 40], [C5c.x + 28, C5c.y + 38]]],
  x2: [[[C5c.x + 28, C5c.y - 42], [C5c.x - 30, C5c.y + 40]]],
  five: digit(5, C5c.x + 62, C5c.y + 42, 74)
};
// hole 5: the whiff was left out (4) -> crossed out and corrected to 5 before the card is returned
const B_T = { x1: [998, 998.3], x2: [998.4, 998.7], five: [998.8, 999] };   // 1.2: no pencil strokes, the card gets a stamp (drawScoreOverlay)
function buildScorecard() {
  sceneB.background = new THREE.Color('#041f16');
  sceneB.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; sceneB.environmentIntensity = 0.32;
  const key = new THREE.SpotLight('#ffe0b5', 260, 40, 0.55, 0.85, 1.6); key.position.set(-5, 13, -4); key.target.position.set(0.6, 0, -0.6);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0002; key.shadow.radius = 4; sceneB.add(key, key.target);
  sceneB.add(new THREE.HemisphereLight('#fff3df', '#0b2a1f', 0.45));
  const rim = new THREE.DirectionalLight('#ffbf70', 0.9); rim.position.set(7, 3, -9); sceneB.add(rim);
  // leather table
  const ln = vnoise(512, 32, 4);
  const leather = texFrom(canvasFrom(512, i => { const v = ln[i]; return [8 + v * 18, 52 + v * 30, 38 + v * 20]; }), true, true); leather.repeat.set(5, 5);
  const bump = texFrom(canvasFrom(512, i => { const v = ln[i] * 255; return [v, v, v]; }), false, true); bump.repeat.set(14, 14);
  const table = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: leather, bumpMap: bump, bumpScale: 1.2, roughness: 0.62, color: '#cfe0d5' }));
  table.receiveShadow = true; sceneB.add(table);
  // card
  B.card = new THREE.Group(); B.card.rotation.y = 0.1; sceneB.add(B.card);
  const base = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.05, 8.6), new THREE.MeshStandardMaterial({ color: '#efe7d3', roughness: 0.85 }));
  base.position.y = 0.025; base.castShadow = true; base.receiveShadow = true; B.card.add(base);
  const cardTex = texFrom(paintCard()); cardTex.anisotropy = 16;
  const top = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 8.6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: cardTex, roughness: 0.8 }));
  top.position.y = 0.0505; top.receiveShadow = true; B.card.add(top);
  // dynamic pencil strokes
  B.scv = document.createElement('canvas'); B.scv.width = STROKE_REGION.w * 2; B.scv.height = STROKE_REGION.h * 2; B.sctx = B.scv.getContext('2d');
  B.stex = texFrom(B.scv);
  const sw = STROKE_REGION.w / CW * 5.6, sh = STROKE_REGION.h / CH * 8.6;
  const sp = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: B.stex, transparent: true, roughness: 0.55, metalness: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  const c = designToLocal(STROKE_REGION.x + STROKE_REGION.w / 2, STROKE_REGION.y + STROKE_REGION.h / 2); sp.position.set(c.x, 0.052, c.z); B.card.add(sp);
  // pencil
  B.pencil = new THREE.Group(); sceneB.add(B.pencil);
  const pg = new THREE.Group(); B.pencil.add(pg);
  const lac = new THREE.MeshPhysicalMaterial({ color: '#0c4a34', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 });
  const wood = new THREE.MeshStandardMaterial({ color: '#d9b98a', roughness: 0.8 });
  const lead = new THREE.MeshStandardMaterial({ color: '#2b2b2e', roughness: 0.4, metalness: 0.5 });
  const goldM = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.22 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 4.0, 6), lac); body.position.y = 0.62 + 2.0;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.52, 6).rotateX(Math.PI), wood); cone.position.y = 0.36 + 0.0;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 12).rotateX(Math.PI), lead); tip.position.y = 0.08;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.08, 6), goldM); band.position.y = 4.35;
  const band2 = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.03, 6), goldM); band2.position.y = 4.2;
  [body, cone, tip, band, band2].forEach(m => { m.castShadow = true; pg.add(m); });
  pg.quaternion.setFromUnitVectors(V(0, 1, 0), V(0.52, 0.76, 0.4).normalize());
  // ball, tee, marker coin
  const ball = ballMesh(1.07); ball.position.set(4.3, 1.07, -3.9); sceneB.add(ball);
  const teeM = new THREE.MeshStandardMaterial({ color: '#e9dcc2', roughness: 0.5 });
  const tee = new THREE.Group(); const ts = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.03, 2.3, 16), teeM); ts.position.y = 1.15;
  const th = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.08, 0.3, 24), teeM); th.position.y = 2.42; tee.add(ts, th);
  tee.children.forEach(m => m.castShadow = true); tee.rotation.set(0, 0.7, Math.PI / 2 - 0.08); tee.position.set(4.2, 0.26, -1.3); sceneB.add(tee);
  const coin = new THREE.Group(); const cm = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 64), goldM);
  const ce = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.065, 64), new THREE.MeshPhysicalMaterial({ color: '#0c4a34', roughness: 0.2, clearcoat: 1 }));
  coin.add(cm, ce); coin.children.forEach(m => m.castShadow = true); coin.position.set(-3.6, 0.03, 3.3); sceneB.add(coin);
  B.cell = cardToWorld(C5c.x + 25, C5c.y + 20); B.cell5 = cardToWorld(C5c.x + 62, C5c.y + 42);
  { const r6 = cellRect(0, 0, 5); B.cell6 = cardToWorld(r6.x + r6.w / 2, r6.y + r6.h / 2); }
}
function designToLocal(x, y) { return V((x / CW - .5) * 5.6, 0.05, (y / CH - .5) * 8.6); }
function cardToWorld(x, y) { B.card.updateMatrixWorld(); return B.card.localToWorld(designToLocal(x, y)); }
function updateScorecard(t) {
  const g = B.sctx; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, B.scv.width, B.scv.height);
  g.setTransform(2, 0, 0, 2, -STROKE_REGION.x * 2, -STROKE_REGION.y * 2);
  let tip = null, writing = false;
  for (const k of ['x1', 'x2', 'five']) {
    const [a, b] = B_T[k]; const p = prog(t, a, b);
    if (p > 0) { const tp = hand(g, STR[k], esin(p), 6, 'rgba(48,50,56,0.92)'); if (t <= b) { tip = tp; writing = true; } }
  }
  B.stex.needsUpdate = true;
  // pencil pose
  const order = ['x1', 'x2', 'five'];
  const startOf = k => STR[k][0][0], endOf = k => { const s = STR[k][STR[k].length - 1]; return s[s.length - 1]; };
  let pos2, lift = 0;
  const rest = [C5c.x + 260, C5c.y + 200], away = [C5c.x + 420, C5c.y + 380];
  if (writing && tip) { pos2 = tip; lift = 0; }
  else if (t < B_T.x1[0]) { const p = eio(prog(t, 49.6, B_T.x1[0])); pos2 = [lerp(rest[0], startOf('x1')[0], p), lerp(rest[1], startOf('x1')[1], p)]; lift = (1 - p) * 0.9 + Math.sin(p * Math.PI) * 0.3; }
  else if (t > B_T.five[1]) { const p = eio(prog(t, B_T.five[1], B_T.five[1] + 0.9)); const e = endOf('five'); pos2 = [lerp(e[0], away[0], p), lerp(e[1], away[1], p)]; lift = p * 1.6; }
  else {
    for (let i = 0; i < 2; i++) { const a = order[i], b = order[i + 1]; if (t > B_T[a][1] && t < B_T[b][0]) { const p = esin(prog(t, B_T[a][1], B_T[b][0])); const e = endOf(a), s = startOf(b); pos2 = [lerp(e[0], s[0], p), lerp(e[1], s[1], p)]; lift = Math.sin(p * Math.PI) * 0.35; } }
  }
  if (!pos2) pos2 = rest;
  const w = cardToWorld(pos2[0], pos2[1]); B.pencil.position.set(w.x, 0.05 + lift, w.z);
  B.pencil.rotation.set(0, Math.sin(t * 7) * 0.02, writing ? Math.sin(t * 23) * 0.015 : 0);
}


// ------------------------------------------------------------------ timeline (narration timing: kich-ban/am-thanh/1-2/timing.json)
const DUR = 64.969;                // film part; the 3.625 s logo outro (bumper.js) follows
const SUBS = [
  [0.6, 3.595, "Bạn lỡ đặt bóng trước đường nối hai mốc tee, rồi phát bóng."],
  [4.015, 5.977, "Cú đó có hợp lệ, có bị phạt không?"],
  [6.397, 8.22, "Theo luật golf, bạn xử lý thế nào?"],
  [9.12, 12.573, "Luật 6.1b quy định: bóng phải đánh từ trong khu vực phát bóng."],
  [12.993, 14.576, "Khu vực sâu hai chiều dài gậy"],
  [14.616, 16.656, "từ mép trước hai mốc tee lùi về sau."],
  [17.076, 17.989, "Bóng trước đường này"],
  [18.029, 20.107, "hay ngoài hai cạnh bên, là ngoài khu vực."],
  [20.527, 23.022, "Chỉ cần một phần bóng chạm hoặc nằm trên khu vực"],
  [23.062, 24.185, "bóng vẫn là ở trong."],
  [24.605, 25.963, "Còn bạn được đứng ngoài khu vực."],
  [26.863, 28.593, "Trong đấu gậy, bạn bị phạt hai gậy."],
  [29.013, 30.073, "Cú đánh đó không tính"],
  [30.113, 32.252, "bạn phải đánh lại từ trong khu vực phát bóng."],
  [32.672, 34.688, "Nếu không sửa trước khi phát bóng lỗ sau"],
  [34.728, 37.422, "hay trước khi nộp thẻ ở lỗ cuối, bạn bị truất quyền."],
  [37.842, 39.096, "Trong đấu lỗ thì không bị phạt."],
  [39.516, 41.475, "Nhưng đối phương được quyền huỷ ngay cú đánh"],
  [41.515, 43.255, "bạn phải đánh lại từ trong khu vực."],
  [43.675, 45.933, "Nếu đối phương không huỷ, bóng tiếp tục trong cuộc."],
  [46.833, 49.027, "Vậy có được dời mốc tee cho dễ đứng hơn không?"],
  [49.447, 50.422, "Câu trả lời là không!"],
  [50.842, 53.404, "Dời mốc tee để cải thiện cú đánh bị phạt chung"],
  [53.444, 55.301, "đấu gậy hai gậy, đấu lỗ thua lỗ."],
  [56.201, 57.915, "Nhớ nhé: bóng phải trong khu vực"],
  [57.955, 60.659, "đấu gậy phạt hai gậy, đấu lỗ đối phương được huỷ."],
  [61.079, 63.169, "Đặt bóng đúng chỗ, phát bóng thật tự tin!"]
];
const TITLES = [
  { t0: 0.5, t1: 3.75, k: 'Luật golf · Luật 6.1b', title: ['Phát bóng ngoài', 'khu vực phát bóng'], size: 80 },
  { t0: 6.3, t1: 8.65, k: 'Khu vực phát bóng', title: ['Hợp lệ,', 'hay bị phạt?'], size: 84 },
  { t0: 9.05, t1: 12.75, k: 'Luật 6.1b', title: ['Đánh từ trong', 'khu vực phát bóng'], size: 80 },
  { t0: 12.95, t1: 16.8, k: 'Khu vực phát bóng', title: 'Sâu 2 chiều dài gậy', size: 80 },
  { t0: 17.0, t1: 20.25, k: 'Ngoài khu vực', title: ['Trước mép trước,', 'ngoài cạnh bên'], size: 78 },
  { t0: 20.45, t1: 24.35, k: 'Chi tiết then chốt', title: ['Vắt qua mép', 'vẫn là ở trong'], size: 84 },
  { t0: 24.55, t1: 26.3, k: 'Người chơi', title: 'Được đứng ngoài', size: 84 },
  { t0: 26.8, t1: 32.35, k: 'Đấu gậy · Luật 6.1b(2)', title: 'Phạt 2 gậy', size: 92 },
  { t0: 32.6, t1: 37.5, k: 'Đấu gậy · Luật 6.1b(2)', title: ['Không sửa:', 'truất quyền'], size: 84 },
  { t0: 37.8, t1: 39.35, k: 'Đấu lỗ · Luật 6.1b(1)', title: 'Không phạt', size: 92 },
  { t0: 39.45, t1: 43.35, k: 'Đấu lỗ · Luật 6.1b(1)', title: ['Đối phương', 'được huỷ cú đánh'], size: 80 },
  { t0: 43.6, t1: 46.3, k: 'Đấu lỗ · không huỷ', title: 'Bóng trong cuộc', size: 84 },
  { t0: 46.75, t1: 49.3, k: 'Sai lầm thường gặp', title: ['Dời mốc tee', 'cho dễ đứng?'], size: 84 },
  { t0: 49.4, t1: 50.55, k: 'Luật 6.2b(4)', title: 'Không!', size: 128, fi: 0.25 },
  { t0: 50.8, t1: 55.6, k: 'Luật 6.2b(4) · Luật 8.1', title: ['Không dời', 'mốc tee'], size: 84 },
];
const midFeet = p => { const [a, b] = feet(p); return onGround(a.clone().lerp(b, 0.5), 0.01); };
const RED_L = '#ff6b5e', GREEN_L = '#c9f0a4';
const LABELS = [
  { t0: 1.0, t1: 3.75, p: () => ballOnTee(PF), text: 'Bóng trước mốc tee', dx: -60, dy: -170, c: RED_L },
  { t0: 1.6, t1: 3.75, p: () => onGround(V(MK[1].x - 0.4, 0, TA.z0), 0.012), text: 'Mép trước hai mốc tee', dx: 40, dy: 170 },
  { t0: 13.4, t1: 16.8, p: () => onGround(V(TAC.x - 0.9, 0, TA.z0), 0.012), text: 'Mép trước hai mốc tee', dx: -30, dy: -170 },
  { t0: 14.7, t1: 16.8, p: () => onGround(V(MX, 0, TA.z1), 0.012), text: '2 chiều dài gậy', dx: -40, dy: 170 },
  { t0: 17.3, t1: 20.25, p: () => ballOnTee(PF), text: 'Ngoài khu vực', dx: -50, dy: -170, c: RED_L },
  { t0: 18.2, t1: 20.25, p: () => ballOnTee(PS), text: 'Ngoài khu vực', dx: 40, dy: -150, c: RED_L },
  { t0: 18.7, t1: 20.25, p: () => ballOnTee(PI), text: 'Trong khu vực', dx: -40, dy: 170 },
  { t0: 21.8, t1: 24.35, p: () => ballOnTee(PE), text: 'Một phần bóng trên khu vực', dx: -60, dy: -190, c: GREEN_L },
  { t0: 24.8, t1: 26.3, p: () => midFeet(PL), text: 'Người đứng ngoài: hợp lệ', dx: 40, dy: -170, c: GREEN_L },
  { t0: 30.3, t1: 32.35, p: () => ballOnTee(PR), text: 'Đánh lại trong khu vực', dx: -40, dy: -170 },
  { t0: 40.0, t1: 43.35, p: () => trajPt(0.85), text: 'Đối phương huỷ cú đánh', dx: -70, dy: -160, c: RED_L },
  { t0: 41.6, t1: 43.35, p: () => trajPt(0.85), text: 'Nếu huỷ: đánh lại', dx: -70, dy: 160 },
  { t0: 44.2, t1: 46.3, p: () => onGround(LAND, BALL_R), text: 'Bóng tiếp tục trong cuộc', dx: -40, dy: -170 },
  { t0: 47.0, t1: 50.5, p: () => onGround(MK[0], MARK_R * 1.9), text: 'Mốc tee cản thế đứng', dx: 40, dy: -170, c: '#ffb36b' },
  { t0: 52.0, t1: 55.6, p: () => midFeet(PM), text: 'Phạt chung · Luật 8.1', dx: 50, dy: -170, c: RED_L },
];
const LABELS_B = [   // scorecard scene (projected with the scorecard camera)
  { t0: 33.0, t1: 37.45, p: () => B.cell, text: 'Sửa: đánh lại từ khu vực', dx: -70, dy: 210 },
  { t0: 34.1, t1: 37.45, p: () => B.cell6, text: 'Trước khi phát bóng lỗ 6', dx: 40, dy: -200 },
];
const CARDS = [
  { t0: 55.95, t1: 60.95, tt: 56.15, k: 'ĐIỀU 6.1b · 6.2b(4)', title: ['Phát bóng ngoài', 'khu vực phát bóng'],
    bullets: [[56.75, 'Bóng phải trong khu vực phát bóng'], [58.0, 'Đấu gậy: +2 gậy, đánh lại'], [59.2, 'Đấu lỗ: đối phương được huỷ'], [59.9, 'Không dời mốc tee']],
    button: [60.3, 'ĐẶT BÓNG TRONG KHU VỰC'] },
];

// ------------------------------------------------------------------ camera shots
const SH = (t0, t1, keys, o = {}) => ({ t0, t1, keys, ...o });
const A3 = v => [v.x, v.y, v.z];
const sunOpp = V(-SUN.x, 0, -SUN.z).normalize();
let SHOTS;
const FADE = 0.4;
const DTB = 49.52 - 32.462;          // the scorecard scene (copied from film_1-1.js) runs on its own clock
function buildShots() {
  const G = C.golferPos;
  const gp = (dist, up, side = 0) => A3(G.clone().addScaledVector(sunOpp, dist).addScaledVector(V(-sunOpp.z, 0, sunOpp.x), side).add(V(0, up, 0)));
  const gq = up => A3(G.clone().add(V(0, up, 0)));
  const at = (p, x, y, z) => A3(onGround(p).add(V(x, y, z)));
  const hTee = heightAt(TAC.x, TAC.z);
  const far = [0, heightAt(0, 25) + 1.0, 25];
  SHOTS = [
    // 1 frame 0 = thumbnail: low behind the line of the markers; the ball teed clearly ahead of it
    SH(0, 3.805, [[at(PF, -0.55, 0.15, -0.95), at(PF, 0.5, 0.03, 0.4), 42], [at(PF, -0.5, 0.14, -0.86), at(PF, 0.5, 0.03, 0.4), 42]], { dof: true, near: 0.02, shadow: 3, gT: true, gD: true, fp: () => ballOnTee(PF), ap: 0.006, mb: 0.01 }),
    // 2 the stroke from outside the teeing area: the driver swings, the ball flies off
    SH(3.805, 6.187, [[at(PF, 0.2, 0.75, 3.0), at(PF, -0.2, 0.3, 0), 40], [at(PF, 0.15, 0.85, 2.8), at(PF, -0.3, 0.6, -6), 40]], { shadow: 5, gT: true }),
    // 3 golfer, back-lit
    SH(6.187, 8.67, [[gp(3.75, 1.46, 0.35), gq(1.62), 34], [gp(3.45, 1.44, 0.3), gq(1.63), 34]], { golfer: true, dof: true, near: 0.05, shadow: 9, gT: true, fp: () => G.clone().add(V(0, 1.2, 0)), ap: 0.006, mb: 0.012 }),
    // 4 rise from behind the teeing area: the rectangle tinted
    SH(8.67, 12.783, [[[0.6, hTee + 3.2, 63.2], [0, hTee, 58.6], 38], [[0.7, hTee + 3.8, 63.9], [0, hTee, 58.4], 38]], { shadow: 10, gT: true }),
    // 5 high from the side: front edge through the markers, two club-lengths deep, the side edges
    SH(12.783, 16.866, [[[TAC.x + 7.6, hTee + 5.2, TAC.z + 1.0], [TAC.x + 0.25, hTee, TAC.z], 34], [[TAC.x + 7.25, hTee + 4.95, TAC.z + 0.95], [TAC.x + 0.25, hTee, TAC.z], 34]], { shadow: 6, gT: true, lw: 1.1 }),
    // 6 overhead from behind: two balls outside (red), one inside (gold)
    SH(16.866, 20.317, [[[1.45, hTee + 4.1, 62.8], [1.45, hTee, 58.8], 50], [[1.45, hTee + 3.9, 62.6], [1.45, hTee, 58.8], 50]], { shadow: 7, gT: true }),
    // 7 close at the front edge: the ball straddles the line, its rear half above the teeing area
    SH(20.317, 24.395, [[at(PE, 0.34, 0.1, 0.2), at(PE, 0, 0.03, 0), 30], [at(PE, 0.3, 0.09, 0.17), at(PE, 0, 0.03, 0), 30]], { dof: true, near: 0.02, shadow: 2.5, gT: true, gD: true, fp: () => ballOnTee(PE), ap: 0.008, mb: 0.01, lw: 1.6 }),
    // 8 oblique from behind-left: ball inside, feet outside (allowed)
    SH(24.395, 26.413, [[[TA.x0 - 1.5, hTee + 2.3, TA.z1 + 1.6], [TA.x0 + 0.1, hTee, 59.3], 38], [[TA.x0 - 1.4, hTee + 2.2, TA.z1 + 1.45], [TA.x0 + 0.1, hTee, 59.3], 38]], { shadow: 6, gT: true }),
    // 9 stroke play: from behind, the stroke from outside is cancelled; replay from inside (+2)
    SH(26.413, 32.462, [[[1.05, hTee + 2.25, 61.5], [0.8, hTee, 58.5], 50], [[1.0, hTee + 2.15, 61.35], [0.8, hTee, 58.5], 50]], { shadow: 5, gT: true }),
    // 10 scorecard (scene B)
    SH(32.462, 37.632, null, { scene: 'B' }),
    // 11 match play: the stroke may be cancelled by the opponent
    SH(37.632, 43.465, [[[9.2, hTee + 3.0, 64.4], [0.5, hTee + 7, 34], 54], [[8.8, hTee + 2.9, 63.9], [0.5, hTee + 7, 33.5], 54]], { shadow: 14, gT: true }),
    // 12 ... or not: the ball stays in play on the fairway
    SH(43.465, 46.383, [[[LAND.x + 2.6, heightAt(LAND.x, LAND.z) + 1.4, LAND.z + 5.5], A3(onGround(LAND, 0.1)), 34], [[LAND.x + 2.3, heightAt(LAND.x, LAND.z) + 1.25, LAND.z + 4.9], A3(onGround(LAND, 0.1)), 34]], { shadow: 6 }),
    // 13 the left marker is in the way of the stance; it is dragged away
    SH(46.383, 50.632, [[at(MK[0], 1.05, 0.62, 1.35), at(MK[0], -0.15, 0.05, -0.15), 36], [at(MK[0], 0.95, 0.58, 1.2), at(MK[0], -0.15, 0.05, -0.15), 36]], { dof: true, near: 0.03, shadow: 3, gT: true, gD: true, fp: () => onGround(MK[0], MARK_R), ap: 0.004, mb: 0.008 }),
    // 14 the improved stance (red) and the general penalty; the marker goes back
    SH(50.632, 55.751, [[at(PM, 1.5, 1.7, 1.7), at(PM, -0.35, 0, -0.25), 38], [at(PM, 1.4, 1.6, 1.55), at(PM, -0.35, 0, -0.25), 38]], { shadow: 5, gT: true }),
    // 15 rule card on a soft background of the teeing area
    SH(55.751, 60.869, [[[TAC.x + 1.2, hTee + 4.2, TA.z1 + 5.6], far, 40], [[TAC.x + 1.2, hTee + 4.2, TA.z1 + 5.6], far, 40]], { card: true, shadow: 14 }),
    // 16 golfer prepares to tee off from inside
    SH(60.869, 65.5, [[gp(3.9, 1.46, 0.55), gq(1.68), 32], [gp(3.5, 1.44, 0.5), gq(1.69), 32]], { golfer: true, dof: true, near: 0.05, shadow: 9, gT: true, fp: () => G.clone().add(V(0, 1.2, 0)), ap: 0.006, mb: 0.012 }),
  ];
}
function camAt(shot, t) {
  const k = shot.keys;
  let u = prog(t, shot.t0 - FADE / 2, shot.t1 + FADE / 2);
  u = shot.ease === 'lin' ? u : esin(u);
  return { p: V(...k[0][0]).lerp(V(...k[1][0]), u), q: V(...k[0][1]).lerp(V(...k[1][1]), u), fov: lerp(k[0][2], k[1][2], u) };
}

// ------------------------------------------------------------------ per-frame 3D state
// the stroke from PF: driver pendulum (head centre passes through the ball centre at impact), then the ball flight
const SW = { b0: 4.0, top: 4.6, imp: 4.86, fin: 5.2 };
function mkSwing(p, clr) {
  const f = tgtDir(p), d = V(-f.z, 0, f.x);
  const pivot = onGround(p).addScaledVector(d, -0.56).add(V(0, 1.3, 0));
  const bottom = ballOnTee(p).add(V(0, clr, 0));
  const r0 = bottom.clone().sub(pivot); const R0 = r0.length(); r0.normalize();
  return { f, d, pivot, R0, r0, b: f.clone().negate() };
}
const SWP = mkSwing(PF, 0);
const rHat = th => SWP.r0.clone().multiplyScalar(Math.cos(th)).addScaledVector(SWP.b, Math.sin(th));
const headAt = th => SWP.pivot.clone().addScaledVector(rHat(th), SWP.R0);
const TH_TOP = 2.25, TH_FIN = -2.0, TH_ADDR = 0.1;
function swingTheta(t) {
  if (t < SW.b0) return TH_ADDR;
  if (t < SW.top) return lerp(TH_ADDR, TH_TOP, esin(prog(t, SW.b0, SW.top)));
  if (t < SW.imp) { const u = prog(t, SW.top, SW.imp); return lerp(TH_TOP, 0, u * u); }
  if (t < SW.fin) return lerp(0, TH_FIN, eout(prog(t, SW.imp, SW.fin)));
  return TH_FIN;
}
function addressPose(p, gap) {
  const f = tgtDir(p), d = V(-f.z, 0, f.x), bc = ballOnTee(p);
  const head = bc.clone().addScaledVector(f, -(BALL_R + 0.05 + gap)); head.y = heightAt(head.x, head.z) + 0.034;
  const hands = onGround(p).addScaledVector(d, -0.6).addScaledVector(f, 0.04 - gap).add(V(0, 0.86, 0));
  return { head, hands, face: f };
}
function swingPose(t) {
  const th = swingTheta(t);
  const arc = { head: headAt(th), hands: SWP.pivot.clone().addScaledVector(rHat(th), 0.6), face: SWP.r0.clone().multiplyScalar(Math.sin(th)).addScaledVector(SWP.f, Math.cos(th)).normalize() };
  const k = sstep(SW.b0, SW.b0 + 0.3, t); if (k >= 1) return arc;
  const a = addressPose(PF, 0.0);
  return { head: a.head.lerp(arc.head, k), hands: a.hands.lerp(arc.hands, k), face: a.face.lerp(arc.face, k).normalize() };
}
const FLY = { peak: 17, dur: 5.5 };
const trajPt = s => { const S = ballOnTee(PF), L = onGround(LAND, BALL_R); return S.clone().lerp(L, s).add(V(0, 4 * FLY.peak * s * (1 - s), 0)); };
const flightS = t => eout(clamp((t - SW.imp) / FLY.dur)) ;
function setShaft(club, a, b) { const d = b.clone().sub(a).normalize(); club.position.copy(a); club.quaternion.setFromUnitVectors(V(1, 0, 0), d); }
// visibility windows of the teed balls
const VIS = {
  F: t => t > 16.6 && t < 20.5, S: t => t > 16.6 && t < 20.5, I: t => t > 16.6 && t < 20.5,
  E: t => t > 20.1 && t < 24.6, L: t => t > 24.2 && t < 26.6,
  R: t => (t > 29.9 && t < 32.7) || (t > 41.3 && t < 43.7) || t > 55.5,
  M: t => t > 46.2 && t < 55.95,
};
const T_RET = { R1: [29.9, 30.3], R2: [41.3, 41.7] };     // the replay ball is teed (drops onto its tee)
const T_MK = { lift: [47.7, 48.9], back: [54.2, 55.1] };    // the marker is dragged, then put back
function markerPos(t) {
  const a = onGround(MK[0]), b = onGround(MK[0].clone().add(MKMOVE));
  if (t < T_MK.lift[0] || t > T_MK.back[1]) return a;
  if (t < T_MK.lift[1]) { const u = esin(prog(t, ...T_MK.lift)); const p = a.clone().lerp(b, u); p.y += Math.sin(u * Math.PI) * 0.08; return p; }
  if (t < T_MK.back[0]) return b;
  const u = esin(prog(t, ...T_MK.back)); const p = b.clone().lerp(a, u); p.y += Math.sin(u * Math.PI) * 0.08; return p;
}
function updateWorld(t, shot) {
  SKYTIME.value = t;
  C.water.material.uniforms.time.value = t * 0.55; C.water.material.uniforms.size.value = shot.wsize || 1.2;
  C.gT.visible = !!shot.gT; C.gD.forEach(m => m.visible = !!shot.gD);
  const fp = C.flag.geometry.attributes.position, fb = C.flagBase;
  for (let i = 0; i < fp.count; i++) { const x = fb[i * 3], y = fb[i * 3 + 1]; fp.setXYZ(i, x, y - 0.03 * x * x, Math.sin(x * 9 - t * 6) * 0.05 * x / 0.5 + Math.sin(y * 10 + t * 3) * 0.008 * x / 0.5); }
  fp.needsUpdate = true; C.flag.geometry.computeVertexNormals();
  C.golfer.visible = C.golferShadow.visible = !!shot.golfer;
  if (shot.golfer) C.golfer.rotation.y = Math.atan2(camera.position.x - C.golfer.position.x, camera.position.z - C.golfer.position.z);
  // the ball played from PF
  C.teeF.visible = t < 16.6;
  let bp = null, glow = 0;
  if (t < SW.imp) bp = ballOnTee(PF);
  else if (t < 6.4) bp = trajPt(flightS(t));
  else if (t > 43.3 && t < 46.6) { bp = onGround(LAND, BALL_R); glow = fade(t, 43.8, 46.3, 0.4, 0.3) * 0.7; }
  C.ball.visible = !!bp; if (bp) C.ball.position.copy(bp);
  C.ball.userData.glow.visible = glow > 0.01; C.ball.userData.glow.material.opacity = 0.85 * glow;
  // ghost at PF where the stroke from outside was played (stroke play / match play scenes)
  const gA = Math.max(fade(t, 26.6, 32.5, 0.4, 0.3), fade(t, 37.8, 43.5, 0.4, 0.3));
  C.ghostF.visible = gA > 0.01; C.ghostF.position.copy(ballOnTee(PF)); C.ghostF.material.opacity = 0.6 * gA;
  // teed balls
  for (const [k, s] of Object.entries(C.S)) {
    const v = VIS[k](t); s.b.visible = s.t.visible = v; if (!v) continue;
    let drop = 0; if (k === 'R') for (const [a, b] of Object.values(T_RET)) if (t >= a && t < b + 0.01) drop = 0.18 * (1 - eout(prog(t, a, b)));
    s.b.position.copy(ballOnTee(s.p)).add(V(0, drop, 0));
  }
  C.markers[0].position.copy(markerPos(t));
  // driver: the stroke from PF (shots 1-2)
  if (t > 3.6 && t < 6.3) { const s = swingPose(t); C.driver.visible = true; poseDriver(C.driver, s.head, s.hands, s.face); }
  else C.driver.visible = false;
  // teeing-area tint and outline
  const zop = Math.max(fade(t, 9.1, 12.9, 0.6, 0.3), fade(t, 15.4, 16.9, 0.5, 0.2), fade(t, 16.9, 20.4, 0.2, 0.3), fade(t, 24.4, 26.5, 0.3, 0.3), fade(t, 30.0, 32.55, 0.4, 0.3), fade(t, 41.3, 43.5, 0.4, 0.3), fade(t, 46.3, 55.8, 0.4, 0.3) * 0.6);
  C.zone.U.op.value = zop; C.zone.m.visible = zop > 0; C.zone.U.rim.value = fade(t, 30.0, 32.55, 0.4, 0.3) * (0.6 + 0.4 * Math.sin(t * 4));
  const inS5 = t > 12.6 && t < 16.95;
  const eF = Math.max(fade(t, -1, 6.3, 0.1, 0.3), fade(t, 9.4, 12.9, 0.6, 0.3), fade(t, 12.95, 26.5, 0.2, 0.3), fade(t, 26.4, 32.55, 0.3, 0.3), fade(t, 46.3, 55.8, 0.3, 0.3));
  const eS = Math.max(fade(t, 9.4, 12.9, 0.6, 0.3), fade(t, 14.5, 26.5, 0.2, 0.3), fade(t, 26.4, 32.55, 0.3, 0.3), fade(t, 46.3, 55.8, 0.3, 0.3));
  revealLine(C.eFront, eF > 0 ? (inS5 ? eio(prog(t, 13.1, 13.8)) : 1) : 0); C.eFront.material.opacity = eF; C.eFront.material.dashOffset = -t * 0.2;
  const rs = inS5 ? eio(prog(t, 14.6, 15.4)) : 1, rb = inS5 ? eio(prog(t, 15.4, 15.9)) : 1;
  revealLine(C.eL, eS > 0 ? rs : 0); revealLine(C.eR, eS > 0 ? rs : 0); revealLine(C.eB, eS > 0 ? rb : 0);
  C.eL.material.opacity = C.eR.material.opacity = C.eB.material.opacity = eS;
  // two club-lengths, measured from the front edge
  const mv = t > 13.5 && t < 16.95;
  [[C.clubM1, 0, 13.6], [C.clubM2, 1, 14.15]].forEach(([club, k, t0]) => {
    const u = eout(prog(t, t0, t0 + 0.6)); club.visible = mv && t > t0;
    const a0 = onGround(V(MX, 0, TA.z0 + k * CL), 0.012), a1 = onGround(V(MX, 0, TA.z0 + (k + 1) * CL), 0.012);
    setShaft(club, a0.clone().add(V(0, (1 - u) * 0.4, 0)), a1.clone().add(V(0, (1 - u) * 0.4, 0))); club.rotateZ((1 - u) * 0.35);
  });
  const lw = (shot.lw || 1) * RS; C.eFront.material.linewidth = 4.5 * lw; C.eL.material.linewidth = C.eR.material.linewidth = C.eB.material.linewidth = 3.4 * lw;
}
function camB(t) {
  const cell = B.cell;
  const u = eio(prog(t, 49.3, 50.4)), v = eio(prog(t, 53.0, 55.4)) * 0.6;
  const p1 = cell.clone().add(V(1.9, 6.6, 5.0)), p2 = cell.clone().add(V(1.2, 5.0, 3.7)), p3 = V(1.6, 13.5, 9.5), q3 = V(0.6, 0, -0.8);
  const p = p1.lerp(p2, u).lerp(p3, v), q = cell.clone().lerp(q3, v);
  camera.fov = 34; camera.near = 0.1; camera.far = 200; camera.aspect = W / H; camera.position.copy(p); camera.lookAt(q); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  return { p, q };
}
function setupShot(shot, t) {
  if (shot.scene === 'B') { updateScorecard(t + DTB); const { p, q } = camB(t + DTB); return { sc: sceneB, dof: true, focus: p.distanceTo(q), aperture: 0.0055, maxblur: 0.009 }; }
  const c = camAt(shot, t);
  camera.fov = c.fov; camera.aspect = shot.aspect || W / H; camera.near = shot.near || 0.3; camera.far = 2400; camera.position.copy(c.p); camera.lookAt(c.q); camera.updateProjectionMatrix();
  sky.position.copy(camera.position);
  aimShadow(c.q, shot.shadow || 60);
  updateWorld(t, shot);
  const focus = shot.fp ? c.p.distanceTo(shot.fp()) : c.p.distanceTo(c.q);
  return { sc: scene, dof: !!shot.dof, focus, aperture: shot.ap || 0.003, maxblur: shot.mb || 0.008 };
}
function render3D(shot, t) {
  const r = setupShot(shot, t);
  if (r.dof) {
    renderPass.scene = r.sc; renderPass.camera = camera; bokeh.scene = r.sc; bokeh.camera = camera;
    bokeh.uniforms.focus.value = r.focus; bokeh.uniforms.aperture.value = r.aperture; bokeh.uniforms.maxblur.value = r.maxblur;
    bokeh.uniforms.aspect.value = camera.aspect;
    composer.render();
  } else renderer.render(r.sc, camera);
}
function useCam(shot, t) { const c = camAt(shot, t); camera.fov = c.fov; camera.aspect = shot.aspect || W / H; camera.position.copy(c.p); camera.lookAt(c.q); camera.updateProjectionMatrix(); camera.updateMatrixWorld(); }

// ------------------------------------------------------------------ 2D infographics (projected from 3D)
let CURT = 0;
function drawPath(pts, color, alpha, lw, dash = null) {
  if (alpha <= 0) return; ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.shadowColor = color; ctx.shadowBlur = 16;
  if (dash) ctx.setLineDash(dash); ctx.beginPath(); let started = false;
  for (const p of pts) { const q = project(p); if (!q.ok) { started = false; continue; } started ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); started = true; }
  ctx.stroke(); ctx.restore();
}
const arcPts = (th0, th1) => Array.from({ length: 81 }, (_, i) => headAt(lerp(th0, th1, i / 80)));
const trajPts = (s0, s1) => Array.from({ length: 81 }, (_, i) => trajPt(lerp(s0, s1, i / 80)));
// vertical plane standing on the front edge (shows the part of the ball that is above the teeing area)
function drawEdgePlane(a) {
  if (a <= 0) return; const h0 = heightAt(PE.x, TA.z0), x0 = PE.x - 0.045, x1 = PE.x + 0.045, hh = 0.065;
  const q = [V(x0, h0, TA.z0), V(x1, h0, TA.z0), V(x1, h0 + hh, TA.z0), V(x0, h0 + hh, TA.z0)].map(project); if (q.some(p => !p.ok)) return;
  ctx.save(); ctx.globalAlpha = a; const g = ctx.createLinearGradient(0, q[0].y, 0, q[3].y); g.addColorStop(0, 'rgba(201,240,164,0.42)'); g.addColorStop(1, 'rgba(201,240,164,0.05)');
  ctx.fillStyle = g; ctx.beginPath(); q.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = GREEN_L; ctx.lineWidth = 2; ctx.setLineDash([8, 7]); ctx.beginPath(); ctx.moveTo(q[0].x, q[0].y); ctx.lineTo(q[3].x, q[3].y); ctx.moveTo(q[1].x, q[1].y); ctx.lineTo(q[2].x, q[2].y); ctx.stroke(); ctx.restore();
}
function drawInfographics(shot, t) {
  // 1: the ball ahead of the front edge (red)
  if (t < 4.0) { drawPulse(ballOnTee(PF), RED_L, fade(t, -1, 3.8, 0.1, 0.3), 9); }
  // 2: swing (neutral trail), ball flight
  if (t > SW.top && t < SW.fin + 0.1) { const th = swingTheta(t); drawPath(arcPts(th, Math.min(TH_TOP, th + 0.9)), CREAM, 0.55, 8); }
  if (t > SW.imp && t < 6.35) { const s = flightS(t); drawPath(trajPts(Math.max(0, s - 0.12), s), CREAM, 0.7 * fade(t, SW.imp, 6.3, 0.05, 0.3), 4); }
  // 6: outside (red) / inside (gold)
  if (t > 16.8 && t < 20.4) {
    drawRing3(PF, 0.09, RED_L, fade(t, 17.1, 20.25, 0.3, 0.3)); drawRing3(PS, 0.09, RED_L, fade(t, 18.1, 20.25, 0.3, 0.3)); drawRing3(PI, 0.09, GOLD_L, fade(t, 18.6, 20.25, 0.3, 0.3));
    const qf = project(ballOnTee(PF)), qs = project(ballOnTee(PS)); ctx.save(); ctx.globalAlpha = fade(t, 17.4, 20.25, 0.3, 0.3); if (qf.ok) drawCross(qf.x, qf.y, 10, RED_L, 4); ctx.globalAlpha = fade(t, 18.4, 20.25, 0.3, 0.3); if (qs.ok) drawCross(qs.x, qs.y, 10, RED_L, 4); ctx.restore();
  }
  // 7: the straddling ball
  if (t > 20.3 && t < 24.45) { drawEdgePlane(fade(t, 20.9, 24.3, 0.5, 0.3)); }
  // 8: feet outside (light green), ball inside
  if (t > 24.4 && t < 26.45) { drawFeet(PL, GREEN_L, fade(t, 24.7, 26.3, 0.3, 0.3)); drawPulse(ballOnTee(PL), GOLD_L, fade(t, 24.7, 26.3, 0.3, 0.3), 7); }
  // 9: stroke play: the stroke from PF is crossed out; replay from PR
  if (t > 26.4 && t < 32.5) {
    drawRing3(PF, 0.1, RED_L, fade(t, 26.8, 32.35, 0.3, 0.3));
    const q = project(ballOnTee(PF)); if (q.ok) { ctx.save(); ctx.globalAlpha = fade(t, 29.1, 32.35, 0.3, 0.3); drawCross(q.x, q.y, 16, RED_L, 5); ctx.restore(); }
    drawPulse(ballOnTee(PR), GOLD_L, fade(t, 30.3, 32.35, 0.3, 0.3), 8);
  }
  // 11-12: match play: the flight from PF; cancelled (red, crossed) or kept (gold)
  if (t > 37.6 && t < 43.5) {
    const a = fade(t, 37.9, 43.35, 0.4, 0.3), r = sstep(39.9, 40.4, t);
    drawPath(trajPts(0, eout(prog(t, 37.9, 39.0))), r > 0.5 ? RED_L : CREAM, a * (1 - 0.45 * r), 4, [14, 12]);
    const m = project(trajPt(0.85)); if (m.ok && r > 0) { ctx.save(); ctx.globalAlpha = a * r; drawCross(m.x, m.y, 22, RED_L, 6); ctx.restore(); }
    drawRing3(PF, 0.1, RED_L, a * 0.8); drawPulse(ballOnTee(PR), GOLD_L, fade(t, 41.6, 43.35, 0.3, 0.3), 8);
  }
  if (t > 43.4 && t < 46.4) { drawPath(trajPts(0, 1), GOLD_L, fade(t, 43.6, 46.3, 0.4, 0.3), 4, [14, 12]); drawPulse(onGround(LAND, BALL_R), GOLD_L, fade(t, 43.8, 46.3, 0.4, 0.3), 9); }
  // 13-14: the marker in the way, moved (orange -> red), the improved stance (red)
  if (t > 46.3 && t < 55.8) {
    drawRing3(MK[0], 0.14, '#ffb36b', fade(t, 46.7, 47.7, 0.3, 0.3));
    drawRing3(MK[0], 0.14, GOLD_L, fade(t, 47.8, 55.6, 0.3, 0.3) * 0.7);                                   // where it belongs
    drawRing3(MK[0].clone().add(MKMOVE), 0.14, RED_L, fade(t, 49.4, 54.3, 0.3, 0.3));                      // moved: breach
    drawFeet(PM, '#ffb36b', fade(t, 46.9, 48.9, 0.3, 0.3)); drawFeet(PM, RED_L, fade(t, 49.3, 54.1, 0.3, 0.3));
    const q = project(onGround(MK[0].clone().add(MKMOVE), MARK_R)); if (q.ok) { ctx.save(); ctx.globalAlpha = fade(t, 49.5, 54.2, 0.3, 0.3); drawCross(q.x, q.y - 60, 16, RED_L, 5); ctx.restore(); }
  }
  // two club-lengths, numbered, along the measuring line (shot 5)
  if (t > 13.9 && t < 16.95) for (let k = 0; k < 2; k++) {
    const a = fade(t, 14.0 + k * 0.55, 16.8, 0.35, 0.25); if (a <= 0) continue;
    const p0 = project(onGround(V(MX, 0, TA.z0 + k * CL), 0.02)), p1 = project(onGround(V(MX, 0, TA.z0 + (k + 1) * CL), 0.02)); if (!p0.ok || !p1.ok) continue;
    const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x), nx = -Math.sin(ang) * 14, ny = Math.cos(ang) * 14;
    ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = GOLD_L; ctx.shadowColor = GOLD_L; ctx.shadowBlur = 12; ctx.lineCap = 'round'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    ctx.lineWidth = 4; for (const q of [p0, p1]) { ctx.beginPath(); ctx.moveTo(q.x - nx, q.y - ny); ctx.lineTo(q.x + nx, q.y + ny); ctx.stroke(); }
    const mx = (p0.x + p1.x) / 2 + nx * 2.6, my = (p0.y + p1.y) / 2 + ny * 2.6; ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(7,54,38,0.9)'; ctx.beginPath(); ctx.arc(mx, my, 24, 0, 7); ctx.fill(); ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = GOLD_L; ctx.font = '600 30px "Cormorant Garamond"'; ctx.textAlign = 'center'; ctx.fillText(String(k + 1), mx, my + 10); ctx.restore();
  }
}
// scorecard: red stamp "TRUẤT QUYỀN" when the error is not corrected
function drawScoreOverlay(t) {
  const a = fade(t, 35.75, 37.5, 0.25, 0.3); if (a <= 0) return;
  const s = 1 + 0.35 * (1 - eout(prog(t, 35.75, 36.15)));
  ctx.save(); ctx.globalAlpha = a * 0.92; ctx.translate(W / 2 + 40, 1250); ctx.rotate(-0.16); ctx.scale(s, s);
  ctx.strokeStyle = RED; ctx.lineWidth = 7; ctx.beginPath(); ctx.roundRect(-300, -78, 600, 156, 14); ctx.stroke(); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.roundRect(-284, -62, 568, 124, 8); ctx.stroke();
  ctx.fillStyle = RED; ctx.textAlign = 'center'; ctx.font = '700 70px "Be Vietnam Pro"'; spaced(ctx, 'TRUẤT QUYỀN', 0, 26, 6); ctx.restore();
}

// ------------------------------------------------------------------ frame assembly
const glowCv = document.createElement('canvas'); glowCv.width = 270; glowCv.height = 480; const glowCtx = glowCv.getContext('2d');
function softGlow(a) {
  glowCtx.filter = 'none'; glowCtx.clearRect(0, 0, 270, 480); glowCtx.filter = 'blur(5px)'; glowCtx.drawImage(out, 0, 0, 270, 480); glowCtx.filter = 'none';
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = a; ctx.drawImage(glowCv, 0, 0, W, H); ctx.restore();
}
const cardCache = {};
function cardBackground(shot) {
  const key = shot.t0; if (cardCache[key]) return cardCache[key];
  render3D(shot, shot.t0 + 0.5);
  const sm = document.createElement('canvas'); sm.width = 270; sm.height = 480; const sg = sm.getContext('2d'); sg.filter = 'blur(4px)'; sg.drawImage(renderer.domElement, 0, 0, 270, 480);
  const full = document.createElement('canvas'); full.width = W; full.height = H; const fg = full.getContext('2d'); fg.imageSmoothingQuality = 'high'; fg.drawImage(sm, -20, -36, W + 40, H + 72);
  fg.fillStyle = 'rgba(3,32,22,0.34)'; fg.fillRect(0, 0, W, H);
  const vg = fg.createRadialGradient(W / 2, H / 2, 300, W / 2, H / 2, 1200); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,10,6,0.45)'); fg.fillStyle = vg; fg.fillRect(0, 0, W, H);
  cardCache[key] = full; return full;
}
function layer(shot, t, alpha) {
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha = alpha;
  if (shot.card) { const bg = cardBackground(shot); const z = 1 + 0.05 * prog(t, shot.t0, shot.t1); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.drawImage(bg, -W / 2, -H / 2); }
  else { render3D(shot, t); ctx.drawImage(renderer.domElement, 0, 0, W, H); }
  ctx.restore();
}
function drawMedals(t) {
  const X = W - 170, Y = 1240;
  drawMedal(X, Y, fade(t, 27.0, 29.55, 0.3, 0.3), '+2', 'GẬY PHẠT', { pop: prog(t, 27.0, 27.35) });
  drawMedal(X, Y, fade(t, 29.75, 32.35, 0.3, 0.3), '3', 'GẬY THỨ', { pop: prog(t, 29.75, 30.1), note: 'cú đánh lại · 1 + 2 phạt', noteA: sstep(30.2, 30.7, t) });
  drawMedal(X, Y, fade(t, 37.95, 39.4, 0.3, 0.3), '✓', 'KHÔNG PHẠT');
  drawMedal(X, Y, fade(t, 51.2, 55.55, 0.3, 0.3), '!', 'PHẠT CHUNG', { pop: prog(t, 51.2, 51.55), note: 'đấu gậy +2 · đấu lỗ thua lỗ', noteA: sstep(53.4, 53.9, t) });
}
function renderFrame(t) {
  CURT = t;
  let i = SHOTS.findIndex(s => t >= s.t0 && t < s.t1); if (i < 0) i = SHOTS.length - 1;
  const s = SHOTS[i], prev = SHOTS[i - 1], next = SHOTS[i + 1];
  ctx.globalAlpha = 1; ctx.fillStyle = '#04281c'; ctx.fillRect(0, 0, W, H);
  if (prev && t < s.t0 + FADE / 2) { layer(prev, t, 1); layer(s, t, esin(clamp((t - (s.t0 - FADE / 2)) / FADE))); }
  else if (next && t >= s.t1 - FADE / 2) { layer(s, t, 1); layer(next, t, esin(clamp((t - (s.t1 - FADE / 2)) / FADE))); }
  else layer(s, t, 1);
  softGlow(s.card ? 0.08 : s.scene === 'B' ? 0.12 : 0.2);
  const dom = (next && t >= s.t1) ? next : (prev && t < s.t0) ? prev : s;
  const B3 = dom.scene === 'B';
  if (B3) { camB(t + DTB); }
  else if (!dom.card) { useCam(dom, t); drawInfographics(dom, t); }
  drawScrims(t);
  if (B3) { LABELS_B.forEach(l => drawLabel(l, t)); drawScoreOverlay(t); }
  else if (!dom.card) LABELS.forEach(l => drawLabel(l, t));
  if (!dom.card && !B3) drawMedals(t);
  CARDS.forEach(cd => drawCard(cd, t));
  TITLES.forEach(o => drawTitle(o, t));
  drawEnd(t);
  drawSubs(t);
}
async function init() {
  const faces = ['500 92px "Cormorant Garamond"', '600 92px "Cormorant Garamond"', 'italic 500 44px "Cormorant Garamond"', '400 40px "Be Vietnam Pro"', '500 25px "Be Vietnam Pro"', '600 25px "Be Vietnam Pro"', '300 72px "Be Vietnam Pro"', '700 70px "Be Vietnam Pro"'];
  for (const f of faces) await document.fonts.load(f, 'ĐđỏậàÀ Aa1→①②');
  await document.fonts.ready;
  const T0 = performance.now(); const lg = m => console.log(m, ((performance.now() - T0) / 1000).toFixed(1));
  // stance checks (need feet(), defined with the 2D helpers)
  { const fl = feet(PL), fm = feet(PM); CHECK.PL_feet_outside = fl.slice(0, 2).every(f => !inTA(f) && f.x < TA.x0);
    const mid = fm[0].clone().lerp(fm[1], 0.5); CHECK.marker_between_PM_and_feet = MK[0].x > mid.x && MK[0].x < PM.x && Math.abs(MK[0].z - PM.z) < 0.3;
    CHECK.moved_marker_clear = MK[0].clone().add(MKMOVE).distanceTo(V(MK[0].x, 0, PM.z)) > 0.5; }
  console.log('GEOM', JSON.stringify(CHECK));
  buildCourse(); lg('course'); buildProps(); buildClumps(); buildHills(); buildScorecard(); buildShots(); lg('props');
  await new Promise(r => { const chk = () => (C.golfer.material.map.image ? r() : setTimeout(chk, 50)); chk(); });
  for (const s of SHOTS) if (!s.card) render3D(s, (s.t0 + s.t1) / 2);
  lg('warm');
  window.renderFrame = (t, q = 0.93) => { renderFrame(t); return out.toDataURL('image/jpeg', q); };
  window.camTest = (p, q, fov, t, extra = {}) => {
    if (extra.fpv) { const v = V(...extra.fpv); extra.fp = () => v; }
    const shot = Object.assign({ t0: t - 5, t1: t + 5, keys: [[p, q, fov], [p, q, fov]], shadow: 6, gT: true }, extra);
    ctx.globalAlpha = 1; ctx.fillStyle = '#04281c'; ctx.fillRect(0, 0, W, H); render3D(shot, t); ctx.drawImage(renderer.domElement, 0, 0, W, H);
    useCam(shot, t); CURT = t; drawInfographics(shot, t); drawScrims(t); LABELS.forEach(l => drawLabel(l, t)); TITLES.forEach(o => drawTitle(o, t)); drawSubs(t);
    return out.toDataURL('image/jpeg', 0.85);
  };
  const PTS = { PF, PS, PI, PE, PR, PL, PM, LAND, TAC, MK0: MK[0], MK1: MK[1] };
  window.H = { at: (n, x, y, z) => A3(onGround(PTS[n]).add(V(x, y, z))), bt: n => A3(ballOnTee(PTS[n])), g: n => A3(onGround(PTS[n], BALL_R)), h: heightAt(TAC.x, TAC.z) };
  window.CHECK = CHECK;
  // cover (jpg 1080x1920): clean 3D frame + kicker, serif title, gold rule, sub-line
  window.renderCover = (t, o) => {
    let i = SHOTS.findIndex(s => t >= s.t0 && t < s.t1); if (i < 0) i = 0;
    ctx.globalAlpha = 1; ctx.fillStyle = '#04281c'; ctx.fillRect(0, 0, W, H); layer(SHOTS[i], t, 1); softGlow(0.22);
    if (o.info) { useCam(SHOTS[i], t); drawInfographics(SHOTS[i], t); }
    let g = ctx.createLinearGradient(0, 0, 0, 860); g.addColorStop(0, 'rgba(4,40,28,0.74)'); g.addColorStop(1, 'rgba(4,40,28,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, 860);
    g = ctx.createRadialGradient(W / 2, H * 0.55, 420, W / 2, H * 0.55, 1250); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,12,6,0.42)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.textAlign = 'center'; ctx.shadowColor = 'rgba(0,18,10,0.6)'; ctx.shadowBlur = 24;
    ctx.fillStyle = GOLD_L; ctx.font = '500 30px "Be Vietnam Pro"'; spaced(ctx, o.k, W / 2, 226, 9);
    ctx.fillStyle = CREAM; ctx.font = '500 116px "Cormorant Garamond"'; o.t.forEach((l, k) => ctx.fillText(l, W / 2, 366 + k * 116));
    const ly = 366 + (o.t.length - 1) * 116 + 50; ctx.shadowBlur = 0; ctx.fillStyle = GOLD; ctx.fillRect(W / 2 - 70, ly, 140, 2);
    ctx.shadowBlur = 18; ctx.fillStyle = CREAM; ctx.font = '300 38px "Be Vietnam Pro"'; ctx.fillText(o.sub, W / 2, ly + 74);
    ctx.restore(); return out.toDataURL('image/jpeg', 0.93);
  };
  window.ready = true;
}
init().catch(e => { console.error('INIT FAIL', e.stack || e); window.initError = String(e.stack || e); });
