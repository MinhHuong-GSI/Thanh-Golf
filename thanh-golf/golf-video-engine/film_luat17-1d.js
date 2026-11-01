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

// Luật 17.1d – bóng từ bunker xuống hồ cọc vàng: 2 phương án giải thoát
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
const teeSD = (x, z) => sdBox(x, z, 0, 60, 3.6, 2.4, 0.8);
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
const BB = V(-12.0, 0, -49.6);                      // spot of the previous stroke, in the greenside bunker
const LAND = V(15.6, 0, -70.2);                     // where the bladed bunker shot splashed down
// X: estimated point where the ball LAST crossed the edge of the penalty area (ground track B -> LAND)
const XP = (() => {
  let s = 1; while (s > 0 && penSD(lerp(BB.x, LAND.x, s), lerp(BB.z, LAND.z, s)) < 0) s -= 0.0005;
  let a = s, b = Math.min(1, s + 0.0005);
  for (let k = 0; k < 40; k++) { const m = (a + b) / 2; if (penSD(lerp(BB.x, LAND.x, m), lerp(BB.z, LAND.z, m)) < 0) b = m; else a = m; }
  return V(lerp(BB.x, LAND.x, a), 0, lerp(BB.z, LAND.z, a));
})();
const dX = distH(XP);
const WL = XP.clone().sub(HV).setY(0).normalize();  // reference line: straight back from the hole through X
const PERP = V(-WL.z, 0, WL.x);                     // horizontal normal to the line
const atLine = d => HV.clone().addScaledVector(WL, d);
// first point on the line beyond X that is outside the penalty area (far bank)
const dExit = (() => { let d = dX + 0.3; while (penSD(atLine(d).x, atLine(d).z) < 0) d += 0.01; return d; })();
const dDrop = dExit + 4.2;
const DROP = atLine(dDrop);                         // ball must be dropped ON the line (2023 Rules 14.3b / 17.1d(2))
const D_REST = DROP.clone().addScaledVector(PERP, 0.27).addScaledVector(WL, 0.12); // may roll up to 1 club-length in any direction
// stroke and distance from the bunker (Rule 14.6): drop within 1 club-length of the previous spot, not nearer the hole, in the bunker
const AWAY = BB.clone().sub(HV).setY(0).normalize(), PERP_B = V(-AWAY.z, 0, AWAY.x);
const S_DROP = BB.clone().addScaledVector(AWAY, 0.55).addScaledVector(PERP_B, 0.22);
const S_REST = S_DROP.clone().addScaledVector(AWAY, 0.07).addScaledVector(PERP_B, 0.09);
const dBB = distH(BB);
const CHECK = {
  X: [XP.x, XP.z], dX, dExit, D: [DROP.x, DROP.z], D_ok_outside: [0, 1, 2, 3, 4, 5, 6, 7].every(k => { const a = k / 8 * 6.283; return penSD(D_REST.x + Math.cos(a) * 0.05, D_REST.z + Math.sin(a) * 0.05) > 0; }),
  D_rest_in_CL: D_REST.distanceTo(DROP) <= CL, D_not_nearer_than_X: distH(D_REST) >= dX,
  S_in_bunker: bunkerSD(HB, S_REST.x, S_REST.z) < -0.2, S_in_CL: S_REST.distanceTo(BB) <= CL, S_not_nearer: distH(S_REST) >= dBB && distH(S_DROP) >= dBB,
  zoneD_outside: (() => { for (let i = 0; i < 64; i++) { const a = i / 64 * 6.283; if (penSD(DROP.x + Math.cos(a) * CL, DROP.z + Math.sin(a) * CL) < 0) return false; } return true; })(),
  land_inside: penSD(LAND.x, LAND.z)
};
console.log('GEOM', JSON.stringify(CHECK));

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
  // tee box
  g.save(); g.fillStyle = '#86b04b'; g.beginPath(); g.roundRect(-3.6, 57.6, 7.2, 4.8, 0.8); g.fill(); g.clip();
  for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? 'rgba(255,255,220,0.08)' : 'rgba(0,30,0,0.07)'; g.fillRect(-3.6 + k * 1.2, 57, 1.2, 6); }
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
      if (Math.hypot(p[0] - XP.x, p[1] - XP.z) > 1.6 && Math.hypot(p[0] - atLine(dExit).x, p[1] - atLine(dExit).z) > 1.6) sp.push(p); }
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
  for (const x of [-3, 3]) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.85, roughness: 0.3 })); m.position.set(x, heightAt(x, 59) + 0.15, 59); m.castShadow = true; scene.add(m); }
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
  const lineEnd = atLine(dDrop + 16);
  const ok = (x, z) => pondSD(x, z) > 6 && fairwaySD(x, z) > 3.2 && Math.hypot(x - HOLE.x, z - HOLE.z) > 24 && teeSD(x, z) > 4.5 && pathDist(x, z) > 2.6 &&
    !(x > -18 && x < 12 && z > 60 && z < 98) && BUNKERS.every(b => bunkerSD(b, x, z) > 3) && Math.hypot(x - BB.x, z - BB.z) > 22 &&
    segDist(x, z, HV, lineEnd) > 7.5 && Math.hypot(x - DROP.x, z - DROP.z) > 11;
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
function makeSplash(sc) {
  const g = new THREE.Group(); scene.add(g); g.scale.setScalar(sc);
  const rings = [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f5f0e0', transparent: true, depthWrite: false, toneMapped: false })); g.add(m); return m; });
  const drops = []; const dg = new THREE.SphereGeometry(0.06, 8, 6); const dm = new THREE.MeshStandardMaterial({ color: '#eef6f4', roughness: 0.1, transparent: true });
  for (let i = 0; i < 30; i++) { const m = new THREE.Mesh(dg, dm); const a = rnd() * 6.28, sp = 1 + rnd() * 2.2; m.userData = { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 4 + rnd() * 5 }; g.add(m); drops.push(m); }
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.25, 1, 24, 1, true), new THREE.MeshStandardMaterial({ color: '#e8f2f0', roughness: 0.1, transparent: true, side: THREE.DoubleSide }));
  g.add(crown); return { g, rings, drops, dm, crown };
}
function updateSplash(sp, pos, t0, t) {
  const dt = t - t0; sp.g.visible = dt > 0 && dt < 3.0; if (!sp.g.visible) return;
  sp.g.position.copy(pos).setY(WATER_Y + 0.02);
  sp.rings.forEach((m, i) => { const d = dt - i * 0.25; m.visible = d > 0; const s = 0.3 + d * 1.6; m.scale.set(s, 1, s); m.material.opacity = 0.75 * Math.max(0, 1 - d / 2.4); });
  sp.drops.forEach(m => { const u = m.userData; const d = dt; m.position.set(u.vx * d * 0.6, u.vy * d - 9.8 * d * d, u.vz * d * 0.6); m.visible = m.position.y > -0.05; });
  sp.dm.opacity = Math.max(0, 1 - dt / 1.1);
  const ch = Math.max(0, Math.sin(clamp(dt / 0.6) * Math.PI)) * 1.3; sp.crown.visible = dt < 0.6; sp.crown.scale.set(1 + dt * 2, ch + 0.01, 1 + dt * 2); sp.crown.position.y = ch / 2; sp.crown.material.opacity = 0.5 * (1 - dt / 0.6);
}
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
// hero bunker: high-resolution raked sand with footprints (the coarse ground texture is far too soft for close-ups)
function buildSand() {
  const S = 13, N = 2048, x0 = HB.x - S / 2, z0 = HB.z - S / 2;
  const toPx = (x, z) => [(x - x0) / S * N, (z - z0) / S * N];
  const col = document.createElement('canvas'); col.width = col.height = N; const g = col.getContext('2d');
  const hc = document.createElement('canvas'); hc.width = hc.height = N; const hg = hc.getContext('2d');
  const n1 = vnoise(512, 24, 5), n2 = vnoise(512, 128, 2);
  const id = g.createImageData(N, N), hd = hg.createImageData(N, N);
  const c0 = Math.cos(HB.a), s0 = Math.sin(HB.a);
  for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
    const i = (py * N + px) * 4, x = x0 + px / N * S, z = z0 + py / N * S;
    const sd = bunkerSD(HB, x, z);
    const a = sd < -0.02 ? 255 : 0;
    const k1 = n1[((py >> 2) & 511) * 512 + ((px >> 2) & 511)], k2 = n2[(py & 511) * 512 + (px & 511)];
    // rake grooves follow the long axis of the bunker
    const along = (x - HB.x) * s0 + (z - HB.z) * c0;
    const rake = 0.5 + 0.5 * Math.sin(along * 2 * Math.PI / 0.045 + Math.sin((x - HB.x) * 1.7) * 2.2);
    const edge = sstep(-0.9, -0.05, sd);
    const hgt = 0.55 * rake * (1 - edge * 0.7) + 0.35 * k1 + 0.1 * k2;
    let r = 205, gg = 186, b = 142; const m = 0.86 + 0.16 * k1 + 0.08 * (k2 - 0.5) + 0.05 * (rake - 0.5);
    r *= m; gg *= m; b *= m * 0.98; if (rnd() < 0.02) { r *= 0.8; gg *= 0.78; b *= 0.75; }
    id.data[i] = r; id.data[i + 1] = gg; id.data[i + 2] = b; id.data[i + 3] = a;
    const hv = hgt * 255; hd.data[i] = hd.data[i + 1] = hd.data[i + 2] = hv; hd.data[i + 3] = 255;
  }
  g.putImageData(id, 0, 0); hg.putImageData(hd, 0, 0);
  // footprints: path in from the green side, the stance at the ball, and scuffs
  const f = HV.clone().sub(BB).setY(0).normalize(), d = V(-f.z, 0, f.x);
  const prints = [];
  const stance = BB.clone().addScaledVector(d, -0.62);
  prints.push([stance.clone().addScaledVector(f, 0.24), 0], [stance.clone().addScaledVector(f, -0.24), 0]);
  for (let k = 0; k < 7; k++) { const p = stance.clone().addScaledVector(f, 1.2 + k * 0.38).addScaledVector(d, (k % 2 ? 0.12 : -0.12) - 0.2 - k * 0.05); prints.push([p, 1]); }
  for (const [p, walk] of prints) {
    const [px, py] = toPx(p.x, p.z); const ang = walk ? Math.atan2(f.z, f.x) : Math.atan2(d.z, d.x);
    for (const [cv2, cc, col2] of [[g, 'rgba(120,98,60,0.32)', 0], [hg, 'rgba(30,30,30,0.55)', 1]]) {
      cv2.save(); cv2.translate(px, py); cv2.rotate(ang + Math.PI / 2); cv2.fillStyle = cc;
      const sc = N / S; cv2.beginPath(); cv2.ellipse(0, -0.05 * sc, 0.048 * sc, 0.09 * sc, 0, 0, 7); cv2.fill(); cv2.beginPath(); cv2.ellipse(0, 0.09 * sc, 0.04 * sc, 0.045 * sc, 0, 0, 7); cv2.fill(); cv2.restore();
    }
  }
  const t = texFrom(col); t.anisotropy = 16; const ht = texFrom(hc, false); ht.anisotropy = 8;
  const geo = new THREE.PlaneGeometry(S, S, 220, 220).rotateX(-Math.PI / 2).translate(HB.x, 0, HB.z);
  const p = geo.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)) + 0.006);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: t, bumpMap: ht, bumpScale: 1.2, alphaTest: 0.5 }));
  m.receiveShadow = true; scene.add(m); C.sand = m;
  // explosion crater left by the bunker shot (appears at impact)
  const cc = document.createElement('canvas'); cc.width = cc.height = 256; const q = cc.getContext('2d');
  const gr = q.createRadialGradient(128, 128, 10, 128, 128, 126); gr.addColorStop(0, 'rgba(118,96,62,0.75)'); gr.addColorStop(0.55, 'rgba(150,126,86,0.45)'); gr.addColorStop(0.8, 'rgba(232,214,172,0.55)'); gr.addColorStop(1, 'rgba(232,214,172,0)');
  q.fillStyle = gr; q.beginPath(); q.ellipse(128, 128, 126, 70, 0, 0, 7); q.fill();
  for (let i = 0; i < 260; i++) { const a = (rnd() - 0.5) * 1.2, r = 60 + rnd() * 66; q.fillStyle = `rgba(${200 + rnd() * 30},${180 + rnd() * 25},${130 + rnd() * 20},${0.3 + rnd() * 0.4})`; q.beginPath(); q.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r * 0.55, 1 + rnd() * 2.5, 0, 7); q.fill(); }
  const crater = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: texFrom(cc), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  crater.rotation.y = -Math.atan2(f.z, f.x); crater.position.copy(onGround(BB, 0.009)).addScaledVector(f, 0.08); crater.visible = false; crater.receiveShadow = true; scene.add(crater); C.crater = crater;
}
function makeSandBurst() {
  const g = new THREE.Group(); scene.add(g); const parts = [];
  const gm = new THREE.SphereGeometry(1, 6, 4), mm = new THREE.MeshLambertMaterial({ color: '#d8c49a', transparent: true });
  const f = HV.clone().sub(BB).setY(0).normalize();
  for (let i = 0; i < 80; i++) { const m = new THREE.Mesh(gm, mm); const s = 0.008 + rnd() * 0.022; m.scale.setScalar(s);
    const a = (rnd() - 0.5) * 1.6; const dir = f.clone().applyAxisAngle(UP, a); const sp = 1.5 + rnd() * 4.5;
    m.userData = { v: V(dir.x * sp, 2.5 + rnd() * 4.5, dir.z * sp) }; g.add(m); parts.push(m); }
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const q = cv.getContext('2d'); const gr = q.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(236,218,178,0.9)'); gr.addColorStop(0.5, 'rgba(226,206,160,0.45)'); gr.addColorStop(1, 'rgba(220,200,150,0)'); q.fillStyle = gr; q.fillRect(0, 0, 128, 128);
  const cloud = []; for (let i = 0; i < 6; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texFrom(cv), transparent: true, depthWrite: false })); sp.userData = { o: V((rnd() - 0.5) * 0.4, 0.1 + rnd() * 0.3, (rnd() - 0.5) * 0.4).addScaledVector(f, rnd() * 0.6) }; g.add(sp); cloud.push(sp); }
  return { g, parts, mm, cloud };
}
function updateSandBurst(sb, t0, t) {
  const dt = t - t0; sb.g.visible = dt > 0 && dt < 2.2; if (!sb.g.visible) return;
  sb.g.position.copy(onGround(BB, 0.02));
  sb.parts.forEach(m => { const v = m.userData.v; m.position.set(v.x * dt * 0.55, Math.max(0, v.y * dt * 0.55 - 4.9 * dt * dt), v.z * dt * 0.55); });
  sb.mm.opacity = Math.max(0, 1 - dt / 1.2);
  sb.cloud.forEach((s, i) => { const k = eout(clamp(dt / 1.4)); s.position.copy(s.userData.o).multiplyScalar(1 + k * 2.5); s.position.y += k * 0.5; const sc = 0.35 + k * 1.3; s.scale.set(sc, sc, 1); s.material.opacity = 0.75 * (1 - clamp(dt / 2.0)); });
}
// relief-area shader: circle of radius `rad` around C, clipped by "not nearer the hole than rMin" and by the area-of-course rule
const ZONE_GLSL = `uniform vec2 C, Hh, bkC, bkR, pdC, pdH; uniform float rad, op, rMin, ex, mode, bkA, pdA, pdR, PEN;
  varying vec2 vW;
  float bunkerSD(vec2 p){ vec2 d=p-bkC; float c=cos(bkA), s=sin(bkA); float u=(d.x*c-d.y*s)/bkR.x, v=(d.x*s+d.y*c)/bkR.y; return (length(vec2(u,v))-1.0)*min(bkR.x,bkR.y); }
  float pondSD(vec2 p){ vec2 d=p-pdC; float c=cos(pdA), s=sin(pdA); float u=d.x*c+d.y*s, v=-d.x*s+d.y*c;
    vec2 q=vec2(abs(u)-pdH.x+pdR, abs(v)-pdH.y+pdR); float box=length(max(q,0.0))+min(max(q.x,q.y),0.0)-pdR;
    return box+1.5*sin(u*0.27+1.1)*sin(v*0.37+0.3)+0.8*sin(u*0.55-v*0.23+0.7)+0.35*sin(u*1.05+v*0.62); }
  void main(){ float d=distance(vW,C); if(d>rad) discard;
    bool nearer = distance(vW,Hh) < rMin;
    bool wrongArea = mode < 0.5 ? (bunkerSD(vW) > -0.02) : (pondSD(vW)-PEN < 0.0);
    float rim = smoothstep(rad-0.045,rad-0.015,d)*(1.0-smoothstep(rad-0.012,rad,d));
    vec4 c;
    if(nearer || wrongArea){ if(ex<0.01) discard; float hatch=step(0.5,fract((vW.x+vW.y)*11.0)); c=vec4(0.95,0.30,0.26,(0.20+0.25*hatch)*ex); }
    else c=vec4(0.97,0.85,0.52,0.30+0.62*rim);
    gl_FragColor=vec4(c.rgb,c.a*op);
    #include <colorspace_fragment>
  }`;
