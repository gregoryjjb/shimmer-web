import audiobufferToWav from 'audiobuffer-to-wav';

import { Emitter, TimelineEmitter } from './events';
import { localPersistence } from './persistence';

type Peaks = {
  mins: Float32Array;
  maxes: Float32Array;
};

const newPeaks = (count: number): Peaks => {
  console.log('Allocating new peaks of count', count);
  return { mins: new Float32Array(count), maxes: new Float32Array(count) };
};

type PeakOptionsRate = {
  peaksPerSecond: number;
};
type PeakOptionsCount = {
  peaksCount: number;
  start?: number;
  duration?: number;
};
type PeaksOptions = (PeakOptionsRate | PeakOptionsCount) & {
  preallocatedPeaks?: Peaks;
};
type PeaksConfig = {
  start: number;
  duration: number;
  peaksCount: number;
};

const coalescePeaksOptions = (
  samplesDuration: number,
  options: PeaksOptions,
): PeaksConfig => {
  const start = ('start' in options && options.start) || 0;
  const duration =
    ('duration' in options && options.duration) || samplesDuration - start;
  const peaksCount =
    'peaksCount' in options
      ? Math.ceil(options.peaksCount)
      : Math.ceil(options.peaksPerSecond * duration);

  return { start, duration, peaksCount };
};

/**
 * Turns normalized audio samples into peaks
 */
const getPeaks = (
  samples: Float32Array,
  samplesDuration: number,
  options: PeaksOptions,
): Peaks => {
  const { start, duration, peaksCount } = coalescePeaksOptions(
    samplesDuration,
    options,
  );

  // Raw data
  const sampleRate = samples.length / samplesDuration;

  // Mapping from raw -> peaks
  const startPos = Math.floor(start * sampleRate);
  const endPos = Math.ceil((start + duration) * sampleRate);
  const samplesPerPeak = (endPos - startPos) / peaksCount;

  console.log('Computing peaks', {
    startPos,
    endPos,
    samplesPerPeak,
    peaksCount,
  });

  // Get min/max of each peak
  const peaks = newPeaks(peaksCount);
  for (let i = 0; i < peaksCount; i++) {
    let max = Number.NEGATIVE_INFINITY;
    let min = Number.POSITIVE_INFINITY;

    for (let j = 0; j < samplesPerPeak; j++) {
      const pos = Math.floor(startPos + i * samplesPerPeak + j);
      const sample = samples[pos];
      if (sample > max) {
        max = sample;
      }
      if (sample < min) min = sample;
    }

    peaks.mins[i] = min;
    peaks.maxes[i] = max;
  }

  return peaks;
};

/**
 * Takes peaks and downsamples them to lower resolution peaks
 */
const downsamplePeaks = (
  sourcePeaks: Peaks,
  sourceDuration: number,
  options: PeaksOptions,
): Peaks => {
  const { start, duration, peaksCount } = coalescePeaksOptions(
    sourceDuration,
    options,
  );

  // Raw data
  const sourceRate = sourcePeaks.mins.length / sourceDuration;

  // Mapping from raw -> peaks
  const startPos = Math.floor(start * sourceRate);
  const endPos = Math.ceil((start + duration) * sourceRate);
  const samplesPerPeak = (endPos - startPos) / peaksCount;

  // console.log("Downsampling peaks", {
  //   startPos,
  //   endPos,
  //   samplesPerPeak,
  //   peaksCount,
  //   iterations: peaksCount * Math.ceil(samplesPerPeak),
  // });

  const peaks = options.preallocatedPeaks || newPeaks(peaksCount);
  for (let i = 0; i < peaksCount; i++) {
    let max = Number.NEGATIVE_INFINITY;
    let min = Number.POSITIVE_INFINITY;

    for (let j = 0; j < Math.ceil(samplesPerPeak); j++) {
      const pos = Math.floor(startPos + i * samplesPerPeak + j);
      const maxSample = sourcePeaks.maxes[pos];
      if (maxSample > max) {
        max = maxSample;
      }
      const minSample = sourcePeaks.mins[pos];
      if (minSample < min) min = minSample;
    }

    peaks.mins[i] = min;
    peaks.maxes[i] = max;
  }

  return peaks;
};

// Maps sample rate to peaks
type PrecomputedPeaks = {
  10: Peaks;
  100: Peaks;
  1000: Peaks;
};

