# Round-trip check: transcribe each generated sentence with an offline Vietnamese ASR model
import sys, wave, glob, os, numpy as np, sherpa_onnx
D = os.path.dirname(os.path.abspath(__file__)); A = os.path.join(D, 'sherpa-onnx-zipformer-vi-int8-2025-04-20')
rec = sherpa_onnx.OfflineRecognizer.from_transducer(encoder=f'{A}/encoder-epoch-12-avg-8.int8.onnx', decoder=f'{A}/decoder-epoch-12-avg-8.onnx',
                                                    joiner=f'{A}/joiner-epoch-12-avg-8.int8.onnx', tokens=f'{A}/tokens.txt', num_threads=2)
files = sys.argv[1:] or sorted(glob.glob(os.path.join(D, 'wav', '*.wav')))
for f in files:
    with wave.open(f) as w: sr = w.getframerate(); s = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    st = rec.create_stream(); st.accept_waveform(sr, s); rec.decode_stream(st)
    print(os.path.basename(f), '|', st.result.text)
