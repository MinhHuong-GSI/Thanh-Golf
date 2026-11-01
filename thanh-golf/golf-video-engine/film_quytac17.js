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
const SUN = V(-0.62, 0.36, -0.70).normalize();
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
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 3.4, 12).translate(0, 1.7, 0), new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.35 }));
  pin.position.set(HOLE.x, pinY, HOLE.z); pin.castShadow = true; scene.add(pin);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.9, roughness: 0.25 }));
  knob.position.set(HOLE.x, pinY + 3.42, HOLE.z); scene.add(knob);
  const cup = new THREE.Mesh(new THREE.CircleGeometry(0.32, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#111', roughness: 1, polygonOffset: true, polygonOffsetFactor: -4 }));
  cup.position.set(HOLE.x, pinY + 0.02, HOLE.z); scene.add(cup);
  const fg = new THREE.PlaneGeometry(1.5, 0.95, 18, 8).translate(0.75, 0, 0);
  C.flagBase = fg.attributes.position.array.slice();
  C.flag = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ color: '#f3ead2', roughness: 0.8, side: THREE.DoubleSide }));
  C.flag.position.set(HOLE.x + 0.04, pinY + 2.92, HOLE.z); C.flag.rotation.y = 0.6; C.flag.castShadow = true; scene.add(C.flag);
  const flagStripe = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.08, 18, 1).translate(0.75, -0.37, 0), new THREE.MeshStandardMaterial({ color: '#0d4a35', side: THREE.DoubleSide, roughness: 0.8 }));
  C.flagStripeBase = flagStripe.geometry.attributes.position.array.slice();
  C.flagStripe = flagStripe; flagStripe.position.copy(C.flag.position); flagStripe.rotation.y = 0.6; flagStripe.visible = false; scene.add(flagStripe);
  // tee markers (small gold spheres)
  for (const x of [-3, 3]) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 14), new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.85, roughness: 0.3 })); m.position.set(x, heightAt(x, 59) + 0.15, 59); m.castShadow = true; scene.add(m); }

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
  const H = (7.5 + rnd() * 3) * s, R = (2.0 + rnd() * 0.5) * s, h0 = 1.4 * s; const n = 30;
  for (let i = 0; i < n; i++) {
    const t = Math.pow(rnd(), 0.85), h = h0 + t * (H - h0), rad = (R * (1 - t) + 0.25 * s) * (0.55 + 0.45 * rnd()), a = rnd() * 6.283;
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
    !(x > -4 && x < 26 && z > -66 && z < -45);
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

// ------------------------------------------------------------------ props for the explanation
const R = V(14, 0, 13.333);                      // red edge crossing point
const L1 = V(1.0, -0.45, -39), L2 = V(18, -0.45, 0);
const Ypt = V(0.95, 0, -34);                     // yellow edge crossing point
const D = V(10.0, 0, 15.8);                       // drop point
const HV = V(HOLE.x, 0, HOLE.z);
const rH = Math.hypot(R.x - HOLE.x, R.z - HOLE.z);
const CLUB = 3.0;
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
function makeSplash() {
  const g = new THREE.Group(); scene.add(g);
  const rings = [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f5f0e0', transparent: true, depthWrite: false, toneMapped: false })); g.add(m); return m; });
  const drops = []; const dg = new THREE.SphereGeometry(0.07, 8, 6); const dm = new THREE.MeshStandardMaterial({ color: '#eef6f4', roughness: 0.1, transparent: true });
  for (let i = 0; i < 26; i++) { const m = new THREE.Mesh(dg, dm); const a = rnd() * 6.28, sp = 1 + rnd() * 2.2; m.userData = { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 4 + rnd() * 5 }; g.add(m); drops.push(m); }
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.25, 1, 24, 1, true), new THREE.MeshStandardMaterial({ color: '#e8f2f0', roughness: 0.1, transparent: true, side: THREE.DoubleSide }));
  g.add(crown);
  return { g, rings, drops, dm, crown };
}
function updateSplash(sp, pos, t0, t) {
  const dt = t - t0; sp.g.visible = dt > 0 && dt < 3.0; if (!sp.g.visible) return;
  sp.g.position.copy(pos).setY(-0.43);
  sp.rings.forEach((m, i) => { const d = dt - i * 0.25; m.visible = d > 0; const s = 0.3 + d * 1.6; m.scale.set(s, 1, s); m.material.opacity = 0.75 * Math.max(0, 1 - d / 2.4); });
  sp.drops.forEach(m => { const u = m.userData; const d = dt; m.position.set(u.vx * d * 0.6, u.vy * d - 9.8 * d * d, u.vz * d * 0.6); m.visible = m.position.y > -0.05; });
  sp.dm.opacity = Math.max(0, 1 - dt / 1.1);
  const ch = Math.max(0, Math.sin(clamp(dt / 0.6) * Math.PI)) * 1.3; sp.crown.visible = dt < 0.6; sp.crown.scale.set(1 + dt * 2, ch + 0.01, 1 + dt * 2); sp.crown.position.y = ch / 2; sp.crown.material.opacity = 0.5 * (1 - dt / 0.6);
}
function makeClub() {
  const g = new THREE.Group();
  const shaftM = new THREE.MeshStandardMaterial({ color: '#2a2d2c', metalness: 0.7, roughness: 0.3, transparent: true });
  const gripM = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.7, transparent: true });
  const headM = new THREE.MeshPhysicalMaterial({ color: '#16241e', metalness: 0.6, roughness: 0.25, clearcoat: 1, transparent: true });
  const goldM = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.25, transparent: true });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 2.35, 12), shaftM); shaft.rotation.z = Math.PI / 2; shaft.position.x = 0.62 + 1.175;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.62, 16), gripM); grip.rotation.z = Math.PI / 2; grip.position.x = 0.31;
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), headM); head.scale.set(0.24, 0.16, 0.34); head.position.set(CLUB - 0.1, 0.04, 0.16);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 8, 24), goldM); band.rotation.y = Math.PI / 2; band.position.x = CLUB - 0.3;
  [shaft, grip, head, band].forEach(m => { m.castShadow = true; g.add(m); });
  g.userData.mats = [shaftM, gripM, headM, goldM]; scene.add(g); return g;
}