function makeZone(center, rMin, mode) {
  const U = { C: { value: new THREE.Vector2(center.x, center.z) }, Hh: { value: new THREE.Vector2(HOLE.x, HOLE.z) }, rad: { value: 0 }, op: { value: 0 }, rMin: { value: rMin }, ex: { value: 0 }, mode: { value: mode },
    bkC: { value: new THREE.Vector2(HB.x, HB.z) }, bkR: { value: new THREE.Vector2(HB.rx, HB.rz) }, bkA: { value: HB.a },
    pdC: { value: new THREE.Vector2(POND.x, POND.z) }, pdH: { value: new THREE.Vector2(POND.hx, POND.hz) }, pdA: { value: POND.a }, pdR: { value: POND.r }, PEN: { value: PEN } };
  const zg = new THREE.PlaneGeometry(2.6, 2.6, 64, 64).rotateX(-Math.PI / 2).translate(center.x, 0, center.z);
  const zp = zg.attributes.position; for (let i = 0; i < zp.count; i++) zp.setY(i, heightAt(zp.getX(i), zp.getZ(i)) + 0.016);
  const m = new THREE.Mesh(zg, new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
    vertexShader: `varying vec2 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xz; gl_Position=projectionMatrix*viewMatrix*w; }`, fragmentShader: ZONE_GLSL }));
  m.renderOrder = 7; m.visible = false; scene.add(m); return { m, U };
}
function grassPatch(N, okFn, center, radius, h0, h1, w0 = 0.006) {
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
    o.scale.set(0.6 + rnd() * 0.7, (h0 + rnd() * (h1 - h0)) * k, 1); o.updateMatrix(); m.setMatrixAt(n, o.matrix);
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
function buildClumps() {
  const tex = clumpTex();
  const parts = [0, Math.PI / 3, 2 * Math.PI / 3].flatMap(a => [new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateY(a), new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateY(a + Math.PI)]);
  const geo = mergeGeometries(parts); const nr = geo.attributes.normal; for (let i = 0; i < nr.count; i++) nr.setXYZ(i, 0, 1, 0);
  const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.4, alphaToCoverage: true });
  const lineEnd = atLine(dDrop + 16);
  const pts = []; const cont = C.contour;
  for (let i = 0; i < cont.length; i += 3) {
    if (rnd() > 0.55) continue;
    const [x, z] = cont[i]; const gx = x - POND.x, gz = z - POND.z, gl = Math.hypot(gx, gz); const off = 0.5 + rnd() * 1.6;
    const p = [x + gx / gl * off, z + gz / gl * off];
    if (Math.hypot(p[0] - XP.x, p[1] - XP.z) < 5.5 || segDist(p[0], p[1], HV, lineEnd) < 3.2 || Math.hypot(p[0] - HOLE.x, p[1] - HOLE.z) < 13) continue;
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
function buildProps() {
  makeDimples();
  { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,240,200,0.55)'); gr.addColorStop(1, 'rgba(255,220,150,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); glowTexS = texFrom(cv); }
  C.ball = ballMesh(BALL_R); addGlow(C.ball, 1.4);
  C.ballS = ballMesh(BALL_R); addGlow(C.ballS, 0.5);
  C.ballD = ballMesh(BALL_R); addGlow(C.ballD, 0.5);
  C.START = onGround(BB, BALL_R * 0.55);                       // ball sitting slightly down in the sand
  C.tr = traj(C.START, V(LAND.x, WATER_Y, LAND.z), 3.4, 160); C.trL = fatLine(C.tr, GOLD_L, { w: 3 });
  C.splash = makeSplash(0.32); C.burst = makeSandBurst();
  C.float = [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.18, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, toneMapped: false })); scene.add(m); return m; });
  // back-on-the-line reference line (sits on the water where it crosses the pond)
  const lp = []; const dEnd = dDrop + 30; for (let d = 0; d <= dEnd; d += 0.25) lp.push(onSurface(atLine(d), 0.06));
  C.back = fatLine(lp, GOLD_L, { w: 4, dashed: true, dash: 0.9, gap: 0.6 }); C.backSplitX = dX / dEnd; C.backSplitD = dDrop / dEnd;
  // bunker replay: dashed path back to the green
  C.trS = fatLine(traj(onGround(S_REST, BALL_R), onGround(HV.clone().add(V(0.9, 0, 0.6)), 0.02), 3.0, 120), GOLD_L, { w: 3, dashed: true, dash: 0.6, gap: 0.4 });
  C.zoneS = makeZone(BB, dBB, 0); C.zoneD = makeZone(DROP, dX, 1);
  C.club = makeClub(CL);
  buildSand();
  // golfer (photographic cut-out supplied by the client) as a camera-facing card
  { const tex = new THREE.TextureLoader().load('golfer_cut.png'); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const hgt = 958 * 0.0018, wid = 616 * 0.0018;
    C.golfer = new THREE.Mesh(new THREE.PlaneGeometry(wid, hgt).translate(0, hgt / 2, 0), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.03, toneMapped: false, color: '#efe8de' }));
    const f = HV.clone().sub(BB).setY(0).normalize(), d = V(-f.z, 0, f.x);
    C.golferPos = BB.clone().addScaledVector(d, -0.95).addScaledVector(f, -0.35); C.golferPos.y = heightAt(C.golferPos.x, C.golferPos.z) + 0.04;
    C.golfer.position.copy(C.golferPos); C.golfer.visible = false; C.golfer.renderOrder = 20; scene.add(C.golfer);
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.25, depthWrite: false }));
    sh.scale.set(1, 1, 0.55); sh.position.copy(C.golferPos).setY(C.golferPos.y - 0.03); sh.visible = false; scene.add(sh); C.golferShadow = sh; }
  // grass blades for close shots
  C.gB = grassPatch(26000, (x, z) => { const sd = bunkerSD(HB, x, z); return sd > 0.25 && Math.hypot(x - HOLE.x, z - HOLE.z) > 12.3 ? (sd < 0.9 ? 0.7 : 1) : 0; }, BB, 7.5, 0.03, 0.07);
  C.gD = grassPatch(34000, (x, z) => { const s = penSD(x, z); return s > 0.12 ? (s < 1.2 ? 1.6 : 1) : 0; }, DROP, 6.5, 0.035, 0.085);
  C.gX = grassPatch(16000, (x, z) => { const s = pondSD(x, z); return s > 0.15 ? (s < 1.0 ? 1.8 : 1) : 0; }, XP, 5, 0.035, 0.08);
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
// "+1 gậy phạt" medallion
function drawBadge(x, y, a, sc = 1) {
  if (a <= 0) return; const p = eback(clamp(a * 1.25));
  ctx.save(); ctx.globalAlpha = clamp(a * 1.5); ctx.translate(x, y); ctx.scale(sc * (0.7 + 0.3 * p), sc * (0.7 + 0.3 * p));
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 30; ctx.fillStyle = 'rgba(7,54,38,0.94)'; ctx.beginPath(); ctx.arc(0, 0, 92, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
  ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.stroke(); ctx.strokeStyle = 'rgba(201,165,92,0.55)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, 80, 0, 7); ctx.stroke();
  ctx.textAlign = 'center'; ctx.fillStyle = GOLD_L; ctx.font = '500 78px "Cormorant Garamond"'; ctx.fillText('+1', 0, 18);
  ctx.fillStyle = CREAM; ctx.font = '500 19px "Be Vietnam Pro"'; spaced(ctx, 'GẬY PHẠT', 0, 52, 4);
  ctx.restore();
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
// chevrons running back along the line beyond the drop: "no limit how far back"
function drawChevrons(a, t) {
  if (a <= 0) return;
  ctx.save(); ctx.strokeStyle = GOLD_L; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.shadowColor = GOLD_L; ctx.shadowBlur = 14;
  for (let i = 0; i < 5; i++) {
    const ph = ((t * 0.55 + i / 5) % 1); const d = dDrop + 1.5 + ph * 22; const p0 = project(onSurface(atLine(d), 0.08)), p1 = project(onSurface(atLine(d + 0.6), 0.08));
    if (!p0.ok || !p1.ok) continue; const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x); const s = 16;
    ctx.globalAlpha = a * Math.sin(ph * Math.PI); ctx.save(); ctx.translate(p0.x, p0.y); ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(-s * 0.6, -s); ctx.lineTo(s * 0.5, 0); ctx.lineTo(-s * 0.6, s); ctx.stroke(); ctx.restore();
  }
  ctx.restore();
}
function wrapW(text, maxW) { const words = text.split(' '); const lines = []; let line = ''; for (const w of words) { const tst = line ? line + ' ' + w : w; if (ctx.measureText(tst).width > maxW && line) { lines.push(line); line = w; } else line = tst; } lines.push(line); return lines; }
function motes(a, t, t0) {
  ctx.save(); for (let i = 0; i < 46; i++) { const sx = ((i * 0.6180339) % 1) * W + Math.sin(t * 0.4 + i) * 24, sy = H + 120 - (((t - t0) * (18 + (i % 7) * 6) + i * 211) % (H + 240)); const r = 1.5 + (i % 5) * 0.9;
    ctx.globalAlpha = a * (0.18 + 0.3 * (0.5 + 0.5 * Math.sin(t * 2 + i))); ctx.fillStyle = GOLD_L; ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.fill(); } ctx.restore();
}
// yellow vs red plaques (rule card style)
function drawPlaques(t) {
  const T0 = 56.05, T1 = 60.0; const a = fade(t, T0, T1, 0.5, 0.4); if (a <= 0) return;
  motes(a, t, T0);
  const items = [{ c: YEL, k: 'CỌC VÀNG', n: '2', d: ['Gậy và khoảng cách', 'Lùi theo đường thẳng'] }, { c: RED, k: 'CỌC ĐỎ', n: '3', d: ['2 phương án của cọc vàng', '+ Thả ngang 2 gậy'] }];
  items.forEach((it, i) => {
    const p = eout(prog(t, T0 + 0.15 + i * 0.3, T0 + 1.0 + i * 0.3));
    const w = 440, h = 520, x = (i === 0 ? W / 2 - w - 18 : W / 2 + 18), y = 640 + (1 - p) * 40;
    ctx.save(); ctx.globalAlpha = a * p;
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 40; ctx.fillStyle = 'rgba(7,54,38,0.93)'; ctx.fillRect(x, y, w, h); ctx.shadowBlur = 0;
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.strokeStyle = 'rgba(201,165,92,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(x + 12, y + 12, w - 24, h - 24);
    // stake icon
    ctx.fillStyle = it.c; ctx.beginPath(); ctx.roundRect(x + w / 2 - 7, y + 46, 14, 52, 7); ctx.fill();
    ctx.textAlign = 'center'; ctx.fillStyle = GOLD_L; ctx.font = '600 25px "Be Vietnam Pro"'; spaced(ctx, it.k, x + w / 2, y + 142, 7);
    ctx.fillStyle = GOLD_L; ctx.font = '500 150px "Cormorant Garamond"'; ctx.fillText(it.n, x + w / 2, y + 282);
    ctx.fillStyle = CREAM; ctx.font = 'italic 500 44px "Cormorant Garamond"'; ctx.fillText('phương án', x + w / 2, y + 334);
    ctx.fillStyle = 'rgba(246,241,230,0.88)'; ctx.font = '400 25px "Be Vietnam Pro"'; it.d.forEach((l, k) => ctx.fillText(l, x + w / 2, y + 400 + k * 40));
    ctx.restore();
  });
  // "no lateral relief for yellow" strip
  const sa = a * sstep(57.4, 57.9, t); if (sa > 0) {
    ctx.save(); ctx.globalAlpha = sa; const y = 1222, w = 820, x = W / 2 - w / 2;
    ctx.fillStyle = 'rgba(4,40,28,0.9)'; ctx.beginPath(); ctx.roundRect(x, y, w, 84, 42); ctx.fill(); ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.stroke();
    drawCross(x + 58, y + 42, 13, '#ff7a6c', 5);
    ctx.fillStyle = CREAM; ctx.font = '500 32px "Be Vietnam Pro"'; ctx.textAlign = 'left'; ctx.fillText('Cọc vàng: không thả ngang 2 gậy', x + 98, y + 54);
    ctx.restore();
  }
}
function drawEnd(t) {
  const a = fade(t, 60.1, 99, 0.7, 0.1); if (a <= 0) return;
  const o = { t0: 60.1, t1: 99, k: 'Luật golf chuẩn', title: ['Cọc vàng:', '2 phương án giải thoát'], size: 76, sub: 'Căn cứ: Luật 17.1d', fi: 0.7 };
  drawTitle(o, t);
}

// ------------------------------------------------------------------ timeline (narration timing from timing.json)
const DUR = 63.9;
const SUBS = [
  [0.6, 2.1, "Bạn đang đánh bóng từ bunker,"],
  [2.1, 4.98, "nhưng cú đánh tiếp theo lại đưa bóng\nxuống hồ có cọc vàng."],
  [5.33, 6.35, "Bóng không thể cứu được!"],
  [6.8, 8.85, "Theo luật golf,\nbạn phải xử lý thế nào?"],
  [9.75, 13.58, "Theo Luật 17.1d(1), bạn có thể chọn\nphương án gậy và khoảng cách,"],
  [13.7, 15.97, "hay còn gọi là Stroke and Distance."],
  [16.43, 19.95, "Bạn chịu một gậy phạt và đánh lại\ntừ vị trí của cú đánh trước đó."],
  [20.36, 22.67, "Vì cú đánh trước được thực hiện\ntrong bunker,"],
  [22.67, 23.98, "bạn sẽ đánh lại từ bunker."],
  [24.88, 27.9, "Bạn cũng có thể chọn phương án\nthả bóng theo đường thẳng"],
  [27.9, 30.38, "kéo dài về phía sau,\ntheo Luật 17.1d(2)."],
  [30.8, 33.58, "Hãy giữ điểm bóng lần cuối\ncắt ranh giới khu vực phạt"],
  [33.58, 35.44, "nằm giữa hố golf và vị trí thả bóng."],
  [35.81, 38.42, "Bạn được thả bóng ở khu vực hợp lệ\ntrên đường thẳng này,"],
  [38.6, 41.53, "không giới hạn khoảng cách\nvề phía sau, và chịu một gậy phạt."],
  [42.43, 44.67, "Vậy có bắt buộc phải đánh lại\ntừ bunker không?"],
  [44.98, 45.97, "Câu trả lời là không!"],
  [46.39, 48.88, "Bạn có hai lựa chọn giải thoát\ntheo Luật 17.1d"],
  [48.88, 51.1, "khi bóng nằm trong\nkhu vực phạt cọc vàng:"],
  [51.25, 53.02, "đánh lại từ vị trí cú đánh trước,"],
  [53.02, 55.8, "hoặc thả bóng theo đường thẳng\nkéo dài về phía sau."],
  [56.25, 59.76, "Hãy nhớ: cọc vàng không có phương án\nthả bóng ngang hai gậy như cọc đỏ."],
  [60.18, 62.06, "Hiểu đúng luật\nđể tránh mất gậy đáng tiếc!"],
];
const TITLES = [
  { t0: 0.5, t1: 4.95, k: 'Luật golf · Luật 17.1d', title: 'Bunker → Cọc vàng' },
  { t0: 5.25, t1: 6.5, k: 'Khu vực phạt cọc vàng', title: 'Không thể cứu bóng', size: 84 },
  { t0: 6.75, t1: 9.15, k: 'Bunker → Cọc vàng', title: ['Bắt buộc đánh lại', 'từ bunker?'], size: 82 },
  { t0: 9.6, t1: 13.55, k: 'Phương án 1 · Luật 17.1d(1)', title: 'Gậy và khoảng cách', size: 84 },
  { t0: 13.7, t1: 16.05, k: 'Phương án 1', title: 'Stroke and Distance', size: 84 },
  { t0: 16.4, t1: 20.0, k: 'Phương án 1 · Stroke and Distance', title: 'Chịu 1 gậy phạt', size: 86 },
  { t0: 20.35, t1: 24.2, k: 'Phương án 1', title: 'Đánh lại từ bunker', size: 86 },
  { t0: 24.85, t1: 30.4, k: 'Phương án 2 · Luật 17.1d(2)', title: 'Back-on-the-Line', size: 86, sub: 'Thả bóng theo đường thẳng lùi về sau' },
  { t0: 30.8, t1: 33.45, k: 'Phương án 2 · Back-on-the-Line', title: ['Điểm cắt ranh giới', 'nằm ở giữa'], size: 80 },
  { t0: 35.8, t1: 38.45, k: 'Phương án 2', title: 'Thả ngoài khu vực phạt', size: 78 },
  { t0: 38.6, t1: 41.75, k: 'Phương án 2 · Back-on-the-Line', title: 'Chịu 1 gậy phạt', size: 86, sub: 'Không giới hạn khoảng cách lùi' },
  { t0: 42.4, t1: 44.8, k: 'Câu hỏi', title: ['Bắt buộc đánh lại', 'từ bunker?'], size: 82 },
  { t0: 44.95, t1: 46.05, k: 'Luật 17.1d', title: 'Không!', size: 128, fi: 0.25 },
  { t0: 46.4, t1: 55.85, k: 'Luật 17.1d · Cọc vàng', title: '2 phương án giải thoát', size: 80 },
  { t0: 56.25, t1: 59.85, k: 'Hãy nhớ', title: 'Không thả ngang 2 gậy', size: 80 },
];
const LABELS = [
  { t0: 3.7, t1: 4.95, p: () => onGround(V(C.stakes[2][0], 0, C.stakes[2][1]), 0.9), text: 'Hồ có cọc vàng', dx: 60, dy: 140 },
  { t0: 5.4, t1: 6.5, p: () => V(LAND.x, WATER_Y + 0.02, LAND.z), text: 'Bóng chìm dưới hồ', dx: -60, dy: 150 },
  { t0: 11.0, t1: 16.1, p: () => onGround(BB, 0.02), text: 'Vị trí cú đánh trước', dx: 60, dy: 150 },
  { t0: 17.4, t1: 20.0, p: () => onGround(BB.clone().addScaledVector(AWAY, CL), 0.02), text: '1 chiều dài gậy', dx: 60, dy: 150 },
  { t0: 18.4, t1: 20.0, p: () => onGround(BB.clone().addScaledVector(AWAY, -0.55).addScaledVector(PERP_B, -0.3), 0.02), text: 'Không gần hố hơn', dx: -50, dy: -150, c: '#ff8a7a' },
  { t0: 20.55, t1: 22.5, p: () => onGround(S_DROP, 0.5), text: 'Thả từ độ cao đầu gối', dx: 60, dy: -150 },
  { t0: 21.3, t1: 24.2, p: () => onGround(BB.clone().addScaledVector(AWAY, 0.8).addScaledVector(PERP_B, -0.55), 0.02), text: 'Vùng thả bóng trong bunker', dx: -40, dy: 160 },
  { t0: 26.0, t1: 30.45, p: () => onSurface(XP, 0.05), text: 'Điểm bóng cắt ranh giới', dx: 50, dy: 150 },
  { t0: 27.0, t1: 30.45, p: () => onGround(HV, 0.05), text: 'Hố golf', dx: -60, dy: 140 },
  { t0: 31.0, t1: 35.5, p: () => onSurface(XP, 0.05), text: 'Điểm cắt ranh giới', dx: 50, dy: -150 },
  { t0: 31.6, t1: 33.7, p: () => onGround(HV, 0.05), text: 'Hố golf', dx: -60, dy: -140 },
  { t0: 33.6, t1: 35.5, p: () => onGround(DROP, 0.05), text: 'Vị trí thả bóng', dx: 60, dy: 150 },
  { t0: 36.2, t1: 38.5, p: () => onGround(DROP, 0.02), text: 'Thả bóng trên đường thẳng', dx: -60, dy: -190 },
  { t0: 37.3, t1: 41.8, p: () => onGround(DROP.clone().addScaledVector(PERP, -CL * 0.9), 0.02), text: 'Vùng 1 gậy, ngoài khu vực phạt', dx: -40, dy: 170 },
  { t0: 42.6, t1: 46.1, p: () => onGround(BB, 0.02), text: 'Vị trí cú đánh trước', dx: 60, dy: -140 },
];

// ------------------------------------------------------------------ camera shots
const SH = (t0, t1, keys, o = {}) => ({ t0, t1, keys, ...o });
const A3 = v => [v.x, v.y, v.z];
const sunOpp = V(-SUN.x, 0, -SUN.z).normalize();
let SHOTS;
const FADE = 0.4;
function buildShots() {
  const G = C.golferPos;
  const gp = (dist, up, side = 0) => A3(G.clone().addScaledVector(sunOpp, dist).addScaledVector(V(-sunOpp.z, 0, sunOpp.x), side).add(V(0, up, 0)));
  const gq = up => A3(G.clone().add(V(0, up, 0)));
  const B0 = onGround(BB), Bq = (e, f, u) => A3(B0.clone().addScaledVector(AWAY, -f).addScaledVector(PERP_B, e).add(V(0, u, 0)));
  const mid = HV.clone().lerp(DROP, 0.5);
  const D0 = onGround(DROP);
  const Dp = (e, b, u) => A3(D0.clone().addScaledVector(PERP, e).addScaledVector(WL, b).add(V(0, u, 0)));
  const Lw = onSurface(LAND);
  const fS = tgtDir(S_REST), dS = V(-fS.z, 0, fS.x), S0 = onGround(S_REST);
  const Sf = (a, b, u) => S0.clone().addScaledVector(dS, a).addScaledVector(fS, b).add(V(0, u, 0));
  const uBD = DROP.clone().sub(BB).setY(0).normalize();
  const Ln = d => onSurface(atLine(d));
  SHOTS = [
    // 1a drone: bunker shot, follow the ball into the pond
    SH(0, 5.15, [[[-34, 21, -27], [-6, 0, -55], 40], [[-26, 24, -35], [4, 0, -62], 38], [[-14, 27, -44], [13, 0, -68], 36]], { shadow: 70, wsize: 0.9, ease: 'io2' }),
    // 1b the ball has gone: ripples, yellow stake in the foreground
    SH(5.15, 6.57, [[A3(onSurface(XP).addScaledVector(WL, -2.6).addScaledVector(PERP, -1.2).add(V(0, 1.0, 0))), A3(Lw.clone().add(V(0, 0.1, 0))), 34], [A3(onSurface(XP).addScaledVector(WL, -2.3).addScaledVector(PERP, -1.05).add(V(0, 0.95, 0))), A3(Lw.clone().add(V(0, 0.1, 0))), 34]],
      { dof: true, near: 0.05, shadow: 12, wsize: 1.6, gX: true, fp: () => Lw, ap: 0.006, mb: 0.01 }),
    // 1c golfer, back-lit, thinking
    SH(6.57, 9.3, [[gp(3.75, 1.46, 0.35), gq(1.62), 34], [gp(3.45, 1.44, 0.3), gq(1.63), 34]], { golfer: true, dof: true, near: 0.05, shadow: 9, gB: true, fp: () => G.clone().add(V(0, 1.2, 0)), ap: 0.006, mb: 0.012 }),
    // 2a fly back from the pond to the previous spot in the bunker
    SH(9.3, 16.2, [[[18, 20, -60], [-4, 0, -54], 40, 9.1], [[2, 13, -47], [-11, 0, -50], 40, 13.0], [Bq(2.6, 3.4, 3.1), A3(B0.clone().addScaledVector(AWAY, -0.6)), 38, 16.4]], { timed: true, shadow: 26, gB: true, wsize: 1.2 }),
    // 2c measure one club-length, relief area
    SH(16.2, 20.15, [[Bq(1.1, 2.6, 5.9), A3(B0.clone().addScaledVector(AWAY, 0.3)), 40], [Bq(0.95, 2.4, 5.5), A3(B0.clone().addScaledVector(AWAY, 0.3)), 40]], { shadow: 8, gB: true }),
    // 2d drop + replay from the bunker
    SH(20.15, 24.43, [[A3(Sf(4.6, -0.9, 2.9)), A3(Sf(-0.25, 0, 0.25)), 40], [A3(Sf(4.2, -0.8, 2.7)), A3(Sf(-0.25, 0, 0.25)), 40]], { shadow: 8, gB: true }),
    // 3a drone: hole, crossing point, reference line over the water
    SH(24.43, 30.59, [[A3(HV.clone().addScaledVector(WL, -20).addScaledVector(PERP, -5).add(V(0, 44, 0))), A3(Ln(dX + 7)), 40], [A3(HV.clone().addScaledVector(WL, -16).addScaledVector(PERP, -4).add(V(0, 46, 0))), A3(Ln(dX + 9)), 40]], { shadow: 70, wsize: 0.8, lw: 1.1 }),
    // 3b lower, from the side of the line
    SH(30.59, 35.62, [[A3(HV.clone().addScaledVector(WL, -22).addScaledVector(PERP, 3.6).add(V(0, 34, 0))), A3(Ln(8)), 40, 30.4], [A3(HV.clone().addScaledVector(WL, -20.5).addScaledVector(PERP, 3.6).add(V(0, 34, 0))), A3(Ln(9)), 40, 32.7], [A3(HV.clone().addScaledVector(WL, -10).addScaledVector(PERP, 3.6).add(V(0, 34, 0))), A3(Ln(22)), 38, 35.85]], { timed: true, shadow: 60, wsize: 1.0 }),
    // 3c far bank: drop on the line, 1 club-length area, then rise to show the line going back without limit
    SH(35.62, 42.0, [[Dp(2.4, -6.8, 4.8), Dp(0, 0.6, 0), 40, 35.4], [Dp(2.2, -6.2, 4.5), Dp(0, 0.7, 0), 40, 38.5], [Dp(2.0, -9.5, 10.5), Dp(0, 6.5, 0), 40, 42.2]], { timed: true, shadow: 16, gD: true, wsize: 1.4 }),
    // 4a aerial: both options together
    SH(42.0, 46.18, [[A3(BB.clone().addScaledVector(uBD, -60).add(V(0, 90, 0))), A3(BB.clone().addScaledVector(uBD, 16)), 30], [A3(BB.clone().addScaledVector(uBD, -56).add(V(0, 88, 0))), A3(BB.clone().addScaledVector(uBD, 16.5)), 30]], { shadow: 90, wsize: 0.8 }),
    // 4b split screen
    SH(46.18, 56.03, null, { split: true,
      L: SH(46.18, 56.03, [[A3(B0.clone().addScaledVector(AWAY, 6.2).addScaledVector(PERP_B, 0.5).add(V(0, 4.4, 0))), A3(B0.clone().addScaledVector(AWAY, -0.9)), 56], [A3(B0.clone().addScaledVector(AWAY, 4.6).addScaledVector(PERP_B, 0.4).add(V(0, 3.3, 0))), A3(B0.clone().addScaledVector(AWAY, -0.6)), 54]], { shadow: 9, gB: true, aspect: 0.28125 }),
      R: SH(46.18, 56.03, [[Dp(0.4, 7.0, 4.8), Dp(0, -1.6, 0), 56], [Dp(0.35, 5.2, 3.6), Dp(0, -1.2, 0), 54]], { shadow: 10, gD: true, wsize: 1.4, aspect: 0.28125 }) }),
    // 4c plaques on a soft background of the yellow stakes
    SH(56.03, 59.97, [[A3(onSurface(XP).addScaledVector(WL, -3.0).addScaledVector(PERP, -1.6).add(V(0, 1.1, 0))), A3(onSurface(XP).addScaledVector(WL, 3).add(V(0, 0.4, 0))), 38], [A3(onSurface(XP).addScaledVector(WL, -3.0).addScaledVector(PERP, -1.6).add(V(0, 1.1, 0))), A3(onSurface(XP).addScaledVector(WL, 3).add(V(0, 0.4, 0))), 38]], { card: true, shadow: 14, gX: true }),
    // 4d golfer prepares for the next shot
    SH(59.97, 64.5, [[gp(3.9, 1.46, -0.55), gq(1.68), 32], [gp(3.5, 1.44, -0.5), gq(1.69), 32]], { golfer: true, dof: true, near: 0.05, shadow: 9, gB: true, fp: () => G.clone().add(V(0, 1.2, 0)), ap: 0.006, mb: 0.012 }),
  ];
}
function camAt(shot, t) {
  const k = shot.keys;
  if (shot.timed) {
    let i = 0; while (i < k.length - 2 && t > k[i + 1][3]) i++;
    const l = esin(prog(t, k[i][3], k[i + 1][3]));
    return { p: V(...k[i][0]).lerp(V(...k[i + 1][0]), l), q: V(...k[i][1]).lerp(V(...k[i + 1][1]), l), fov: lerp(k[i][2], k[i + 1][2], l) };
  }
  let u = prog(t, shot.t0 - FADE / 2, shot.t1 + FADE / 2);
  u = shot.ease === 'lin' ? u : esin(u);
  const n = k.length - 1;
  if (n === 1) return { p: V(...k[0][0]).lerp(V(...k[1][0]), u), q: V(...k[0][1]).lerp(V(...k[1][1]), u), fov: lerp(k[0][2], k[1][2], u) };
  const pc = new THREE.CatmullRomCurve3(k.map(x => V(...x[0]))), qc = new THREE.CatmullRomCurve3(k.map(x => V(...x[1])));
  const f = u * n, i = Math.min(n - 1, Math.floor(f));
  return { p: pc.getPoint(u), q: qc.getPoint(u), fov: lerp(k[i][2], k[i + 1][2], f - i) };
}

// ------------------------------------------------------------------ per-frame 3D state
const T_IMP = 1.55, T_SPL = 3.35;
const T_SDROP = 20.68, T_DDROP = 36.2;
function dropPos(first, rest, t0, t) {        // knee-height drop (0.5 m), first touch, short roll
  const tf = Math.sqrt(2 * 0.5 / 9.8), dt = t - t0;
  if (dt < tf) return onGround(first, BALL_R + 0.5 - 4.9 * dt * dt);
  const u = eout(clamp((dt - tf) / 0.6)); const p = first.clone().lerp(rest, u); const b = Math.max(0, Math.abs(Math.sin((dt - tf) * 11)) * 0.05 * Math.exp(-(dt - tf) * 7));
  return onGround(p, BALL_R + b);
}
function setShaft(club, a, b) { const d = b.clone().sub(a).normalize(); club.position.copy(a); club.quaternion.setFromUnitVectors(V(1, 0, 0), d); }
function updateWorld(t, shot) {
  SKYTIME.value = t;
  C.water.material.uniforms.time.value = t * 0.55; C.water.material.uniforms.size.value = shot.wsize || 1.2;
  C.gB.visible = !!shot.gB; C.gD.visible = !!shot.gD; C.gX.visible = !!shot.gX;
  const fp = C.flag.geometry.attributes.position, fb = C.flagBase;
  for (let i = 0; i < fp.count; i++) { const x = fb[i * 3], y = fb[i * 3 + 1]; fp.setXYZ(i, x, y - 0.03 * x * x, Math.sin(x * 9 - t * 6) * 0.05 * x / 0.5 + Math.sin(y * 10 + t * 3) * 0.008 * x / 0.5); }
  fp.needsUpdate = true; C.flag.geometry.computeVertexNormals();
  C.golfer.visible = C.golferShadow.visible = !!shot.golfer;
  if (shot.golfer) C.golfer.rotation.y = Math.atan2(camera.position.x - C.golfer.position.x, camera.position.z - C.golfer.position.z);
  // the bunker shot
  { const u = prog(t, T_IMP, T_SPL);
    C.ball.visible = t < T_SPL; C.ball.position.copy(t < T_IMP ? C.START : C.tr[Math.round(u * 160)]);
    C.ball.userData.glow.visible = t > T_IMP && t < T_SPL; C.ball.userData.glow.material.opacity = 0.9;
    revealLine(C.trL, t > T_IMP && t < 16.2 ? u : 0); C.trL.material.opacity = (t < 4.6 ? 1 : 0.55) * (1 - prog(t, 15.5, 16.2));
    updateSandBurst(C.burst, T_IMP, t); updateSplash(C.splash, onSurface(LAND), T_SPL, t);
    C.crater.visible = t > T_IMP && t < 46.2 || t > 56;
    C.float.forEach((m, i) => { const ph = ((t * 0.5 + i / 3) % 1); const on = t > T_SPL + 0.8 && t < 9.4; m.visible = on; m.position.copy(onSurface(LAND, 0.005)); const s = 0.6 + ph * 3.2; m.scale.set(s, 1, s); m.material.opacity = 0.5 * (1 - ph) * (on ? 1 : 0); }); }
  // yellow line highlight
  const yHi = Math.max(fade(t, 3.7, 6.6, 0.4, 0.4), fade(t, 25.6, 35.6, 0.5, 0.4) * 0.6, fade(t, 46.4, 51.1, 0.5, 0.4) * 0.5) * (0.75 + 0.25 * Math.sin(t * 4));
  C.yGlow.material.opacity = yHi * 0.85; C.yLineMat.emissiveIntensity = 0.05 + yHi * 0.6; C.yMat.emissiveIntensity = yHi * 0.4;
  // option 1: club measure, relief area, drop, replay
  const o1 = Math.max(fade(t, 16.7, 24.45, 0.2, 0.3), fade(t, 41.8, 56.1, 0.2, 0.3));
  { const u = eout(prog(t, 16.7, 17.5)); C.club.visible = o1 > 0 && !(t > 20.2 && t < 41.8);
    const a0 = onGround(BB, 0.012), a1 = onGround(BB.clone().addScaledVector(AWAY, CL), 0.012); const dir = a1.clone().sub(a0).normalize();
    C.club.position.copy(a0).add(V(0, (1 - u) * 0.45, 0)); C.club.quaternion.setFromUnitVectors(V(1, 0, 0), dir); C.club.rotateZ((1 - u) * 0.35);
    if (t > 41.8) { C.club.visible = shot.split || shot === SHOTS[9]; C.club.position.copy(a0); C.club.quaternion.setFromUnitVectors(V(1, 0, 0), dir); } }
  C.zoneS.U.rad.value = CL * eout(prog(t, 17.4, 18.3)) + 0.001; C.zoneS.U.op.value = Math.max(fade(t, 17.4, 24.45, 0.3, 0.3), fade(t, 41.9, 56.1, 0.3, 0.3)); C.zoneS.m.visible = C.zoneS.U.op.value > 0;
  C.zoneS.U.ex.value = fade(t, 18.3, 20.1, 0.4, 0.3);
  C.ballS.visible = (t > T_SDROP - 0.05 && t < 24.5) || (t > 41.9 && t < 56.1);
  C.ballS.position.copy(t > 41.9 ? onGround(S_REST, BALL_R) : dropPos(S_DROP, S_REST, T_SDROP, t)); C.ballS.userData.glow.visible = shot.split || shot === SHOTS[9]; C.ballS.userData.glow.material.opacity = 0.6;
  revealLine(C.trS, t > 23.1 && t < 24.5 ? eio(prog(t, 23.1, 23.95)) : (shot.split ? 1 : 0)); C.trS.material.opacity = shot.split ? 0.8 * fade(t, 51.2, 53.2, 0.3, 0.3) + 0.25 : 1;
  // option 2: back-on-the-line
  const lb = Math.max(fade(t, 27.0, 42.05, 0.2, 0.3), fade(t, 41.9, 56.1, 0.2, 0.3));
  let rv = 0; if (t < 42) rv = t < 28.1 ? prog(t, 27.0, 28.1) * C.backSplitX : C.backSplitX + (1 - C.backSplitX) * eio(prog(t, 28.1, 29.9)); else rv = 1;
  revealLine(C.back, lb > 0 ? rv : 0); C.back.material.opacity = lb; C.back.material.dashOffset = -t * 0.8;
  C.zoneD.U.rad.value = CL * eout(prog(t, 36.8, 37.7)) + 0.001; C.zoneD.U.op.value = Math.max(fade(t, 36.8, 42.05, 0.3, 0.3), fade(t, 41.9, 56.1, 0.3, 0.3)); C.zoneD.m.visible = C.zoneD.U.op.value > 0; C.zoneD.U.ex.value = 0;
  C.ballD.visible = (t > T_DDROP - 0.05 && t < 42.05) || (t > 41.9 && t < 56.1);
  C.ballD.position.copy(t > 41.9 ? onGround(D_REST, BALL_R) : dropPos(DROP, D_REST, T_DDROP, t)); C.ballD.userData.glow.visible = shot.split || shot === SHOTS[9]; C.ballD.userData.glow.material.opacity = 0.6;
  const lw = (shot.lw || 1) * RS; C.back.material.linewidth = 4.2 * lw; C.trL.material.linewidth = 3.2 * lw; C.trS.material.linewidth = 3.2 * lw;
}
function setupShot(shot, t) {
  const c = camAt(shot, t);
  camera.fov = c.fov; camera.aspect = shot.aspect || W / H; camera.near = shot.near || 0.3; camera.far = 2400; camera.position.copy(c.p); camera.lookAt(c.q); camera.updateProjectionMatrix();
  sky.position.copy(camera.position);
  aimShadow(c.q, shot.shadow || 60);
  updateWorld(t, shot);
  const focus = shot.fp ? c.p.distanceTo(shot.fp()) : c.p.distanceTo(c.q);
  return { dof: !!shot.dof, focus, aperture: shot.ap || 0.003, maxblur: shot.mb || 0.008 };
}
function render3D(shot, t) {
  const r = setupShot(shot, t);
  if (r.dof) {
    renderPass.scene = scene; renderPass.camera = camera; bokeh.scene = scene; bokeh.camera = camera;
    bokeh.uniforms.focus.value = r.focus; bokeh.uniforms.aperture.value = r.aperture; bokeh.uniforms.maxblur.value = r.maxblur;
    bokeh.uniforms.aspect.value = camera.aspect;
    composer.render();
  } else renderer.render(scene, camera);
}
function useCam(shot, t) { const c = camAt(shot, t); camera.fov = c.fov; camera.aspect = shot.aspect || W / H; camera.position.copy(c.p); camera.lookAt(c.q); camera.updateProjectionMatrix(); camera.updateMatrixWorld(); }

// ------------------------------------------------------------------ 2D infographics per shot (projected from 3D)
let CURT = 0;
function drawInfographics(shot, t, side) {
  drawPulse(C.START, GOLD_L, fade(t, 0.35, 1.5, 0.3, 0.15), 8);
  // option 1
  if (t > 10.3 && t < 24.5) {
    drawPulse(onGround(BB, 0.02), GOLD_L, fade(t, 10.6, 17.2, 0.4, 0.3), 12);
    drawFeet(BB, GOLD_L, fade(t, 13.4, 16.2, 0.4, 0.3) * 0.55);
    if (t > 22.4) { const a = fade(t, 22.5, 24.4, 0.3, 0.3); drawFeet(S_REST, '#c9f0a4', a);
      let th = 0, from = null; if (t > 22.65) { th = 1.9 * esin(prog(t, 22.65, 23.15)); from = 0; } if (t > 23.2) { th = lerp(1.9, -1.4, esin(prog(t, 23.2, 23.65))); from = 1.9; }
      drawClub(S_REST, th, GOLD_L, a * 0.95, from); }
  }
  // option 2 markers
  const xm = Math.max(fade(t, 25.8, 42.05, 0.4, 0.3), fade(t, 41.9, 46.2, 0.3, 0.3));
  if (xm > 0 && !(shot.split && side === 'L')) { drawPulse(onSurface(XP, 0.05), '#ffe08a', xm, 10); }
  if (t > 26.8 && t < 46.2 && !shot.split) drawPulse(onGround(HV, 0.05), CREAM, Math.max(fade(t, 27.0, 35.6, 0.4, 0.3), fade(t, 42.0, 46.2, 0.3, 0.3)) * 0.8, 8);
  drawPulse(onGround(DROP, 0.03), GOLD_L, fade(t, 33.6, 36.3, 0.3, 0.2), 10);
  drawChevrons(Math.max(fade(t, 38.7, 42.05, 0.4, 0.3), shot.split && side === 'R' ? fade(t, 53.2, 55.8, 0.4, 0.3) : 0), t);
  if (shot.split && side === 'L') { const a = fade(t, 51.3, 53.4, 0.3, 0.3); drawFeet(S_REST, '#c9f0a4', a); let th = 0, from = null; if (t > 51.6) { th = 1.9 * esin(prog(t, 51.6, 52.1)); from = 0; } if (t > 52.15) { th = lerp(1.9, -1.4, esin(prog(t, 52.15, 52.6))); from = 1.9; } drawClub(S_REST, th, GOLD_L, a * 0.95, from); }
}
// split screen: two cameras, each shows the centre half of its render
function drawSplit(shot, t, alpha) {
  const halves = [['L', shot.L, 0], ['R', shot.R, W / 2]];
  for (const [side, s, x] of halves) {
    render3D(s, t);
    ctx.save(); ctx.globalAlpha = alpha; ctx.beginPath(); ctx.rect(x, 0, W / 2, H); ctx.clip();
    ctx.drawImage(renderer.domElement, 0, 0, RW, RH, x, 0, W / 2, H);
    // focus: dim the half that is not being talked about
    const dim = side === 'L' ? fade(t, 53.1, 55.9, 0.3, 0.3) : fade(t, 51.25, 53.05, 0.3, 0.3);
    if (dim > 0) { ctx.fillStyle = `rgba(3,26,18,${0.55 * dim})`; ctx.fillRect(x, 0, W / 2, H); }
    ctx.restore();
  }
}
function drawSplitOverlay(shot, t) {
  { const a = fade(t, 46.4, 56.0, 0.5, 0.4); if (a > 0) { const g = ctx.createLinearGradient(0, 470, 0, 880); g.addColorStop(0, 'rgba(3,30,20,0)'); g.addColorStop(0.3, `rgba(3,30,20,${0.5 * a})`); g.addColorStop(0.75, `rgba(3,30,20,${0.45 * a})`); g.addColorStop(1, 'rgba(3,30,20,0)'); ctx.fillStyle = g; ctx.fillRect(0, 470, W, 410); } }
  for (const [side, s, x] of [['L', shot.L, 0], ['R', shot.R, W / 2]]) {
    useCam(s, t); PJ.x0 = x; PJ.w = W / 2; PJ.x1 = x + W / 2;
    ctx.save(); ctx.beginPath(); ctx.rect(x, 0, W / 2, H); ctx.clip();
    drawInfographics(shot, t, side);
    ctx.restore();
    // captions for each half (top band, under the title)
    const a = fade(t, 46.5, 56.0, 0.5, 0.4); if (a > 0) {
      const focus = side === 'L' ? 1 - 0.55 * fade(t, 53.1, 55.9, 0.3, 0.3) : 1 - 0.55 * fade(t, 51.25, 53.05, 0.3, 0.3);
      ctx.save(); ctx.globalAlpha = a * focus; ctx.textAlign = 'center'; ctx.shadowColor = 'rgba(0,18,10,0.7)'; ctx.shadowBlur = 18;
      ctx.fillStyle = GOLD_L; ctx.font = '600 23px "Be Vietnam Pro"'; spaced(ctx, side === 'L' ? 'PHƯƠNG ÁN 1' : 'PHƯƠNG ÁN 2', x + W / 4, 590, 6);
      ctx.fillStyle = CREAM; ctx.font = '500 54px "Cormorant Garamond"';
      (side === 'L' ? ['Đánh lại', 'từ bunker'] : ['Thả theo', 'đường thẳng']).forEach((l, i) => ctx.fillText(l, x + W / 4, 652 + i * 54));
      ctx.fillStyle = 'rgba(246,241,230,0.9)'; ctx.font = '400 23px "Be Vietnam Pro"'; ctx.fillText(side === 'L' ? 'Luật 17.1d(1) · Stroke and Distance' : 'Luật 17.1d(2) · Back-on-the-Line', x + W / 4, 750);
      ctx.fillStyle = GOLD_L; ctx.font = '600 26px "Be Vietnam Pro"'; spaced(ctx, '+1 GẬY PHẠT', x + W / 4, 796, 3);
      ctx.restore();
    }
  }
  PJ.x0 = 0; PJ.w = W; PJ.x1 = W; camera.aspect = W / H; camera.updateProjectionMatrix();
  // gold divider
  const a = fade(t, 46.0, 56.2, 0.4, 0.4); if (a > 0) { ctx.save(); ctx.globalAlpha = a; const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(201,165,92,0)'); g.addColorStop(0.2, GOLD); g.addColorStop(0.8, GOLD); g.addColorStop(1, 'rgba(201,165,92,0)'); ctx.fillStyle = g; ctx.fillRect(W / 2 - 1.5, 0, 3, H); ctx.restore(); }
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
  if (shot.split) { drawSplit(shot, t, alpha); return; }
  ctx.save(); ctx.globalAlpha = alpha;
  if (shot.card) { const bg = cardBackground(shot); const z = 1 + 0.05 * prog(t, shot.t0, shot.t1); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.drawImage(bg, -W / 2, -H / 2); }
  else { render3D(shot, t); ctx.drawImage(renderer.domElement, 0, 0, W, H); }
  ctx.restore();
}
function renderFrame(t) {
  CURT = t;
  let i = SHOTS.findIndex(s => t >= s.t0 && t < s.t1); if (i < 0) i = SHOTS.length - 1;
  const s = SHOTS[i], prev = SHOTS[i - 1], next = SHOTS[i + 1];
  ctx.globalAlpha = 1; ctx.fillStyle = '#04281c'; ctx.fillRect(0, 0, W, H);
  if (prev && t < s.t0 + FADE / 2) { layer(prev, t, 1); layer(s, t, esin(clamp((t - (s.t0 - FADE / 2)) / FADE))); }
  else if (next && t >= s.t1 - FADE / 2) { layer(s, t, 1); layer(next, t, esin(clamp((t - (s.t1 - FADE / 2)) / FADE))); }
  else layer(s, t, 1);
  softGlow(s.card ? 0.08 : 0.2);
  const dom = (next && t >= s.t1) ? next : (prev && t < s.t0) ? prev : s;
  if (dom.split) drawSplitOverlay(dom, t);
  else if (!dom.card) { useCam(dom, t); drawInfographics(dom, t, null); }
  drawScrims(t);
  if (!dom.card && !dom.split) LABELS.forEach(l => drawLabel(l, t));
  if (!dom.split && !dom.card) { drawBadge(W - 170, 1240, fade(t, 16.5, 20.05, 0.3, 0.3)); drawBadge(W - 170, 1240, fade(t, 40.1, 41.95, 0.3, 0.3)); }
  drawPlaques(t);
  TITLES.forEach(o => drawTitle(o, t));
  drawEnd(t);
  const ef = sstep(62.9, 63.85, t); if (ef > 0) { ctx.fillStyle = `rgba(4,40,28,${ef * 0.85})`; ctx.fillRect(0, 0, W, H); if (t > 62.9) { ctx.save(); ctx.globalAlpha = 1; drawEnd(t); ctx.restore(); } }
  const st = sstep(0, 0.35, t); if (st < 1) { ctx.fillStyle = `rgba(4,40,28,${1 - st})`; ctx.fillRect(0, 0, W, H); }
  drawSubs(t);
}
async function init() {
  const faces = ['500 92px "Cormorant Garamond"', '600 92px "Cormorant Garamond"', 'italic 500 44px "Cormorant Garamond"', '400 40px "Be Vietnam Pro"', '500 25px "Be Vietnam Pro"', '600 25px "Be Vietnam Pro"'];
  for (const f of faces) await document.fonts.load(f, 'ĐđỏậàÀ Aa1→①②');
  await document.fonts.ready;
  const T0 = performance.now(); const lg = m => console.log(m, ((performance.now() - T0) / 1000).toFixed(1));
  buildCourse(); lg('course'); buildProps(); buildClumps(); buildHills(); buildShots(); lg('props');
  await new Promise(r => { const chk = () => (C.golfer.material.map.image ? r() : setTimeout(chk, 50)); chk(); });
  for (const s of SHOTS) { if (s.split) { render3D(s.L, 50); render3D(s.R, 50); } else if (!s.card) render3D(s, (s.t0 + s.t1) / 2); }
  lg('warm');
  window.renderFrame = (t, q = 0.93) => { renderFrame(t); return out.toDataURL('image/jpeg', q); };
  window.camTest = (p, q, fov, t, extra = {}) => {
    const shot = Object.assign({ t0: t - 5, t1: t + 5, keys: [[p, q, fov], [p, q, fov]], shadow: 60, wsize: 1.2 }, extra);
    ctx.globalAlpha = 1; render3D(shot, t); ctx.drawImage(renderer.domElement, 0, 0, W, H);
    useCam(shot, t); CURT = t; drawInfographics(shot, t, null); drawScrims(t); LABELS.forEach(l => drawLabel(l, t)); TITLES.forEach(o => drawTitle(o, t)); drawSubs(t);
    return out.toDataURL('image/jpeg', 0.85);
  };
  window.ready = true;
}
init().catch(e => { console.error('INIT FAIL', e.stack || e); window.initError = String(e.stack || e); });
