// TTgolf logo intro / outro (2D canvas, 1080x1920) — same render.js interface as the films.
// URL: bumper.html?m=intro|outro
//   intro : glossy logo, ends with a 0.4 s crossfade into the film's first frame (img=frames/f_00000.jpg)
//   outro : starts with a 0.4 s crossfade from the film's last frame (img=frames/f_01533.jpg),
//           flat logo + subtitle of the closing voice line (sub, s0 = voice start, s1 = end)
const Q = new URLSearchParams(location.search);
const MODE = Q.get('m') || 'intro';
const DUR = +(Q.get('dur') || (MODE === 'intro' ? 3.0 : 3.625));
const XF = 0.4;
const IMG = Q.get('img') || (MODE === 'intro' ? 'frames/f_00000.jpg' : 'frames/f_01533.jpg');
const LOGO = Q.get('logo') || (MODE === 'intro' ? 'logo_ttgolf_gloss.png' : 'logo_ttgolf_flat.png');
const SUB = Q.get('sub') ?? (MODE === 'outro' ? 'Hãy follow TTGolf để biết thêm\nnhiều kiến thức về golf nhé' : '');
const S0 = +(Q.get('s0') || 0.2), S1 = +(Q.get('s1') || 99);

const W = 1080, H = 1920;
const GOLD = '#C9A55C', GOLD_L = '#E8D29A', CREAM = '#F6F1E6', EMER = '#0B4733', EMER_D = '#04281C';
const cv = document.createElement('canvas'); cv.width = W; cv.height = H; document.body.appendChild(cv);
const ctx = cv.getContext('2d');
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const eout = x => 1 - Math.pow(1 - x, 3);
const sstep = (a, b, t) => { const x = prog(t, a, b); return x * x * (3 - 2 * x); };
function spaced(g, text, x, y, sp) { g.letterSpacing = sp + 'px'; g.fillText(text, x + (g.textAlign === 'center' ? sp / 2 : 0), y); g.letterSpacing = '0px'; }
const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('load ' + src)); i.src = src; });

// deterministic gold dust
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const DUST = Array.from({ length: 70 }, () => ({ x: rnd() * W, y: rnd() * H, r: 1 + rnd() * 2.8, v: 8 + rnd() * 22, ph: rnd() * 6.28, f: 0.6 + rnd() * 1.6, a: 0.25 + rnd() * 0.5 }));

