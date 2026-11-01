# Cut the two TTgolf logos (Project files) to transparent PNGs used by bumper.js
# Usage: python3 logo_cut.py <flat_logo_white_bg.png> <glossy_logo_checker_bg.png>
#   -> logo_ttgolf_flat.png, logo_ttgolf_gloss.png (cropped to the logo + 12 px)
# Needs: pip install --break-system-packages "rembg[cpu]"; model isnet-general-use.onnx in ~/.u2net
#   (https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx)
# Note: the glossy logo's "transparent" checkerboard is baked into the pixels, so it must be cut like a photo.
import sys
from PIL import Image
from rembg import new_session, remove

s = new_session('isnet-general-use')
for src, out in [(sys.argv[1], 'logo_ttgolf_flat.png'), (sys.argv[2], 'logo_ttgolf_gloss.png')]:
    im = Image.open(src).convert('RGB')
    m = remove(im, session=s, only_mask=True).convert('L')
    im.putalpha(m)
    bb = m.point(lambda v: 255 if v > 8 else 0).getbbox()
    bb = (max(0, bb[0] - 12), max(0, bb[1] - 12), min(im.size[0], bb[2] + 12), min(im.size[1], bb[3] + 12))
    im.crop(bb).save(out)
    print(out, im.crop(bb).size)
