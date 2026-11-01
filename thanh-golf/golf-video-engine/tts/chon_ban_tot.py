# Chọn bản đọc tốt nhất cho từng câu (chạy sau make_tts.py, trước assemble.py).
# Giọng piper có yếu tố ngẫu nhiên: cùng một câu, mỗi lần tạo đọc hơi khác. Script nhận dạng lại từng câu
# bằng ASR; câu nào lệch so với `tts` thì tạo lại tối đa N lần và giữ bản khớp nhất (ghi đè wav/lXX.wav, durs.json).
# So sánh bỏ qua các khác biệt do giọng Bắc của ASR: tr=ch, d=r=gi, s=x, i=y; "b" (ASR) = "bê".
# Dùng: python3 chon_ban_tot.py [tốc_độ=0.97] [N=5] [câu=0,3,12 – mặc định tất cả]
import json, os, re, sys, wave, numpy as np, sherpa_onnx, unicodedata

D = os.path.dirname(os.path.abspath(__file__))
M = os.path.join(D, 'vits-piper-vi_VN-vais1000-medium')
A = os.path.join(D, 'sherpa-onnx-zipformer-vi-int8-2025-04-20')
speed = float(sys.argv[1]) if len(sys.argv) > 1 else 0.97
N = int(sys.argv[2]) if len(sys.argv) > 2 else 5
ONLY = {int(x) for x in sys.argv[3].split(',')} if len(sys.argv) > 3 else None

tts = sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
    vits=sherpa_onnx.OfflineTtsVitsModelConfig(model=f'{M}/vi_VN-vais1000-medium.onnx', tokens=f'{M}/tokens.txt',
                                               data_dir=f'{M}/espeak-ng-data', noise_scale=0.55, noise_scale_w=0.7, length_scale=1.0),
    num_threads=2), max_num_sentences=1))   # cùng cấu hình với make_tts.py
rec = sherpa_onnx.OfflineRecognizer.from_transducer(
    encoder=f'{A}/encoder-epoch-12-avg-8.int8.onnx', decoder=f'{A}/decoder-epoch-12-avg-8.onnx',
    joiner=f'{A}/joiner-epoch-12-avg-8.int8.onnx', tokens=f'{A}/tokens.txt', num_threads=2)

def norm(s):
    out = []
    for w in re.sub(r"[^\w\s]", " ", s.lower()).split():
        w = unicodedata.normalize('NFC', w)
        if w == 'b': w = 'bê'
        w = re.sub(r'^tr', 'ch', w); w = re.sub(r'^(gi|r)', 'd', w); w = re.sub(r'^s', 'x', w)
        w = w.replace('kì', 'kỳ').replace('y', 'i')
        out.append(w)
    return out

def errors(ref, hyp):                      # khoảng cách sửa (theo âm tiết)
    r, h = norm(ref), norm(hyp)
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev, d[j] = d[j], cur
    return d[len(h)]

def asr(s, sr):
    st = rec.create_stream(); st.accept_waveform(sr, s); rec.decode_stream(st); return st.result.text.lower()

def gen(text, sp):                         # giống make_tts.py: tạo rồi cắt lặng đầu/cuối
    a = tts.generate(text, sid=0, speed=sp); s = np.array(a.samples, dtype=np.float32)
    idx = np.where(np.abs(s) > 0.012)[0]
    if len(idx): s = s[max(0, idx[0] - 400): min(len(s), idx[-1] + 1600)]
    return np.round(np.clip(s, -1, 1) * 32767) / 32767, a.sample_rate   # lượng tử hoá như khi ghi wav để ASR chấm đúng bản lưu

lines = json.load(open(os.path.join(D, 'lines.json'), encoding='utf-8'))
durs = json.load(open(os.path.join(D, 'durs.json')))
report = []
for i, ln in enumerate(lines):
    if ONLY is not None and i not in ONLY: continue
    fn = os.path.join(D, 'wav', f'l{i:02d}.wav')
    with wave.open(fn) as w:
        sr = w.getframerate(); s = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
    best = (errors(ln['tts'], h := asr(s, sr)), s, sr, h); tries = 1
    while best[0] > 0 and tries < N:
        s2, sr2 = gen(ln['tts'], speed * ln.get('speed', 1.0)); h2 = asr(s2, sr2); tries += 1
        if errors(ln['tts'], h2) < best[0]: best = (errors(ln['tts'], h2), s2, sr2, h2)
    e, s, sr, h = best
    with wave.open(fn, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((np.clip(s, -1, 1) * 32767).astype(np.int16).tobytes())
    durs[i]['dur'] = round(len(s) / sr, 3)
    report.append({'i': i, 'loi': e, 'lan_tao': tries, 'tts': ln['tts'], 'asr': h})
    print(f"{'OK' if e == 0 else f'{e} lệch':>6}  lần {tries}  {i:02d} {h}")
json.dump(durs, open(os.path.join(D, 'durs.json'), 'w'))
RP = os.path.join(D, 'asr_report.json')         # chạy riêng vài câu thì gộp vào báo cáo cũ
if ONLY is not None and os.path.exists(RP):
    old = {r['i']: r for r in json.load(open(RP, encoding='utf-8'))}; old.update({r['i']: r for r in report})
    report = [old[k] for k in sorted(old)]
json.dump(report, open(RP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
bad = [r for r in report if r['loi']]
print(f"\n{len(report) - len(bad)}/{len(report)} câu ASR khớp hoàn toàn." +
      ("" if not bad else " Câu còn lệch (nghe lại, thường do ASR nghe nhầm dấu thanh): " + ", ".join(str(r['i']) for r in bad)))
