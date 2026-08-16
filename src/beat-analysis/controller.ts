import { Accessor, createSignal, onCleanup } from 'solid-js';
import { BeatAnalysisAudio, BeatAnalysisOptions, BeatAnalysisState, BeatAnalyzer } from './types';

type BeatAnalysisControllerOptions = {
  analyzer: BeatAnalyzer;
  readAudio: () => BeatAnalysisAudio;
  applyBeats: (beats: readonly number[]) => void;
};

export type BeatAnalysisController = {
  state: Accessor<BeatAnalysisState>;
  run: (options?: BeatAnalysisOptions) => Promise<void>;
  cancel: () => void;
};

export const createBeatAnalysis = (
  dependencies: BeatAnalysisControllerOptions,
): BeatAnalysisController => {
  const [state, setState] = createSignal<BeatAnalysisState>({ state: 'idle' });
  let activeController: AbortController | undefined;

  const cancel = () => {
    activeController?.abort();
    activeController = undefined;
    setState({ state: 'idle' });
  };

  const run = async (options?: BeatAnalysisOptions) => {
    if (activeController) return;

    const controller = new AbortController();
    activeController = controller;
    setState({ state: 'running' });

    try {
      const result = await dependencies.analyzer.analyze(
        dependencies.readAudio(),
        options,
        controller.signal,
      );

      if (activeController !== controller) return;

      dependencies.applyBeats(result.beats);
      setState({ state: 'complete', ...result });
    } catch (error) {
      if (activeController !== controller || controller.signal.aborted) return;

      const message = error instanceof Error ? error.message : String(error);
      console.error('Beat analysis:', error);
      setState({ state: 'error', message });
    } finally {
      if (activeController === controller) {
        activeController = undefined;
      }
    }
  };

  onCleanup(cancel);

  return { state, run, cancel };
};
