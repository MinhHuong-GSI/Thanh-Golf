import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createGolfer } from './golfer3d.js';

// ------------------------------------------------------------------ basics
console.log('module start', performance.now()|0);
const W = 1080, H = 1920;
const GOLD = '#C9A55C', GOLD_L = '#E8D29A', CREAM = '#F6F1E6', EMER = '#0B4733', EMER_D = '#04281C';
const YEL = '#E4B41F', RED = '#BC2A30';
let _s = 20240607;
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

const QS = new URLSearchParams(location.search);
const G3D = QS.get('g3d') === '1'; // ?g3d=1: dùng nhân vật golfer 3D (golfer3d.js) thay cho tấm ảnh golfer_cut.png
const RS = parseFloat(QS.get('rs') || '1'), AA = QS.get('aa') !== '0', RW = Math.round(W * RS), RH = Math.round(H * RS);
const renderer = new THREE.WebGLRenderer({ antialias: AA, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(RW, RH);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = QS.get('tm') === 'agx' ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = parseFloat(QS.get('ex') || '1.08');
renderer.shadowMap.enabled = true; renderer.shadowMap.type = QS.get('pcf') === '1' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
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

// ------------------------------------------------------------------ sky + environment
const SUN = V(0.62, 0.36, 0.70).normalize();
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

// ------------------------------------------------------------------ course layout (units ~ stylised metres)
const HOLE = { x: 0, z: -58 }, TEE = { x: 0, z: 60 };
function sdBox(px, pz, cx, cz, hx, hz, r) {
  const qx = Math.abs(px - cx) - hx + r, qz = Math.abs(pz - cz) - hz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}
function smin(a, b, k) { const h = clamp(.5 + .5 * (b - a) / k); return lerp(b, a, h) - k * h * (1 - h); }
const pondSD = (x, z) => sdBox(x, z, 0, -39, 32, 5, 4);
const creekSD = (x, z) => sdBox(x, z, 18, 10, 4, 46, 3.9);
const waterSD = (x, z) => smin(pondSD(x, z), creekSD(x, z), 2.0);
function fwHalf(z) {
  let h = 12.4 + 1.3 * Math.sin(clamp((z + 34) / 88) * Math.PI);
  if (z > 47) h *= Math.sqrt(Math.max(0, 1 - Math.pow((z - 47) / 7, 2)));
  return h;
}
function fairwaySD(x, z) { if (z < -34.5 || z > 54) return 30; return Math.abs(x) - fwHalf(z); }
const teeSD = (x, z) => sdBox(x, z, 0, 60, 3.6, 2.4, 0.8);
const BUNKERS = [{ x: -9.6, z: -51.5, rx: 3.3, rz: 2.2, a: 0.5 }, { x: 7.8, z: -64, rx: 2.8, rz: 1.8, a: -0.4 }, { x: -13.2, z: 24, rx: 2.4, rz: 4.4, a: 0.12 }];
function bunkerSD(b, x, z) {
  const dx = x - b.x, dz = z - b.z, c = Math.cos(b.a), s = Math.sin(b.a);
  const u = (dx * c - dz * s) / b.rx, v = (dx * s + dz * c) / b.rz;
  return (Math.hypot(u, v) - 1) * Math.min(b.rx, b.rz);
}
const PATH = new THREE.CatmullRomCurve3([V(-5, 0, 70), V(-17, 0, 55), V(-20, 0, 20), V(-22, 0, -12), V(-28, 0, -27), V(-37, 0, -33), V(-38, 0, -45), V(-27, 0, -54), V(-15, 0, -64)]);
const PATHPTS = PATH.getSpacedPoints(300);
function pathDist(x, z) { let m = 1e9; for (const p of PATHPTS) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < m) m = d; } return Math.sqrt(m); }
// ------------------------------------------------------------------ Rule 16.1 hero spot: big oak beside the cart path
const HERO = (() => {
  const z0 = 6;
  let bi = 0, bd = 1e9; PATHPTS.forEach((p, i) => { const d = Math.abs(p.z - z0); if (d < bd) { bd = d; bi = i; } });
  const Pc = PATHPTS[bi].clone().setY(0);
  const T = PATHPTS[Math.min(bi + 3, 300)].clone().sub(PATHPTS[Math.max(bi - 3, 0)]).setY(0).normalize();
  const E = V(-T.z, 0, T.x); if (E.x < 0) E.negate();           // unit normal pointing east (toward the fairway)
  const PW = 1.0;                                                // cart path half width
  const RF = 1.18;                                               // trunk flare radius at ground
  const B = Pc.clone().addScaledVector(E, -(PW + 0.22));          // where the ball came to rest
  const Ct = B.clone().addScaledVector(E, -(RF + 0.035));        // trunk centre
  const f = V(HOLE.x - B.x, 0, HOLE.z - B.z).normalize();        // target line
  const d = V(-f.z, 0, f.x);                                     // a right-handed player faces d (target on his left)
  return { Pc, T, E, PW, RF, B, Ct, f, d };
})();

function heightAt(x, z) {
  const sd = waterSD(x, z);
  if (sd < 0) return -1.45 * sstep(0, 1.9, -sd);
  const fw = 1 - sstep(-2, 4, fairwaySD(x, z));
  const dg = Math.hypot(x - HOLE.x, z - HOLE.z);
  const gm = 1 - sstep(9, 15, dg);
  const roll = 0.55 * Math.sin(x * 0.071 + 1.3) * Math.sin(z * 0.052 + 0.4) + 0.35 * Math.sin(x * 0.13 + z * 0.09 + 2.0) + 0.2 * Math.sin(x * 0.31 - z * 0.23);
  let h = (0.55 + roll * 0.6 * (1 - 0.75 * fw) * (1 - gm)) * sstep(0, 6, sd);
  h += 0.42 * (1 - sstep(0, 1.1, teeSD(x, z)));
  h += 0.35 * Math.pow(1 - clamp(dg / 11), 2);
  for (const b of BUNKERS) h -= 0.5 * (1 - sstep(-0.4, 0.5, bunkerSD(b, x, z)));
  const r = Math.hypot(x, z * 0.85);
  h += 16 * sstep(100, 300, r) * (0.65 + 0.35 * Math.sin(Math.atan2(z, x) * 3 + 1));
  return h;
}

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
  // cart path
  g.strokeStyle = '#cbbf9f'; g.lineWidth = 2.2; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); PATHPTS.forEach((p, i) => i ? g.lineTo(p.x, p.z) : g.moveTo(p.x, p.z)); g.stroke();
  g.strokeStyle = '#b6aa89'; g.lineWidth = 0.15; g.stroke();
  // fairway
  const fw = new Path2D(); const zs = [];
  for (let z = -34.6; z <= 54; z += 0.25) zs.push(z);
  zs.forEach((z, i) => { const x = -fwHalf(z); i ? fw.lineTo(x, z) : fw.moveTo(x, z); });
  [...zs].reverse().forEach(z => fw.lineTo(fwHalf(z), z)); fw.closePath();
  g.strokeStyle = '#668a36'; g.lineWidth = 3.2; g.stroke(fw);
  g.fillStyle = '#7fa646'; g.fill(fw);
  g.save(); g.clip(fw);
  for (let x = -18, k = 0; x < 18; x += 3, k++) { g.fillStyle = k % 2 ? 'rgba(255,255,230,0.05)' : 'rgba(20,40,0,0.05)'; g.fillRect(x, -40, 3, 100); }
  for (let z = -40, k = 0; z < 60; z += 6, k++) { g.fillStyle = k % 2 ? 'rgba(255,255,230,0.018)' : 'rgba(20,40,0,0.018)'; g.fillRect(-20, z, 40, 6); }
  g.restore();
  // approach + green
  g.fillStyle = '#76a043';
  g.beginPath(); g.moveTo(-10, -43.5); g.lineTo(10, -43.5); g.lineTo(8.5, -52); g.lineTo(-8.5, -52); g.closePath(); g.fill();
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
    g.fillStyle = '#bea77a'; g.beginPath(); g.ellipse(0, 0, b.rx, b.rz, 0, 0, 7); g.fill(); g.restore();
  }
  // water banks + grain (pixel pass)
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
      if (z > -52 && z < 62 && x > -40 && x < 40) {
        const sd = waterSD(x, z);
        if (sd < 0.5) {
          let col;
          if (sd > 0) { const k = sd / 0.5; col = [lerp(bankA[0], d[i], k), lerp(bankA[1], d[i + 1], k), lerp(bankA[2], d[i + 2], k)]; }
          else if (sd > -1.0) { const k = -sd; col = [lerp(bankA[0], bankB[0], k), lerp(bankA[1], bankB[1], k), lerp(bankA[2], bankB[2], k)]; }
          else col = bed;
          d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2];
        }
      }
      { // rough: natural mottling (dry straw-coloured and lush patches)
        const fs = fairwaySD(x, z), dg = Math.hypot(x - HOLE.x, z - HOLE.z);
        const rough = sstep(0.8, 3.0, fs) * sstep(10.2, 12, dg) * sstep(0.5, 2, teeSD(x, z));
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

// ------------------------------------------------------------------ scene C (course)
const scene = new THREE.Scene();
scene.environment = envTex; scene.environmentIntensity = 0.55;
scene.fog = new THREE.FogExp2(SKY.hor.clone(), 0.00165);
const sky = makeSky(1800); scene.add(sky);
const sun = new THREE.DirectionalLight(new THREE.Color('#ffd7a3'), 3.1);
sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight('#c4d6e6', '#5c6634', QS.get('lam') !== '0' ? 1.05 : 0.6));
function aimShadow(c, size) {
  sun.position.copy(c).addScaledVector(SUN, 300); sun.target.position.copy(c); sun.target.updateMatrixWorld();
  const sc = sun.shadow.camera; sc.left = -size; sc.right = size; sc.top = size; sc.bottom = -size; sc.near = 150; sc.far = 460; sc.updateProjectionMatrix();
}

let detailTex, groundMat;
const C = {}; // course objects

function buildCourse() {
  const groundTex = texFrom(paintGround()); groundTex.wrapS = groundTex.wrapT = THREE.ClampToEdgeWrapping;
  const dn = vnoise(512, 16, 4), dn2 = vnoise(512, 64, 2);
  detailTex = texFrom(canvasFrom(512, i => [dn[i] * 255, dn2[i] * 255, 0]), false, true);
  groundMat = QS.get('lam') !== '0' ? new THREE.MeshLambertMaterial({ map: groundTex }) : new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.93, metalness: 0 });
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
  const core = new THREE.Mesh(terrain(200, 250, false), groundMat); core.receiveShadow = true; scene.add(core);
  const outer = new THREE.Mesh(terrain(1700, 170, true), groundMat); outer.receiveShadow = true; outer.layers.set(1); scene.add(outer);

  // water
  const wh = vnoise(512, 6, 5);
  const wn = texFrom(normalFromHeight(wh, 512, 40), false, true);
  const water = new Water(new THREE.PlaneGeometry(90, 130), {
    textureWidth: 300, textureHeight: 534, waterNormals: wn, sunDirection: SUN.clone(),
    sunColor: 0xf3e2c2, waterColor: 0x123f3e, distortionScale: 0.32, fog: true, alpha: 1
  });
  water.rotation.x = -Math.PI / 2; water.position.set(0, -0.45, 6); scene.add(water);
  C.water = water;

  // stakes
  const stakeGeo = (() => {
    const a = new THREE.CylinderGeometry(0.075, 0.08, 1.25, 16).translate(0, 0.625, 0);
    const b = new THREE.SphereGeometry(0.075, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.25, 0);
    return mergeGeometries([a, b]);
  })();
  C.yMat = new THREE.MeshStandardMaterial({ color: YEL, roughness: 0.42, metalness: 0.05, emissive: new THREE.Color(YEL), emissiveIntensity: 0 });
  C.rMat = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.42, metalness: 0.05, emissive: new THREE.Color(RED), emissiveIntensity: 0 });
  const yPos = [], rPos = [];
  for (const x of [-27, -20.5, -14, -7.5, 2.5, 7.0, 12.2]) yPos.push([x, -33.97]);
  for (let x = -24; x <= 22; x += 7.5) yPos.push([x, -44.03]);
  for (const z of [-32.2, -24, -17, -10, -3, 4, 10, 16.2, 23, 30, 37, 44, 51]) rPos.push([13.97, z]);
  for (let z = -28; z <= 52; z += 9) rPos.push([22.03, z]);
  function stakes(list, mat) {
    const m = new THREE.InstancedMesh(stakeGeo, mat, list.length); const o = new THREE.Object3D();
    list.forEach(([x, z], i) => { o.position.set(x, heightAt(x, z) - 0.05, z); o.rotation.set((rnd() - .5) * 0.06, rnd() * 6, (rnd() - .5) * 0.06); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    m.castShadow = true; m.receiveShadow = true; scene.add(m); return m;
  }
  stakes(yPos, C.yMat); stakes(rPos, C.rMat);

  // painted boundary lines (follow the true water edge)
  function edgeProject(x, z) {
    for (let k = 0; k < 8; k++) {
      const e = 0.01, s = waterSD(x, z);
      const gx = (waterSD(x + e, z) - waterSD(x - e, z)) / (2 * e), gz = (waterSD(x, z + e) - waterSD(x, z - e)) / (2 * e);
      const gl = Math.hypot(gx, gz) || 1; x -= s * gx / gl; z -= s * gz / gl;
    }
    return [x, z];
  }
  function strip(pts, w, mat) {
    const pos = [], idx = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
      const nx = -tz, nz = tx, [x, z] = pts[i];
      for (const s of [-1, 1]) { const px = x + nx * w / 2 * s, pz = z + nz * w / 2 * s; pos.push(px, heightAt(px, pz) + 0.035, pz); }
      if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m); return m;
  }
  const yl = [], rl = [];
  for (let x = -28.5; x <= 12.4; x += 0.3) { const [px, pz] = edgeProject(x, -34); yl.push([px, pz + 0.12]); }
  for (let z = -33.2; z <= 53.5; z += 0.3) { const [px, pz] = edgeProject(14, z); rl.push([px - 0.12, pz]); }
  const lineMat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, emissive: new THREE.Color(c), emissiveIntensity: 0.05, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  C.yLineMat = lineMat(YEL); C.rLineMat = lineMat(RED);
  strip(yl, 0.26, C.yLineMat); strip(rl, 0.26, C.rLineMat);
  // glow overlays for the lines
  const glowTex = texFrom(canvasFrom(64, i => { const y = ((i / 64) | 0) / 63; const v = Math.pow(Math.sin(y * Math.PI), 2) * 255; return [v, v, v]; }), false);
  const glowMat = c => new THREE.MeshBasicMaterial({ color: c, alphaMap: glowTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  C.yGlow = strip(yl, 1.6, glowMat('#ffd86a')); C.rGlow = strip(rl, 1.6, glowMat('#ff5a4a'));
  [C.yGlow, C.rGlow].forEach(m => {
    const uv = []; const n = m.geometry.attributes.position.count; for (let i = 0; i < n; i++) uv.push(i % 2, i % 2);
    m.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); m.receiveShadow = false; m.renderOrder = 5;
  });

  // flag + cup
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
  C.flag.position.set(HOLE.x + 0.012, pinY + 1.94, HOLE.z); C.flag.rotation.y = 0.6; C.flag.castShadow = true; scene.add(C.flag);
  const flagStripe = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.08, 18, 1).translate(0.75, -0.37, 0), new THREE.MeshStandardMaterial({ color: '#0d4a35', side: THREE.DoubleSide, roughness: 0.8 }));
  C.flagStripeBase = flagStripe.geometry.attributes.position.array.slice();
  C.flagStripe = flagStripe; flagStripe.position.copy(C.flag.position); flagStripe.rotation.y = 0.6; flagStripe.visible = false; scene.add(flagStripe);
  // tee markers (small gold spheres)
  for (const x of [-3, 3]) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.85, roughness: 0.3 })); m.position.set(x, heightAt(x, 59) + 0.15, 59); m.castShadow = true; scene.add(m); }

  buildTrees();
}

