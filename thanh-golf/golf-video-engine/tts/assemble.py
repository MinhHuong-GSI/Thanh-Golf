# Join sentence WAVs with pauses -> narration_raw.wav, and write the timing table (timing.json)
# Khoảng nghỉ sau mỗi câu lấy từ trường "gap" trong lines.json; nếu không có:
# 0,9 s khi sang cảnh mới, 0,42 s trong cùng cảnh (câu cuối dùng TAIL).
import json, wave, numpy as np, os
D = os.path.dirname(os.path.abspath(__file__))
L = json.load(open(os.path.join(D, 'lines.json'), encoding='utf-8'))
LEAD, TAIL = 0.6, 1.8
GAP_IN, GAP_SCENE = 0.42, 0.9
GAP = [ln.get('gap', (GAP_SCENE if L[i + 1]['scene'] != ln['scene'] else GAP_IN) if i < len(L) - 1 else 0)
       for i, ln in enumerate(L)]
SR = 22050
parts, t, timing = [np.zeros(int(LEAD * SR), np.float32)], LEAD, []
for i, ln in enumerate(L):
    with wave.open(os.path.join(D, 'wav', f'l{i:02d}.wav')) as w:
        s = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
    d = len(s) / SR
    timing.append({'i': i, 'scene': ln['scene'], 't0': round(t, 3), 't1': round(t + d, 3), 'sub': ln['sub']})
    parts.append(s); t += d
    g = GAP[i] if i < len(L) - 1 else TAIL
    parts.append(np.zeros(int(g * SR), np.float32)); t += g
a = np.concatenate(parts)
# soft fade in/out on the whole track
f = int(0.02 * SR); a[:f] *= np.linspace(0, 1, f); a[-f:] *= np.linspace(1, 0, f)
with wave.open(os.path.join(D, 'narration_raw.wav'), 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(a, -1, 1) * 32767).astype(np.int16).tobytes())
json.dump({'dur': round(len(a) / SR, 3), 'lines': timing}, open(os.path.join(D, 'timing.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('total', round(len(a) / SR, 2))
for x in timing: print(x['scene'], x['t0'], x['t1'], x['sub'][:50])