export default class TimelineAudio extends Emitter<{
  loading: boolean;
}> {
  private input: HTMLInputElement;
  private element: HTMLAudioElement;
  private buffer?: AudioBuffer;

  private normalizedBuffer?: Float32Array;

  loading: boolean;

  precomputedPeaks?: PrecomputedPeaks;
  cachedPeaks?: Peaks;
  cacheKey?: string;

  emitter: TimelineEmitter;

  constructor(emitter: TimelineEmitter) {
    super();

    this.input = document.createElement('input');
    this.input.type = 'file';
    this.input.style.display = 'none';
    this.input.addEventListener(
      'change',
      this.handleOpenFile as (e: Event) => void,
    );
    // document.body.appendChild(this.input);

    this.element = new Audio();
    this.element.autoplay = false;
    this.element.volume = 0.1;

    this.emitter = emitter;

    this.loading = false;

    this.element.addEventListener('play', this.handlePlay);
    this.element.addEventListener('pause', this.handlePause);
  }

  destroy = () => {
    this.pause();
    URL.revokeObjectURL(this.element.src);
    this.element.src = '';

    this.element.removeEventListener('play', this.handlePlay);
    this.element.removeEventListener('pause', this.handlePause);
  };

  handlePlay = () => {
    this.emitter.emit('play', undefined);
  };
  handlePause = () => {
    this.emitter.emit('pause', undefined);
  };

  openFile = () => {
    this.input.click();
  };

  private handleOpenFile = (
    event: Event & {
      target: HTMLInputElement;
    },
  ) => {
    const file = event.target.files?.[0];

    if (!file) {
      console.error('no file selected?');
      return;
    }

    this.load(file);
    localPersistence.saveAudio(file);
  };

  loadFromPersistence = async () => {
    const blob = await localPersistence.getAudio();
    await this.load(blob);
  };

  load = async (blob: Blob) => {
    if (this.loading) throw new Error('Cant load audio twice');

    this.loading = true;
    this.emit('loading', true);

    // this.element.src = path;

    // const response = await fetch(path);

    // const blob = await localPersistence.getAudio();
    // const blob = await fetch(path).then((res) => res.blob());
    // await localPersistence.saveAudio(blob);

    const arrayBuffer = await blob.arrayBuffer();

    // const [arrayBuffer, blob] = await Promise.all([
    //   response.clone().arrayBuffer(),
    //   response.blob()
    // ]);

    // const arrayBuffer = await response.clone().arrayBuffer();
    // const blob = await response.blob();

    // const arrayBuffer: ArrayBuffer = await fetch(path).then((response) =>
    //   response.arrayBuffer()
    // );

    const context = new AudioContext();
    this.buffer = await context.decodeAudioData(arrayBuffer);

    // VBR mp3 files get desynced when seeking, so instead of using the original
    // mp3 blob, we convert the decoded PCM data to wav and use that
    const wav = audiobufferToWav(this.buffer);
    const wavBlob = new Blob([wav]);
    this.element.src = URL.createObjectURL(wavBlob);

    // this.element.src = URL.createObjectURL(blob);

    const raw = this.buffer.getChannelData(0);

    // Downsample
    const targetSamplesPerSecond = 1000;
    // TODO downsample to peaks here, then do more later

    // Normalize to 1
    let max = 0;
    for (let sample of raw) {
      const abs = Math.abs(sample);
      if (abs > max) {
        max = abs;
        // console.log("New max", max);
      }
    }
    const scaler = 1 / max;
    // console.log('Scaler:', scaler);
    this.normalizedBuffer = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      this.normalizedBuffer[i] = raw[i] * scaler;
    }

    // Precompute
    // console.log('Precomputing peaks');
    const peaks1000 = getPeaks(this.normalizedBuffer, this.buffer.duration, {
      peaksPerSecond: 1000,
    });
    const peaks100 = downsamplePeaks(peaks1000, this.buffer.duration, {
      peaksPerSecond: 100,
    });
    const peaks10 = downsamplePeaks(peaks100, this.buffer.duration, {
      peaksPerSecond: 10,
    });
    this.precomputedPeaks = {
      1000: peaks1000,
      100: peaks100,
      10: peaks10,
    };
    // console.log('Precompute complete');
    this.cachedPeaks = undefined;
    this.cacheKey = undefined;

    this.loading = false;
    this.emit('loading', false);
  };

  getPeaks = (
    segmentCount: number,
    start: number,
    duration: number,
  ): Peaks | undefined => {
    if (!this.buffer) return;

    // Check the cache!
    const key = [segmentCount, start, duration].join('$');
    if (key === this.cacheKey && this.cachedPeaks) return this.cachedPeaks;

    const rate = segmentCount / duration;
    const source =
      rate < 10
        ? this.precomputedPeaks![10]
        : rate < 100
          ? this.precomputedPeaks![100]
          : this.precomputedPeaks![1000];

    // Use existing array if we can, to save memory
    const cached =
      this.cachedPeaks?.mins.length === segmentCount
        ? this.cachedPeaks
        : undefined;

    const peaks = downsamplePeaks(source, this.buffer!.duration, {
      peaksCount: segmentCount,
      start,
      duration,
      preallocatedPeaks: cached,
    });

    this.cachedPeaks = peaks;
    this.cacheKey = key;
    return peaks;
  };

  get currentTime() {
    return this.element.currentTime;
  }

  set currentTime(t: number) {
    this.element.currentTime = t;
  }

  set playbackRate(r: number) {
    this.element.playbackRate = r;
  }

  set volume(v: number) {
    this.element.volume = v;
  }

  isPlaying = (): boolean => {
    return !this.element.paused;
  };

  play = () => {
    this.element.play();
  };

  pause = () => {
    this.element.pause();
  };
}