let logo, img, lc;
function drawCard(t) {
  // warm ivory paper with a soft golden-hour glow
  let g = ctx.createRadialGradient(W * 0.5, H * 0.44, 60, W * 0.5, H * 0.5, H * 0.72);
  g.addColorStop(0, '#FCF9F2'); g.addColorStop(0.55, CREAM); g.addColorStop(1, '#E9DFC8');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W * 0.86, H * 0.12, 10, W * 0.86, H * 0.12, W * 0.9);
  g.addColorStop(0, 'rgba(232,210,154,0.30)'); g.addColorStop(1, 'rgba(232,210,154,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // double gold frame with diamonds (draws itself in)
  const fr = eout(prog(t, 0.05, 1.1));
  ctx.save(); ctx.globalAlpha = fr;
  ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.strokeRect(46, 46, W - 92, H - 92);
  ctx.strokeStyle = 'rgba(201,165,92,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(60, 60, W - 120, H - 120);
  for (const y of [46, H - 46]) {
    ctx.fillStyle = '#F4EEDF'; ctx.fillRect(W / 2 - 34, y - 4, 68, 8);
    ctx.fillStyle = GOLD; ctx.beginPath(); ctx.moveTo(W / 2, y - 10); ctx.lineTo(W / 2 + 10, y); ctx.lineTo(W / 2, y + 10); ctx.lineTo(W / 2 - 10, y); ctx.closePath(); ctx.fill();
    ctx.fillRect(W / 2 - 30, y - 1, 12, 2); ctx.fillRect(W / 2 + 18, y - 1, 12, 2);
  }
  ctx.restore();
  // gold dust
  for (const d of DUST) {
    const y = ((d.y - d.v * t) % H + H) % H, x = d.x + Math.sin(t * 0.7 + d.ph) * 10;
    const tw = 0.55 + 0.45 * Math.sin(t * d.f * 3 + d.ph);
    ctx.globalAlpha = d.a * tw * sstep(0, 0.6, t); ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.arc(x, y, d.r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function drawLogo(t) {
  const t0 = MODE === 'intro' ? 0.12 : 0.22;
  const a = eout(prog(t, t0, t0 + 0.75)); if (a <= 0) return;
  const sc = 0.93 + 0.07 * eout(prog(t, t0, t0 + 1.4));
  const maxW = MODE === 'intro' ? 800 : 690;
  const w = maxW * sc, h = w * logo.height / logo.width;
  const cy = 860 - (1 - a) * 14; const x = W / 2 - w / 2, y = cy - h / 2;
  // logo layer + gold light sweep confined to the logo
  const g2 = lc.getContext('2d'); g2.globalCompositeOperation = 'source-over'; g2.clearRect(0, 0, W, H);
  g2.globalCompositeOperation = 'source-over'; g2.drawImage(logo, x, y, w, h);
  const sw = prog(t, t0 + 0.75, t0 + 1.65);
  if (sw > 0 && sw < 1) {
    const sx = x - 300 + (w + 600) * sw;
    const gr = g2.createLinearGradient(sx - 140, y, sx + 140, y + h * 0.35);
    gr.addColorStop(0, 'rgba(255,248,225,0)'); gr.addColorStop(0.5, 'rgba(255,248,225,0.62)'); gr.addColorStop(1, 'rgba(255,248,225,0)');
    g2.globalCompositeOperation = 'source-atop'; g2.fillStyle = gr; g2.fillRect(x - 20, y - 20, w + 40, h + 40);
  }
  ctx.save(); ctx.globalAlpha = a;
  ctx.shadowColor = 'rgba(70,48,12,0.20)'; ctx.shadowBlur = 46; ctx.shadowOffsetY = 20;
  ctx.drawImage(lc, 0, 0); ctx.restore();
  // thin gold rule under the logo
  const rw = 70 * eout(prog(t, t0 + 0.45, t0 + 1.25));
  ctx.fillStyle = GOLD; ctx.fillRect(W / 2 - rw, cy + h / 2 + 64, rw * 2, 2);
}
function drawSub(t) {
  if (!SUB) return;
  const a = Math.min(sstep(S0 - 0.05, S0 + 0.15, t), 1 - sstep(S1 - 0.08, S1 + 0.05, t)); if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.font = '400 48px "Be Vietnam Pro"'; ctx.letterSpacing = '0.5px';
  const lines = SUB.split('\n'); const lh = 66; const base = 1548 - (lines.length - 1) * lh;
  ctx.fillStyle = EMER; lines.forEach((ln, i) => ctx.fillText(ln, W / 2, base + i * lh));
  ctx.restore();
}
function renderFrame(t) {
  drawCard(t); drawLogo(t); drawSub(t);
  // 0.4 s crossfade with the neighbouring film frame
  const k = MODE === 'intro' ? sstep(DUR - XF, DUR, t + 1 / 24) : 1 - sstep(0, XF, t + 1 / 24);
  if (k > 0) { ctx.globalAlpha = k; ctx.drawImage(img, 0, 0, W, H); ctx.globalAlpha = 1; }
}
(async () => {
  try {
    for (const f of ['400 48px "Be Vietnam Pro"', '500 25px "Be Vietnam Pro"']) await document.fonts.load(f, 'ĐđỏậàÀ Aa1');
    await document.fonts.ready;
    [logo, img] = await Promise.all([load(LOGO), load(IMG)]);
    lc = document.createElement('canvas'); lc.width = W; lc.height = H;
    window.renderFrame = (t, q = 0.93) => { renderFrame(t); return cv.toDataURL('image/jpeg', q); };
    window.ready = true;
  } catch (e) { window.initError = String(e); }
})();
