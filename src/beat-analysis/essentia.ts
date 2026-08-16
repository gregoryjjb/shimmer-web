import {
  BeatAnalysisAudio,
  BeatAnalysisOptions,
  BeatAnalysisRequest,
  BeatAnalysisResponse,
  BeatAnalyzer,
  defaultBeatAnalysisOptions,
} from './types';

const abortError = () => new DOMException('Beat analysis was canceled', 'AbortError');

export const essentiaBeatAnalyzer: BeatAnalyzer = {
  analyze: (audio: BeatAnalysisAudio, options?: BeatAnalysisOptions, signal?: AbortSignal) => {
    if (signal?.aborted) return Promise.reject(abortError());

    const worker = new Worker(new URL('./essentia.worker.ts', import.meta.url), {
      type: 'module',
    });

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        signal?.removeEventListener('abort', handleAbort);
        worker.terminate();
      };
      const handleAbort = () => {
        cleanup();
        reject(abortError());
      };

      worker.onmessage = (event: MessageEvent<BeatAnalysisResponse>) => {
        cleanup();

        if (event.data.ok) {
          resolve(event.data.result);
        } else {
          reject(new Error(event.data.message));
        }
      };

      worker.onerror = (event) => {
        cleanup();
        reject(new Error(event.message || 'Essentia beat analysis failed'));
      };

      signal?.addEventListener('abort', handleAbort, { once: true });

      const request: BeatAnalysisRequest = {
        ...audio,
        options: { ...defaultBeatAnalysisOptions, ...options },
      };
      worker.postMessage(request, [audio.samples.buffer as ArrayBuffer]);
    });
  },
};
