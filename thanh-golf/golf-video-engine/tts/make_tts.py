# Generate the Vietnamese narration sentence by sentence (offline, sherpa-onnx + piper vi_VN-vais1000-medium)
import json, sys, wave, numpy as np, sherpa_onnx, os
D = os.path.dirname(os.path.abspath(__file__))
M = os.path.join(D, 'vits-piper-vi_VN-vais1000-medium')
cfg = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
    vits=sherpa_onnx.OfflineTtsVitsModelConfig(model=f'{M}/vi_VN-vais1000-medium.onnx', tokens=f'{M}/tokens.txt',
                                               data_dir=f'{M}/espeak-ng-data', noise_scale=0.55, noise_scale_w=0.7, length_scale=1.0),
    num_threads=2), max_num_sentences=1)
tts = sherpa_onnx.OfflineTts(cfg)
lines = json.load(open(os.path.join(D, 'lines.json'), encoding='utf-8'))
speed = float(sys.argv[1]) if len(sys.argv) > 1 else 1.0
os.makedirs(os.path.join(D, 'wav'), exist_ok=True)
out = []
for i, ln in enumerate(lines):
    a = tts.generate(ln['tts'], sid=0, speed=speed * ln.get('speed', 1.0))
    s = np.array(a.samples, dtype=np.float32)
    # trim leading/trailing silence
    thr = 0.012; idx = np.where(np.abs(s) > thr)[0]
    if len(idx): s = s[max(0, idx[0] - 400): min(len(s), idx[-1] + 1600)]
    fn = os.path.join(D, 'wav', f'l{i:02d}.wav')
    with wave.open(fn, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(a.sample_rate)
        w.writeframes((np.clip(s, -1, 1) * 32767).astype(np.int16).tobytes())
    out.append({'i': i, 'dur': round(len(s) / a.sample_rate, 3), 'sr': a.sample_rate})
    print(i, out[-1]['dur'], ln['tts'][:60])
json.dump(out, open(os.path.join(D, 'durs.json'), 'w'))
print('total speech', round(sum(o['dur'] for o in out), 2))