function blobGeo(r, detail, cx, cy, cz, so, sy = 0.9) {
  let g = new THREE.IcosahedronGeometry(r, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 2.3 / r + so) * Math.sin(y * 2.9 / r + so * 2) * Math.sin(z * 2.1 / r + 1.3) + 0.5 * Math.sin(x * 5.1 / r + z * 4.3 / r + so);
    const k = 1 + 0.13 * n; p.setXYZ(i, x * k + cx, y * k * sy + cy, z * k + cz);
  }
  g.computeVertexNormals(); return g;
}
function paint(g, fn) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3), col = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(p.getX(i), p.getY(i), p.getZ(i), col); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
function trunkGeo(r0, r1, h) { const g = new THREE.CylinderGeometry(r1, r0, h, 8, 1).translate(0, h / 2, 0); g.deleteAttribute('uv'); return paint(g, (x, y, z, c) => c.set('#5a4532')); }
// ---- foliage-card trees: each canopy is built from many camera-facing leaf-cluster cards
// lit with a canopy-shaped normal, so trees read as soft, natural, leafy volumes from any angle.
function leafAtlasTex() {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * 256, oy = (v >> 1) * 256;
    g.save(); g.beginPath(); g.rect(ox + 2, oy + 2, 252, 252); g.clip();
    // a few twigs
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
  const m = QS.get('lam') !== '0' ? new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.42, alphaToCoverage: true }) : new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.42, roughness: 0.92, metalness: 0, alphaToCoverage: true });
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
function cardColor(base, shade, out) {
  const j = 0.9 + rnd() * 0.2;
  out.cr = base.r * shade * j; out.cg = base.g * shade * j; out.cb = base.b * shade * j * (0.92 + rnd() * 0.12);
}
function sphereDir() { const u = rnd() * 2 - 1, th = rnd() * 6.283, q = Math.sqrt(1 - u * u); return [q * Math.cos(th), u, q * Math.sin(th)]; }
function genDeciduous(x, z, s, out) {
  const y0 = heightAt(x, z) - 0.1;
  const base = new THREE.Color().setHSL(0.19 + rnd() * 0.08, 0.40 + rnd() * 0.22, 0.30 + rnd() * 0.10);
  const H = (4.6 + rnd() * 1.6) * s, R = (2.3 + rnd() * 0.5) * s;
  const lumps = [[0, H, 0, R]];
  const nl = 3 + (rnd() * 3 | 0);
  for (let i = 0; i < nl; i++) { const a = rnd() * 6.28, d = (0.9 + rnd() * 0.9) * s; lumps.push([Math.cos(a) * d * 1.3, H + (rnd() - 0.55) * 1.8 * s, Math.sin(a) * d * 1.3, (1.25 + rnd() * 0.6) * s]); }
  lumps.push([(rnd() - .5) * s, H + 1.5 * s, (rnd() - .5) * s, 1.5 * s]);
  for (const [lx, ly, lz, r] of lumps) {
    const n = Math.round(7 + r / s * 2.6);
    for (let i = 0; i < n; i++) {
      const [dx, dy, dz] = sphereDir(); const rr = r * (0.45 + 0.55 * Math.sqrt(rnd()));
      const px = x + lx + dx * rr, py = y0 + ly + dy * rr * 0.82, pz = z + lz + dz * rr;
      let nx = px - x, ny = (py - y0 - H) * 1.1 + 0.9 * s, nz = pz - z; const L = Math.hypot(nx, ny, nz) || 1;
      const c = { x: px, y: py, z: pz, s: r * (0.88 + rnd() * 0.4), nx: nx / L, ny: ny / L, nz: nz / L, v: (rnd() * 4) | 0, r: (rnd() - .5) * 0.9 };
      cardColor(base, (0.62 + 0.38 * rr / r) * (0.8 + 0.2 * (dy * 0.5 + 0.5)), c); out.push(c);
    }
  }
  return { H };
}
function genConifer(x, z, s, out) {
  const y0 = heightAt(x, z) - 0.1;
  const base = new THREE.Color().setHSL(0.30 + rnd() * 0.06, 0.32 + rnd() * 0.15, 0.20 + rnd() * 0.06);
  const H = (6.8 + rnd() * 1.8) * s, R = (2.0 + rnd() * 0.5) * s, h0 = 1.4 * s; const n = 38;
  for (let i = 0; i < n; i++) {
    const t = Math.min(0.9, rnd()), h = h0 + t * (H - h0), rad = (R * (1 - t) + 0.25 * s) * (0.55 + 0.45 * rnd()), a = rnd() * 6.283;
    const px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad, py = y0 + h;
    let nx = Math.cos(a), ny = 0.55, nz = Math.sin(a); const L = Math.hypot(nx, ny, nz);
    const c = { x: px, y: py, z: pz, s: (0.85 + (1 - t) * 1.35) * s, nx: nx / L, ny: ny / L, nz: nz / L, v: (rnd() * 4) | 0, r: (rnd() - .5) * 0.6 };
    cardColor(base, 0.7 + 0.3 * rad / (R + 0.1), c); out.push(c);
  }
  return { H };
}
function genCypress(x, z, s, out) {
  const y0 = heightAt(x, z) - 0.1;
  const base = new THREE.Color().setHSL(0.27 + rnd() * 0.05, 0.34, 0.2 + rnd() * 0.05);
  const H = (8.5 + rnd() * 2.5) * s, R = 1.05 * s; const n = 20;
  for (let i = 0; i < n; i++) {
    const t = rnd(), h = 1.0 * s + t * (H - 1.0 * s), prof = Math.sin(Math.PI * Math.pow(t, 0.8)) * R + 0.15 * s, a = rnd() * 6.283, rad = prof * (0.5 + 0.5 * rnd());
    const px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad, py = y0 + h;
    let nx = Math.cos(a), ny = 0.3, nz = Math.sin(a); const L = Math.hypot(nx, ny, nz);
    const c = { x: px, y: py, z: pz, s: (0.95 + 0.5 * rnd()) * s, nx: nx / L, ny: ny / L, nz: nz / L, v: (rnd() * 4) | 0, r: (rnd() - .5) * 0.5 };
    cardColor(base, 0.72 + 0.28 * rad / (prof + 0.01), c); out.push(c);
  }
  return { H };
}
function genFar(x, z, s, out) {
  const y0 = heightAt(x, z) - 0.1;
  const base = new THREE.Color().setHSL(0.21 + rnd() * 0.08, 0.38 + rnd() * 0.15, 0.27 + rnd() * 0.08);
  const H = 5.5 * s, R = 3.0 * s;
  for (let i = 0; i < 6; i++) {
    const [dx, dy, dz] = sphereDir(); const rr = R * (0.4 + 0.6 * rnd());
    const c = { x: x + dx * rr, y: y0 + H + dy * rr * 0.8, z: z + dz * rr, s: R * (1.0 + rnd() * 0.4), nx: dx * 0.6, ny: 0.8, nz: dz * 0.6, v: (rnd() * 4) | 0, r: (rnd() - .5) * 0.6 };
    cardColor(base, 0.75 + 0.25 * rr / R, c); out.push(c);
  }
  return { H };
}
function trunkGeo2() {
  const parts = [new THREE.CylinderGeometry(0.14, 0.3, 4.2, 9).translate(0, 2.1, 0)];
  for (const [a, tilt, y, L] of [[0.3, 0.8, 2.3, 2.0], [2.4, 0.7, 2.7, 1.8], [4.3, 0.9, 3.0, 1.6], [5.5, 0.55, 3.4, 1.3]]) {
    const b = new THREE.CylinderGeometry(0.05, 0.11, L, 6).translate(0, L / 2, 0); b.rotateZ(tilt); b.rotateY(a); b.translate(0, y, 0); parts.push(b);
  }
  parts.forEach(g => g.deleteAttribute('uv'));
  return paint(mergeGeometries(parts), (x, y, z, c) => c.set('#4b3c2e').multiplyScalar(0.8 + 0.25 * clamp(y / 4)));
}
function buildTrees() {
  const lists = { d: [], c: [], y: [], f: [] };
  const ok = (x, z, clr) => waterSD(x, z) > 2.8 + clr && fairwaySD(x, z) > 3.2 + clr && Math.hypot(x - HOLE.x, z - HOLE.z) > 15 && teeSD(x, z) > 4.5 && pathDist(x, z) > 2.6 &&
    !(x > -18 && x < 12 && z > 60 && z < 98) && !(Math.abs(x) < 12 && z < -42 && z > -54) && BUNKERS.every(b => bunkerSD(b, x, z) > 2) &&
    !(x > -4 && x < 26 && z > -66 && z < -45) && Math.hypot(x - HERO.Ct.x, z - HERO.Ct.z) > 7.5;
  for (let gx = -120; gx <= 120; gx += 5.6) for (let gz = -120; gz <= 120; gz += 5.6) {
    const x = gx + (rnd() - .5) * 4.2, z = gz + (rnd() - .5) * 4.2;
    if (!ok(x, z, 0)) continue;
    const r = rnd(); const s = 0.8 + rnd() * 0.55;
    (r < 0.66 ? lists.d : r < 0.9 ? lists.c : lists.y).push([x, z, s]);
  }
  for (let gx = -280; gx <= 280; gx += 11) for (let gz = -280; gz <= 280; gz += 11) {
    const x = gx + (rnd() - .5) * 8, z = gz + (rnd() - .5) * 8; if (Math.abs(x) < 122 && Math.abs(z) < 122) continue;
    if (Math.hypot(x, z) > 300) continue; lists.f.push([x, z, 1 + rnd() * 0.8]);
  }
  const mats = cardMaterials(leafAtlasTex());
  const gens = { d: genDeciduous, c: genConifer, y: genCypress, f: genFar };
  const buckets = {}, trunks = [], proxies = [];
  for (const k of ['d', 'c', 'y', 'f']) for (const [x, z, s] of lists[k]) {
    const cell = k === 'f' ? 110 : 34, key = k + (k === 'f' ? 'F' : 'N') + Math.floor(x / cell) + ',' + Math.floor(z / cell);
    const arr = (buckets[key] = buckets[key] || { far: k === 'f', cards: [] });
    const info = gens[k](x, z, s, arr.cards);
    if (k !== 'f') trunks.push([x, z, s, info.H, k]);
    if (k !== 'f') proxies.push([x, z, s, info.H, k]);
  }
  C.treeMeshes = [];
  for (const b of Object.values(buckets)) { const m = cardMesh(b.cards, mats, b.far ? 1 : 0); C.treeMeshes.push({ mesh: m, list: b.cards }); }
  // shadow proxies: invisible low-poly canopies that only cast shadows
  { const pm = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    const pg = { d: new THREE.IcosahedronGeometry(2.6, 1).scale(1.25, 0.95, 1.25), c: new THREE.ConeGeometry(1.8, 7, 8).translate(0, 4.6, 0), y: new THREE.SphereGeometry(1, 8, 6).scale(1.1, 4.2, 1.1).translate(0, 5.2, 0) };
    for (const k of ['d', 'c', 'y']) {
      const L = proxies.filter(t => t[4] === k); const m = new THREE.InstancedMesh(pg[k], pm, L.length); const o2 = new THREE.Object3D();
      L.forEach(([x, z, s, Hh], i) => { o2.position.set(x, heightAt(x, z) + (k === 'd' ? Hh + 0.3 * s : 0), z); o2.rotation.set(0, rnd() * 6.28, 0); o2.scale.setScalar(s); o2.updateMatrix(); m.setMatrixAt(i, o2.matrix); });
      m.castShadow = true; m.receiveShadow = false; m.renderOrder = -1; scene.add(m);
    }
  }
  // trunks (deciduous get branches, conifers a plain stem)
  const tmat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const tg = { d: trunkGeo2(), c: trunkGeo(0.22, 0.1, 3.0), y: trunkGeo(0.18, 0.1, 2.0) };
  const o = new THREE.Object3D();
  for (const k of ['d', 'c', 'y']) {
    const L = trunks.filter(t => t[4] === k); const m = new THREE.InstancedMesh(tg[k], tmat, L.length);
    L.forEach(([x, z, s, Hh], i) => { o.position.set(x, heightAt(x, z) - 0.15, z); o.rotation.set(0, rnd() * 6.28, 0); o.scale.set(s, k === 'd' ? Hh * 0.82 / 4.2 : s, s); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    m.castShadow = true; m.receiveShadow = true; scene.add(m);
  }
}

function onGround(v, lift = 0) { return V(v.x, heightAt(v.x, v.z) + lift, v.z); }

let dimpleTex;
function makeDimples() {
  const w = 1024, h = 512, pts = []; const N = 380, ga = Math.PI * (3 - Math.sqrt(5));
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
        // tangent-space approx: direction from dimple centre in lon/lat
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
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 64, 40), new THREE.MeshPhysicalMaterial({ color: '#fbfbf7', roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.2, normalMap: dimpleTex, normalScale: new THREE.Vector2(0.9, 0.9) }));
  m.castShadow = true; return m;
}
function fatLine(pts, color, opts = {}) {
  const g = new LineGeometry(); g.setPositions(pts.flatMap(p => [p.x, p.y, p.z]));
  const m = new LineMaterial({ color, linewidth: opts.w || 4, worldUnits: false, dashed: !!opts.dashed, dashSize: opts.dash || 1.2, gapSize: opts.gap || 0.8, transparent: true, opacity: 1, depthWrite: false, toneMapped: false });
  m.resolution.set(RW, RH);
  const l = new Line2(g, m); l.computeLineDistances(); l.renderOrder = 10; l.userData.n = pts.length - 1; scene.add(l); return l;
}
function revealLine(l, f) { l.geometry.instanceCount = Math.max(0, Math.floor(l.userData.n * clamp(f))); l.visible = f > 0.001; }
function traj(S, L, peak, n) { const a = []; for (let i = 0; i <= n; i++) { const s = i / n; a.push(S.clone().lerp(L, s).add(V(0, 4 * peak * s * (1 - s), 0))); } return a; }
function groundPath(a, b, step, lift) { const n = Math.ceil(a.distanceTo(b) / step), r = []; for (let i = 0; i <= n; i++) { const p = a.clone().lerp(b, i / n); r.push(onGround(p, lift)); } return r; }
function ring(r0, r1, color, opacity = 1) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  m.renderOrder = 8; scene.add(m); return m;
}
function disc(r, color) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, toneMapped: false }));
  m.renderOrder = 8; scene.add(m); return m;
}
// ================================================================== Rule 16.1 story: geometry + props
const CL = 1.15;               // one club-length (driver)
const BALL_R = 0.0214;
const hB = HERO.B, hC = HERO.Ct, hE = HERO.E, hF = HERO.f, hDir = HERO.d, hPc = HERO.Pc, PW = HERO.PW, RF = HERO.RF;
const UP = V(0, 1, 0);
const projE = (x, z) => (x - hPc.x) * hE.x + (z - hPc.z) * hE.z;      // signed offset from the path centre line
const onPath = (x, z, m = 0) => Math.abs(projE(x, z)) < PW + m;
const distH = p => Math.hypot(p.x - HOLE.x, p.z - HOLE.z);
function trunkR(y) { // trunk radius profile above local ground
  if (y < 0.15) return lerp(RF, 0.98, y / 0.15);
  if (y < 0.6) return lerp(0.98, 0.86, (y - 0.15) / 0.45);
  if (y < 4.5) return lerp(0.86, 0.66, (y - 0.6) / 3.9);
  return lerp(0.66, 0.5, clamp((y - 4.5) / 2));
}
function stanceDir(hand) { return hand === 'R' ? hDir.clone() : hDir.clone().negate(); }
function feet(p, hand) { const dir = stanceDir(hand), base = p.clone().addScaledVector(dir, -0.62); return [base.clone().addScaledVector(hF, 0.26), base.clone().addScaledVector(hF, -0.26), dir]; }
const ballOK = p => Math.hypot(p.x - hC.x, p.z - hC.z) >= RF + 0.03 && !onPath(p.x, p.z, 0.03);
const feetClearPath = (p, hand) => feet(p, hand).slice(0, 2).every(q => !onPath(q.x, q.z, 0.07));
const feetClearTrunk = (p, hand) => feet(p, hand).slice(0, 2).every(q => Math.hypot(q.x - hC.x, q.z - hC.z) > RF + 0.12);
const dBH = distH(hB);
// nearest point of complete relief (judged with the left-handed stroke), not nearer the hole
const hP = (() => {
  let best = 1e9, P = null;
  for (let i = -170; i <= 170; i++) for (let j = -170; j <= 170; j++) {
    const dd = Math.hypot(i, j) * 0.02; if (dd >= best) continue;
    const p = V(hB.x + i * 0.02, 0, hB.z + j * 0.02);
    if (distH(p) < dBH || !ballOK(p) || !feetClearPath(p, 'L')) continue;
    best = dd; P = p;
  }
  return P;
})();
const dPH = distH(hP);
const inZone = p => Math.hypot(p.x - hP.x, p.z - hP.z) <= CL && distH(p) >= dPH && ballOK(p) && feetClearPath(p, 'L');
// club kinematics (simplified swing plane around the hands)
function handsAt(p, hand) {
  const dir = stanceDir(hand); const h = p.clone().addScaledVector(dir, -0.36); h.y = heightAt(p.x, p.z) + 0.78;
  const rr = trunkR(0.78), dx = h.x - hC.x, dz = h.z - hC.z, dl = Math.hypot(dx, dz);
  if (dl < rr + 0.04) { h.x = hC.x + dx / dl * (rr + 0.04); h.z = hC.z + dz / dl * (rr + 0.04); }
  return h;
}
function clubAt(p, hand, th) { // returns {hands, head}
  const Hp = handsAt(p, hand), head0 = V(p.x, heightAt(p.x, p.z) + 0.025, p.z).addScaledVector(stanceDir(hand), -0.03);
  const v0 = head0.clone().sub(Hp); let n = v0.clone().cross(hF).normalize();
  const test = v0.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(n, 0.1));
  if (test.dot(hF) > v0.dot(hF)) n.negate();
  const v = v0.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(n, th));
  return { hands: Hp, head: Hp.clone().add(v) };
}
function clubHitsTrunk(p, hand, th) {
  const c = clubAt(p, hand, th);
  for (let k = 0; k <= 12; k++) { const q = c.hands.clone().lerp(c.head, k / 12); const gy = heightAt(hC.x, hC.z); if (q.y - gy < 7 && Math.hypot(q.x - hC.x, q.z - hC.z) < trunkR(q.y - gy)) return q; }
  return null;
}
const HIT = (() => { for (let th = 0.05; th < 2.6; th += 0.01) { const q = clubHitsTrunk(hB, 'R', th); if (q) return { th, q }; } return { th: 1.2, q: clubAt(hB, 'R', 1.2).head }; })();
// drop point inside the relief area (with a margin), preferring a spot where the normal right-handed swing is free again
const hDrop = (() => {
  let best = 1e9, Dp = null;
  for (let i = -60; i <= 60; i++) for (let j = -60; j <= 60; j++) {
    const p = V(hP.x + i * 0.02, 0, hP.z + j * 0.02); if (!inZone(p)) continue;
    let ok = true; for (let k = 0; k < 10 && ok; k++) { const a = k / 10 * 6.283; ok = inZone(V(p.x + Math.cos(a) * 0.13, 0, p.z + Math.sin(a) * 0.13)); }
    if (!ok) continue;
    let sc = Math.abs(Math.hypot(p.x - hP.x, p.z - hP.z) - 0.55);
    if (!(feetClearTrunk(p, 'R') && feetClearPath(p, 'R'))) sc += 5;
    let swingHit = false; for (let th = 0.05; th < 2.2 && !swingHit; th += 0.05) swingHit = !!clubHitsTrunk(p, 'R', th);
    if (swingHit) sc += 3;
    if (sc < best) { best = sc; Dp = p; }
  }
  return Dp;
})();
const HAND11 = (feetClearTrunk(hDrop, 'R') && feetClearPath(hDrop, 'R')) ? 'R' : 'L';
console.log('HERO', JSON.stringify({ B: [hB.x, hB.z], C: [hC.x, hC.z], P: [hP.x, hP.z], D: [hDrop.x, hDrop.z], hit: HIT.th, hand11: HAND11, dBP: hB.distanceTo(hP) }));

