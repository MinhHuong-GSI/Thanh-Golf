"""Stage 2: dissolves, mood, sunrise finish (glow/bloom/vignette/grain), light leak, TTGolf logo intro/outro, subtitles.
Usage: python3 stage2.py full            -> out/video_subs.mp4 + out/video_clean.mp4 (no audio)
       python3 stage2.py preview t1 t2.. -> previews/p_<t>.jpg (with subtitles)"""
import sys, os, json, subprocess, math, time
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import edl, grade
from subs import SUBS

W, H = 1080, 1920
FPS = edl.FPS
CREAM = (246, 241, 230); GOLD = (201, 165, 92); EMER_D = (4, 40, 28)
FONT_SUB = 'fonts/BeVietnamPro-Regular.ttf'


def sstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- shot access
META = []
for i in range(len(edl.SHOTS)):
    p = f'shots/shot_{i+1:02d}.json'
    META.append(json.load(open(p)) if os.path.exists(p) else None)


class Reader:
    def __init__(self, i, start_n):
        m = META[i]; self.i = i; self.n0 = m['n0']; self.n1 = m['n1']
        off = (start_n - self.n0) / FPS
        cmd = ['ffmpeg', '-v', 'error']
        if off > 0: cmd += ['-ss', f'{off:.4f}']
        cmd += ['-i', f'shots/shot_{i+1:02d}.mp4', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
        self.p = subprocess.Popen(cmd, stdout=subprocess.PIPE, bufsize=W * H * 3 * 2)
        self.cur = start_n - 1; self.frame = None

    def get(self, n):
        while self.cur < n:
            raw = self.p.stdout.read(W * H * 3)
            if len(raw) < W * H * 3: break
            self.frame = np.frombuffer(raw, np.uint8).reshape(H, W, 3); self.cur += 1
        return self.frame

    def close(self):
        self.p.stdout.close(); self.p.kill(); self.p.wait()


def active(n):
    return [i for i, m in enumerate(META) if m and m['n0'] <= n <= m['n1']]


MOOD = {'warm': dict(glow=1.0, sat=1.0, tint=(1.0, 1.0, 1.0)),
        'leak': dict(glow=1.08, sat=1.02, tint=(1.01, 1.0, 0.985)),
        'cool': dict(glow=0.55, sat=0.86, tint=(0.975, 0.995, 1.03))}


def mood_adjust(x, mood):
    m = MOOD[mood]
    if mood == 'warm': return x
    L = grade.luma(x)[..., None]
    x = L + (x - L) * m['sat']
    return x * np.array(m['tint'], np.float32)


# ---------------------------------------------------------------- light leak (turning point at B[7])
_yy, _xx = np.mgrid[0:H, 0:W].astype(np.float32)
def light_leak(t):
    tc = edl.B[7] + 0.10
    env = math.exp(-((t - tc) / 0.55) ** 2)
    if env < 0.01: return None
    px = W * (1.15 - 0.9 * sstep(tc - 1.0, tc + 1.0, t)); py = H * 0.22
    d = ((_xx - px) / (W * 0.75)) ** 2 + ((_yy - py) / (H * 0.55)) ** 2
    g = np.exp(-d * 1.6)[..., None] * np.array([1.0, 0.72, 0.46], np.float32) * 0.55 * env
    return g


# ---------------------------------------------------------------- logos
def load_rgba(p):
    im = cv2.imread(p, cv2.IMREAD_UNCHANGED); im = cv2.cvtColor(im, cv2.COLOR_BGRA2RGBA)
    return im.astype(np.float32) / 255

LOGO_G = load_rgba('logo/logo_ttgolf_gloss.png')
LOGO_F = load_rgba('logo/logo_ttgolf_flat.png')


def paste(x, rgba, cx, cy, width, alpha, shadow=0.0, sweep=None):
    h = int(round(width * rgba.shape[0] / rgba.shape[1])); w = int(round(width))
    im = cv2.resize(rgba, (w, h), interpolation=cv2.INTER_AREA)
    x0 = int(round(cx - w / 2)); y0 = int(round(cy - h / 2))
    a = im[..., 3:4] * alpha; rgb = im[..., :3]
    if sweep is not None:   # gold-white light sweep confined to the logo
        xs = np.arange(w, dtype=np.float32)[None, :]; ys = np.arange(h, dtype=np.float32)[:, None]
        sx = -0.3 * w + 1.6 * w * sweep
        band = np.exp(-(((xs + ys * 0.35) - sx) / (0.12 * w)) ** 2)[..., None]
        rgb = np.clip(rgb + band * 0.55 * np.array([1.0, 0.97, 0.88], np.float32), 0, 1)
    if shadow > 0:
        sh = cv2.GaussianBlur(im[..., 3], (0, 0), 26) * alpha * shadow
        sy, sx2 = y0 + 14, x0
        _blend_dark(x, sh, sx2, sy)
    region = x[y0:y0 + h, x0:x0 + w]
    region[:] = region * (1 - a) + rgb * a


def _blend_dark(x, m, x0, y0):
    h, w = m.shape
    r = x[y0:y0 + h, x0:x0 + w]
    r[:] = r * (1 - m[..., None] * 0.55) + m[..., None] * 0.55 * np.array([0.10, 0.07, 0.03], np.float32)


def intro_logo(x, t):
    if t > 3.05: return
    a = sstep(0.15, 0.85, t) * (1 - sstep(2.35, 3.0, t))
    if a <= 0.001: return
    sc = 0.94 + 0.06 * sstep(0.15, 1.6, t)
    sw = (t - 0.9) / 0.9 if 0.9 < t < 1.8 else None
    paste(x, LOGO_G, W / 2, 470 - (1 - sstep(0.15, 0.85, t)) * 14, 560 * sc, a, shadow=0.28, sweep=sw)


OUT_T0 = 68.30
_card = None
def outro(x, t):
    global _card
    if t < OUT_T0: return x
    k = sstep(OUT_T0, OUT_T0 + 0.8, t)
    # soften the footage, then cream card veil
    small = cv2.resize(x, (W // 6, H // 6), interpolation=cv2.INTER_AREA)
    bl = cv2.resize(cv2.GaussianBlur(small, (0, 0), 3), (W, H), interpolation=cv2.INTER_LINEAR)
    x = x * (1 - k * 0.8) + bl * (k * 0.8)
    if _card is None:
        yy, xx = _yy / H, _xx / W
        r = np.sqrt((xx - 0.5) ** 2 + ((yy - 0.45) * 0.62) ** 2)
        c0 = np.array([252, 249, 242], np.float32) / 255; c1 = np.array([233, 223, 200], np.float32) / 255
        _card = c0 + (c1 - c0) * np.clip(r / 0.62, 0, 1)[..., None]
    x = x * (1 - k * 0.86) + _card * (k * 0.86)
    # double gold frame drawing in
    fr = sstep(OUT_T0 + 0.3, OUT_T0 + 1.3, t)
    if fr > 0:
        g = np.array(GOLD, np.float32) / 255
        for (m, th, al) in [(46, 2, 1.0), (60, 1, 0.55)]:
            a = fr * al
            for (ys, ye, xs, xe) in [(m, m + th, m, W - m), (H - m - th, H - m, m, W - m), (m, H - m, m, m + th), (m, H - m, W - m - th, W - m)]:
                x[ys:ye, xs:xe] = x[ys:ye, xs:xe] * (1 - a) + g * a
    la = sstep(OUT_T0 + 0.35, OUT_T0 + 1.1, t)
    if la > 0:
        sc = 0.94 + 0.06 * sstep(OUT_T0 + 0.35, OUT_T0 + 1.8, t)
        sw = (t - OUT_T0 - 1.1) / 0.9 if OUT_T0 + 1.1 < t < OUT_T0 + 2.0 else None
        paste(x, LOGO_F, W / 2, 880 - (1 - la) * 14, 640 * sc, la, shadow=0.25, sweep=sw)
        rw = int(70 * sstep(OUT_T0 + 0.8, OUT_T0 + 1.6, t))
        if rw > 0:
            g = np.array(GOLD, np.float32) / 255
            x[880 + 300:880 + 302, W // 2 - rw:W // 2 + rw] = g
    return x


# ---------------------------------------------------------------- subtitles (pre-rendered RGBA)
_font = ImageFont.truetype(FONT_SUB, 48)
def wrap(text, maxw=940):
    if '|' in text: return text.split('|')
    words = text.split(); d = ImageDraw.Draw(Image.new('L', (10, 10)))
    full = d.textlength(text, font=_font)
    if full <= maxw: return [text]
    best = None
    for k in range(1, len(words)):
        a, b = ' '.join(words[:k]), ' '.join(words[k:])
        wa, wb = d.textlength(a, font=_font), d.textlength(b, font=_font)
        if wa <= maxw and wb <= maxw:
            score = abs(wa - wb) + (0 if wa <= wb + 40 else 30)   # prefer top line not longer
            if best is None or score < best[0]: best = (score, [a, b])
    return best[1] if best else [text]


def render_sub(text):
    lines = wrap(text); lh = 66
    base = 1548 - (len(lines) - 1) * lh       # baseline of first line
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    widths = [d.textlength(l, font=_font) for l in lines]
    asc, desc = _font.getmetrics()
    top = base - asc + 4; bot = base + (len(lines) - 1) * lh + desc - 2
    bw = max(widths) + 64
    # soft dark backing
    back = Image.new('L', (W, H), 0); bd = ImageDraw.Draw(back)
    bd.rounded_rectangle([W / 2 - bw / 2 + 10, top - 14, W / 2 + bw / 2 - 10, bot + 14], radius=44, fill=128)
    back = back.filter(ImageFilter.GaussianBlur(24))
    bk = Image.new('RGBA', (W, H), EMER_D + (0,)); bk.putalpha(back)
    img = Image.alpha_composite(img, bk)
    # text shadow
    sh = Image.new('RGBA', (W, H), (0, 0, 0, 0)); sd = ImageDraw.Draw(sh)
    for k, l in enumerate(lines):
        sd.text((W / 2, base + k * lh + 2), l, font=_font, fill=(0, 0, 0, 170), anchor='ms')
    sh = sh.filter(ImageFilter.GaussianBlur(3))
    img = Image.alpha_composite(img, sh)
    d = ImageDraw.Draw(img)
    for k, l in enumerate(lines):
        d.text((W / 2, base + k * lh), l, font=_font, fill=CREAM + (255,), anchor='ms')
    arr = np.asarray(img).astype(np.float32) / 255
    ys = np.where(arr[..., 3].max(1) > 0.003)[0]
    y0, y1 = ys.min(), ys.max() + 1
    return (y0, arr[y0:y1])


_subcache = {}
def subtitles(x, t):
    for (a, b, text) in SUBS:
        if a - 0.15 <= t <= b + 0.15:
            al = sstep(a - 0.06, a + 0.12, t) * (1 - sstep(b - 0.05, b + 0.13, t))
            if al <= 0: continue
            if text not in _subcache: _subcache[text] = render_sub(text)
            y0, s = _subcache[text]
            r = x[y0:y0 + s.shape[0]]
            aa = s[..., 3:4] * al
            r[:] = r * (1 - aa) + s[..., :3] * aa
    return x


# ---------------------------------------------------------------- compose one frame
def compose(n, frames):
    """frames: dict shot_index -> uint8 frame (only active shots)."""
    t = n / FPS
    ids = sorted(frames)
    acc = None; glow = 0.0
    if len(ids) == 1:
        ws = {ids[0]: 1.0}
    else:
        a, b = ids[0], ids[1]           # b starts at boundary B[b]
        d = edl.xf(b); w = sstep(edl.B[b] - d / 2, edl.B[b] + d / 2, t + 0.5 / FPS)
        ws = {a: 1 - w, b: w}
    for i in ids:
        f = frames[i].astype(np.float32) / 255
        f = mood_adjust(f, edl.SHOTS[i]['mood'])
        acc = f * ws[i] if acc is None else acc + f * ws[i]
        glow += MOOD[edl.SHOTS[i]['mood']]['glow'] * ws[i]
    x = grade.finish(acc, t, seed=n, glow=glow, grain=0.014)
    lk = light_leak(t)
    if lk is not None: x = 1 - (1 - x) * (1 - lk)
    # no intro logo and no fade-in: frame 0 is the landscape itself (good thumbnail)
    x = outro(x, t)
    return np.clip(x, 0, 1)


def run_full():
    os.makedirs('out', exist_ok=True)
    encs = {}
    for name in ['subs', 'clean']:
        cmd = ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
               '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
               '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
               f'out/video_{name}.tmp.mp4']
        encs[name] = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    readers = {}
    T0 = time.time()
    for n in range(edl.NFRAMES):
        act = active(n)
        for i in list(readers):
            if i not in act: readers.pop(i).close()
        for i in act:
            if i not in readers: readers[i] = Reader(i, n)
        frames = {i: readers[i].get(n) for i in act}
        x = compose(n, frames)
        clean = (x * 255 + 0.5).astype(np.uint8)
        encs['clean'].stdin.write(clean.tobytes())
        xs = subtitles(x, n / FPS)
        encs['subs'].stdin.write((np.clip(xs, 0, 1) * 255 + 0.5).astype(np.uint8).tobytes())
        if n % 120 == 0:
            print(f'frame {n}/{edl.NFRAMES}  {time.time()-T0:.0f}s', flush=True)
    for r in readers.values(): r.close()
    for name, e in encs.items():
        e.stdin.close(); e.wait(); os.replace(f'out/video_{name}.tmp.mp4', f'out/video_{name}.mp4')
    print('done', time.time() - T0)


def run_preview(ts):
    os.makedirs('previews', exist_ok=True)
    for t in ts:
        n = int(round(t * FPS)); act = active(n)
        frames = {}
        for i in act:
            r = Reader(i, n); frames[i] = r.get(n).copy(); r.close()
        x = subtitles(compose(n, frames), n / FPS)
        cv2.imwrite(f'previews/p_{t:05.2f}.jpg', cv2.cvtColor((x * 255 + 0.5).astype(np.uint8), cv2.COLOR_RGB2BGR),
                    [cv2.IMWRITE_JPEG_QUALITY, 90])
        print('preview', t, act)


if __name__ == '__main__':
    if sys.argv[1] == 'full': run_full()
    else: run_preview([float(v) for v in sys.argv[2:]])
