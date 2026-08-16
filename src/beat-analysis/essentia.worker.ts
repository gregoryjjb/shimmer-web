import Essentia from 'essentia.js/dist/essentia.js-core.es.js';
import { EssentiaWASM } from 'essentia.js/dist/essentia-wasm.es.js';
import type { BeatAnalysisRequest, BeatAnalysisResponse } from './types';

const errorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : String(error);
};

const resample = (samples: Float32Array, inputRate: number, outputRate: number) => {
  if (inputRate === outputRate) return samples;

  const output = new Float32Array(Math.round((samples.length * outputRate) / inputRate));
  const ratio = inputRate / outputRate;

  for (let index = 0; index < output.length; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, samples.length - 1);
    const mix = position - left;
    output[index] = samples[left] + (samples[right] - samples[left]) * mix;
  }

  return output;
};

self.onmessage = (event: MessageEvent<BeatAnalysisRequest>) => {
  let stage = 'initializing Essentia';
  let essentia: Essentia | undefined;
  let inputSignal: any;
  let analysis: any;

  try {
    essentia = new Essentia(EssentiaWASM);
    stage = `resampling ${event.data.sampleRate} Hz audio`;
    const samples = resample(event.data.samples, event.data.sampleRate, 44_100);
    stage = 'copying audio into Essentia';
    inputSignal = essentia.arrayToVector(samples);

    stage = 'running RhythmExtractor2013';
    const { maxTempo, method, minTempo } = event.data.options;
    analysis = essentia.RhythmExtractor2013(inputSignal, maxTempo, method, minTempo);

    const response: BeatAnalysisResponse = {
      ok: true,
      result: {
        beats: Array.from(essentia.vectorToArray(analysis.ticks)),
        bpm: analysis.bpm,
        confidence: analysis.confidence,
      },
    };
    self.postMessage(response);
  } catch (error) {
    const response: BeatAnalysisResponse = {
      ok: false,
      message: `${stage}: ${errorMessage(error)}`,
    };
    self.postMessage(response);
  } finally {
    analysis?.ticks?.delete?.();
    analysis?.estimates?.delete?.();
    analysis?.bpmIntervals?.delete?.();
    inputSignal?.delete?.();
    essentia?.delete();
  }
};
