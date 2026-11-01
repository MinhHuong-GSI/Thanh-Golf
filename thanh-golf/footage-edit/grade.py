"""Sunrise grade: color part (baked into a .cube LUT for ffmpeg) + spatial finish (glow, bloom, vignette, grain)."""
import numpy as np, cv2

def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

def luma(x):
    return x[..., 0] * 0.2126 + x[..., 1] * 0.7152 + x[..., 2] * 0.0722

# per-clip white-balance / exposure trims (c3, c5 were shot cooler & bluer)
CLIP = {
    'c1': dict(wb=(1.00, 0.985, 0.99), exp=0.97, sat=0.90),
    'c2': dict(wb=(1.02, 0.99, 0.97), exp=0.98, sat=0.94),
    'c3': dict(wb=(1.05, 1.00, 0.93), exp=0.98, sat=0.92),
    'c5': dict(wb=(1.05, 1.00, 0.93), exp=0.98, sat=0.92),
}

def color_grade(x, clip='c1'):
    """x: float RGB 0..1 (display-referred SDR). Pure per-pixel colour transform."""
    p = CLIP[clip]
    x = x * np.array(p['wb'], np.float32) * p['exp']
    x = np.clip(x, 0, 1.2)
    L = luma(x)[..., None]
    # gentle filmic tone curve: lifted toe, soft shoulder
    def curve(v):
        v = np.clip(v, 0, 1.0)
        s = v + 0.10 * np.sin(2 * np.pi * v) / (2 * np.pi) * -1.0  # mild S (deeper shadows, brighter mids-high)
        s = v + (v - s) * 0.0 + (s - v)
        s = np.clip(s, 0, 1)
        return 0.018 + 0.962 * s
    x = curve(x)
    L = luma(x)[..., None]
    # saturation: keep warm hues, calm the greens/blues slightly
    x = L + (x - L) * p['sat']
    # split tone: shadows -> soft blue-teal, highlights -> peach gold
    sh = (1 - smooth(0.05, 0.55, L))
    hi = smooth(0.45, 1.0, L)
    x = x + sh * np.array([-0.012, 0.004, 0.022], np.float32) + hi * np.array([0.032, 0.004, -0.030], np.float32)
    # mid-tone warmth (sunrise)
    mid = smooth(0.15, 0.5, L) * (1 - smooth(0.6, 0.95, L))
    x = x + mid * np.array([0.016, 0.002, -0.010], np.float32)
    # green -> slightly olive/gold (avoid neon greens)
    g_dom = np.clip((x[..., 1:2] - np.maximum(x[..., 0:1], x[..., 2:3])) * 2.0, 0, 1)
    x = x + g_dom * np.array([0.012, -0.010, 0.000], np.float32)
    # highlights never pure white: cream ceiling
    x = np.minimum(x, np.array([0.99, 0.975, 0.945], np.float32))
    return np.clip(x, 0, 1)

def write_cube(path, clip, n=33):
    r = np.linspace(0, 1, n, dtype=np.float32)
    B, G, R = np.meshgrid(r, r, r, indexing='ij')  # cube order: R fastest
    grid = np.stack([R, G, B], -1).reshape(-1, 3)
    out = color_grade(grid.reshape(1, -1, 3), clip).reshape(-1, 3)
    with open(path, 'w') as f:
        f.write(f'TITLE "sunrise_{clip}"\nLUT_3D_SIZE {n}\n')
        for v in out: f.write(f'{v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n')

# ---------------- spatial finish (applied per output frame, 1080x1920) ----------------
_cache = {}
def _maps(h, w):
    k = (h, w)
    if k in _cache: return _cache[k]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xx / w, yy / h
    # sunrise light from upper right, off-frame
    d = np.sqrt(((u - 0.92) / 1.0) ** 2 + ((v + 0.05) / 0.75) ** 2)
    sun = np.exp(-(d ** 2) / 0.22)[..., None]
    # warm horizon haze band (upper-middle)
    band = np.exp(-((v - 0.36) ** 2) / 0.02)[..., None]
    r = np.sqrt((u - 0.5) ** 2 * 1.0 + (v - 0.47) ** 2 * 0.55)
    vig = (1 - 0.26 * smooth(0.32, 0.80, r))[..., None]
    _cache[k] = (sun, band, vig)
    return _cache[k]

SUN = np.array([1.00, 0.74, 0.52], np.float32)
HAZE = np.array([1.00, 0.80, 0.74], np.float32)

def finish(x, t=0.0, seed=0, glow=1.0, grain=0.018):
    """x: float32 RGB 0..1, HxWx3"""
    h, w = x.shape[:2]
    sun, band, vig = _maps(h, w)
    # screen-blend warm sun glow + soft haze
    g = np.clip(sun * 0.15 * glow, 0, 1) * SUN + np.clip(band * 0.035 * glow, 0, 1) * HAZE
    x = 1 - (1 - x) * (1 - g)
    # bloom: blurred highlights, added softly
    small = cv2.resize(x, (w // 8, h // 8), interpolation=cv2.INTER_AREA)
    hl = np.clip(small - 0.72, 0, 1) * 1.8
    hl = cv2.GaussianBlur(hl, (0, 0), 9)
    bl = cv2.resize(hl, (w, h), interpolation=cv2.INTER_LINEAR)
    x = 1 - (1 - x) * (1 - np.clip(bl * np.array([1.0, 0.9, 0.75], np.float32) * 0.30 * glow, 0, 1))
    x = x * vig
    if grain > 0:
        rng = np.random.default_rng(seed)
        nz = rng.standard_normal((h // 2, w // 2), dtype=np.float32)
        nz = cv2.resize(nz, (w, h), interpolation=cv2.INTER_LINEAR)[..., None]
        L = luma(x)[..., None]
        x = x + nz * grain * (0.5 + 0.5 * (1 - np.abs(L - 0.5) * 2))
    return np.clip(x, 0, 1)

if __name__ == '__main__':
    import sys, glob, os
    files = sorted(glob.glob('base/*.png'))
    tiles = []
    for f in files:
        clip = os.path.basename(f).split('_')[0]
        im = cv2.cvtColor(cv2.imread(f), cv2.COLOR_BGR2RGB).astype(np.float32) / 255
        g = finish(color_grade(im, clip), grain=0.012)
        a = cv2.resize(im, (270, 480)); b = cv2.resize(g, (270, 480))
        tiles.append(np.concatenate([a, b], 0))
    row1 = np.concatenate(tiles[:6], 1); row2 = np.concatenate(tiles[6:12], 1)
    out = np.concatenate([row1, row2], 0)
    cv2.imwrite('sheets/grade_test.jpg', cv2.cvtColor((out * 255).astype(np.uint8), cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 88])
    print(out.shape)