// ------------------------------------------------------------------ textures
function barkTex() {
  const Wd = 1024, Ht = 2048, nl = vnoise(512, 6, 4), nm = vnoise(512, 24, 4), nf = vnoise(512, 96, 2);
  const smp = (n, u, v) => n[(((v | 0) % 512 + 512) % 512) * 512 + (((u | 0) % 512 + 512) % 512)];
  const cv = document.createElement('canvas'); cv.width = Wd; cv.height = Ht; const g = cv.getContext('2d'); const id = g.createImageData(Wd, Ht);
  const bm = document.createElement('canvas'); bm.width = Wd; bm.height = Ht; const bg = bm.getContext('2d'); const bd = bg.createImageData(Wd, Ht);
  for (let y = 0; y < Ht; y++) for (let x = 0; x < Wd; x++) {
    const u = x / Wd * 512, v = y / Ht * 512;
    const warp = smp(nl, u, v) * 2.6 + smp(nm, u * 2, v) * 0.6;
    const X = x / Wd * 14 + warp;
    let ridge = Math.pow(Math.abs(Math.sin(X * Math.PI)), 0.45);
    const brk = smp(nm, u * 4, v * 1);                       // horizontal breaks across the plates
    ridge *= 0.55 + 0.45 * sstep(0.28, 0.42, Math.abs(brk - 0.5) * 2 + 0.1);
    const fine = smp(nf, u * 2, v * 0.5);
    const lich = sstep(0.62, 0.8, smp(nl, u + 200, v + 90));
    let k = 0.16 + 0.72 * ridge + 0.16 * (fine - 0.5);
    const i = (y * Wd + x) * 4;
    const r = 40 + 95 * k, gg = 32 + 86 * k, b = 26 + 74 * k;
    id.data[i] = r * (1 - 0.18 * lich) + 120 * 0.18 * lich; id.data[i + 1] = gg * (1 - 0.18 * lich) + 130 * 0.18 * lich; id.data[i + 2] = b * (1 - 0.18 * lich) + 105 * 0.18 * lich; id.data[i + 3] = 255;
    const m = Math.min(255, (ridge * 0.85 + fine * 0.15) * 255); bd.data[i] = bd.data[i + 1] = bd.data[i + 2] = m; bd.data[i + 3] = 255;
  }
  g.putImageData(id, 0, 0); bg.putImageData(bd, 0, 0);
  const t = texFrom(cv, true, true), tb = texFrom(bm, false, true); return [t, tb];
}
function concreteTex() {
  const S = 512, n = vnoise(512, 32, 4), n2 = vnoise(512, 128, 2);
  const cv = canvasFrom(S, i => { const k = 0.82 + 0.1 * n[i] + 0.08 * n2[i]; return [196 * k, 190 * k, 176 * k]; });
  const g = cv.getContext('2d');
  g.strokeStyle = 'rgba(70,64,56,0.55)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 2); g.lineTo(S, 2); g.stroke();
  g.fillStyle = 'rgba(80,72,60,0.25)'; g.fillRect(0, 0, 18, S); g.fillRect(S - 18, 0, 18, S);
  for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(${rnd() < .5 ? '60,55,50' : '235,230,220'},${rnd() * 0.25})`; g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2); }
  return texFrom(cv, true, true);
}
function leafLitterTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d');
  const cols = ['#8a5a2b', '#a5682a', '#c08a3a', '#6f4a2a'];
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * 128 + 64, oy = (v >> 1) * 128 + 64; g.save(); g.translate(ox, oy); g.rotate(0.3 * v);
    g.fillStyle = cols[v]; g.beginPath();
    for (let a = 0; a <= 6.30; a += 0.05) { const lob = 1 + 0.18 * Math.sin(a * 7); const r = 48 * lob; const x = Math.cos(a) * r * 0.55, y = Math.sin(a) * r; a === 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.fill(); g.strokeStyle = 'rgba(60,35,15,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -48); g.lineTo(0, 52); g.stroke(); g.restore();
  }
  return texFrom(cv);
}

// ------------------------------------------------------------------ build
function buildHero() {
  const gy = heightAt(hC.x, hC.z);
  // cart path (real concrete strip following the terrain)
  { const ctex = concreteTex(); const pos = [], uv = [], idx = []; let acc = 0;
    for (let i = 0; i < PATHPTS.length; i++) {
      const a = PATHPTS[Math.max(0, i - 1)], b = PATHPTS[Math.min(PATHPTS.length - 1, i + 1)];
      let tx = b.x - a.x, tz = b.z - a.z; const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L; const nx = -tz, nz = tx;
      if (i) acc += PATHPTS[i].distanceTo(PATHPTS[i - 1]);
      for (const s of [-1, 1]) { const x = PATHPTS[i].x + nx * PW * s, z = PATHPTS[i].z + nz * PW * s; pos.push(x, heightAt(x, z) + 0.035, z); uv.push(s < 0 ? 0 : 1, acc / 3.0); }
      if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: ctex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); m.receiveShadow = true; scene.add(m); C.pathMesh = m;
  }
  // trunk: lathe with root flare, bark texture, gentle irregularity
  const [bt, bb] = barkTex(); bt.repeat.set(3, 1.6); bb.repeat.set(3, 1.6);
  const barkMat = new THREE.MeshLambertMaterial({ map: bt, bumpMap: bb, bumpScale: 3.0, color: '#e2d9cc' });
  { const prof = []; for (let i = 0; i <= 30; i++) { const y = -0.2 + i / 30 * 6.8; prof.push(new THREE.Vector2(trunkR(Math.max(0, y)), y)); }
    let g = new THREE.LatheGeometry(prof, 64); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x); const k = 1 + 0.04 * Math.sin(a * 7 + y * 0.6) + 0.025 * Math.sin(a * 13 - y * 1.3) + (y < 0.6 ? 0.09 * Math.pow(Math.max(0, Math.sin(a * 5 + 0.7)), 3) * (1 - y / 0.6) : 0); p.setX(i, x * k); p.setZ(i, z * k); }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, barkMat); m.position.set(hC.x, gy, hC.z); m.castShadow = true; m.receiveShadow = true; scene.add(m); C.trunk = m;
    // roots
    for (let k = 0; k < 7; k++) { const a = k / 7 * 6.283 + 0.4, L = 1.2 + rnd() * 0.7, r0 = 0.24 + rnd() * 0.06;
      const rg = new THREE.CylinderGeometry(0.035, r0, L, 14, 6).translate(0, L / 2, 0); const rp = rg.attributes.position; for (let q = 0; q < rp.count; q++) { const yy = rp.getY(q) / L; rp.setX(q, rp.getX(q) + Math.sin(yy * 3 + k) * 0.05); } rg.computeVertexNormals();
      const r = new THREE.Mesh(rg, barkMat); r.rotation.set(0, 0, 0); r.scale.set(1, 1, 0.75);
      const dir = V(Math.cos(a), -0.2, Math.sin(a)).normalize(); r.quaternion.setFromUnitVectors(UP, dir); r.position.set(hC.x + Math.cos(a) * (RF - 0.35), gy + 0.12, hC.z + Math.sin(a) * (RF - 0.35));
      if (Math.abs(Math.atan2(Math.sin(a - Math.atan2(hE.z, hE.x)), Math.cos(a - Math.atan2(hE.z, hE.x)))) < 0.5) continue; // keep the ball side clean
      r.castShadow = true; r.receiveShadow = true; scene.add(r); }
    // limbs
    for (const [a, tilt, y, L, r0] of [[0.5, 0.75, 5.2, 4.2, 0.32], [2.6, 0.7, 5.6, 3.8, 0.28], [4.4, 0.85, 5.0, 4.0, 0.3], [5.6, 0.45, 6.2, 3.2, 0.24]]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 0.45, r0, L, 12).translate(0, L / 2, 0), barkMat); b.rotation.set(0, a, tilt, 'YXZ'); b.position.set(hC.x, gy + y, hC.z); b.castShadow = true; scene.add(b);
    }
  }
  // canopy (foliage cards) + shadow proxy
  { const cards = []; const _s0 = _s; const info = genDeciduous(hC.x, hC.z, 2.15, cards);
    cards.forEach(c => { c.cr *= 1.08; c.cg *= 1.02; c.cb *= 0.9; });
    const mats = cardMaterials(leafAtlasTex()); C.heroCanopy = cardMesh(cards, mats, 0);
    const pr = new THREE.Mesh(new THREE.IcosahedronGeometry(4.2, 2).scale(1.2, 0.75, 1.2), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    pr.position.set(hC.x, gy + info.H, hC.z); pr.castShadow = true; scene.add(pr); }
  // leaf litter
  { const tex = leafLitterTex(); const N = 1100; const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const uvA = new Float32Array(N * 2);
    const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
    mat.onBeforeCompile = sh => { sh.vertexShader = 'attribute vec2 aAtlas;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = uv * 0.5 + aAtlas;\n#endif'); };
    const m = new THREE.InstancedMesh(g, mat, N); const o = new THREE.Object3D(); const col = new THREE.Color(); let n = 0;
    while (n < N) { const a = rnd() * 6.283, r = RF + 0.05 + Math.pow(rnd(), 1.3) * 5.2; const x = hC.x + Math.cos(a) * r, z = hC.z + Math.sin(a) * r;
      if (onPath(x, z, -0.1) && rnd() < 0.75) continue; if (Math.hypot(x - hB.x, z - hB.z) < 0.09) continue;
      o.position.set(x, heightAt(x, z) + (onPath(x, z) ? 0.04 : 0.012), z); o.rotation.set((rnd() - .5) * 0.25, rnd() * 6.28, (rnd() - .5) * 0.25); o.scale.setScalar(0.055 + rnd() * 0.06); o.updateMatrix(); m.setMatrixAt(n, o.matrix);
      const v = (rnd() * 4) | 0; uvA[n * 2] = (v % 2) * 0.5; uvA[n * 2 + 1] = (1 - (v >> 1)) * 0.5; col.setScalar(0.75 + rnd() * 0.35); m.setColorAt(n, col); n++; }
    g.setAttribute('aAtlas', new THREE.InstancedBufferAttribute(uvA, 2)); m.receiveShadow = true; scene.add(m); }
  // grass blades around the tree (rough) and on the tee box (short)
  C.grassHero = grassPatch(30000, (x, z) => { const dB = Math.hypot(x - hB.x, z - hB.z); return dB < 6 && !onPath(x, z, 0.02) && Math.hypot(x - hC.x, z - hC.z) > RF - 0.02; }, hB, 6, 0.07, 0.15);
  const S0 = V(TEE.x, heightAt(TEE.x, TEE.z), TEE.z);
  C.grassTee = grassPatch(42000, (x, z) => Math.hypot(x - S0.x, z - S0.z) < 1.1, S0, 1.1, 0.009, 0.02, 0.0022);
  // golfer (photographic cut-out supplied by the client, used as a camera-facing card)
  { const tl = new THREE.TextureLoader(); const tex = tl.load('golfer_cut.png'); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const hgt = 958 * 0.0018, wid = 616 * 0.0018;
    const g = new THREE.PlaneGeometry(wid, hgt).translate(0, hgt / 2, 0);
    C.golfer = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.03, toneMapped: false, color: '#f4efe8' }));
    C.golferPos = hB.clone().addScaledVector(hE, 1.0).addScaledVector(hF, 1.9); C.golferPos.y = heightAt(C.golferPos.x, C.golferPos.z) + 0.076;
    C.golfer.position.copy(C.golferPos); C.golfer.visible = false; C.golfer.renderOrder = 20; scene.add(C.golfer);
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.28, depthWrite: false }));
    sh.scale.set(1, 1, 0.55); sh.position.copy(C.golferPos).setY(heightAt(C.golferPos.x, C.golferPos.z) + 0.04); sh.visible = false; scene.add(sh); C.golferShadow = sh; }
  // golfer 3D (tuỳ chọn ?g3d=1): tư thế "watch" – nhìn theo bóng, tay che mắt; đứng cùng chỗ với tấm ảnh, bóng đổ thật
  if (G3D) { C.golfer3d = createGolfer({ club: 'iron', hand: 'R' }); C.golfer3d.setPose('watch');
    C.golfer3d.group.position.copy(C.golferPos).setY(heightAt(C.golferPos.x, C.golferPos.z)); C.golfer3d.group.visible = false; scene.add(C.golfer3d.group); }
}
function grassPatch(N, okFn, center, radius, h0, h1, w0 = 0.012) {
  const seg = 4, pos = [], col = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const h = i / seg, w = w0 * (1 - h * 0.9), bend = 0.2 * h * h;
    pos.push(-w, h, bend, w, h, bend); const c = 0.58 + 0.42 * h; col.push(c, c, c, c, c, c);
    if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2, k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  const nrm = []; for (let i = 0; i < pos.length / 3; i++) nrm.push(0, 1, 0); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  const m = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }), N);
  const o = new THREE.Object3D(), c = new THREE.Color(); let n = 0, guard = 0;
  const greens = ['#6f9a3c', '#86ad4a', '#9cbf5c', '#7aa344', '#a9b866', '#8fb350', '#b5b874', '#7f9f46'].map(x => new THREE.Color(x));
  while (n < N && guard++ < N * 40) {
    const a = rnd() * 6.283, r = Math.sqrt(rnd()) * radius, x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
    if (!okFn(x, z)) continue;
    o.position.set(x, heightAt(x, z) - 0.005, z); o.rotation.set((rnd() - .5) * 0.6, rnd() * 6.28, (rnd() - .5) * 0.6);
    o.scale.set(0.6 + rnd() * 0.7, h0 + rnd() * (h1 - h0), 1); o.updateMatrix(); m.setMatrixAt(n, o.matrix);
    c.copy(greens[(rnd() * greens.length) | 0]).multiplyScalar(0.85 + rnd() * 0.3); m.setColorAt(n, c); n++;
  }
  m.count = n; m.receiveShadow = true; m.visible = false; scene.add(m); return m;
}
function makeTee() {
  const m = new THREE.MeshStandardMaterial({ color: '#e8dcc4', roughness: 0.55 });
  const g = new THREE.Group();
  const s = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0012, 0.062, 16).translate(0, 0.031, 0), m);
  const h = new THREE.Mesh(new THREE.CylinderGeometry(0.0068, 0.0032, 0.009, 24).translate(0, 0.066, 0), m);
  g.add(s, h); g.children.forEach(x => x.castShadow = true); scene.add(g); return g;   // origin at the tip
}
function makeClub16(len, driver) {
  const g = new THREE.Group();
  const shaftM = new THREE.MeshStandardMaterial({ color: '#c8ccd0', metalness: 0.9, roughness: 0.28 });
  const gripM = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.75 });
  const headM = new THREE.MeshPhysicalMaterial({ color: driver ? '#151a18' : '#aeb3b7', metalness: driver ? 0.5 : 0.95, roughness: driver ? 0.22 : 0.3, clearcoat: driver ? 1 : 0 });
  const goldM = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.25 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0075, len - 0.27, 12).rotateZ(Math.PI / 2).translate(0.27 + (len - 0.27) / 2, 0, 0), shaftM);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0125, 0.27, 16).rotateZ(Math.PI / 2).translate(0.135, 0, 0), gripM);
  const head = driver ? new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20).scale(0.055, 0.03, 0.06), headM) : new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.05, 0.075), headM);
  head.position.set(len, 0.0, 0.03);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.002, 8, 20).rotateY(Math.PI / 2), goldM); band.position.x = len - 0.05;
  [shaft, grip, head, band].forEach(m => { m.castShadow = true; g.add(m); }); scene.add(g); return g;
}
// driver for the opening shot: head + hosel, lower shaft continues off frame toward the hands
function makeDriver() {
  const g = new THREE.Group();
  const headM = new THREE.MeshPhysicalMaterial({ color: '#121614', metalness: 0.55, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 });
  const goldM = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.25 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24).scale(0.058, 0.032, 0.062), headM);
  const face = new THREE.Mesh(new THREE.CircleGeometry(1, 40).scale(0.046, 0.026, 1).rotateY(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#4a4f53', metalness: 0.9, roughness: 0.35 })); face.position.x = 0.0575;
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.0018, 6, 40, Math.PI).rotateX(Math.PI / 2), goldM); stripe.position.y = 0.012;
  g.add(head, face, stripe); g.children.forEach(m => m.castShadow = true);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 10), new THREE.MeshStandardMaterial({ color: '#2a2e30', metalness: 0.6, roughness: 0.3 }));
  scene.add(g, shaft); return { head: g, shaft };
}
function buildProps16() {
  makeDimples();
  C.ball = ballMesh(BALL_R); scene.add(C.ball);
  C.ballFly = ballMesh(BALL_R); scene.add(C.ballFly);
  { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,240,200,0.55)'); gr.addColorStop(1, 'rgba(255,220,150,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texFrom(cv), color: '#ffe7b0', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    sp.scale.set(1.2, 1.2, 1); C.ballFly.add(sp); C.flyGlow = sp; }
  C.S0 = V(TEE.x, heightAt(TEE.x, TEE.z) + 0.025 + BALL_R, TEE.z);
  C.teeTee = makeTee(); C.teeTee.position.set(TEE.x, heightAt(TEE.x, TEE.z) - 0.04, TEE.z);
  C.markTee = makeTee();
  C.driver = makeDriver();
  C.club = makeClub16(CL, true);
  // tee-shot trajectory: hooks left into the trees and ends at the tree
  { const S = C.S0, Bv = V(hB.x, heightAt(hB.x, hB.z) + BALL_R, hB.z); const dir = Bv.clone().sub(S).setY(0).normalize(); const rt = V(-dir.z, 0, dir.x).negate();
    if (rt.x < 0) rt.negate();
    const pts = []; for (let i = 0; i <= 160; i++) { const s = i / 160; pts.push(S.clone().lerp(Bv, s).add(V(0, 4 * 24 * s * (1 - s) * (1 - 0.15 * s), 0)).addScaledVector(rt, 9 * Math.sin(Math.PI * s) * (1 - 0.3 * s))); }
    C.flight = pts; C.flightL = fatLine(pts, GOLD_L, { w: 3.5 }); }
  // ball path from the original spot to the drop point (pick up + carry)
  C.zoneU = { P: { value: new THREE.Vector2(hP.x, hP.z) }, Hh: { value: new THREE.Vector2(HOLE.x, HOLE.z) }, rP: { value: dPH }, rad: { value: 0 }, op: { value: 0 },
    Pc: { value: new THREE.Vector2(hPc.x, hPc.z) }, Ev: { value: new THREE.Vector2(hE.x, hE.z) }, dv: { value: new THREE.Vector2(hDir.x, hDir.z) }, fv: { value: new THREE.Vector2(hF.x, hF.z) },
    Ct: { value: new THREE.Vector2(hC.x, hC.z) }, RF: { value: RF }, PW: { value: PW } };
  { const zg = new THREE.PlaneGeometry(3, 3, 60, 60).rotateX(-Math.PI / 2).translate(hP.x, 0, hP.z);
    const zp = zg.attributes.position; for (let i = 0; i < zp.count; i++) zp.setY(i, heightAt(zp.getX(i), zp.getZ(i)) + 0.03);
    C.zone = new THREE.Mesh(zg, new THREE.ShaderMaterial({ uniforms: C.zoneU, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
      vertexShader: `varying vec2 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform vec2 P,Hh,Pc,Ev,dv,fv,Ct; uniform float rP,rad,op,RF,PW; varying vec2 vW;
        float pe(vec2 q){ return abs(dot(q-Pc,Ev)); }
        void main(){ float d=distance(vW,P); if(d>rad) discard;
          if(distance(vW,Hh)<rP) discard; if(distance(vW,Ct)<RF+0.03) discard; if(pe(vW)<PW+0.03) discard;
          vec2 base=vW+dv*0.62; if(pe(base+fv*0.26)<PW+0.07 || pe(base-fv*0.26)<PW+0.07) discard;
          float rim=smoothstep(rad-0.035,rad-0.01,d)*(1.0-smoothstep(rad-0.01,rad,d));
          vec4 c=vec4(0.96,0.84,0.52,0.20+0.7*rim);
          gl_FragColor=vec4(c.rgb,c.a*op);
          #include <colorspace_fragment>
        }` }));
    C.zone.renderOrder = 7; scene.add(C.zone); }
  // impact flash for the blocked swing
  { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,250,235,1)'); gr.addColorStop(0.3, 'rgba(255,210,150,0.6)'); gr.addColorStop(1, 'rgba(255,160,90,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    C.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: texFrom(cv), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, toneMapped: false })); C.flash.renderOrder = 30; scene.add(C.flash);
    C.chips = []; const cm = new THREE.MeshLambertMaterial({ color: '#5b4632' });
    for (let i = 0; i < 18; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.018), cm); m.userData = { v: V((rnd() - .5) * 1.6, 0.6 + rnd() * 1.6, (rnd() - .5) * 1.6), r: V(rnd() * 9, rnd() * 9, rnd() * 9) }; scene.add(m); C.chips.push(m); } }
}

// ------------------------------------------------------------------ grass blades for close shots, ornamental grass clumps, distant hills
function buildGrass(N, which) {
  const seg = 4, pos = [], col = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const h = i / seg, w = 0.016 * (1 - h * 0.9), bend = 0.22 * h * h;
    pos.push(-w, h, bend, w, h, bend);
    const c = 0.58 + 0.42 * h; col.push(c, c, c, c, c, c);
    if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2, k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  const nrm = []; for (let i = 0; i < pos.length / 3; i++) nrm.push(0, 1, 0); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  const m = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }), N);
  const o = new THREE.Object3D(), c = new THREE.Color(); let n = 0;
  const greens = ['#6f9a3c', '#86ad4a', '#9cbf5c', '#7aa344', '#a9b866', '#8fb350', '#b5b874', '#7f9f46'].map(x => new THREE.Color(x));
  const cam = which === 'A' ? { x: 7.4, z: -27.4, a: -Math.PI / 4, d: 13.5, w: 0.44 } : { x: 9.2, z: 20.9, a: Math.atan2(-5.5, 4.8), d: 9.5, w: 0.5 };
  let guard = 0;
  while (n < N && guard++ < N * 60) {
    const ang = cam.a + (rnd() * 2 - 1) * cam.w, dd = 1.2 + Math.pow(rnd(), 0.8) * (cam.d - 1.2);
    const x = cam.x + Math.cos(ang) * dd, z = cam.z + Math.sin(ang) * dd;
    const sd = waterSD(x, z); if (sd < -0.6) continue;
    o.position.set(x, heightAt(x, z) - 0.01, z); o.rotation.set((rnd() - .5) * 0.6, rnd() * 6.28, (rnd() - .5) * 0.6);
    const hgt = (0.1 + rnd() * 0.16) * (sd < 0.35 ? 1.7 : 1); o.scale.set(0.7 + rnd() * 0.8, hgt, 1); o.updateMatrix(); m.setMatrixAt(n, o.matrix);
    c.copy(greens[(rnd() * greens.length) | 0]).multiplyScalar(0.85 + rnd() * 0.3);
    let painted = false;
    if (which === 'A') { const dy = Math.abs(z - (-33.88)), dr = Math.abs(x - 13.88); if (x < 12.4 && dy < 0.08) { c.set(YEL); painted = true; } else if (z > -32.6 && dr < 0.08) { c.set(RED); painted = true; } }
    else { if (Math.abs(x - 13.86) < 0.08 && z > -32) { c.set(RED); painted = true; } }
    if (painted) { o.scale.y *= 0.45; o.updateMatrix(); m.setMatrixAt(n, o.matrix); }
    m.setColorAt(n, c); n++;
  }
  m.count = n; m.receiveShadow = true; m.castShadow = false; m.visible = false; scene.add(m); return m;
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
  // feathery plumes
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
  const pts = [];
  const okc = (x, z) => waterSD(x, z) > 0.35 && fairwaySD(x, z) > 1.2 && pathDist(x, z) > 1.8 && teeSD(x, z) > 2 && Math.hypot(x - HOLE.x, z - HOLE.z) > 12.5 && BUNKERS.every(b => bunkerSD(b, x, z) > 1);
  for (let z = -27; z < 55; z += 2.6) if (rnd() < 0.7) pts.push([22.7 + rnd() * 1.8, z + (rnd() - .5) * 1.6]);
  for (let x = -31; x < 31; x += 2.8) if (Math.abs(x) > 12 && rnd() < 0.65) pts.push([x + (rnd() - .5) * 1.4, -44.7 - rnd() * 1.6]);
  for (let i = 0; i < 26; i++) pts.push([-15 - rnd() * 12, -29 - rnd() * 4]);
  for (let i = 0; i < 18; i++) pts.push([-12 - rnd() * 10, 50 + rnd() * 18]);
  for (let i = 0; i < 16; i++) pts.push([16.5 + rnd() * 5, -43.5 - rnd() * 1]);
  const ok = pts.filter(([x, z]) => okc(x, z));
  const m = new THREE.InstancedMesh(geo, mat, ok.length); const o = new THREE.Object3D(), c = new THREE.Color();
  ok.forEach(([x, z], i) => { const h = 1.2 + rnd() * 1.1, w = 1.1 + rnd() * 0.8; o.position.set(x, heightAt(x, z) - 0.05, z); o.rotation.set(0, rnd() * 6.28, 0); o.scale.set(w, h, w); o.updateMatrix(); m.setMatrixAt(i, o.matrix); c.setRGB(0.9 + rnd() * 0.2, 0.9 + rnd() * 0.15, 0.85 + rnd() * 0.1); m.setColorAt(i, c); });
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

// ------------------------------------------------------------------ overlay typography
function fade(t, a, b, fi = 0.4, fo = 0.4) { return win(t, a, b, fi, fo); }
function spaced(g, text, x, y, sp) { g.letterSpacing = sp + 'px'; g.fillText(text, x + (g.textAlign === 'center' ? sp / 2 : 0), y); g.letterSpacing = '0px'; }
function drawTitle(o, t) {
  const a = fade(t, o.t0, o.t1, 0.5, 0.45); if (a <= 0) return;
  const rise = (1 - eout(prog(t, o.t0, o.t0 + 0.9))) * 18;
  ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center';
  const y = o.y || 268;
  ctx.shadowColor = 'rgba(0,18,10,0.55)'; ctx.shadowBlur = 26;
  ctx.fillStyle = GOLD_L; ctx.font = '500 25px "Be Vietnam Pro"'; spaced(ctx, o.k.toUpperCase(), W / 2, y + rise, 9);
  ctx.fillStyle = CREAM; ctx.font = `500 ${o.size || 92}px "Cormorant Garamond"`; ctx.fillText(o.title, W / 2, y + 102 + rise);
  ctx.shadowBlur = 0;
  const rw = 70 * eout(prog(t, o.t0 + 0.2, o.t0 + 1.0)); ctx.fillStyle = GOLD; ctx.fillRect(W / 2 - rw, y + 136 + rise, rw * 2, 2);
  if (o.sub) { ctx.shadowBlur = 20; ctx.fillStyle = CREAM; ctx.font = 'italic 500 44px "Cormorant Garamond"'; ctx.fillText(o.sub, W / 2, y + 196 + rise); }
  ctx.restore();
}
function project(p) { const v = p.clone().project(camera); return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, ok: v.z < 1 && v.z > -1 }; }
function drawLabel(l, t) {
  const a = fade(t, l.t0, l.t1, 0.35, 0.3); if (a <= 0) return;
  const p = project(typeof l.p === 'function' ? l.p() : l.p); if (!p.ok) return;
  const dx = l.dx ?? 70; let dy = l.dy ?? -110;
  if (p.y + dy < 600) dy = Math.abs(dy); if (p.y + dy > 1360) dy = -Math.abs(dy);
  const ex = p.x + dx, ey = p.y + dy;
  const grow = eout(prog(t, l.t0, l.t0 + 0.5));
  ctx.save(); ctx.globalAlpha = a;
  ctx.strokeStyle = l.c || GOLD_L; ctx.fillStyle = l.c || GOLD_L; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(p.x + dx * 0.12, p.y + dy * 0.12); ctx.lineTo(lerp(p.x, ex, grow), lerp(p.y, ey, grow)); ctx.stroke();
  ctx.font = '500 31px "Be Vietnam Pro"'; ctx.letterSpacing = '1px';
  const tw = ctx.measureText(l.text).width; const left = dx >= 0; const bx = clamp(left ? ex : ex - tw - 44, 36, W - 36 - tw - 44), by = ey - 30;
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
  const lines = wrapLines(s[2], 920); const lh = 66; const base = 1548 - (lines.length - 1) * lh;
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
// ================================================================== timeline (Rule 16.1 video, original audio timing)
const DUR = 58.77;
const SUBS = [
  [0.5, 3.5, 'Một cú phát bóng đẹp...\nnhưng bóng lại lệch vào hàng cây.'],
  [4.1, 5.5, 'Bóng dừng ngay sát gốc cây.'],
  [6.8, 9.6, 'Thế đánh thuận tay phải\nbị thân cây cản trở.'],
  [11.0, 14.6, 'Chỉ còn cách đánh bằng tay trái —\nmột thế đánh bất thường.'],
  [15.6, 18.5, 'Vậy anh có được\nthả bóng miễn phí không?'],
  [29.6, 33.5, 'Bước 1: Xác định điểm gần nhất\nđược giải tỏa hoàn toàn.'],
  [34.2, 38.5, 'Đánh dấu điểm đó bằng một chiếc tee.'],
  [39.4, 43.3, 'Bước 2: Đo một chiều dài gậy\nđể có vùng được thả bóng.'],
  [44.1, 47.1, 'Nhặt bóng lên,\nrồi thả lại trong vùng đã đo.'],
  [47.8, 49.1, 'Thả bóng xong, anh tiếp tục chơi.'],
  [54.2, 58.6, 'Hiểu luật để chơi tự tin hơn.'],
];
const TITLES = [
  { t0: 0.5, t1: 3.75, k: 'Luật golf · Điều 16.1', title: 'Quyết định là gì?' },
  { t0: 8.55, t1: 9.8, k: 'Thế đánh thuận tay phải', title: 'Bốp!' },
  { t0: 12.15, t1: 14.75, k: 'Thế đánh bất thường', title: 'Đánh tay trái?!' },
  { t0: 15.55, t1: 17.8, k: 'Câu hỏi', title: 'Được thả bóng miễn phí?', size: 76 },
  { t0: 17.95, t1: 18.75, k: 'Điều 16.1', title: 'Có!', check: true, fi: 0.2 },
  { t0: 29.3, t1: 33.45, k: 'Bước 1', title: 'Điểm giải tỏa gần nhất', size: 80 },
  { t0: 34.1, t1: 38.45, k: 'Bước 1', title: 'Đánh dấu bằng tee' },
  { t0: 39.2, t1: 43.4, k: 'Bước 2', title: 'Một chiều dài gậy' },
  { t0: 44.0, t1: 47.45, k: 'Bước 3', title: 'Thả bóng trong vùng' },
  { t0: 47.75, t1: 49.55, k: 'Điều 16.1', title: 'Tiếp tục chơi!', check: true, fi: 0.3 },
  { t0: 55.9, t1: 99, k: 'Hiểu trước khi ra sân', title: 'Luật golf', size: 104 },
];
const midFeet = (p, hand) => { const [a, b] = feet(p, hand); const m = a.clone().add(b).multiplyScalar(0.5); return onGround(m, 0.02); };
const zoneCentroid = (() => { let sx = 0, sz = 0, n = 0; for (let i = -60; i <= 60; i++) for (let j = -60; j <= 60; j++) { const p = V(hP.x + i * 0.02, 0, hP.z + j * 0.02); if (inZone(p)) { sx += p.x; sz += p.z; n++; } } return V(sx / n, 0, sz / n); })();
const zoneDir = zoneCentroid.clone().sub(hP).setY(0).normalize();
const clubEnd = () => onGround(hP.clone().addScaledVector(zoneDir, CL), 0.02);
const LABELS = [
  { t0: 6.7, t1: 9.85, p: () => midFeet(hB, 'R'), text: 'Chỗ đứng nằm trong thân cây', dx: 60, dy: 150, c: '#ff8a7a' },
  { t0: 11.1, t1: 14.85, p: () => midFeet(hB, 'L'), text: 'Chân đứng trên đường xe điện', dx: 50, dy: 160 },
  { t0: 11.7, t1: 14.85, p: () => onGround(hPc.clone().addScaledVector(HERO.T, -2.4), 0.04), text: 'Đường xe điện', dx: -60, dy: -150 },
  { t0: 31.1, t1: 33.45, p: () => onGround(hP, 0.02), text: 'Điểm giải tỏa gần nhất (ước lượng)', dx: -40, dy: -170 },
  { t0: 35.0, t1: 38.45, p: () => onGround(hP, 0.05), text: 'Tee đánh dấu', dx: 60, dy: -170 },
  { t0: 40.4, t1: 43.4, p: clubEnd, text: 'Một chiều dài gậy', dx: 60, dy: 150 },
  { t0: 41.6, t1: 43.4, p: () => onGround(zoneCentroid, 0.02), text: 'Vùng thả bóng', dx: -70, dy: -160 },
  { t0: 45.75, t1: 47.45, p: () => onGround(hDrop, 0.5), text: 'Thả từ độ cao đầu gối', dx: 60, dy: -140 },
  { t0: 48.0, t1: 49.5, p: () => midFeet(hDrop, HAND11), text: HAND11 === 'R' ? 'Vung gậy thuận tay phải' : 'Vung gậy tay trái', dx: 60, dy: -170 },
];
const CARDS = [
  { t0: 18.65, t1: 29.2, tt: 19.35, k: 'ĐIỀU 16.1', title: ['Thế đánh bất thường vẫn', 'được thả bóng miễn phí'],
    bullets: [[20.7, 'Cây cối hoặc chướng ngại vật có thể buộc bạn đứng hoặc vung gậy theo cách bất thường.'], [21.9, 'Ví dụ: bóng sát gốc cây, bạn buộc phải đánh tay trái.'], [23.3, 'Nếu thế đánh đó không bị coi là rõ ràng vô lý, bạn được thả bóng miễn phí.']],
    button: [24.2, 'THẢ BÓNG MIỄN PHÍ'] },
  { t0: 49.65, t1: 53.2, tt: 49.85, k: 'ĐIỀU 16.1b', title: ['Sau khi thả bóng: trở lại', 'thế đánh quen thuộc'],
    bullets: [[50.2, 'Khi đã được giải tỏa cho thế đánh tay trái, bạn có thể quay lại vung gậy thuận tay phải.'], [51.2, 'Nếu thế đánh tay phải vẫn bị cản, bạn cũng có thể xin giải tỏa tiếp.'], [51.95, 'Hoặc cứ đánh bóng tại vị trí nằm. Quyền quyết định thuộc về bạn!']],
    button: [52.25, 'BẠN QUYẾT ĐỊNH'] },
];

// ------------------------------------------------------------------ camera shots
const LP = (e, fw, up, base = hB) => { const p = base.clone().addScaledVector(hE, e).addScaledVector(hF, fw); return [p.x, heightAt(base.x, base.z) + up, p.z]; };
const A3 = v => [v.x, v.y, v.z];
const sunOpp = V(-SUN.x, 0, -SUN.z).normalize();
const HOLE3 = V(HOLE.x, heightAt(HOLE.x, HOLE.z), HOLE.z);
const midBD = hB.clone().lerp(hDrop, 0.5);
const S7c = hB.clone().lerp(hP, 0.5);
const SH = (t0, t1, keys, o = {}) => ({ t0, t1, keys, ...o });
let SHOTS;
function buildShots() {
  const S0 = C.S0, G = C.golferPos;
  const gp = (dist, up) => A3(G.clone().addScaledVector(sunOpp, dist).add(V(0, up, 0)));
  const gq = up => A3(G.clone().add(V(0, up, 0)));
  SHOTS = [
    SH(0, 1.75, [[[S0.x + 0.006, S0.y + 0.006, S0.z - 0.52], [S0.x, S0.y + 0.004, S0.z], 22], [[S0.x + 0.004, S0.y + 0.008, S0.z - 0.46], [S0.x, S0.y + 0.006, S0.z], 22]],
      { dof: true, near: 0.01, gT: true, shadow: 3, wsize: 1.2, fp: () => C.S0, ap: 0.05, mb: 0.014, ease: 'lin' }),
    SH(1.75, 4.05, [[[7, 9, 75], [-12, 3, 18], 42], [[5, 11.5, 72], [-15, 2, 12], 42]], { shadow: 110, wsize: 0.9 }),
    SH(4.05, 6.1, [[LP(1.05, -0.4, 0.15), A3(onGround(hB, 0.05).addScaledVector(hE, -0.2)), 30], [LP(0.85, -0.3, 0.13), A3(onGround(hB, 0.05).addScaledVector(hE, -0.2)), 30]],
      { dof: true, near: 0.02, gH: true, shadow: 4, fp: () => onGround(hB, BALL_R), ap: 0.02, mb: 0.012 }),
    SH(6.1, 10.0, [[LP(3.0, -1.7, 1.9), LP(-0.6, 0.0, 0.45), 40], [LP(2.7, -1.4, 1.75), LP(-0.6, 0.0, 0.42), 40]], { gH: true, shadow: 7 }),
    SH(10.0, 15.0, [[LP(1.4, -3.4, 2.4), LP(0.35, 0.3, 0.25), 40], [LP(1.6, -3.1, 2.2), LP(0.4, 0.25, 0.25), 40]], { gH: true, shadow: 7 }),
    SH(15.0, 18.6, [[gp(4.7, 1.32), gq(1.38), 34], [gp(4.3, 1.32), gq(1.4), 34]], { golfer: true, dof: true, near: 0.05, shadow: 9, fp: () => G.clone().add(V(0, 1.2, 0)), ap: 0.006, mb: 0.012 }),
    SH(18.6, 29.1, [[LP(9, -6, 14), LP(-1.5, -1, 0.5), 45], [LP(9, -6, 14), LP(-1.5, -1, 0.5), 45]], { card: true, shadow: 30 }),
    SH(29.1, 33.6, [[LP(3.5, -0.7, 4.7, S7c), LP(-0.15, 0, 0, S7c), 40], [LP(3.3, -0.6, 4.5, S7c), LP(-0.15, 0, 0, S7c), 40]], { gH: true, shadow: 8 }),
    SH(33.6, 38.6, [[A3(onGround(hP, 0.8).addScaledVector(hF, -0.6).addScaledVector(hE, 0.7)), A3(onGround(hP, 0.03)), 30], [A3(onGround(hP, 0.72).addScaledVector(hF, -0.54).addScaledVector(hE, 0.62)), A3(onGround(hP, 0.03)), 30]],
      { dof: true, near: 0.02, gH: true, shadow: 3, fp: () => onGround(hP, 0.035), ap: 0.01, mb: 0.009 }),
    SH(38.6, 43.5, [[LP(3.3, -0.8, 4.3, zoneCentroid), LP(-0.1, 0, 0, zoneCentroid), 40], [LP(3.1, -0.7, 4.1, zoneCentroid), LP(-0.1, 0, 0, zoneCentroid), 40]], { gH: true, shadow: 6 }),
    SH(43.5, 47.6, [[LP(3.1, -1.1, 2.6, midBD), A3(onGround(midBD, 0.2)), 40], [LP(2.9, -1.0, 2.45, midBD), A3(onGround(midBD, 0.2)), 40]], { gH: true, shadow: 6 }),
    SH(47.6, 49.6, [[LP(2.9, -1.2, 1.9, hDrop), LP(-0.45, 0.1, 0.3, hDrop), 40], [LP(2.7, -1.0, 1.8, hDrop), LP(-0.45, 0.1, 0.3, hDrop), 40]], { gH: true, shadow: 6 }),
    SH(49.6, 53.1, [[[-6, 30, 46], [-14, 0, -20], 45], [[-6, 30, 46], [-14, 0, -20], 45]], { card: true, shadow: 120 }),
    SH(53.1, 60, [[A3(HOLE3.clone().add(V(-3.2, 0.46, 4.0))), A3(HOLE3.clone().add(V(0, 1.4, 0))), 34], [A3(HOLE3.clone().add(V(-2.9, 0.43, 3.6))), A3(HOLE3.clone().add(V(0, 1.42, 0))), 34]],
      { dof: true, near: 0.03, shadow: 6, fp: () => HOLE3.clone().add(V(0.3, 0.2, 0.4)), ap: 0.007, mb: 0.012 }),
  ];
}
const FADE = 0.4;
function camAt(shot, t) {
  const k = shot.keys;
  let u = prog(t, shot.t0 - FADE / 2, shot.t1 + FADE / 2);
  u = shot.ease === 'lin' ? u : esin(u);
  return { p: V(...k[0][0]).lerp(V(...k[1][0]), u), q: V(...k[0][1]).lerp(V(...k[1][1]), u), fov: lerp(k[0][2], k[1][2], u) };
}

// ------------------------------------------------------------------ per-frame 3D state
function setShaft(mesh, a, b) { const d = b.clone().sub(a); mesh.position.copy(a).addScaledVector(d, 0.5); mesh.quaternion.setFromUnitVectors(UP, d.clone().normalize()); mesh.scale.set(1, d.length(), 1); }
function updateCourse16(t, shot) {
  SKYTIME.value = t;
  C.water.material.uniforms.time.value = t * 0.55; C.water.material.uniforms.size.value = shot.wsize || 1.2;
  C.grassHero.visible = !!shot.gH; C.grassTee.visible = !!shot.gT;
  // flag cloth
  const fp = C.flag.geometry.attributes.position, fb = C.flagBase;
  for (let i = 0; i < fp.count; i++) { const x = fb[i * 3], y = fb[i * 3 + 1]; fp.setXYZ(i, x, y - 0.03 * x * x, Math.sin(x * 9 - t * 6) * 0.05 * x / 0.5 + Math.sin(y * 10 + t * 3) * 0.008 * x / 0.5); }
  fp.needsUpdate = true; C.flag.geometry.computeVertexNormals();
  // golfer card faces the camera
  C.golfer.visible = C.golferShadow.visible = !!shot.golfer && !G3D;
  if (shot.golfer) C.golfer.rotation.y = Math.atan2(camera.position.x - C.golfer.position.x, camera.position.z - C.golfer.position.z);
  if (G3D) { C.golfer3d.group.visible = !!shot.golfer; // quay người chếch 28° so với máy quay, mắt nhìn theo hướng bóng bay
    if (shot.golfer) C.golfer3d.group.rotation.y = Math.atan2(camera.position.x - C.golferPos.x, camera.position.z - C.golferPos.z) - 0.49; }
  // opening: driver strikes the ball off the tee
  const tImp = 1.33;
  { const u = prog(t, 1.08, 1.55), S0 = C.S0; const vis = t > 1.0 && t < 1.8;
    const head = V(S0.x - 0.004, S0.y - 0.004 + 0.12 * Math.pow(u - 0.53, 2), S0.z + 0.62 - 1.2 * u);
    C.driver.head.visible = C.driver.shaft.visible = vis; C.driver.head.position.copy(head); C.driver.head.rotation.set(0, Math.PI / 2, -0.1);
    const hosel = head.clone().add(V(-0.03, 0.02, 0)); const hands = V(S0.x - 0.82, S0.y + 0.95, S0.z + 0.25 - 0.5 * u);
    setShaft(C.driver.shaft, hosel, hands);
    const tt = prog(t, tImp, tImp + 0.3); C.teeTee.rotation.set(-1.1 * eout(tt), 0, 0.2 * tt);
  }
  // the ball
  { const S0 = C.S0, Bg = onGround(hB, BALL_R), Dg = onGround(hDrop, BALL_R);
    let p;
    if (t < tImp) p = S0.clone();
    else if (t < 1.8) { const dt = t - tImp; p = S0.clone().add(V(0.05 * dt, 9 * dt - 4.9 * dt * dt, -32 * dt)); }
    else if (t < 44.2) p = Bg.clone();
    else if (t < 46.0) { const u1 = prog(t, 44.2, 44.6), u2 = esin(prog(t, 44.65, 45.7)); const lift = Bg.clone().add(V(0, 0.55 * eout(u1), 0));
      const top = Dg.clone().add(V(0, 0.5, 0)); p = lift.clone().lerp(top, u2); p.y += Math.sin(u2 * Math.PI) * 0.3; }
    else { const dt = t - 46.0; const fall = 0.5 - 4.9 * dt * dt; if (fall > 0) p = Dg.clone().add(V(0, fall, 0)); else { const t2 = dt - Math.sqrt(0.5 / 4.9); const b = Math.max(0, Math.abs(Math.sin(t2 * 9)) * 0.06 * Math.exp(-t2 * 5)); p = Dg.clone().add(V(0, b, 0)); } }
    C.ball.position.copy(p); C.ball.visible = !(t > 1.62 && t < 1.8);
  }
  // tracer flight (wide shot) and the approach on the green (ending)
  { const u = prog(t, 1.85, 3.65); revealLine(C.flightL, t > 1.85 && t < 4.2 ? u : 0); C.flightL.material.opacity = 1 - prog(t, 3.7, 4.1);
    C.ballFly.visible = (t > 1.85 && t < 3.68) || t > 54.6; C.flyGlow.visible = t < 4;
    if (t < 4) C.ballFly.position.copy(C.flight[Math.round(u * 160)]);
    else { const L = HOLE3.clone().add(V(-1.25, BALL_R, 1.9)), F = HOLE3.clone().add(V(0.32, BALL_R + 0.005, 0.42));
      if (t < 55.2) { const u2 = prog(t, 54.6, 55.2); C.ballFly.position.copy(L.clone().add(V(-1.2 * (1 - u2), 3.2 * (1 - u2 * u2), 3.5 * (1 - u2)))); }
      else { const u3 = 1 - Math.pow(1 - prog(t, 55.2, 56.9), 2.2); C.ballFly.position.copy(L.clone().lerp(F, u3)); const bt = t - 55.2; C.ballFly.position.y += Math.max(0, Math.abs(Math.sin(bt * 10)) * 0.08 * Math.exp(-bt * 6)); } }
  }
  // marking tee at the reference point
  { const u = prog(t, 34.3, 34.95); C.markTee.visible = t > 34.25 && t < 49.7; const gy = heightAt(hP.x, hP.z);
    C.markTee.position.set(hP.x, gy - 0.035 + (1 - eout(u)) * 0.32, hP.z); C.markTee.rotation.set((1 - u) * 0.5, u * 2, 0); }
  // club laid down to measure one club-length
  { const u = eout(prog(t, 39.6, 40.5)); C.club.visible = t > 39.55 && t < 49.7;
    const a0 = onGround(hP, 0.012), a1 = onGround(hP.clone().addScaledVector(zoneDir, CL), 0.03); const dir = a1.clone().sub(a0).normalize();
    C.club.position.copy(a0).add(V(0, (1 - u) * 0.45, 0)); C.club.quaternion.setFromUnitVectors(V(1, 0, 0), dir); C.club.rotateX(-Math.PI / 2 * (1 - u) * 0.3); C.club.rotateZ((1 - u) * 0.35); }
  // relief area
  C.zoneU.rad.value = CL * eout(prog(t, 40.4, 41.5)) + 0.001; C.zoneU.op.value = fade(t, 40.4, 49.55, 0.3, 0.4); C.zone.visible = C.zoneU.op.value > 0;
  // impact flash + bark chips for the blocked right-handed swing
  { const dt = t - 8.6; C.flash.visible = dt > 0 && dt < 0.5; C.flash.position.copy(HIT.q); const s = 0.25 + dt * 0.8; C.flash.scale.set(s, s, 1); C.flash.material.opacity = 1 - dt / 0.5;
    C.chips.forEach(m => { m.visible = dt > 0 && dt < 1.2; const u = m.userData; m.position.copy(HIT.q).add(V(u.v.x * dt, u.v.y * dt - 4.9 * dt * dt, u.v.z * dt)); m.rotation.set(u.r.x * dt, u.r.y * dt, u.r.z * dt);
      const gy = heightAt(m.position.x, m.position.z) + 0.004; if (m.position.y < gy) m.position.y = gy; }); }
}
function setupShot(shot, t) {
  const c = camAt(shot, t);
  camera.fov = c.fov; camera.near = shot.near || 0.3; camera.far = 2400; camera.position.copy(c.p); camera.lookAt(c.q); camera.updateProjectionMatrix();
  sky.position.copy(camera.position);
  aimShadow(c.q, shot.shadow || 60);
  updateCourse16(t, shot);
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

// ------------------------------------------------------------------ 2D infographics (projected from 3D)
const SOLE = [[0, -0.145], [0.03, -0.14], [0.042, -0.11], [0.045, -0.06], [0.05, 0.0], [0.055, 0.05], [0.055, 0.09], [0.048, 0.12], [0.03, 0.142], [0.0, 0.148], [-0.03, 0.142], [-0.045, 0.12], [-0.048, 0.08], [-0.04, 0.04], [-0.03, 0.0], [-0.032, -0.05], [-0.038, -0.1], [-0.03, -0.137]];
function drawFeet(p, hand, color, alpha) {
  if (alpha <= 0) return; const [fa, fb, dir] = feet(p, hand);
  ctx.save(); ctx.globalAlpha = alpha; ctx.lineWidth = 3; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12;
  [[fa, 1], [fb, -1]].forEach(([c, side]) => {
    const toe = dir.clone().multiplyScalar(Math.cos(0.2)).addScaledVector(hF, side * Math.sin(0.2)).normalize();
    let xa = V(toe.z, 0, -toe.x); if (xa.dot(hF) * side < 0) xa.negate();
    ctx.beginPath();
    SOLE.forEach(([lx, ly], i) => { const w = c.clone().addScaledVector(xa, lx).addScaledVector(toe, ly); const q = project(onGround(w, 0.015)); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
    ctx.closePath(); ctx.globalAlpha = alpha * 0.3; ctx.fill(); ctx.globalAlpha = alpha; ctx.stroke();
  });
  ctx.restore();
}
function drawClub(p, hand, th, color, alpha, arcFrom = null) {
  if (alpha <= 0) return; const c = clubAt(p, hand, th); const a = project(c.hands), b = project(c.head);
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 14; ctx.lineCap = 'round';
  if (arcFrom !== null) { ctx.setLineDash([10, 9]); ctx.lineWidth = 3; ctx.globalAlpha = alpha * 0.8; ctx.beginPath();
    const n = 40; for (let i = 0; i <= n; i++) { const tt = lerp(arcFrom, th, i / n); const q = project(clubAt(p, hand, tt).head); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); } ctx.stroke(); ctx.setLineDash([]); }
  ctx.globalAlpha = alpha; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  const ang = Math.atan2(b.y - a.y, b.x - a.x); ctx.translate(b.x, b.y); ctx.rotate(ang + Math.PI / 2); ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, 0, 16, 8, 0, 0, 7); ctx.fill();
  ctx.restore();
}
function drawRing3(p, r, color, alpha, lw = 3) {
  if (alpha <= 0) return; ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.beginPath();
  for (let i = 0; i <= 64; i++) { const a = i / 64 * 6.283; const q = project(onGround(V(p.x + Math.cos(a) * r, 0, p.z + Math.sin(a) * r), 0.02)); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }
  ctx.stroke(); ctx.restore();
}
function drawPathGlow(center, alpha) {
  if (alpha <= 0) return; const s0 = (center.x - hPc.x) * HERO.T.x + (center.z - hPc.z) * HERO.T.z;
  const pt = (s, e) => project(onGround(hPc.clone().addScaledVector(HERO.T, s).addScaledVector(hE, e), 0.045));
  ctx.save(); ctx.globalAlpha = alpha; ctx.beginPath(); const n = 16;
  for (let i = 0; i <= n; i++) { const q = pt(s0 - 2.4 + 4.8 * i / n, -PW); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }
  for (let i = n; i >= 0; i--) { const q = pt(s0 - 2.4 + 4.8 * i / n, PW); ctx.lineTo(q.x, q.y); }
  ctx.closePath(); ctx.fillStyle = 'rgba(255,170,70,0.2)'; ctx.fill(); ctx.strokeStyle = '#ffb35c'; ctx.lineWidth = 3; ctx.shadowColor = '#ffb35c'; ctx.shadowBlur = 14; ctx.stroke(); ctx.restore();
}
const AMBER = '#ffb35c', REDC = '#ff6f61', GOLDC = '#f0d79a', GREENC = '#c9f0a4';
function searchPos(u) { // ghost ball path from the original spot round the trunk to the reference point
  const a0 = Math.atan2(hB.z - hC.z, hB.x - hC.x), a1 = Math.atan2(hP.z - hC.z, hP.x - hC.x); let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
  const r0 = Math.hypot(hB.x - hC.x, hB.z - hC.z), r1 = Math.hypot(hP.x - hC.x, hP.z - hC.z); const a = a0 + da * u, r = lerp(r0, r1, u) + Math.sin(u * Math.PI) * 0.05;
  return V(hC.x + Math.cos(a) * r, 0, hC.z + Math.sin(a) * r);
}
function drawInfographics(t) {
  // right-handed: stance inside the trunk, club blocked
  { const a = fade(t, 6.6, 9.95, 0.4, 0.35); drawFeet(hB, 'R', REDC, a);
    const ca = fade(t, 7.0, 9.95, 0.4, 0.35); let th = 0; if (t > 8.2) th = HIT.th * eout(prog(t, 8.2, 8.6)); if (t > 8.6) th = HIT.th * (1 - 0.25 * Math.sin(prog(t, 8.6, 9.0) * Math.PI));
    drawClub(hB, 'R', th, t > 8.6 ? REDC : GOLDC, ca * 0.95, t > 8.2 ? 0 : null); }
  // left-handed: stance on the cart path
  { const a = fade(t, 10.9, 14.95, 0.4, 0.35); drawPathGlow(midFeet(hB, 'L'), fade(t, 11.3, 14.95, 0.4, 0.35) * (0.75 + 0.25 * Math.sin(t * 5))); drawFeet(hB, 'L', AMBER, a);
    const ca = fade(t, 11.6, 14.95, 0.4, 0.35); let th = 0, from = null;
    if (t > 12.2) { th = 2.0 * esin(prog(t, 12.2, 12.9)); from = 0; }
    if (t > 13.05) { th = lerp(2.0, -1.5, esin(prog(t, 13.05, 13.7))); from = 2.0; }
    drawClub(hB, 'L', th, GOLDC, ca * 0.95, from); }
  // step 1: search for the nearest point of complete relief
  { const a = fade(t, 29.5, 33.5, 0.4, 0.3); if (a > 0) { drawFeet(hB, 'L', AMBER, a * 0.35);
      const u = esin(prog(t, 29.9, 31.0)); const g = searchPos(u); const clear = feetClearPath(g, 'L') && ballOK(g);
      drawFeet(g, 'L', clear ? GREENC : AMBER, a); const q = project(onGround(g, BALL_R)); ctx.save(); ctx.globalAlpha = a * 0.9; ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(q.x, q.y, 7, 0, 7); ctx.fill(); ctx.restore();
      // dotted trail
      ctx.save(); ctx.globalAlpha = a * 0.8; ctx.strokeStyle = GOLDC; ctx.lineWidth = 3; ctx.setLineDash([6, 8]); ctx.beginPath(); for (let i = 0; i <= 30; i++) { const w = project(onGround(searchPos(u * i / 30), 0.02)); i ? ctx.lineTo(w.x, w.y) : ctx.moveTo(w.x, w.y); } ctx.stroke(); ctx.restore(); }
    drawRing3(hP, 0.16 + 0.02 * Math.sin(t * 5), GOLDC, fade(t, 31.0, 49.55, 0.3, 0.4) * (t < 38.6 ? 1 : 0.7)); }
  // carry + drop
  { const a = fade(t, 44.6, 47.45, 0.3, 0.3); if (a > 0) { ctx.save(); ctx.globalAlpha = a * 0.7; ctx.strokeStyle = GOLDC; ctx.lineWidth = 3; ctx.setLineDash([6, 8]); ctx.beginPath();
      const Bg = onGround(hB, 0.55), Dg = onGround(hDrop, 0.5); for (let i = 0; i <= 30; i++) { const u = i / 30; const w = Bg.clone().lerp(Dg, u); w.y += Math.sin(u * Math.PI) * 0.3; const q = project(w); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); } ctx.stroke(); ctx.restore();
      drawRing3(hDrop, 0.08, '#ffffff', fade(t, 45.6, 47.45, 0.2, 0.3) * 0.8, 2); } }
  // back to the normal swing
  { const a = fade(t, 47.85, 49.6, 0.35, 0.3); drawFeet(hDrop, HAND11, GOLDC, a);
    let th = 0, from = null; if (t > 48.05) { th = 2.0 * esin(prog(t, 48.05, 48.65)); from = 0; } if (t > 48.75) { th = lerp(2.0, -1.5, esin(prog(t, 48.75, 49.3))); from = 2.0; }
    drawClub(hDrop, HAND11, th, GOLDC, a * 0.95, from); }
}

// ------------------------------------------------------------------ overlay helpers
function drawCheck(x, y, s, color, lw) { ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(x - s * 0.5, y); ctx.lineTo(x - s * 0.12, y + s * 0.38); ctx.lineTo(x + s * 0.55, y - s * 0.42); ctx.stroke(); ctx.restore(); }
function drawTitle16(o, t) {
  const a = fade(t, o.t0, o.t1, o.fi || 0.5, 0.45); if (a <= 0) return;
  const rise = (1 - eout(prog(t, o.t0, o.t0 + 0.9))) * 18;
  ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; const y = o.y || 268;
  ctx.shadowColor = 'rgba(0,18,10,0.55)'; ctx.shadowBlur = 26;
  ctx.fillStyle = GOLD_L; ctx.font = '500 25px "Be Vietnam Pro"'; spaced(ctx, o.k.toUpperCase(), W / 2, y + rise, 9);
  ctx.fillStyle = CREAM; ctx.font = `500 ${o.size || 92}px "Cormorant Garamond"`; ctx.fillText(o.title, W / 2 + (o.check ? 34 : 0), y + 102 + rise);
  if (o.check) { const tw = ctx.measureText(o.title).width; drawCheck(W / 2 + 34 - tw / 2 - 52, y + 76 + rise, 44, GOLD_L, 7); }
  ctx.shadowBlur = 0; const rw = 70 * eout(prog(t, o.t0 + 0.2, o.t0 + 1.0)); ctx.fillStyle = GOLD; ctx.fillRect(W / 2 - rw, y + 136 + rise, rw * 2, 2);
  ctx.restore();
}
function wrapW(text, maxW) { const words = text.split(' '); const lines = []; let line = ''; for (const w of words) { const tst = line ? line + ' ' + w : w; if (ctx.measureText(tst).width > maxW && line) { lines.push(line); line = w; } else line = tst; } lines.push(line); return lines; }
function drawCard(cd, t) {
  const a = fade(t, cd.t0, cd.t1, 0.5, 0.45); if (a <= 0) return;
  // drifting gold motes
  ctx.save(); for (let i = 0; i < 46; i++) { const sx = ((i * 0.6180339) % 1) * W + Math.sin(t * 0.4 + i) * 24, sy = H + 120 - (((t - cd.t0) * (18 + (i % 7) * 6) + i * 211) % (H + 240)); const r = 1.5 + (i % 5) * 0.9;
    ctx.globalAlpha = a * (0.18 + 0.3 * (0.5 + 0.5 * Math.sin(t * 2 + i))); ctx.fillStyle = GOLD_L; ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.fill(); } ctx.restore();
  const sc = 0.94 + 0.06 * eout(prog(t, cd.t0, cd.t0 + 0.8));
  ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, 920); ctx.scale(sc, sc); ctx.translate(-W / 2, -920);
  const x0 = 84, x1 = W - 84, pw = x1 - x0;
  ctx.font = '400 34px "Be Vietnam Pro"'; const blines = cd.bullets.map(b => wrapW(b[1], pw - 210));
  const bh = blines.reduce((s, l) => s + l.length * 50 + 34, 0);
  const top = 440, hgt = 400 + bh + 150, bot = top + hgt;
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 50; ctx.fillStyle = 'rgba(7,54,38,0.93)'; ctx.fillRect(x0, top, pw, hgt); ctx.shadowBlur = 0;
  ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.strokeRect(x0 + 0.5, top + 0.5, pw - 1, hgt - 1); ctx.strokeStyle = 'rgba(201,165,92,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(x0 + 14, top + 14, pw - 28, hgt - 28);
  // kicker + title
  const ta = sstep(cd.tt, cd.tt + 0.5, t), tr = (1 - eout(prog(t, cd.tt, cd.tt + 0.8))) * 14;
  ctx.globalAlpha = a * ta; ctx.textAlign = 'center'; ctx.fillStyle = GOLD_L; ctx.font = '600 26px "Be Vietnam Pro"'; spaced(ctx, cd.k, W / 2, top + 98 + tr, 8);
  const kw = ctx.measureText(cd.k).width + 8 * cd.k.length; for (const s of [-1, 1]) { ctx.save(); ctx.translate(W / 2 + s * (kw / 2 + 26), top + 89 + tr); ctx.rotate(Math.PI / 4); ctx.fillRect(-5, -5, 10, 10); ctx.restore(); }
  ctx.fillStyle = CREAM; ctx.font = '600 66px "Cormorant Garamond"'; cd.title.forEach((l, i) => ctx.fillText(l, W / 2, top + 190 + i * 74 + tr));
  const rw = 90 * eout(prog(t, cd.tt + 0.3, cd.tt + 1.1)); ctx.fillStyle = GOLD; ctx.fillRect(W / 2 - rw, top + 318, rw * 2, 2);
  // bullets
  let y = top + 400; ctx.textAlign = 'left';
  cd.bullets.forEach((b, i) => { const ba = sstep(b[0], b[0] + 0.45, t), bx = (1 - eout(prog(t, b[0], b[0] + 0.7))) * 26; ctx.globalAlpha = a * ba;
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x0 + 92 + bx, y - 11, 21, 0, 7); ctx.stroke();
    ctx.fillStyle = GOLD_L; ctx.font = '600 27px "Cormorant Garamond"'; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), x0 + 92 + bx, y - 2); ctx.textAlign = 'left';
    ctx.fillStyle = CREAM; ctx.font = '400 34px "Be Vietnam Pro"'; blines[i].forEach((l, k) => ctx.fillText(l, x0 + 136 + bx, y + k * 50)); y += blines[i].length * 50 + 34; });
  // button
  { const [tb, label] = cd.button; const ba = sstep(tb, tb + 0.4, t), bs = 0.85 + 0.15 * eback(prog(t, tb, tb + 0.6)); ctx.globalAlpha = a * ba;
    ctx.save(); ctx.translate(W / 2, bot - 96); ctx.scale(bs, bs); ctx.font = '600 30px "Be Vietnam Pro"'; const lw = ctx.measureText(label).width + label.length * 4 + 70; const bw = Math.max(440, lw + 40);
    ctx.fillStyle = '#dcc287'; ctx.beginPath(); ctx.roundRect(-bw / 2, -40, bw, 80, 6); ctx.fill(); ctx.strokeStyle = 'rgba(255,240,200,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = EMER_D; ctx.textAlign = 'center'; spaced(ctx, label, 22, 11, 4); drawCheck(-lw / 2 + 30, 0, 26, EMER_D, 4.5); ctx.restore(); }
  ctx.restore();
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
function renderFrame(t) {
  let i = SHOTS.findIndex(s => t >= s.t0 && t < s.t1); if (i < 0) i = SHOTS.length - 1;
  const s = SHOTS[i], prev = SHOTS[i - 1], next = SHOTS[i + 1];
  ctx.globalAlpha = 1; ctx.fillStyle = '#04281c'; ctx.fillRect(0, 0, W, H);
  if (prev && t < s.t0 + FADE / 2) { layer(prev, t, 1); layer(s, t, esin(clamp((t - (s.t0 - FADE / 2)) / FADE))); }
  else if (next && t >= s.t1 - FADE / 2) { layer(s, t, 1); layer(next, t, esin(clamp((t - (s.t1 - FADE / 2)) / FADE))); }
  else layer(s, t, 1);
  softGlow(s.card ? 0.08 : 0.2);
  const dom = (next && t >= s.t1) ? next : (prev && t < s.t0) ? prev : s;
  if (!dom.card) { const c = camAt(dom, t); camera.fov = c.fov; camera.position.copy(c.p); camera.lookAt(c.q); camera.updateProjectionMatrix(); camera.updateMatrixWorld(); drawInfographics(t); }
  drawScrims(t);
  if (!dom.card) LABELS.forEach(l => drawLabel(l, t));
  CARDS.forEach(cd => drawCard(cd, t));
  TITLES.forEach(o => drawTitle16(o, t));
  const st = sstep(0, 0.3, t); if (st < 1) { ctx.fillStyle = `rgba(4,40,28,${1 - st})`; ctx.fillRect(0, 0, W, H); }
  drawSubs(t);
}
async function init() {
  const faces = ['500 92px "Cormorant Garamond"', '600 92px "Cormorant Garamond"', 'italic 500 44px "Cormorant Garamond"', '400 40px "Be Vietnam Pro"', '500 25px "Be Vietnam Pro"', '600 25px "Be Vietnam Pro"', '300 25px "Be Vietnam Pro"'];
  for (const f of faces) await document.fonts.load(f, 'ĐđỏậàÀ Aa1');
  await document.fonts.ready;
  const T0 = performance.now(); const lg = m => console.log(m, ((performance.now() - T0) / 1000).toFixed(1));
  buildCourse(); lg('course'); buildHero(); lg('hero'); buildProps16(); buildClumps(); buildHills(); buildShots(); lg('props');
  await new Promise(r => { const chk = () => (C.golfer.material.map.image ? r() : setTimeout(chk, 50)); chk(); });
  for (const s of SHOTS) if (!s.card) render3D(s, (s.t0 + s.t1) / 2);
  lg('warm');
  window.renderFrame = (t, q = 0.93) => { renderFrame(t); return out.toDataURL('image/jpeg', q); };
  window.camTest = (p, q, fov, t, extra = {}) => {
    const shot = Object.assign({ t0: t - 5, t1: t + 5, keys: [[p, q, fov], [p, q, fov]], shadow: 60, wsize: 1.2 }, extra);
    ctx.globalAlpha = 1; render3D(shot, t); ctx.drawImage(renderer.domElement, 0, 0, W, H);
    const c = camAt(shot, t); camera.fov = c.fov; camera.position.copy(c.p); camera.lookAt(c.q); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    drawInfographics(t); drawScrims(t); LABELS.forEach(l => drawLabel(l, t)); TITLES.forEach(o => drawTitle16(o, t)); drawSubs(t);
    return out.toDataURL('image/jpeg', 0.85);
  };
  window.ready = true;
}
init().catch(e => { console.error('INIT FAIL', e.stack || e); window.initError = String(e.stack || e); });
