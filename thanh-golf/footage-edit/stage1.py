"""Stage 1: per shot – decode 4K HLG source, tonemap + sunrise LUT, retime (slow/fast/ramp), Ken-Burns zoom.
Writes shots/shot_XX.mp4 (1080x1920, 30 fps, near-lossless) + shots/shot_XX.json. Resumable: skips finished shots."""
import sys, os, json, subprocess, math, time
import numpy as np, cv2
import edl

W, H = 1080, 1920
DW, DH = 1296, 2304          # decode size (1.2x headroom for zoom)
SRCFPS = 60.0
os.makedirs('shots', exist_ok=True)


def ease(x):
    x = min(1.0, max(0.0, x)); return 0.5 - 0.5 * math.cos(math.pi * x)


def decoder(clip, start, dur):
    vf = (f"scale=2304:1296:flags=bicubic,"
          f"zscale=tin=arib-std-b67:min=bt2020nc:pin=bt2020:t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,"
          f"tonemap=reinhard:param=0.6:desat=0,zscale=t=bt709:m=bt709:r=pc,format=rgb48le,"
          f"lut3d=file=luts/{clip}.cube:interp=tetrahedral,transpose=clock,format=rgb24")
    cmd = ['ffmpeg', '-v', 'error', '-noautorotate', '-ss', f'{start:.4f}', '-i', f'{clip}.mov', '-t', f'{dur:.4f}',
           '-an', '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
    return subprocess.Popen(cmd, stdout=subprocess.PIPE, bufsize=DW * DH * 3 * 2)


def encoder(path):
    cmd = ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', '30', '-i', '-',
           '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '9', '-pix_fmt', 'yuv444p', path]
    return subprocess.Popen(cmd, stdin=subprocess.PIPE)


def render_shot(i):
    s = edl.SHOTS[i]
    out = f'shots/shot_{i+1:02d}.mp4'; meta = f'shots/shot_{i+1:02d}.json'
    if os.path.exists(meta):
        print('skip', out); return
    a, b = edl.extent(i)
    n0, n1 = math.ceil(a * edl.FPS - 1e-6), math.floor(b * edl.FPS + 1e-6)
    n1 = min(n1, edl.NFRAMES - 1)
    times = [n / edl.FPS for n in range(n0, n1 + 1)]
    srct = [edl.src_time(i, t) for t in times]
    dec_start = max(0.0, srct[0] - 0.02)
    dec_dur = srct[-1] - dec_start + 0.1
    dec = decoder(s['c'], dec_start, dec_dur)
    enc = encoder(out + '.tmp.mp4')
    fsz = DW * DH * 3
    buf = [None, None]; idx = -1         # buf[0] = frame idx-1, buf[1] = frame idx

    def read_next():
        nonlocal idx
        raw = dec.stdout.read(fsz)
        if len(raw) < fsz:
            return False
        buf[0] = buf[1]; buf[1] = np.frombuffer(raw, np.uint8).reshape(DH, DW, 3); idx += 1
        return True

    z0, z1 = s['z']; cy = s.get('cy', 0.5); cx = s.get('cx', 0.5)
    T0 = time.time()
    for k, (t, st) in enumerate(zip(times, srct)):
        fpos = (st - dec_start) * SRCFPS
        step = abs((srct[min(k + 1, len(srct) - 1)] - srct[max(k - 1, 0)]) / (2 if 0 < k < len(srct) - 1 else 1)) * SRCFPS
        need = math.floor(fpos) + 1 if step < 1.6 else round(fpos)
        while idx < need:
            if not read_next(): break
        if step < 1.6 and buf[0] is not None and idx == math.floor(fpos) + 1:
            w = fpos - math.floor(fpos)
            fr = cv2.addWeighted(buf[0], 1 - w, buf[1], w, 0) if w > 0.02 else buf[0]
        else:
            fr = buf[1]
        # Ken Burns
        z = z0 + (z1 - z0) * ease((t - a) / max(1e-6, (b - a)))
        cw, ch = DW / z, DH / z
        cxp = min(max(DW * cx, cw / 2), DW - cw / 2); cyp = min(max(DH * cy, ch / 2), DH - ch / 2)
        sc = W / cw
        M = np.float32([[sc, 0, -(cxp - cw / 2) * sc], [0, sc, -(cyp - ch / 2) * sc]])
        o = cv2.warpAffine(fr, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
        enc.stdin.write(o.tobytes())
    enc.stdin.close(); enc.wait(); dec.stdout.close(); dec.kill(); dec.wait()
    os.replace(out + '.tmp.mp4', out)
    json.dump(dict(n0=n0, n1=n1, clip=s['c'], decoded=idx + 1, secs=round(time.time() - T0, 1)), open(meta, 'w'))
    print(f'shot {i+1:02d}: frames {n0}-{n1} ({n1-n0+1}), decoded {idx+1}, {time.time()-T0:.0f}s', flush=True)


if __name__ == '__main__':
    ids = [int(x) - 1 for x in sys.argv[1:]] or range(len(edl.SHOTS))
    for i in ids:
        render_shot(i)
