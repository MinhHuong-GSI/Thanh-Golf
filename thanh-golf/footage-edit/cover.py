import sys, numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import stage2
W, H = 1080, 1920
t = float(sys.argv[1]); out = sys.argv[2]
n = int(round(t * 30)); frames = {}
for i in stage2.active(n):
    r = stage2.Reader(i, n); frames[i] = r.get(n).copy(); r.close()
x = stage2.compose(n, frames)
img = Image.fromarray((x * 255 + 0.5).astype(np.uint8)).convert('RGBA')
# soft emerald shade at the top for legibility
yy = np.arange(H, dtype=np.float32)[:, None]
a = (np.clip(1 - yy / 760, 0, 1) ** 1.6 * 0.62 * 255).astype(np.uint8)
shade = Image.new('RGBA', (W, H), (4, 40, 28, 0)); shade.putalpha(Image.fromarray(np.repeat(a, W, 1)))
img = Image.alpha_composite(img, shade)
GOLD_L = (232, 210, 154); GOLD = (201, 165, 92); CREAM = (246, 241, 230)
kick = ImageFont.truetype('fonts/BeVietnamPro-Medium.ttf', 30)
serif = ImageFont.truetype('fonts/CormorantGaramond.ttf', 116); serif.set_variation_by_axes([500])
sub = ImageFont.truetype('fonts/BeVietnamPro-Light.ttf', 38)
txt = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(txt)
def spaced(y, s, font, fill, sp):
    w = sum(d.textlength(ch, font=font) for ch in s) + sp * (len(s) - 1); x0 = W / 2 - w / 2
    for ch in s:
        d.text((x0, y), ch, font=font, fill=fill, anchor='ls'); x0 += d.textlength(ch, font=font) + sp
wk = sum(d.textlength(ch, font=kick) for ch in 'TTGOLF') + 9 * 5
wr = sum(d.textlength(ch, font=kick) for ch in 'NGÀY ĐẦU THÁNG 11') + 9 * 16
gap = 64; tot = wk + gap + wr; x0 = W / 2 - tot / 2
def spaced_at(x, y, s, font, fill, sp):
    for ch in s:
        d.text((x, y), ch, font=font, fill=fill, anchor='ls'); x += d.textlength(ch, font=font) + sp
spaced_at(x0, 222, 'TTGOLF', kick, GOLD_L + (255,), 9)
cx = x0 + wk + gap / 2; cy = 211
d.polygon([(cx, cy - 8), (cx + 8, cy), (cx, cy + 8), (cx - 8, cy)], fill=GOLD_L + (255,))
spaced_at(x0 + wk + gap, 222, 'NGÀY ĐẦU THÁNG 11', kick, GOLD_L + (255,), 9)
d.text((W / 2, 362), 'Chào buổi sáng', font=serif, fill=CREAM + (255,), anchor='ms')
d.text((W / 2, 478), 'tháng mới bình yên', font=serif, fill=CREAM + (255,), anchor='ms')
d.rectangle([W / 2 - 70, 526, W / 2 + 70, 528], fill=GOLD + (255,))
d.text((W / 2, 600), 'Sống chậm lại một chút, thương mình nhiều hơn', font=sub, fill=CREAM + (235,), anchor='ms')
sh = txt.copy().filter(ImageFilter.GaussianBlur(6)); shp = np.asarray(sh).copy(); shp[..., :3] = 0; shp[..., 3] = (shp[..., 3] * 0.55).astype(np.uint8)
img = Image.alpha_composite(img, Image.fromarray(shp)); img = Image.alpha_composite(img, txt)
img.convert('RGB').save(out, quality=93)
print(out)
