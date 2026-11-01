"""Edit decision list: one shot per spoken phrase. Times in output seconds (audio = am_thanh_goc.mp3, 71.105 s)."""
FPS = 30
NFRAMES = 2134            # 71.133 s  (audio 71.105 s)
DUR = NFRAMES / FPS
CLIPDUR = {'c1': 28.70, 'c2': 24.82, 'c3': 20.11, 'c5': 7.18}

# boundaries between shots (placed in the pauses of the voice-over)
B = [0.0, 2.35, 5.65, 9.55, 15.80, 19.92, 23.02, 27.82, 32.78, 36.08, 39.22, 41.40,
     43.50, 47.00, 50.80, 52.55, 55.40, 58.98, 62.15, 65.62, DUR]

# dissolve length at each inner boundary (index i = boundary B[i])
XF = {1: 0.40, 10: 0.35}
XF_DEFAULT = 0.60

# clip, source time at the shot's start boundary, speed (const or knots [(t_rel, v), ...]),
# zoom from -> to, vertical centre (fraction of frame), mood, note
SHOTS = [
    dict(c='c3', ss=0.12, v=0.60, z=(1.16, 1.05), cy=0.50, mood='warm',  note='Chào buổi sáng – núi, sương trên hồ'),
    dict(c='c1', ss=1.05, v=1.00, z=(1.02, 1.12), cy=0.50, mood='warm',  note='háo hức – vòi phun tưới sân'),
    dict(c='c1', ss=8.00, v=0.65, z=(1.20, 1.10), cy=0.455, mood='warm',  note='cuối năm gõ cửa – hàng cây vàng nắng'),
    dict(c='c3', ss=10.05, v=[(0.0, 2.1), (2.6, 2.1), (3.9, 0.8), (99, 0.8)], z=(1.05, 1.11), cy=0.50, mood='warm',
         note='thời gian trôi – tua nhanh rồi chậm dần'),
    dict(c='c3', ss=3.00, v=0.50, z=(1.00, 1.09), cy=0.50, mood='cool',  note='chưa làm được – đảo cây đơn độc'),
    dict(c='c3', ss=7.05, v=0.45, z=(1.10, 1.04), cy=0.50, mood='cool',  note='ước mơ nằm im – mặt hồ phẳng lặng'),
    dict(c='c1', ss=11.65, v=0.50, z=(1.04, 1.12), cy=0.47, mood='cool', note='nỗi buồn chưa gọi tên – sương phủ'),
    dict(c='c2', ss=13.15, v=0.60, z=(1.14, 1.03), cy=0.50, mood='leak', note='không sao cả – trời hồng phản chiếu'),
    dict(c='c2', ss=21.00, v=0.75, z=(1.04, 1.15), cy=0.58, cx=0.62, mood='warm', note='chông chênh – gợn nước'),
    dict(c='c1', ss=15.05, v=0.60, z=(1.12, 1.04), cy=0.48, mood='warm', note='tử tế, yêu thương – ngọn cây đón nắng'),
    dict(c='c1', ss=24.55, v=1.00, z=(1.00, 1.17), cy=0.55, mood='warm', note='can đảm bước tiếp – fairway, đẩy máy tới'),
    dict(c='c5', ss=4.45, v=0.60, z=(1.10, 1.03), cy=0.52, mood='warm', note='điều đáng quý – đảo cây và bóng nước'),
    dict(c='c5', ss=0.20, v=0.55, z=(1.03, 1.12), cy=0.50, mood='warm', note='buổi sáng bình yên – hồ, núi'),
    dict(c='c1', ss=4.45, v=0.38, z=(1.16, 1.19), cy=0.435, mood='warm', note='sống chậm – quay chậm sương bay'),
    dict(c='c2', ss=3.55, v=0.60, z=(1.08, 1.03), cy=0.50, mood='warm', note='thương mình – một cây tròn'),
    dict(c='c2', ss=0.22, v=0.60, z=(1.03, 1.10), cy=0.50, mood='warm', note='người bên cạnh – hai cây song đôi'),
    dict(c='c5', ss=2.40, v=0.50, z=(1.15, 1.08), cy=0.47, mood='warm', note='tháng mới an lành – núi và hồ'),
    dict(c='c2', ss=4.95, v=0.75, z=(1.03, 1.11), cy=0.50, mood='warm', note='điều tốt đẹp sẽ đến – mở ra mặt hồ'),
    dict(c='c1', ss=19.40, v=0.70, z=(1.06, 1.16), cy=0.55, mood='warm', note='thành công – green, cờ'),
    dict(c='c2', ss=8.55, v=0.45, z=(1.16, 1.03), cy=0.50, mood='warm', note='bình yên – núi, hàng cây, sương (kết)'),
]
assert len(SHOTS) == len(B) - 1


def xf(i):
    if i <= 0 or i >= len(B) - 1:
        return 0.0
    return XF.get(i, XF_DEFAULT)


def extent(i):
    """output time range a shot must cover (including dissolve margins)"""
    return B[i] - xf(i) / 2, B[i + 1] + xf(i + 1) / 2


def speed_fn(v):
    if isinstance(v, (int, float)):
        return lambda tr: float(v)
    kn = v
    def f(tr):
        if tr <= kn[0][0]: return kn[0][1]
        for (a, va), (b, vb) in zip(kn, kn[1:]):
            if tr <= b:
                x = (tr - a) / (b - a); x = x * x * (3 - 2 * x)
                return va + (vb - va) * x
        return kn[-1][1]
    return f


def src_time(i, t, dt=1 / 600):
    """source time for output time t of shot i (integrates the speed curve from the boundary)."""
    s = SHOTS[i]; t0 = B[i]; f = speed_fn(s['v'])
    if t >= t0:
        n = int((t - t0) / dt); acc = 0.0; u = t0
        for _ in range(n): acc += f(u - t0) * dt; u += dt
        acc += f(u - t0) * (t - u)
    else:
        acc = -(t0 - t) * f(0.0)
    return s['ss'] + acc


if __name__ == '__main__':
    for i, s in enumerate(SHOTS):
        a, b = extent(i)
        sa, sb = src_time(i, a), src_time(i, b)
        ok = 0 <= sa and sb <= CLIPDUR[s['c']] - 0.04
        print(f"{i+1:2d} out {a:6.2f}-{b:6.2f} ({b-a:4.2f}s)  {s['c']} src {sa:6.2f}-{sb:6.2f}  {'OK ' if ok else 'BAD'} {s['note']}")
