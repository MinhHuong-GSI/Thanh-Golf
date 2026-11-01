import sys
from rembg import remove, new_session
from PIL import Image
src, dst, model = sys.argv[1], sys.argv[2], sys.argv[3]
im = Image.open(src).convert('RGB')
im = im.crop((0, 0, im.width, 958))
s = new_session(model)
out = remove(im, session=s, alpha_matting=True, alpha_matting_foreground_threshold=240, alpha_matting_background_threshold=12, alpha_matting_erode_size=8)
out.save(dst)
print(out.size)
