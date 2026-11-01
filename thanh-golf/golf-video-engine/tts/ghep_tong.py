# Ghép âm thanh tổng của video giọng AI (chạy sau assemble.py):
#   lời đọc phim (narration_raw.wav, bắt đầu ngay ở khung 0 – không logo đầu, quy tắc 6–7 CLAUDE.md)
#   + logo cuối 3,625 s: 0,2 s lặng + câu kết "Hãy phô lô tê tê gôn…" (speed 0,97 × 1,03)
#   → loudnorm → narration_ttgolf.m4a (âm thanh gốc cho encode.sh, so MD5) ; ghi mốc câu kết vào timing.json.
# Dùng: python3 ghep_tong.py [thư_mục_lưu]   (ví dụ ../kich-ban/am-thanh/1-1 – chép m4a, timing.json, lines.json, asr_report.json)
import json, os, shutil, subprocess, sys, wave, numpy as np, sherpa_onnx
D = os.path.dirname(os.path.abspath(__file__)); M = os.path.join(D, 'vits-piper-vi_VN-vais1000-medium')
OUTRO_TTS = "Hãy phô lô tê tê gôn, để biết thêm nhiều kiến thức về gôn nhé!"
OUTRO_SUB = "Hãy follow TTGolf để biết thêm\nnhiều kiến thức về golf nhé"
LOGO, PRE, SR = 3.625, 0.2, 22050

def read(fn):
    with wave.open(fn) as w: return np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768

film = read(os.path.join(D, 'narration_raw.wav'))
ofn = os.path.join(D, 'outro.wav')
if not os.path.exists(ofn):
    tts = sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
        vits=sherpa_onnx.OfflineTtsVitsModelConfig(model=f'{M}/vi_VN-vais1000-medium.onnx', tokens=f'{M}/tokens.txt',
              data_dir=f'{M}/espeak-ng-data', noise_scale=0.55, noise_scale_w=0.7, length_scale=1.0), num_threads=2), max_num_sentences=1))
    a = tts.generate(OUTRO_TTS, sid=0, speed=0.97 * 1.03); s = np.array(a.samples, np.float32)
    idx = np.where(np.abs(s) > 0.012)[0]; s = s[max(0, idx[0] - 400): min(len(s), idx[-1] + 1600)]
    with wave.open(ofn, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(a.sample_rate); w.writeframes((np.clip(s, -1, 1) * 32767).astype(np.int16).tobytes())
outro = read(ofn)
logo_len = max(LOGO, PRE + len(outro) / SR + 0.15)          # câu kết dài hơn logo thì kéo dài logo
tail = np.zeros(int(round(logo_len * SR)), np.float32); tail[int(PRE * SR): int(PRE * SR) + len(outro)] = outro
full = np.concatenate([film, tail])
raw = os.path.join(D, 'narration_ttgolf_raw.wav')
with wave.open(raw, 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(full, -1, 1) * 32767).astype(np.int16).tobytes())
m4a = os.path.join(D, 'narration_ttgolf.m4a')
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', raw, '-af', 'highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000',
                '-ac', '2', '-c:a', 'aac', '-b:a', '192k', m4a], check=True)
T = json.load(open(os.path.join(D, 'timing.json'), encoding='utf-8'))
film_dur = len(film) / SR
T.update({'film_dur': round(film_dur, 3), 'logo_dur': round(logo_len, 3), 'dur': round(len(full) / SR, 3),
          'outro': {'t0': round(film_dur + PRE, 3), 't1': round(film_dur + PRE + len(outro) / SR, 3), 'sub': OUTRO_SUB}})
json.dump(T, open(os.path.join(D, 'timing.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f"phim {film_dur:.2f} s + logo cuối {logo_len:.2f} s = {len(full) / SR:.2f} s → {m4a}")
if len(sys.argv) > 1:
    out = os.path.abspath(sys.argv[1]); os.makedirs(out, exist_ok=True)
    for f in ['narration_ttgolf.m4a', 'timing.json', 'lines.json', 'asr_report.json']:
        if os.path.exists(os.path.join(D, f)): shutil.copy(os.path.join(D, f), out)
    print('đã lưu vào', out)
