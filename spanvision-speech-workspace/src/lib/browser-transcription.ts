export async function transcribeAudioFile(file: File, signal: AbortSignal, onStatus: (message: string) => void): Promise<string> {
  if (file.size > 50 * 1024 * 1024) throw new Error('Choose a recording smaller than 50 MB.');
  const cancelled = () => { if (signal.aborted) throw new DOMException('Transcription cancelled', 'AbortError'); };
  cancelled();
  let context: AudioContext | undefined;
  let mono: Float32Array;
  try {
    onStatus('Decoding your recording…');
    context = new AudioContext();
    let decoded: AudioBuffer;
    try { decoded = await context.decodeAudioData(await file.arrayBuffer()); }
    catch { throw new Error('This browser cannot decode the recording. Convert it to WAV or MP3 and try again.'); }
    cancelled();
    if (decoded.duration < 1 || decoded.duration > 600) throw new Error('Choose a recording between 1 second and 10 minutes.');
    const resampler = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
    const source = resampler.createBufferSource(); source.buffer = decoded; source.connect(resampler.destination); source.start();
    mono = (await resampler.startRendering()).getChannelData(0);
  } finally { await context?.close(); }
  cancelled();
  const worker = new Worker(new URL('./speech-worker.js', import.meta.url), { type: 'module' });
  try {
    return await new Promise<string>((resolve, reject) => {
      const abort = () => reject(new DOMException('Transcription cancelled', 'AbortError'));
      signal.addEventListener('abort', abort, { once: true });
      const cleanup = () => signal.removeEventListener('abort', abort);
      worker.onerror = event => { cleanup(); reject(new Error(event.message || 'The speech worker could not start.')); };
      worker.onmessage = ({ data }) => {
        if (data.status === 'progress') onStatus(data.message);
        else if (data.status === 'complete') { cleanup(); resolve(data.text); }
        else if (data.status === 'error') { cleanup(); reject(new Error(data.message)); }
      };
      worker.postMessage({ audio: mono }, [mono.buffer as ArrayBuffer]);
    });
  } finally { worker.terminate(); }
}
