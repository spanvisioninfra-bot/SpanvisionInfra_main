import { env, pipeline } from '@huggingface/transformers';

env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;
self.onmessage = async ({ data }) => {
  let transcriber;
  try {
    self.postMessage({ status: 'progress', message: 'Loading the English speech model…' });
    transcriber = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny.en', {
      device: 'wasm', dtype: 'q8',
      progress_callback: event => {
        if (event.status === 'progress' && Number.isFinite(event.progress)) {
          self.postMessage({ status: 'progress', message: `Downloading speech model: ${Math.round(event.progress)}% of ${event.file}` });
        }
      },
    });
    self.postMessage({ status: 'progress', message: 'Transcribing your recording locally…' });
    const result = await transcriber(data.audio, { chunk_length_s: 30, stride_length_s: 5, return_timestamps: false });
    self.postMessage({ status: 'complete', text: result.text.trim() });
  } catch (error) {
    self.postMessage({ status: 'error', message: error.message || 'Local speech recognition failed.' });
  } finally { await transcriber?.dispose(); }
};