function buildProps() {
  makeDimples();
  const teeTop = heightAt(TEE.x, TEE.z) + 0.42;
  C.S = V(TEE.x, teeTop, TEE.z);
  C.ball1 = ballMesh(0.35); C.ball2 = ballMesh(0.35); C.ballD = ballMesh(0.35); C.ballT = ballMesh(0.35); C.ballM = ballMesh(0.35);
  [C.ball1, C.ball2, C.ballD, C.ballT, C.ballM].forEach(b => scene.add(b));
  C.ballT.material = C.ballT.material.clone(); C.ballT.material.transparent = true;
  C.ballM.material = C.ballM.material.clone(); C.ballM.material.transparent = true;
  { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,240,200,0.55)'); gr.addColorStop(1, 'rgba(255,220,150,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const gt = texFrom(cv); C.glows = [];
    C.addGlow = b => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: '#ffe7b0', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false })); sp.scale.set(1.7, 1.7, 1); sp.material.opacity = 0.8; b.add(sp); b.userData.glow = sp; }; C.addGlow(C.ball1); C.addGlow(C.ball2); }
  C.tr1 = traj(C.S, L1, 16, 120); C.tr2 = traj(C.S, L2, 13, 120);
  C.tr1L = fatLine(C.tr1, GOLD_L, { w: 3 }); C.tr2L = fatLine(C.tr2, GOLD_L, { w: 3 });
  C.sp1 = makeSplash(); C.sp2 = makeSplash();
  C.float1 = [ring(0.5, 0.56, '#ffffff', 0), ring(0.5, 0.56, '#ffffff', 0)];
  C.float2 = [ring(0.5, 0.56, '#ffffff', 0), ring(0.5, 0.56, '#ffffff', 0)];
  // yellow back-on-the-line
  const uY = Ypt.clone().sub(HV).setY(0).normalize();
  C.uY = uY;
  C.yBack = fatLine(groundPath(HV, Ypt.clone().addScaledVector(uY, 80), 0.5, 0.1), GOLD_L, { w: 5, dashed: true, dash: 1.3, gap: 0.9 });
  C.yBackSplit = HV.distanceTo(Ypt) / HV.distanceTo(Ypt.clone().addScaledVector(uY, 80));
  // red back-on-the-line
  const uR = R.clone().sub(HV).setY(0).normalize(); C.uR = uR;
  C.rBack = fatLine(groundPath(HV, R.clone().addScaledVector(uR, 62), 0.5, 0.1), '#ff8a7a', { w: 5, dashed: true, dash: 1.3, gap: 0.9 });
  C.rBackSplit = HV.distanceTo(R) / HV.distanceTo(R.clone().addScaledVector(uR, 62));
  C.Xpt = R.clone().addScaledVector(uR, 54);
  // red X in the forest
  const xg = new THREE.Group(); const xm = new THREE.MeshBasicMaterial({ color: '#ff4b3e', toneMapped: false, transparent: true });
  for (const a of [Math.PI / 4, -Math.PI / 4]) { const b = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 0.5), xm); b.rotation.z = a; xg.add(b); }
  xg.position.copy(onGround(C.Xpt, 9)); xg.userData.m = xm; scene.add(xg); C.X = xg;
  // markers
  C.mTee = ring(1.1, 1.3, GOLD_L); C.mTee2 = ring(1.6, 1.68, GOLD_L);
  C.mY = ring(0.55, 0.75, '#ffe08a'); C.mYdot = disc(0.32, '#ffe08a');
  C.mR = ring(0.55, 0.75, '#ff6a5a'); C.mRdot = disc(0.32, '#ff6a5a');
  C.mSlide = ring(0.9, 1.05, GOLD_L);
  C.mTeeR = ring(1.1, 1.3, '#ff8a7a');
  // clubs
  C.club1 = makeClub(); C.club2 = makeClub();
  C.clubDir = V(-0.8, 0, 0.6).normalize();
  // relief zone shader
  const zg = new THREE.PlaneGeometry(14, 14, 90, 90).rotateX(-Math.PI / 2).translate(R.x, 0, R.z);
  const zp = zg.attributes.position; for (let i = 0; i < zp.count; i++) zp.setY(i, heightAt(zp.getX(i), zp.getZ(i)) + 0.07);
  C.zoneU = { R: { value: new THREE.Vector2(R.x, R.z) }, Hh: { value: new THREE.Vector2(HOLE.x, HOLE.z) }, rH: { value: rH }, rad: { value: 0 }, op: { value: 0 }, near: { value: 0 }, edge: { value: 13.9 } };
  C.zone = new THREE.Mesh(zg, new THREE.ShaderMaterial({
    uniforms: C.zoneU, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
    vertexShader: `varying vec2 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform vec2 R,Hh; uniform float rH,rad,op,near,edge; varying vec2 vW;
      void main(){ float d=distance(vW,R); if(d>rad) discard; if(vW.x>edge) discard;
        float dh=distance(vW,Hh); vec4 c;
        float rim = smoothstep(rad-0.22,rad-0.05,d)*(1.0-smoothstep(rad-0.05,rad,d));
        if(dh<rH){ if(near<0.01) discard; float hatch=step(0.5,fract((vW.x+vW.y)*1.4)); c=vec4(0.95,0.32,0.28,(0.18+0.18*hatch)*near); }
        else { c=vec4(0.93,0.80,0.47,0.36+0.5*rim); }
        gl_FragColor=vec4(c.rgb,c.a*op);
        #include <colorspace_fragment>
      }`
  }));
  C.zone.renderOrder = 7; scene.add(C.zone);
  // not-nearer arc (centred on the hole)
  const arc = []; for (let a = -0.03; a <= 0.24; a += 0.002) { const x = HOLE.x + rH * Math.sin(a), z = HOLE.z + rH * Math.cos(a); arc.push(onGround(V(x, 0, z), 0.12)); }
  C.arc = fatLine(arc, '#fff6e0', { w: 4, dashed: true, dash: 0.6, gap: 0.45 });
  // shot from the drop to the green
  C.G2 = onGround(V(1.4, 0, -55.5), 0.35);
  C.trD = traj(onGround(D, 0.35), C.G2, 13, 140); C.trDL = fatLine(C.trD, GOLD_L, { w: 4 });
  C.ballG = ballMesh(0.35); scene.add(C.ballG); C.addGlow(C.ballG);
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
  const pre = [4, 5, 3, 5, 4];
  pre.forEach((d, i) => { const r = cellRect(0, 2, i); const dx = i === 4 ? -14 : 0; g.save(); g.globalAlpha = 0.85; hand(g, digit(d, r.x + r.w / 2 + dx, r.y + r.h / 2 + 4, 70), 1, 5.5, '#36383d'); g.restore(); });
  g.textAlign = 'left'; g.fillStyle = EMER; g.font = 'italic 500 34px "Cormorant Garamond"';
  g.fillText('Người chơi', 90, 1330); g.fillText('Ngày', 640, 1330); g.fillText('Chữ ký người ghi', 90, 1460);
  g.strokeStyle = 'rgba(11,71,51,0.5)'; g.lineWidth = 1.2;
  [[250, 1332, 590], [720, 1332, 1030], [350, 1462, 1030]].forEach(([a, y, b]) => { g.beginPath(); g.moveTo(a, y); g.lineTo(b, y); g.stroke(); });
  g.textAlign = 'center'; g.fillStyle = GOLD; g.font = '500 22px "Be Vietnam Pro"'; g.letterSpacing = '8px'; g.fillText('LUẬT GOLF  ·  QUY TẮC 17', CW / 2 + 4, 1600); g.letterSpacing = '0px';
  return cv;
}
// strokes on hole-5 cell, in card design px
const C5 = cellRect(0, 2, 4);
const C5c = { x: C5.x + C5.w / 2 - 14, y: C5.y + C5.h / 2 + 4 };
const STROKE_REGION = { x: C5.x - 80, y: C5.y - 70, w: 300, h: 280 };
const STR = {
  x1: [[[C5c.x - 30, C5c.y - 40], [C5c.x + 28, C5c.y + 38]]],
  x2: [[[C5c.x + 28, C5c.y - 42], [C5c.x - 30, C5c.y + 40]]],
  six: digit(6, C5c.x + 62, C5c.y + 42, 74),
  circ: [sampleCurve(u => { const a = lerp(-2.2, -2.2 + Math.PI * 2.15, u); return [C5c.x + 62 + 52 * Math.cos(a) * (1 + 0.04 * u), C5c.y + 44 + 54 * Math.sin(a) * (1 - 0.05 * u)]; }, 60)]
};
const B_T = { x1: [4.32, 4.62], x2: [4.74, 5.04], six: [5.22, 5.95], circ: [6.05, 6.62] };
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
  B.cell = cardToWorld(C5c.x + 25, C5c.y + 20);
}
function designToLocal(x, y) { return V((x / CW - .5) * 5.6, 0.05, (y / CH - .5) * 8.6); }
function cardToWorld(x, y) { B.card.updateMatrixWorld(); return B.card.localToWorld(designToLocal(x, y)); }
function updateScorecard(t) {
  const g = B.sctx; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, B.scv.width, B.scv.height);
  g.setTransform(2, 0, 0, 2, -STROKE_REGION.x * 2, -STROKE_REGION.y * 2);
  let tip = null, writing = false;
  for (const k of ['x1', 'x2', 'six', 'circ']) {
    const [a, b] = B_T[k]; const p = prog(t, a, b);
    if (p > 0) { const tp = hand(g, STR[k], esin(p), k === 'circ' ? 4.5 : 6, 'rgba(48,50,56,0.92)'); if (t <= b) { tip = tp; writing = true; } }
  }
  B.stex.needsUpdate = true;
  // pencil pose
  const order = ['x1', 'x2', 'six', 'circ'];
  const startOf = k => STR[k][0][0], endOf = k => { const s = STR[k][STR[k].length - 1]; return s[s.length - 1]; };
  let pos2, lift = 0;
  const rest = [C5c.x + 260, C5c.y + 200], away = [C5c.x + 420, C5c.y + 380];
  if (writing && tip) { pos2 = tip; lift = 0; }
  else if (t < B_T.x1[0]) { const p = eio(prog(t, 3.5, B_T.x1[0])); pos2 = [lerp(rest[0], startOf('x1')[0], p), lerp(rest[1], startOf('x1')[1], p)]; lift = (1 - p) * 0.9 + Math.sin(p * Math.PI) * 0.3; }
  else if (t > B_T.circ[1]) { const p = eio(prog(t, B_T.circ[1], B_T.circ[1] + 0.9)); const e = endOf('circ'); pos2 = [lerp(e[0], away[0], p), lerp(e[1], away[1], p)]; lift = p * 1.6; }
  else {
    for (let i = 0; i < 3; i++) { const a = order[i], b = order[i + 1]; if (t > B_T[a][1] && t < B_T[b][0]) { const p = esin(prog(t, B_T[a][1], B_T[b][0])); const e = endOf(a), s = startOf(b); pos2 = [lerp(e[0], s[0], p), lerp(e[1], s[1], p)]; lift = Math.sin(p * Math.PI) * 0.35; } }
  }
  if (!pos2) pos2 = rest;
  const w = cardToWorld(pos2[0], pos2[1]); B.pencil.position.set(w.x, 0.05 + lift, w.z);
  B.pencil.rotation.set(0, Math.sin(t * 7) * 0.02, writing ? Math.sin(t * 23) * 0.015 : 0);
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
function drawPlaques(t) {
  const a = fade(t, 54.4, 57.15, 0.6, 0.4); if (a <= 0) return;
  const items = [{ c: YEL, k: 'CỌC VÀNG', n: '2', d1: 'Đánh lại từ điểm cũ', d2: 'Lùi trên đường thẳng' }, { c: RED, k: 'CỌC ĐỎ', n: '3', d1: '2 lựa chọn của cọc vàng', d2: '+ Thả ngang 2 gậy' }];
  items.forEach((it, i) => {
    const p = eout(prog(t, 54.4 + i * 0.25, 55.3 + i * 0.25));
    const w = 430, h = 430, x = (i === 0 ? W / 2 - w - 22 : W / 2 + 22), y = 560 + (1 - p) * 40;
    ctx.save(); ctx.globalAlpha = a * p;
    ctx.fillStyle = 'rgba(4,42,29,0.86)'; ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.fill();
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(201,165,92,0.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x + 10, y + 10, w - 20, h - 20, 4); ctx.stroke();
    ctx.fillStyle = it.c; ctx.fillRect(x + w / 2 - 6, y + 46, 12, 36);
    ctx.textAlign = 'center'; ctx.fillStyle = GOLD_L; ctx.font = '600 25px "Be Vietnam Pro"'; spaced(ctx, it.k, x + w / 2, y + 128, 7);
    ctx.fillStyle = GOLD_L; ctx.font = '500 150px "Cormorant Garamond"'; ctx.fillText(it.n, x + w / 2, y + 268);
    ctx.fillStyle = CREAM; ctx.font = 'italic 500 42px "Cormorant Garamond"'; ctx.fillText('lựa chọn', x + w / 2, y + 318);
    ctx.fillStyle = 'rgba(246,241,230,0.8)'; ctx.font = '400 22px "Be Vietnam Pro"'; ctx.fillText(it.d1, x + w / 2, y + 366); ctx.fillText(it.d2, x + w / 2, y + 396);
    ctx.restore();
  });
}
function drawCTA(t) {
  const a = fade(t, 57.55, 99, 0.6, 0.1); if (a <= 0) return;
  { const v = a * 0.5; const g = ctx.createRadialGradient(W / 2, 1010, 80, W / 2, 1010, 900); g.addColorStop(0, `rgba(4,40,28,${v})`); g.addColorStop(1, `rgba(4,40,28,${v * 0.6})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  const p = eback(prog(t, 57.55, 58.4)); const cx = W / 2, cy = 1010;
  ctx.save(); ctx.globalAlpha = a;
  ctx.translate(cx, cy); ctx.scale(0.9 + 0.1 * p, 0.9 + 0.1 * p);
  const w = 600, h = 118;
  ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 40;
  ctx.fillStyle = EMER; ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, h / 2); ctx.fill(); ctx.shadowBlur = 0;
  ctx.strokeStyle = GOLD; ctx.lineWidth = 2.5; ctx.stroke();
  // shimmer
  const sx = lerp(-w, w, prog((t - 58.3) % 2.6, 0, 1.1));
  ctx.save(); ctx.clip(); const sg = ctx.createLinearGradient(sx - 90, 0, sx + 90, 0); sg.addColorStop(0, 'rgba(232,210,154,0)'); sg.addColorStop(0.5, 'rgba(232,210,154,0.28)'); sg.addColorStop(1, 'rgba(232,210,154,0)'); ctx.fillStyle = sg; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.restore();
  ctx.fillStyle = CREAM; ctx.textAlign = 'center'; ctx.font = '600 38px "Be Vietnam Pro"'; spaced(ctx, 'ĐĂNG KÝ KÊNH', 0, 14, 8);
  ctx.restore();
  const b = fade(t, 58.0, 99, 0.7, 0.1);
  ctx.save(); ctx.globalAlpha = b; ctx.textAlign = 'center'; ctx.shadowColor = 'rgba(0,18,10,0.6)'; ctx.shadowBlur = 22;
  ctx.fillStyle = GOLD_L; ctx.font = '500 25px "Be Vietnam Pro"'; spaced(ctx, 'LUẬT GOLF · QUY TẮC 17', W / 2, 860, 9);
  ctx.fillStyle = CREAM; ctx.font = 'italic 500 50px "Cormorant Garamond"'; ctx.fillText('Nắm vững trọn bộ luật golf', W / 2, 1150);
  ctx.restore();
}

// ------------------------------------------------------------------ timeline data
const SUBS = [
  [0.3, 1.4, 'Cọc đỏ và cọc vàng'], [1.4, 3.5, 'trong golf đều phạt một gậy.'],
  [3.5, 6.9, 'Nhưng chọn sai vùng thả bóng\nsẽ khiến bạn mất điểm oan uổng.'], [6.9, 8.7, 'Khác biệt cốt lõi là gì?'],
  [8.7, 10.7, 'Giả sử một quả bóng\nrơi xuống hồ nước'], [10.7, 12.4, 'chắn ngang ngay trước vùng green,'],
  [12.4, 16.0, 'so với quả bóng rớt xuống\ncon suối chạy dọc theo lề sườn.'],
  [16.0, 18.7, 'Với cọc vàng dành cho\nchướng ngại vật chắn ngang,'], [18.7, 20.5, 'bạn có hai lựa chọn chính.'],
  [20.5, 22.7, 'Một là đánh lại từ điểm cũ.'], [22.7, 27.3, 'Hai là lùi vô tận trên đường nối\ntừ hố đi qua điểm rớt bóng.'],
  [27.3, 29.2, 'Nhưng thế bí hình học\nsẽ xuất hiện với'], [29.2, 31.7, 'con suối cọc đỏ\nchạy dọc theo hố.'],
  [31.7, 33.3, 'Nếu lùi thẳng theo trục này,'], [33.3, 35.1, 'bạn có thể bị đẩy\nsâu vào rừng rậm,'], [35.1, 37.3, 'hoặc lùi về tận điểm phát bóng.'],
  [37.3, 40.9, 'Đó là lúc cọc đỏ phát huy tác dụng\nđể phá vỡ thế bí này.'], [40.9, 42.8, 'Nó cung cấp thêm một đặc quyền:'],
  [42.8, 45.5, 'thả bóng sang ngang\ntrong vòng hai chiều dài gậy'], [45.5, 47.9, 'từ vị trí bóng cắt ranh giới.'],
  [47.9, 50.7, 'Góc đánh sẽ thoáng đãng hơn\nmà không phải lùi xa,'], [50.7, 52.9, 'miễn là không tiến gần hố hơn.'],
  [52.9, 54.6, 'Lần tới khi bóng bay xuống nước,'], [54.6, 57.3, 'hãy nhìn màu cọc để chọn\nvùng thả có lợi nhất.'],
  [57.3, 60.2, 'Và đừng quên đăng ký kênh\nđể nắm vững trọn bộ luật golf nhé.']
];
const TITLES = [
  { t0: 0.35, t1: 3.3, k: 'Luật golf · Quy tắc 17', title: 'Cọc đỏ & cọc vàng' },
  { t0: 6.95, t1: 8.55, k: 'Khác biệt cốt lõi', title: 'Vàng hay đỏ?' },
  { t0: 9.0, t1: 15.7, k: 'Tình huống', title: 'Bóng xuống nước' },
  { t0: 16.2, t1: 20.25, k: '01 — Cọc vàng', title: 'Hai lựa chọn' },
  { t0: 20.6, t1: 22.45, k: 'Cọc vàng · Lựa chọn 1', title: 'Đánh lại từ điểm cũ', size: 84 },
  { t0: 22.8, t1: 26.9, k: 'Cọc vàng · Lựa chọn 2', title: 'Lùi trên đường thẳng', size: 84 },
  { t0: 27.3, t1: 31.45, k: '02 — Cọc đỏ', title: 'Thế bí hình học' },
  { t0: 31.8, t1: 36.95, k: 'Cọc đỏ · Lùi theo trục', title: 'Đường cụt', size: 88 },
  { t0: 37.3, t1: 40.6, k: '02 — Cọc đỏ', title: 'Phá vỡ thế bí' },
  { t0: 40.95, t1: 47.75, k: '03 — Đặc quyền cọc đỏ', title: 'Thả ngang', sub: 'trong vòng hai chiều dài gậy' },
  { t0: 48.0, t1: 50.45, k: '03 — Đặc quyền cọc đỏ', title: 'Góc đánh thoáng', sub: 'không phải lùi xa' },
  { t0: 50.8, t1: 52.55, k: 'Điều kiện', title: 'Không gần hố hơn', size: 84 },
  { t0: 52.95, t1: 57.15, k: 'Ghi nhớ', title: 'Nhìn màu cọc' },
];
const LABELS = [
  { t0: 10.95, t1: 12.35, p: () => L1.clone().setY(0), text: 'Hồ chắn ngang', dx: -80, dy: -120 },
  { t0: 14.25, t1: 15.75, p: () => L2.clone().setY(0), text: 'Suối dọc lề sườn', dx: 70, dy: -130 },
  { t0: 16.9, t1: 20.25, p: () => onGround(V(-6, 0, -33.9)), text: 'Ranh giới cọc vàng', dx: -60, dy: 150 },
  { t0: 24.6, t1: 26.9, p: () => onGround(Ypt), text: 'Điểm bóng cắt ranh giới', dx: 60, dy: 130 },
  { t0: 27.9, t1: 31.4, p: () => onGround(V(13.9, 0, -2)), text: 'Ranh giới cọc đỏ', dx: -70, dy: 120 },
  { t0: 33.55, t1: 36.95, p: () => onGround(C.Xpt), text: 'Rừng rậm', dx: -70, dy: -110 },
  { t0: 35.35, t1: 36.95, p: () => onGround(V(TEE.x, 0, TEE.z)), text: 'Điểm phát bóng', dx: -70, dy: 110 },
  { t0: 44.2, t1: 45.45, p: () => onGround(R.clone().addScaledVector(C.clubDir, 6)), text: '2 chiều dài gậy', dx: -60, dy: 120 },
  { t0: 45.6, t1: 47.75, p: () => onGround(R), text: 'Điểm bóng cắt ranh giới', dx: -60, dy: -130 },
  { t0: 48.35, t1: 49.9, p: () => onGround(D, 0.35), text: 'Thả bóng', dx: 70, dy: -230 },
];

// camera shots: keys [pos, target, fov]; ease over [t0,t1] (keys are spline points)
const SH = (t0, t1, keys, o = {}) => ({ t0, t1, keys, ...o });
const SHOTS = [
  SH(0, 3.5, [[[7.25, 4.45, -27.25], [13.6, 0.3, -33.6], 40], [[7.95, 3.95, -27.95], [13.6, 0.3, -33.6], 40]], { dof: true, grass: true, shadow: 18, wsize: 1.5, near: 0.05, ease: 'lin' }),
  SH(3.5, 8.7, null, { scene: 'B' }),
  SH(8.7, 15.9, [[[-8, 66, 118], [0, 0, -14], 38], [[-16, 52, 102], [3, 0, -14], 38], [[-27, 42, 84], [7, 0, -4], 38]], { shadow: 120, wsize: 0.9, ease: 'io2' }),
  SH(15.9, 20.4, [[[-13, 10.5, -15], [1.5, 0, -38.5], 36], [[-10, 8.6, -18.5], [2, 0, -39.5], 36]], { shadow: 40, wsize: 1.6 }),
  SH(20.4, 22.6, [[[-9.5, 7.5, 77], [0, 0.6, 59.5], 36], [[-7.2, 6.1, 73.5], [0, 0.6, 59.2], 36]], { shadow: 30, wsize: 1.4 }),
  SH(22.6, 27.0, [[[3, 165, 100], [0, 0, -16], 40], [[1, 156, 92], [0, 0, -15], 40]], { shadow: 120, wsize: 0.8, lw: 1.2 }),
  SH(27.0, 31.6, [[[8.5, 9.5, -31], [16.5, 0, 16], 36], [[8.2, 8.2, -26], [16.5, 0, 19], 36]], { shadow: 50, wsize: 1.4 }),
  SH(31.6, 37.1, [[[0, 150, 70], [6, 0, -20], 40, 31.4], [[0, 150, 75], [6, 0, -15], 40, 32.75], [[5, 150, 133], [11, 0, 43], 40, 34.05], [[5, 150, 137], [11, 0, 47], 40, 37.3]], { shadow: 130, wsize: 0.8, lw: 1.2, timed: true }),
  SH(37.1, 40.75, [[[8.6, 1.8, 21.6], [14, 0.75, 15.3], 34], [[9.9, 1.4, 19.9], [14, 0.7, 15.6], 34]], { dof: true, shadow: 16, wsize: 1.4, near: 0.05, grass: 'R' }),
  SH(40.75, 47.9, [[[9.0, 13.5, 30], [12, 0, 14.2], 38], [[9.8, 12.2, 28.5], [12, 0, 14.4], 38]], { shadow: 26, wsize: 1.6 }),
  SH(47.9, 50.6, [[[9.8, 12.2, 28.5], [12, 0, 14.4], 38], [[12.4, 7.5, 31.5], [6, 0, -5], 38], [[12.8, 6.6, 31], [2, 0, -40], 38]], { shadow: 70, wsize: 1.4, ease: 'io2' }),
  SH(50.6, 52.7, [[[9.6, 30, 23], [10.5, 0, 13.6], 40], [[9.9, 27, 21.4], [10.5, 0, 13.5], 40]], { shadow: 24, wsize: 1.5 }),
  SH(52.7, 57.25, [[[-46, 88, 96], [3, 0, -6], 40], [[-34, 98, 108], [3, 0, -8], 40]], { shadow: 120, wsize: 0.9 }),
  SH(57.25, 64.0, [[[-3.6, 0.75, -52.2], [-0.6, 2.7, -58.6], 36], [[-2.6, 0.7, -52.6], [-0.7, 2.8, -58.6], 36]], { dof: true, near: 0.05, shadow: 20, wsize: 1.8 }),
];
const FADE = 0.4;

function camAt(shot, t) {
  const k = shot.keys;
  if (shot.timed) {
    let i = 0; while (i < k.length - 2 && t > k[i + 1][3]) i++;
    const l = esin(prog(t, k[i][3], k[i + 1][3]));
    return { p: V(...k[i][0]).lerp(V(...k[i + 1][0]), l), q: V(...k[i][1]).lerp(V(...k[i + 1][1]), l), fov: lerp(k[i][2], k[i + 1][2], l) };
  }
  let u = prog(t, shot.t0 - FADE / 2, shot.t1 + FADE / 2);
  u = shot.ease === 'lin' ? u : shot.ease === 'io2' ? esin(u) : eio(u);
  const n = k.length - 1, f = u * n, i = Math.min(n - 1, Math.floor(f)), l = f - i;
  if (n === 1) return { p: V(...k[0][0]).lerp(V(...k[1][0]), u), q: V(...k[0][1]).lerp(V(...k[1][1]), u), fov: lerp(k[0][2], k[1][2], u) };
  const pc = new THREE.CatmullRomCurve3(k.map(x => V(...x[0]))), qc = new THREE.CatmullRomCurve3(k.map(x => V(...x[1])));
  return { p: pc.getPoint(u), q: qc.getPoint(u), fov: lerp(k[i][2], k[i + 1][2], l) };
}

// ------------------------------------------------------------------ per-frame state
function updateCourse(t, shot) {
  C.water.material.uniforms.time.value = t * 0.55;
  C.water.material.uniforms.size.value = shot.wsize || 1.2;
  C.grassA.visible = shot.grass === true; C.grassR.visible = shot.grass === 'R'; SKYTIME.value = t;
  // flag cloth
  const fp = C.flag.geometry.attributes.position, fb = C.flagBase;
  for (let i = 0; i < fp.count; i++) { const x = fb[i * 3], y = fb[i * 3 + 1]; fp.setXYZ(i, x, y - 0.04 * x * x, Math.sin(x * 3.4 - t * 5.2) * 0.13 * x + Math.sin(y * 4 + t * 3) * 0.02 * x); }
  fp.needsUpdate = true; C.flag.geometry.computeVertexNormals();
  const sp = C.flagStripe.geometry.attributes.position, sb = C.flagStripeBase;
  for (let i = 0; i < sp.count; i++) { const x = sb[i * 3], y = sb[i * 3 + 1]; sp.setXYZ(i, x, y - 0.04 * x * x, Math.sin(x * 3.4 - t * 5.2) * 0.13 * x + Math.sin(y * 4 + t * 3) * 0.02 * x + 0.004); }
  sp.needsUpdate = true;
  // ball 1 → pond
  const t1a = 9.15, t1b = 10.9, t2a = 12.55, t2b = 14.25;
  const p1 = prog(t, t1a, t1b), p2 = prog(t, t2a, t2b);
  C.ball1.visible = t > t1a - 0.6 && t < 27.2;
  if (t < t1b) C.ball1.position.copy(t < t1a ? C.S : C.tr1[Math.round(p1 * 120)]);
  else C.ball1.position.copy(L1).setY(-0.45 + 0.08 + 0.03 * Math.sin(t * 2));
  revealLine(C.tr1L, t < t1a ? 0 : p1); C.tr1L.material.opacity = 1 - prog(t, t1b + 0.8, t1b + 2.4); if (t > t1b + 2.4) C.tr1L.visible = false;
  updateSplash(C.sp1, L1, t1b, t);
  C.ball1.userData.glow.visible = t > t1a && t < t1b; C.ball2.userData.glow.visible = t > t2a && t < t2b;
  C.ball2.visible = t > t2a - 0.6 && t < 52.8;
  if (t < t2b) C.ball2.position.copy(t < t2a ? C.S : C.tr2[Math.round(p2 * 120)]);
  else C.ball2.position.copy(L2).setY(-0.45 + 0.08 + 0.03 * Math.sin(t * 2 + 1));
  if (t < t1b && t > t2a) C.ball1.visible = true;
  if (t2a > t && t > t1b) { /* ball 2 waits on tee hidden */ C.ball2.visible = false; }
  revealLine(C.tr2L, t < t2a ? 0 : p2); C.tr2L.material.opacity = 1 - prog(t, t2b + 0.8, t2b + 2.4); if (t > t2b + 2.4) C.tr2L.visible = false;
  updateSplash(C.sp2, L2, t2b, t);
  // floating ripples on resting balls
  const rip = (rings, P, on) => rings.forEach((m, i) => { const ph = ((t * 0.55 + i * 0.5) % 1); m.position.copy(P).setY(-0.43); const s = 0.8 + ph * 2.2; m.scale.set(s, 1, s); m.material.opacity = on * 0.55 * (1 - ph); m.visible = on > 0; });
  rip(C.float1, L1, (t > t1b + 1.2 && t < 27.2) ? 1 : 0); rip(C.float2, L2, (t > t2b + 1.2 && t < 52.8) ? 1 : 0);
  // line highlights
  const yHi = Math.max(fade(t, 16.0, 27.1, 0.6, 0.4), fade(t, 52.9, 57.2, 0.6, 0.4)) * (0.75 + 0.25 * Math.sin(t * 4));
  const rHi = Math.max(fade(t, 27.3, 52.7, 0.6, 0.4), fade(t, 52.9, 57.2, 0.6, 0.4)) * (0.75 + 0.25 * Math.sin(t * 4));
  C.yGlow.material.opacity = yHi * 0.85; C.rGlow.material.opacity = rHi * 0.85;
  C.yLineMat.emissiveIntensity = 0.05 + yHi * 0.6; C.rLineMat.emissiveIntensity = 0.05 + rHi * 0.6;
  C.yMat.emissiveIntensity = yHi * 0.35; C.rMat.emissiveIntensity = rHi * 0.35;
  // option 1: replay from the tee
  const o1 = fade(t, 20.5, 22.75, 0.4, 0.3);
  C.ballT.visible = o1 > 0; C.ballT.position.copy(C.S); C.ballT.material.opacity = o1; const bs = eback(prog(t, 20.6, 21.2)); C.ballT.scale.setScalar(Math.max(0.01, bs));
  const tg = onGround(V(TEE.x, 0, TEE.z), 0.47);
  [C.mTee, C.mTee2].forEach((m, i) => { m.position.copy(tg); const ph = ((t - 20.5) * 0.7 + i * 0.5) % 1; const s = i ? 1 + ph * 1.8 : 1 + 0.06 * Math.sin(t * 5); m.scale.set(s, 1, s); m.material.opacity = o1 * (i ? 1 - ph : 0.95); m.visible = o1 > 0; });
  // option 2: back on the line (yellow)
  const yb = fade(t, 22.9, 27.1, 0.2, 0.4);
  const yr = t < 24.6 ? prog(t, 23.0, 24.6) * C.yBackSplit : C.yBackSplit + (1 - C.yBackSplit) * eio(prog(t, 24.6, 26.6));
  revealLine(C.yBack, yb > 0 ? yr : 0); C.yBack.material.opacity = yb; C.yBack.material.dashOffset = -t * 1.2;
  const yd = fade(t, 23.2, 27.1, 0.4, 0.4); C.mY.visible = C.mYdot.visible = yd > 0; C.mY.position.copy(onGround(Ypt, 0.13)); C.mYdot.position.copy(onGround(Ypt, 0.14));
  C.mY.material.opacity = yd; C.mYdot.material.opacity = yd; const ys = 1 + 0.12 * Math.sin(t * 5); C.mY.scale.set(ys, 1, ys);
  const sl = fade(t, 25.0, 27.1, 0.3, 0.4); const sk = 2 + 40 * eio(prog(t, 25.0, 26.9));
  const SP = onGround(Ypt.clone().addScaledVector(C.uY, sk), 0.35);
  C.ballM.visible = sl > 0; C.ballM.position.copy(SP); C.ballM.material.opacity = sl;
  C.mSlide.visible = sl > 0; C.mSlide.position.copy(SP).setY(SP.y - 0.33); C.mSlide.material.opacity = sl;
  // red geometry
  const rd = fade(t, 28.2, 52.7, 0.5, 0.4); C.mR.visible = C.mRdot.visible = rd > 0;
  C.mR.position.copy(onGround(R, 0.13)); C.mRdot.position.copy(onGround(R, 0.14)); C.mR.material.opacity = rd; C.mRdot.material.opacity = rd;
  const rs = 1 + 0.12 * Math.sin(t * 5); C.mR.scale.set(rs, 1, rs);
  const rb = fade(t, 31.9, 37.0, 0.2, 0.4);
  const rr = t < 32.9 ? prog(t, 31.9, 32.9) * C.rBackSplit : C.rBackSplit + (1 - C.rBackSplit) * eio(prog(t, 32.9, 34.3));
  revealLine(C.rBack, rb > 0 ? rr : 0); C.rBack.material.opacity = rb; C.rBack.material.dashOffset = -t * 1.2;
  const xa = fade(t, 34.0, 37.0, 0.3, 0.4); C.X.visible = false; C.X.userData.m.opacity = xa; C.X.scale.setScalar(Math.max(0.01, eback(prog(t, 34.0, 34.5))));
  C.X.rotation.y = t * 0.6; C.X.position.y = heightAt(C.Xpt.x, C.Xpt.z) + 9 + Math.sin(t * 2) * 0.3;
  const tr = fade(t, 35.2, 37.0, 0.3, 0.3); C.mTeeR.visible = tr > 0; C.mTeeR.position.copy(tg); const trs = 1 + ((t * 0.8) % 1) * 1.4; C.mTeeR.scale.set(trs, 1, trs); C.mTeeR.material.opacity = tr * (1 - ((t * 0.8) % 1));
  // clubs
  const placeClub = (club, a, b, k) => {
    const p = eout(prog(t, a, b)); const vis = fade(t, a - 0.01, 52.65, 0.15, 0.4);
    club.visible = vis > 0; club.userData.mats.forEach(m => m.opacity = Math.min(vis, p * 1.5));
    const a0 = onGround(R.clone().addScaledVector(C.clubDir, CLUB * k), 0.09), a1 = onGround(R.clone().addScaledVector(C.clubDir, CLUB * (k + 1)), 0.09);
    const dirv = a1.clone().sub(a0).normalize();
    club.position.copy(a0).add(V(0, (1 - p) * 1.5, 0));
    club.quaternion.setFromUnitVectors(V(1, 0, 0), dirv); club.rotateZ((1 - p) * 0.5);
  };
  placeClub(C.club1, 43.0, 43.9, 0); placeClub(C.club2, 44.15, 45.05, 1);
  // zone
  C.zoneU.rad.value = 6.0 * eout(prog(t, 45.3, 46.6)) + 0.001; C.zoneU.op.value = fade(t, 45.3, 57.15, 0.3, 0.4);
  C.zoneU.near.value = fade(t, 50.8, 52.65, 0.5, 0.3);
  C.zone.visible = C.zoneU.op.value > 0;
  const ar = fade(t, 50.8, 52.65, 0.2, 0.3); revealLine(C.arc, ar > 0 ? eio(prog(t, 50.8, 51.8)) : 0); C.arc.material.opacity = ar;
  // drop + shot
  const dropT = 47.95, land = 48.3; const DG = onGround(D, 0.35);
  C.ballD.visible = t > dropT && t < 57.2;
  if (t < land) { const f = prog(t, dropT, land); C.ballD.position.copy(DG).setY(DG.y + 2.6 * (1 - f * f)); }
  else { const f = t - land; C.ballD.position.copy(DG).setY(DG.y + Math.abs(Math.sin(Math.min(f, 0.45) / 0.45 * Math.PI)) * 0.35 * Math.max(0, 1 - f / 0.45)); }
  const s0 = 48.85, s1 = 50.35, ps = prog(t, s0, s1);
  revealLine(C.trDL, t > s0 ? ps : 0); C.trDL.material.opacity = fade(t, s0, 52.65, 0.05, 0.4);
  C.ballG.visible = t > s0 && (t < 52.7 || t > 57.0); C.ballG.position.copy(C.trD[Math.round(ps * 140)]); C.ballG.userData.glow.visible = ps < 1;
  // line widths depend on framing
  const lw = (shot.lw || 1) * RS;
  C.yBack.material.linewidth = 5 * lw; C.rBack.material.linewidth = 5 * lw; C.tr1L.material.linewidth = 3.5 * lw; C.tr2L.material.linewidth = 3.5 * lw;
}

function setupShot(shot, t) {
  if (shot.scene === 'B') {
    updateScorecard(t);
    const cell = B.cell;
    const u = eio(prog(t, 3.3, 6.8)), v = eio(prog(t, 6.6, 8.9));
    const p1 = cell.clone().add(V(1.9, 6.6, 5.0)), p2 = cell.clone().add(V(1.2, 5.0, 3.7));
    const p3 = V(1.6, 13.5, 9.5);
    const q3 = V(0.6, 0, -0.8);
    const p = p1.lerp(p2, u).lerp(p3, v); const q = cell.clone().lerp(q3, v);
    camera.fov = 34; camera.near = 0.1; camera.far = 200; camera.position.copy(p); camera.lookAt(q); camera.updateProjectionMatrix();
    return { sc: sceneB, dof: true, focus: p.distanceTo(q), aperture: 0.0055, maxblur: 0.009 };
  }
  const c = camAt(shot, t);
  camera.fov = c.fov; camera.near = shot.near || 0.5; camera.far = 2400; camera.position.copy(c.p); camera.lookAt(c.q); camera.updateProjectionMatrix();
  sky.position.copy(camera.position);
  aimShadow(c.q, shot.shadow || 60);
  updateCourse(t, shot);
  let focus = c.p.distanceTo(c.q), aperture = 0.003, maxblur = 0.008;
  if (shot === SHOTS[8]) { focus = c.p.distanceTo(V(13.97, 0.7, 16.2)); aperture = 0.004; maxblur = 0.01; }
  if (shot === SHOTS[0]) { focus = c.p.distanceTo(V(13.1, 0.6, -33.1)); aperture = 0.0035; maxblur = 0.009; }
  if (shot === SHOTS[13]) { focus = c.p.distanceTo(V(0, 2.6, -58)); aperture = 0.0045; maxblur = 0.012; }
  return { sc: scene, dof: !!shot.dof, focus, aperture, maxblur };
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

const glowCv = document.createElement('canvas'); glowCv.width = 270; glowCv.height = 480; const glowCtx = glowCv.getContext('2d');
function softGlow(a) {
  glowCtx.filter = 'none'; glowCtx.clearRect(0, 0, 270, 480); glowCtx.filter = 'blur(5px)'; glowCtx.drawImage(out, 0, 0, 270, 480); glowCtx.filter = 'none';
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = a; ctx.drawImage(glowCv, 0, 0, W, H); ctx.restore();
}
function renderFrame(t) {
  let i = SHOTS.findIndex(s => t >= s.t0 && t < s.t1); if (i < 0) i = SHOTS.length - 1;
  const s = SHOTS[i];
  const prev = SHOTS[i - 1], next = SHOTS[i + 1];
  ctx.globalAlpha = 1;
  if (prev && t < s.t0 + FADE / 2) {
    render3D(prev, t); ctx.drawImage(renderer.domElement, 0, 0, W, H);
    render3D(s, t); ctx.globalAlpha = esin(clamp((t - (s.t0 - FADE / 2)) / FADE)); ctx.drawImage(renderer.domElement, 0, 0, W, H); ctx.globalAlpha = 1;
  } else if (next && t >= s.t1 - FADE / 2) {
    render3D(s, t); ctx.drawImage(renderer.domElement, 0, 0, W, H);
    render3D(next, t); ctx.globalAlpha = esin(clamp((t - (s.t1 - FADE / 2)) / FADE)); ctx.drawImage(renderer.domElement, 0, 0, W, H); ctx.globalAlpha = 1;
  } else { render3D(s, t); ctx.drawImage(renderer.domElement, 0, 0, W, H); }
  softGlow((s.scene === 'B' || (prev && prev.scene === 'B' && t < s.t0 + FADE / 2) || (next && next.scene === 'B' && t >= s.t1 - FADE / 2)) ? 0.07 : 0.2);
  // overlay labels need the camera of the dominant shot
  const dom = (next && t >= s.t1 - FADE / 2 && t >= s.t1) ? next : (prev && t < s.t0) ? prev : s;
  if (dom.scene !== 'B') { const c = camAt(dom, t); camera.fov = c.fov; camera.position.copy(c.p); camera.lookAt(c.q); camera.updateProjectionMatrix(); camera.updateMatrixWorld(); }
  drawScrims(t);
  if (dom.scene !== 'B') {
    const xa = fade(t, 34.0, 37.0, 0.3, 0.4);
    if (xa > 0) { const p = project(onGround(C.Xpt, 1)); const sc = eback(prog(t, 34.0, 34.5)); ctx.save(); ctx.globalAlpha = xa; ctx.translate(p.x, p.y); ctx.scale(sc, sc);
      ctx.fillStyle = 'rgba(120,12,14,0.55)'; ctx.beginPath(); ctx.arc(0, 0, 40, 0, 7); ctx.fill(); ctx.strokeStyle = '#ff6b5e'; ctx.lineWidth = 3; ctx.stroke();
      ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-17, -17); ctx.lineTo(17, 17); ctx.moveTo(17, -17); ctx.lineTo(-17, 17); ctx.stroke(); ctx.restore(); }
    LABELS.forEach(l => drawLabel(l, t));
  }
  TITLES.forEach(o => drawTitle(o, t));
  drawPlaques(t);
  // end fade
  const ef = sstep(62.3, 63.4, t); if (ef > 0) { ctx.fillStyle = `rgba(4,40,28,${ef})`; ctx.fillRect(0, 0, W, H); }
  const st = sstep(0, 0.35, t); if (st < 1) { ctx.fillStyle = `rgba(4,40,28,${1 - st})`; ctx.fillRect(0, 0, W, H); }
  drawCTA(t);
  drawSubs(t);
}

async function init() {
  console.log('init start', performance.now()|0);
  const faces = ['500 92px "Cormorant Garamond"', '600 92px "Cormorant Garamond"', 'italic 500 44px "Cormorant Garamond"', '400 40px "Be Vietnam Pro"', '500 25px "Be Vietnam Pro"', '600 25px "Be Vietnam Pro"', '300 25px "Be Vietnam Pro"'];
  for (const f of faces) await document.fonts.load(f, 'ĐđỏậàÀ Aa1');
  await document.fonts.ready; console.log('fonts', performance.now()|0);
  const T0 = performance.now(); const lg = m => console.log(m, ((performance.now() - T0) / 1000).toFixed(1));
  buildCourse(); lg('course'); buildProps(); lg('props'); C.grassA = buildGrass(32000, 'A'); C.grassR = buildGrass(15000, 'R'); buildClumps(); buildHills(); lg('grass'); buildScorecard(); lg('card');
  // warm-up compile
  for (const s of SHOTS) render3D(s, (s.t0 + s.t1) / 2);
  lg('warm');
  window.renderFrame = (t, q = 0.93) => { renderFrame(t); return out.toDataURL('image/jpeg', q); };
  window.camTest = (p, q, fov, t, extra = {}) => {
    const shot = Object.assign({ t0: t - 5, t1: t + 5, keys: [[p, q, fov], [p, q, fov]], shadow: 60, wsize: 1.2 }, extra);
    ctx.globalAlpha = 1; render3D(shot, t); ctx.drawImage(renderer.domElement, 0, 0, W, H);
    const c = camAt(shot, t); camera.fov = c.fov; camera.position.copy(c.p); camera.lookAt(c.q); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    drawScrims(t); LABELS.forEach(l => drawLabel(l, t)); TITLES.forEach(o => drawTitle(o, t)); drawSubs(t);
    return out.toDataURL('image/jpeg', 0.85);
  };
  window.prof = (t, opts = {}) => {
    const gl = renderer.getContext(); const px = new Uint8Array(4);
    const fin = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const sv = { sh: renderer.shadowMap.enabled, w: C.water.visible, tr: Object.values(C.treeMeshes).map(o => o.mesh.visible) };
    if (opts.noShadow) { sun.castShadow = false; }
    if (opts.noA2C !== undefined) scene.traverse(o => { if (o.material && o.material.alphaTest > 0) { o.material.alphaToCoverage = !opts.noA2C; o.material.needsUpdate = true; } });
    if (opts.noCardShadow !== undefined) C.treeMeshes.forEach(o => { if (!o.mesh.layers.isEnabled(1) || true) o.mesh.castShadow = !opts.noCardShadow; });
    if (opts.mapSize) { sun.shadow.map && sun.shadow.map.dispose(); sun.shadow.map = null; sun.shadow.mapSize.set(opts.mapSize, opts.mapSize); }
    if (opts.lowShadow) { sun.shadow.map && sun.shadow.map.dispose(); sun.shadow.map = null; sun.shadow.mapSize.set(2048, 2048); }
    if (opts.noWater) C.water.visible = false;
    if (opts.noTrees) Object.values(C.treeMeshes).forEach(o => o.mesh.visible = false);
    let i = SHOTS.findIndex(s => t >= s.t0 && t < s.t1); const s = SHOTS[i];
    fin(); let a = performance.now(); render3D(s, t); fin(); const r3 = performance.now() - a;
    a = performance.now(); ctx.drawImage(renderer.domElement, 0, 0, W, H); const di = performance.now() - a;
    a = performance.now(); const d = out.toDataURL('image/jpeg', 0.93); const enc = performance.now() - a;
    sun.castShadow = true; renderer.shadowMap.enabled = sv.sh; C.water.visible = sv.w; Object.values(C.treeMeshes).forEach((o, k) => o.mesh.visible = sv.tr[k]);
    return { r3: r3 | 0, di: di | 0, enc: enc | 0, tris: renderer.info.render.triangles, calls: renderer.info.render.calls, trees: Object.values(C.treeMeshes).map(o => o.list.length) };
  };
  window.ready = true;
}
init().catch(e => { console.error('INIT FAIL', e.stack || e); window.initError = String(e.stack || e); });
