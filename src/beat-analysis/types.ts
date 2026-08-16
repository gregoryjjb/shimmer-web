export type BeatAnalysisAudio = {
  samples: Float32Array;
  sampleRate: number;
};

export type BeatAnalysisMethod = 'multifeature' | 'degara';

export type BeatAnalysisOptions = {
  maxTempo?: number;
  method?: BeatAnalysisMethod;
  minTempo?: number;
};

export type ResolvedBeatAnalysisOptions = Required<BeatAnalysisOptions>;

export const defaultBeatAnalysisOptions: ResolvedBeatAnalysisOptions = {
  maxTempo: 208,
  method: 'multifeature',
  minTempo: 40,
};

export type BeatAnalysisResult = {
  beats: number[];
  bpm: number;
  confidence: number;
};

export type BeatAnalysisState =
  | { state: 'idle' }
  | { state: 'running' }
  | ({ state: 'complete' } & BeatAnalysisResult)
  | { state: 'error'; message: string };

export type BeatAnalysisRequest = BeatAnalysisAudio & {
  options: ResolvedBeatAnalysisOptions;
};

export type BeatAnalysisResponse =
  | { ok: true; result: BeatAnalysisResult }
  | { ok: false; message: string };

export interface BeatAnalyzer {
  analyze(
    audio: BeatAnalysisAudio,
    options?: BeatAnalysisOptions,
    signal?: AbortSignal,
  ): Promise<BeatAnalysisResult>;
}
