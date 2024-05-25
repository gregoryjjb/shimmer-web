import TimelineAudio from './timeline-audio';
import TimelineData, { BoxSelection, mapJSONToMemory } from './timeline-data';
import { ProjectData, Track } from './types';

import colors from './colors';
import { ArgOf, Command, ComplexCommand, apple, keybinds } from './commands';
import { TimelineEmitter } from './events';
import * as mouse from './mouse';
import { ShowDataJSON } from './types';
import {
  abs,
  clamp,
  difference,
  pointsToRect,
  rangeEnd,
  rangeStart,
  stringifyTime,
} from './utils';

import lightsSVG from '../assets/lights-colored.svg?raw';
import { downloadFile, toLegacyFormat } from './export';
import { IPersistence, Persistence, localPersistence } from './persistence';
import { Project } from './types';

const LEFT_MOUSE_BUTTON = 0;
const MIDDLE_MOUSE_BUTTON = 1;
const RIGHT_MOUSE_BUTTON = 2;

interface Point {
  x: number;
  y: number;
}

type DeepWritable<T> = { -readonly [P in keyof T]: DeepWritable<T[P]> };
type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

const lightTheme = {
  sidebar: colors.white,
  debugText: colors.black,
  ticks: colors.black,
  scrubber: colors.red[500],
  waveform: colors.gray[400], //colors.indigo[600],
  channel: colors.gray[200],
  channelAlternate: colors.gray[100],
  channelDisabled: colors.gray[400],
  channelDisabledAlternate: colors.gray[300],
  keyframeOutline: colors.gray[900],
  keyframeOutlineSelected: colors.red[600],
  keyframeOn: colors.yellow[200],
  boxSelectOutline: colors.black,
} as const;

const darkTheme = {
  sidebar: colors.zinc[900],
  debugText: colors.white,
  ticks: colors.white,
  scrubber: colors.red[500],
  waveform: colors.gray[400],
  channel: colors.zinc[700],
  channelAlternate: colors.zinc[600],
  channelDisabled: colors.zinc[900],
  channelDisabledAlternate: colors.zinc[800],
  keyframeOutline: colors.gray[900],
  keyframeOutlineSelected: colors.red[500],
  keyframeOn: colors.yellow[300],
  boxSelectOutline: colors.cyan[300],
} satisfies Record<keyof typeof lightTheme, string>;

const defaultConfig = {
  layout: {
    timelineHeight: 40,
    waveformHeight: 100,
    sidebarWidth: 160,
    channelHeight: 30,
    keyframeSize: 20,
  },
  colors: {
    light: lightTheme,
    dark: darkTheme,
  },
} as const;

type TimelineConfig = typeof defaultConfig;

type TimelineOptions = DeepPartial<DeepWritable<TimelineConfig>>;

const createDiamond = (
  size: number,
  strokeStyle: string | CanvasGradient | CanvasPattern,
  fillStyle: string | CanvasGradient | CanvasPattern,
  borderWidth: number,
): CanvasImageSource => {
  const squareRootTwo = 1.41421356237;
  const edgeSize = size / squareRootTwo;

  const canvas = document.createElement('canvas');
  canvas.height = size;
  canvas.width = size;

  const ctx = canvas.getContext('2d')!;
  ctx.strokeStyle = strokeStyle;
  ctx.fillStyle = fillStyle;
  ctx.lineWidth = borderWidth;

  ctx.translate(size / 2, size / 2);
  ctx.rotate(Math.PI / 4);

  ctx.beginPath();
  ctx.rect(
    Math.ceil(edgeSize / -2 + 1),
    Math.ceil(edgeSize / -2 + 1),
    Math.floor(edgeSize - 2),
    Math.floor(edgeSize - 2),
  );
  ctx.fill();
  ctx.stroke();
  ctx.resetTransform();

  return canvas;
};

interface RenderedBoxSelection extends BoxSelection {
  start: Point;
  end: Point;
}

class Timeline {
  private container: Element | undefined; // Outer container provided to us
  private root: HTMLDivElement; // Element we add to the container
  private canvas: HTMLCanvasElement;
  private debugDisplay: HTMLPreElement;
  private lights: HTMLDivElement[] = [];
  private currentTimeDisplay: HTMLDivElement;

  private resizeObserver?: ResizeObserver;

  private audio: TimelineAudio;
  private data?: TimelineData;
  private persistence: Persistence;

  private config: TimelineConfig = defaultConfig;
  destroyed: boolean = false;

  private readonly emitter = new TimelineEmitter();
  on = this.emitter.on;

  // Display stuff

  /**
   * The number of canvas pixels for one second of audio
   */
  private get pxPerSecond() {
    const minPxPerSecond = 8;
    const maxPxPerSecond = 1000;

    // The formula for converting zoom into pxPerSecond is:
    // y = a * 𝑒^{bx}
    // Where:
    //   x = zoom scaler
    //   y = px per second
    //   a = min px per second (since y = a when x = 0)
    //   b = some coefficient such that y = max px when x = max zoom

    // We have to solve for b:
    const b = Math.log(maxPxPerSecond / minPxPerSecond);

    // Then use b
    return Math.pow(Math.E, this.zoom * b) * minPxPerSecond;
  }

  /**
   * Linear zoom value between 0 and 1, with 0 being most zoomed out and 1 being most
   * zoomed in. This is smoothly converted to pxPerSecond as we zoom in and out.
   */
  private zoom = 0.5;
  private dpiScale = 1;

  // Offset in seconds
  private basePosition: number = 0;
  private panStartPx: number = 0;

  // Additional offset because of the current pan in seconds
  private panOffset: number = 0;

  private seeking = false;

  private boxSelection: RenderedBoxSelection | undefined;

  private lastFrameTimestamp?: DOMHighResTimeStamp;

  private diamondCache?: {
    keyframeOn: CanvasImageSource;
    keyframeOff: CanvasImageSource;
    keyframeOnSelected: CanvasImageSource;
    keyframeOffSelected: CanvasImageSource;
    keyframeOnPlaying: CanvasImageSource;
    keyframeOffPlaying: CanvasImageSource;
  };

  /**
   * Position of the left side of the viewport in seconds
   */
  private get position() {
    return Math.max(this.basePosition + this.panOffset, 0);
  }

  // Width in fake web pixels
  private get canvasWidth() {
    return this.canvas.width / this.dpiScale;
  }

  // Height in fake web pixels
  private get canvasHeight() {
    return this.canvas.height / this.dpiScale;
  }

  constructor(options?: TimelineOptions) {
    const { layout } = this.config;

    this.root = document.createElement('div');
    this.root.style.position = 'relative';

    this.canvas = document.createElement('canvas');
    // this.canvas.style.position = 'absolute';
    // this.canvas.style.inset = '0';
    this.canvas.style.width = '100%';
    this.canvas.oncontextmenu = (e) => {
      // e.shiftKey = false;
      e.stopPropagation();
      e.preventDefault();
      return false;
    };
    this.root.appendChild(this.canvas);

    this.currentTimeDisplay = document.createElement('div');
    this.currentTimeDisplay.className =
      'absolute top-0 left-3 px-1 py-0.5 rounded-sm text-sm border';
    // this.currentTimeDisplay.style.position = 'absolute';
    // this.currentTimeDisplay.style.top = '4px';
    // this.currentTimeDisplay.style.left = '4px';
    // this.currentTimeDisplay.style.padding = '4px';
    // this.currentTimeDisplay.style.fontSize = '12px';
    this.root.appendChild(this.currentTimeDisplay);

    this.debugDisplay = document.createElement('pre');
    this.debugDisplay.innerText = 'Foo\nBar';
    this.debugDisplay.style.position = 'absolute';
    this.debugDisplay.style.bottom = '0';
    this.debugDisplay.style.left = '0';
    this.debugDisplay.style.margin = '0';
    this.debugDisplay.style.fontSize = '12px';
    this.root.appendChild(this.debugDisplay);

    for (let i = 0; i < 8; i++) {
      const span = document.createElement('div');
      span.innerHTML = lightsSVG
        .replaceAll('_Radial1', `_Radial1_${i}`)
        .replaceAll('_Radial2', `_Radial2_${i}`)
        .replaceAll('_Radial3', `_Radial3_${i}`)
        .replaceAll('_Radial4', `_Radial4_${i}`)
        .replaceAll('_Radial5', `_Radial5_${i}`)
        .replaceAll('_Radial6', `_Radial6_${i}`)
        .replaceAll('_Radial7', `_Radial7_${i}`)
        .replaceAll('_Radial8', `_Radial8_${i}`);
      // span.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:1.5" viewBox="0 0 48 8"><path d="M3.227 2.121c-2.17.406 2.824-.869 4.34-.812 1.808.068 4.339 1.218 6.509 1.218s4.339-1.218 6.509-1.218 4.34 1.218 6.509 1.218c2.17 0 4.34-1.218 6.51-1.218 2.169 0 4.339 1.218 6.509 1.218s6.509-1.218 6.509-1.218" style="fill:none;stroke:#0c2010;stroke-width:.48px"/><path d="M42.59 2.555c.703-.103 1.28-.142 1.442.962.162 1.105-.152 2.937-.854 3.041-.703.103-1.53-1.563-1.692-2.667-.162-1.105.402-1.233 1.104-1.336ZM36.446 2.037c.67.234 1.199.467.831 1.52-.369 1.054-1.496 2.533-2.166 2.299-.67-.235-.631-2.094-.263-3.147.368-1.054.927-.907 1.598-.672ZM29.142 2.468c.685-.187 1.253-.296 1.547.781.294 1.077.203 2.934-.482 3.121-.685.187-1.706-1.366-2-2.443-.294-1.077.25-1.272.935-1.459ZM22.738 1.909c.699.129 1.257.278 1.055 1.376-.203 1.098-1.09 2.731-1.789 2.603-.698-.129-.944-1.972-.741-3.07.202-1.098.777-1.037 1.475-.909ZM15.315 2.638c.701-.115 1.277-.163 1.457.938.181 1.102-.102 2.939-.802 3.054-.701.115-1.556-1.536-1.736-2.638-.181-1.101.381-1.239 1.081-1.354ZM7.881 1.551c.708.053 1.279.141 1.196 1.254-.083 1.114-.789 2.834-1.497 2.781-.708-.053-1.151-1.859-1.068-2.972.083-1.113.661-1.115 1.369-1.063Z" style="fill:#f10000;stroke:#f10000;stroke-width:.24px"/></svg>`;
      span.style.position = 'absolute';
      span.style.top =
        (
          layout.waveformHeight +
          layout.timelineHeight +
          layout.channelHeight * i
        ).toString() + 'px';
      span.style.left = '0';
      span.style.width = `${layout.sidebarWidth}px`;
      span.style.height = `${layout.channelHeight}px`;
      const colors = ['red', 'green', 'blue', 'yellow'].sort(
        () => Math.random() - 0.5,
      );
      for (let i = 0; i < 4; i++) {
        span.style.setProperty(`--light${i + 1}`, colors[i]);
      }

      this.root.appendChild(span);
      this.lights.push(span);

      // const svg = document
      //   .createRange()
      //   .createContextualFragment(
      //     `<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:1.5" viewBox="0 0 48 8"><path d="M3.227 2.121c-2.17.406 2.824-.869 4.34-.812 1.808.068 4.339 1.218 6.509 1.218s4.339-1.218 6.509-1.218 4.34 1.218 6.509 1.218c2.17 0 4.34-1.218 6.51-1.218 2.169 0 4.339 1.218 6.509 1.218s6.509-1.218 6.509-1.218" style="fill:none;stroke:#0c2010;stroke-width:.48px"/><path d="M42.59 2.555c.703-.103 1.28-.142 1.442.962.162 1.105-.152 2.937-.854 3.041-.703.103-1.53-1.563-1.692-2.667-.162-1.105.402-1.233 1.104-1.336ZM36.446 2.037c.67.234 1.199.467.831 1.52-.369 1.054-1.496 2.533-2.166 2.299-.67-.235-.631-2.094-.263-3.147.368-1.054.927-.907 1.598-.672ZM29.142 2.468c.685-.187 1.253-.296 1.547.781.294 1.077.203 2.934-.482 3.121-.685.187-1.706-1.366-2-2.443-.294-1.077.25-1.272.935-1.459ZM22.738 1.909c.699.129 1.257.278 1.055 1.376-.203 1.098-1.09 2.731-1.789 2.603-.698-.129-.944-1.972-.741-3.07.202-1.098.777-1.037 1.475-.909ZM15.315 2.638c.701-.115 1.277-.163 1.457.938.181 1.102-.102 2.939-.802 3.054-.701.115-1.556-1.536-1.736-2.638-.181-1.101.381-1.239 1.081-1.354ZM7.881 1.551c.708.053 1.279.141 1.196 1.254-.083 1.114-.789 2.834-1.497 2.781-.708-.053-1.151-1.859-1.068-2.972.083-1.113.661-1.115 1.369-1.063Z" style="fill:#f10000;stroke:#f10000;stroke-width:.24px"/></svg>`
      //   );
    }

    this.audio = new TimelineAudio(this.emitter);
    this.audio.on('loading', (loading: boolean) => {
      this.requestDraw();
    });

    this.persistence = new Persistence();
    this.persistence.on('audioChanged', (blob) => {
      this.audio.load(blob);
    });

    // Cursor overlays on canvas
    // const wf = document.createElement('div');
    // wf.style.position = 'absolute';
    // wf.style.top = '0';
    // wf.style.left = layout.sidebarWidth + 'px';
    // wf.style.right = '0';
    // wf.style.height = `${layout.waveformHeight + layout.timelineHeight}px`;
    // this.canvas.appendChild(wf);

    // window.addEventListener("resize", this.resizeCanvas);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('keydown', this.handleKeyDown);

    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    this.canvas.addEventListener('mouseup', this.handleMouseUp);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
  }

  /**
   * Attaches the timeline to the provided container element; the timeline
   * will be rendered there
   */
  attach = (container: Element) => {
    this.container = container;
    this.container.appendChild(this.root);

    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver((entries) => {
      if (!this.container) return;

      this.resizeCanvas(
        this.container.clientWidth,
        this.container.clientHeight,
      );
    });
    this.resizeObserver.observe(this.container);

    this.resizeCanvas(this.container.clientWidth, this.container.clientHeight);
  };

  destroy = () => {
    this.resizeObserver?.disconnect();
    this.container?.removeChild(this.root);

    this.audio.destroy();

    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('keydown', this.handleKeyDown);

    this.destroyed = true;
  };

  load = async (project: Project) => {
    const start = performance.now();

    this.emitter.emit('loading', true);

    try {
      const p = this.audio.load(project.audio);
      this.replaceData(project.data);
      await p;
    } finally {
      console.log(`Loaded in ${performance.now() - start}ms`);
      this.emitter.emit('loading', false);
    }

    this.requestDraw();
  };

  replaceData = (data: ProjectData) => {
    if (this.data) {
      this.data.replace(data.tracks);
    } else {
      this.data = new TimelineData(this.emitter, data.tracks);
    }
    this.requestDraw();
  };

  loadPersistence = async (source: IPersistence) => {
    const start = performance.now();
    const [data, audio] = await Promise.all([
      source.get('tracks'),
      source.get('audio'),
    ]);
    console.log('Fetched from IndexedDB in ms:', performance.now() - start);

    if (data && audio) {
      const parsedData = JSON.parse(data);

      await this.load({ name: '', data: { tracks: parsedData }, audio });
    }

    this.requestDraw();
  };

  resizeCanvas = (width: number, height: number) => {
    // const ctx = this.canvas.getContext('2d');
    // const tmpCanvas = document.createElement('canvas');
    // const tmpCtx = tmpCanvas.getContext('2d');
    // tmpCtx?.drawImage(this.canvas, 0, 0)

    // this.canvas.style.width = '100%';
    // this.canvas.style.height = '100%';

    this.root.style.width = width + 'px';
    this.root.style.height = height + 'px';

    this.dpiScale = window.devicePixelRatio;

    this.canvas.width = width * this.dpiScale;
    this.canvas.height = height * this.dpiScale;

    this.diamondCache = undefined;

    // ctx?.drawImage(tmpCanvas, 0, 0);

    this.requestDraw();
  };

  requestDraw = () => {
    requestAnimationFrame(this.handleFrameRequest);
  };

  private handleFrameRequest = (time: DOMHighResTimeStamp) => {
    if (time === this.lastFrameTimestamp) {
      return;
    }
    this.lastFrameTimestamp = time;

    this.draw();

    if (this.audio.isPlaying()) {
      this.requestDraw();
    }
  };

  /**
   * Converts a distance of pixels to a distance of time
   */
  private pxToDuration = (px: number): number => {
    return px / this.pxPerSecond;
  };

  /**
   * Converts a distance of time to a distance of pixels
   */
  private durationToPx = (t: number): number => {
    return t * this.pxPerSecond;
  };

  /**
   * Converts an absolute position of pixels on the canvas to the matching time
   */
  private absolutePxToTime = (x: number) => {
    return (
      this.pxToDuration(x - this.config.layout.sidebarWidth) + this.position
    );
  };

  /**
   * Converts a timeline time to the matching absolute position on the canvas
   */
  private absoluteTimeToPx = (seconds: number) => {
    return (
      (seconds - this.position) * this.pxPerSecond +
      this.config.layout.sidebarWidth
    );
  };

  private absolutePxToChannel = (y: number): number | null => {
    const { layout } = this.config;

    const channelsStartAt = layout.waveformHeight + layout.timelineHeight;

    if (y <= channelsStartAt) return null;

    return Math.floor((y - channelsStartAt) / layout.channelHeight);
  };

  private getLocalCoordinates = (
    event: MouseEvent | WheelEvent,
  ): { x: number; y: number } => {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    return { x, y };
  };

  private draw = () => {
    performance.mark('draw-start');
    const { layout, colors } = this.config;
    const theme = colors.dark;

    // Compute needed height of canvas
    const channelCount = this.data?.channels?.length || 0;
    const totalHeight =
      layout.timelineHeight +
      layout.waveformHeight +
      channelCount * layout.channelHeight;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.reset();
    ctx.scale(this.dpiScale, this.dpiScale);
    ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

    //// Sidebar

    ctx.strokeStyle = theme.channelAlternate;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(layout.sidebarWidth, 0);
    ctx.lineTo(layout.sidebarWidth, this.canvasHeight);
    ctx.stroke();

    //// Timeline

    const endSeconds = this.absolutePxToTime(this.canvasWidth);

    const increments = [1, 5, 10, 30, 60, 600]; // Seconds
    const smallIncrements = [0.1, 1, 1, 5, 10, 60];
    const desiredTickSpacing = 100; // Pixels
    const minTickSpacing = 150;
    let chosenIncrement = 0;
    let chosenSmallIncrement = 0;
    for (let i = 0; i < increments.length; i++) {
      const increment = increments[i];
      const spacing = this.durationToPx(increment);
      if (spacing >= minTickSpacing) {
        chosenIncrement = increment;
        chosenSmallIncrement = smallIncrements[i];
        break;
      }
    }
    if (!chosenIncrement) {
      chosenIncrement = increments[increments.length - 1];
      chosenSmallIncrement = smallIncrements[increments.length - 1];
    }

    // Draw big tick marks with time numbers
    const drawnBigMarks = new Set<string>();
    let currentMark = this.position - (this.position % chosenIncrement);
    while (currentMark < endSeconds) {
      const x = this.absoluteTimeToPx(currentMark);
      const height = layout.timelineHeight / 2;

      ctx.strokeStyle = theme.ticks;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, Math.round(height));
      ctx.stroke();

      const timeString = stringifyTime(currentMark, 'seconds');
      ctx.font = '12px sans-serif';
      ctx.fillStyle = theme.ticks;
      ctx.fillText(timeString, x + 2, height + 12);

      drawnBigMarks.add(currentMark.toFixed(3));
      currentMark += chosenIncrement;
    }

    // Draw small tick marks
    let currentSmallMark =
      this.position - (this.position % chosenSmallIncrement);
    while (currentSmallMark <= endSeconds) {
      // Skip any times that already have a big mark
      if (!drawnBigMarks.has(currentSmallMark.toFixed(3))) {
        const x = this.absoluteTimeToPx(currentSmallMark);
        const height = layout.timelineHeight / 4;
        ctx.strokeStyle = theme.ticks;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, Math.round(height));
        ctx.stroke();
      }

      currentSmallMark += chosenSmallIncrement;
    }

    //// Waveform
    performance.mark('draw-waveform-start');
    const waveformX = layout.sidebarWidth;
    const waveformY = layout.timelineHeight;
    const waveformWidth = Math.max(this.canvasWidth - waveformX, 0);
    const waveformHeight = layout.waveformHeight;

    ctx.translate(waveformX, waveformY);

    const peaks = this.audio.getPeaks(
      waveformWidth,
      this.position,
      waveformWidth / this.pxPerSecond,
    );

    if (peaks) {
      // Draw waveform
      const { mins, maxes } = peaks;

      const middle = waveformHeight / 2;
      const maxWaveHeight = (waveformHeight / 2) * 0.9; // 90%

      ctx.beginPath();
      ctx.moveTo(0, middle - mins[0] * maxWaveHeight);

      // Forward over mins (bottom of waveform)
      for (let i = 1; i < mins.length; i++) {
        ctx.lineTo(i, middle - mins[i] * maxWaveHeight);
      }
      // Backward over maxes (top of waveform)
      for (let i = maxes.length - 1; i >= 0; i--) {
        // The line must be at least 1 pixel thick, so clamp it above 1
        ctx.lineTo(i, middle - Math.max(maxes[i] * maxWaveHeight, 1));
      }
      ctx.closePath();
      ctx.fillStyle = theme.waveform;
      ctx.fill();

      // For debugging - draw center line over waveform
      // ctx.strokeStyle = "green";
      // ctx.moveTo(0, middle);
      // ctx.lineTo(waveformWidth, middle);
      // ctx.stroke();
    } else {
      // Draw flat line
      const middle = waveformHeight / 2;
      ctx.strokeStyle = theme.waveform;
      ctx.beginPath();
      ctx.moveTo(0, middle);
      ctx.lineTo(waveformWidth, middle);
      ctx.stroke();
    }

    ctx.resetTransform();
    ctx.scale(this.dpiScale, this.dpiScale);

    performance.mark('draw-waveform-end');

    //// Channels and Keyframes

    const channelsX = layout.sidebarWidth;
    const channelsY = waveformY + layout.waveformHeight;
    const channelsWidth = this.canvasWidth - channelsX;
    const channelsHeight = channelCount * layout.channelHeight;
    ctx.translate(channelsX, channelsY);

    // Draw alternating background colors for channels
    for (let i = 0; i < 100; i++) {
      const alt = i % 2 === 0;
      const disabled = i >= channelCount;

      ctx.fillStyle = disabled
        ? alt
          ? theme.channelDisabledAlternate
          : theme.channelDisabled
        : alt
          ? theme.channelAlternate
          : theme.channel;

      // ctx.fillStyle = i % 2 === 0 ? theme.channel : theme.channelAlternate;

      const y = layout.channelHeight * i;

      if (y > this.canvasHeight) break;

      ctx.fillRect(0, y, channelsWidth, layout.channelHeight);
    }

    // Cache keyframe canvases
    performance.mark('diamonds-start');

    if (!this.diamondCache) {
      this.diamondCache = {
        keyframeOn: createDiamond(
          layout.keyframeSize * this.dpiScale,
          theme.keyframeOutline,
          theme.keyframeOn,
          1 * this.dpiScale,
        ),
        keyframeOff: createDiamond(
          layout.keyframeSize * this.dpiScale,
          theme.keyframeOutline,
          'transparent',
          1 * this.dpiScale,
        ),
        keyframeOnSelected: createDiamond(
          layout.keyframeSize * this.dpiScale,
          theme.keyframeOutlineSelected,
          theme.keyframeOn,
          1 * this.dpiScale,
        ),
        keyframeOffSelected: createDiamond(
          layout.keyframeSize * this.dpiScale,
          theme.keyframeOutlineSelected,
          'transparent',
          1 * this.dpiScale,
        ),
        keyframeOnPlaying: createDiamond(
          layout.keyframeSize * this.dpiScale,
          theme.boxSelectOutline,
          theme.keyframeOn,
          1 * this.dpiScale,
        ),
        keyframeOffPlaying: createDiamond(
          layout.keyframeSize * this.dpiScale,
          theme.boxSelectOutline,
          'transparent',
          1 * this.dpiScale,
        ),
      };
    }

    performance.mark('diamonds-end');

    // Draw keyframes
    performance.mark('keyframes-start');
    if (this.data) {
      const cutoffTimeLeft = this.absolutePxToTime(
        channelsX - layout.keyframeSize / 2,
      );
      const cutoffTimeRight = this.absolutePxToTime(
        this.canvasWidth + layout.keyframeSize / 2,
      );

      this.data.channels.forEach((channel, i) => {
        const y = layout.channelHeight * i + layout.channelHeight * 0.5;
        ctx.strokeStyle = theme.keyframeOutline;

        // We have to start from 0 if we're grabbing
        const startIndex = this.grabbing
          ? 0
          : this.data?.binarySearch(i, cutoffTimeLeft, 'right');

        if (startIndex === undefined) return;

        const boxSelectingChannel =
          this.boxSelection &&
          i >= this.boxSelection.startChannel &&
          i <= this.boxSelection.endChannel;

        for (let i = startIndex; i < channel.keyframes.length; i++) {
          const kf = channel.keyframes[i];
          let t = kf.timestamp + (kf.selected ? this.grabOffset : 0);
          if (kf.selected && this.scaling) t = this.renderScaled(t);

          if (t > cutoffTimeRight) {
            // Quit early if we're over the right edge
            if (this.grabbing) {
              continue;
            } else {
              break;
            }
          } else if (t < cutoffTimeLeft) {
            continue;
          }

          const x = this.absoluteTimeToPx(t) - layout.sidebarWidth;

          // const next = channel.keyframes[i + 1];
          // const playing =
          //   kf.timestamp <= this.audio.currentTime &&
          //   (!next || next.timestamp > this.audio.currentTime);
          const playing = false;

          const selected =
            kf.selected ||
            (boxSelectingChannel &&
              kf.timestamp >= this.boxSelection!.startTime &&
              kf.timestamp <= this.boxSelection!.endTime);

          const source =
            kf.value === 0
              ? selected
                ? this.diamondCache!.keyframeOffSelected
                : playing
                  ? this.diamondCache!.keyframeOffPlaying
                  : this.diamondCache!.keyframeOff
              : selected
                ? this.diamondCache!.keyframeOnSelected
                : playing
                  ? this.diamondCache!.keyframeOnPlaying
                  : this.diamondCache!.keyframeOn;

          ctx.drawImage(
            source,
            x - layout.keyframeSize / 2,
            y - layout.keyframeSize / 2,
            layout.keyframeSize,
            layout.keyframeSize,
          );
        }
      });
    }
    performance.mark('keyframes-end');

    ctx.resetTransform();
    ctx.scale(this.dpiScale, this.dpiScale);

    //// Marker
    const scrubberTime = this.audio.currentTime || 0;
    const scrubberPos =
      (scrubberTime - this.position) * this.pxPerSecond + layout.sidebarWidth;

    ctx.fillStyle = theme.scrubber;
    if (scrubberPos < layout.sidebarWidth) {
      // Left off-screen scrubber indicator triangle
      ctx.beginPath();
      ctx.moveTo(layout.sidebarWidth + 1, 5);
      ctx.lineTo(layout.sidebarWidth + 6, 0);
      ctx.lineTo(layout.sidebarWidth + 6, 10);
      ctx.fill();
    } else if (scrubberPos > this.canvasWidth) {
      // Right off-screen scrubber indicator triangle
      ctx.beginPath();
      ctx.moveTo(this.canvasWidth - 1, 5);
      ctx.lineTo(this.canvasWidth - 6, 0);
      ctx.lineTo(this.canvasWidth - 6, 10);
      ctx.fill();
    } else {
      // Scrubber line
      ctx.fillStyle = theme.scrubber;
      ctx.fillRect(scrubberPos, 0, 1, this.canvasHeight);
    }

    //// Selection box
    if (this.boxSelection) {
      const r = pointsToRect(this.boxSelection.start, this.boxSelection.end);

      ctx.strokeStyle = theme.boxSelectOutline;
      // ctx.fillStyle = "transparent";
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.rect(r.position.x, r.position.y, r.size.width, r.size.height);
      // ctx.fill();
      ctx.stroke();
    }

    //// Sidebar
    ctx.fillStyle = theme.sidebar;
    ctx.fillRect(0, 0, layout.sidebarWidth, this.canvasHeight);

    // Current time
    const timeString = stringifyTime(this.audio.currentTime, 'milliseconds');
    this.currentTimeDisplay.innerHTML = timeString;

    // ctx.font = '16px Courier New,monospace';
    // ctx.fillStyle = theme.ticks;
    // ctx.fillText(timeString, 4, 20);

    // ctx.lineWidth = 1;
    // ctx.strokeStyle = 'white';
    // ctx.strokeRect(4, 2, 90, 22);

    // Turn the lights on or off
    this.lights.forEach((light, i) => {
      const time = this.audio.currentTime || 0;
      const keyframeIndex = this.data?.binarySearch(i, time, 'left');
      let on = false;
      if (keyframeIndex !== undefined) {
        on = (this.data?.channels[i].keyframes[keyframeIndex].value || 0) > 0;
      }
      on = false; // Temporary: disable svg lights
      this.lights[i].style.visibility = on ? 'visible' : 'hidden';
    });

    this.data?.channels.forEach((track, i) => {
      const xPadding = 8;
      const yPadding = 4;
      const fontSize = layout.channelHeight - yPadding * 2;

      const x = 8;
      const y = channelsY + (i + 1) * layout.channelHeight - yPadding;

      const time = this.audio.currentTime || 0;
      const keyframeIndex = this.data?.binarySearch(i, time, 'left');
      let on = false;
      if (keyframeIndex !== undefined) {
        on = (this.data?.channels[i].keyframes[keyframeIndex].value || 0) > 0;
      }

      const color = on ? theme.keyframeOn : 'black';

      ctx.font = `${fontSize}px sans-serif`;
      ctx.fillStyle = color;
      ctx.fillText(`Track ${i}`, x, y, layout.sidebarWidth - xPadding * 2);
    })

    // const lights = document.createElement('canvas');
    // lights.width = layout.sidebarWidth;
    // lights.height = layout.channelHeight;
    // const lctx = lights.getContext('2d')!;
    // lctx.fillStyle = 'red';

    performance.mark('draw-end');

    performance.measure('draw full', 'draw-start', 'draw-end');
    performance.measure(
      'draw waveform',
      'draw-waveform-start',
      'draw-waveform-end',
    );
    performance.measure('diamonds', 'diamonds-start', 'diamonds-end');
    performance.measure('keyframes', 'keyframes-start', 'keyframes-end');

    // In order to get sub-ms precision here the following headers
    // need to be set on the server:
    //
    //   Cross-Origin-Opener-Policy: same-origin
    //   Cross-Origin-Embedder-Policy: require-corp

    const getPerfMS = (key: string) => {
      return performance.getEntriesByName(key)[0].duration.toPrecision(3);
    };

    this.debugDisplay.style.color = theme.debugText;
    this.debugDisplay.innerText = `Frametime: ${getPerfMS('draw full')}ms
  waveform: ${getPerfMS('draw waveform')}ms
  diamonds: ${getPerfMS('diamonds')}ms
  keyframes: ${getPerfMS('keyframes')}ms
Resolution: ${this.canvas.width}x${this.canvas.height}
Element size: ${this.canvasWidth}x${this.canvasHeight}
DPI scale: ${this.dpiScale}`;

    performance.clearMarks();
    performance.clearMeasures();

    this.emitter.emit('render', undefined);
  };

  ///////////////////
  // Panning

  private startPan = (x: number) => {
    this.panStartPx = x;
  };

  private updatePan = (x: number) => {
    this.panOffset = (this.panStartPx - x) / this.pxPerSecond;
    this.requestDraw();
  };

  private applyPan = () => {
    this.basePosition = this.position;
    this.panOffset = 0;
    this.panStartPx = 0;
  };

  ///////////////////
  // Seeking

  private seek = (time: number, snapping: boolean) => {
    if (snapping) {
      const nearest = this.data?.findNearest(time);
      if (nearest) {
        time = nearest.timestamp;
      }
    }

    this.audio.currentTime = Math.max(time, 0);
    this.requestDraw();
  };

  ///////////////////
  // Grabbing

  private grabbing = false;
  private grabStart: number | undefined;
  private grabOffset = 0; // Offset in time

  private startGrab = () => {
    this.grabbing = true;
  };

  private updateGrab = (p: Point) => {
    if (!this.grabStart) {
      this.grabStart = this.absolutePxToTime(p.x);
    }

    this.grabOffset = this.absolutePxToTime(p.x) - this.grabStart;
  };

  private cancelGrab = () => {
    this.grabbing = false;
    this.grabStart = undefined;
    this.grabOffset = 0;
  };

  private finalizeGrab = () => {
    this.data?.moveSelected(this.grabOffset);
    this.cancelGrab();
  };

  ///////////////////
  // Scaling

  private scaling = false;
  private scaleStart: number | undefined;
  private scalePivot = 0;
  private scaleEnd = 0;
  private scale = 1;

  private startScale = () => {
    if (!this.data) return;

    const { first, last } = this.data.firstLastSelected();

    if (!first && !last) return;
    if (first === last) return;

    this.scaling = true;

    this.scalePivot = first;
    this.scaleEnd = last;
  };

  private updateScale = (p: Point) => {
    if (!this.scaleStart) {
      this.scaleStart = this.absolutePxToTime(p.x);
    }

    const offset = this.absolutePxToTime(p.x) - this.scaleStart;

    const originalSize = this.scaleEnd - this.scalePivot;
    this.scale = (originalSize + offset) / originalSize;
  };

  private renderScaled = (t: number) => {
    return (t - this.scalePivot) * this.scale + this.scalePivot;
  };

  private finalizeScale = () => {
    this.data?.scaleSelected(this.scalePivot, this.scale);
    this.cancelScale();
  };

  private cancelScale = () => {
    this.scaling = false;
    this.scaleStart = undefined;
    this.scalePivot = 0;
    this.scaleEnd = 0;
  };

  ///////////////////
  // Event handlers

  private handleMouseDown = (e: MouseEvent) => {
    const { x, y } = this.getLocalCoordinates(e);

    const { waveformHeight, timelineHeight } = this.config.layout;

    if (e.button === LEFT_MOUSE_BUTTON) {
      const time = this.absolutePxToTime(x);
      if (this.grabbing) {
        // Place grabbed keyframes
        this.finalizeGrab();
      } else if (this.scaling) {
        this.finalizeScale();
      } else if (y < waveformHeight + timelineHeight) {
        // Seek
        if (time > 0) {
          this.seeking = true;
          this.seek(time, e.ctrlKey);
          this.requestDraw();
        }
      } else {
        // Select
        const channel = this.absolutePxToChannel(y);
        if (channel !== null) {
          // Select single keyframe
          const tolerance =
            this.config.layout.keyframeSize / 2 / this.pxPerSecond;
          const k = this.data?.selectSingle(
            channel,
            time,
            tolerance,
            e.shiftKey,
          );

          // If no single keyframe was clicked, start a box select
          if (k === undefined) {
            this.updateBoxSelection({ x, y });

            if (this.boxSelection) {
              this.boxSelection.keepExisting = e.shiftKey;
            }
          }
        }
      }
    } else if (e.button === RIGHT_MOUSE_BUTTON) {
      if (this.grabbing) {
        // Cancel grab
        this.cancelGrab();
      } else if (this.scaling) {
        this.cancelScale();
      }
      // Insert new frame
      else {
        const channel = this.absolutePxToChannel(y);
        if (channel !== null) {
          const time = this.absolutePxToTime(x);
          const value = e.altKey ? 0 : 1;

          if (e.ctrlKey) {
            this.data?.insertColumn(time, value);
          } else {
            this.data?.insertSingle(channel, time, value);
          }
        }
      }
    } else if (e.button === MIDDLE_MOUSE_BUTTON) {
      this.startPan(x);
    }

    this.requestDraw();
  };

  private updateBoxSelection = (p: Point) => {
    if (!this.boxSelection) {
      this.boxSelection = {
        start: p,
        end: p,
        startChannel: 0,
        endChannel: 0,
        startTime: 0,
        endTime: 0,
        keepExisting: false,
      };
    }

    this.boxSelection.end = {
      x: clamp(p.x, this.config.layout.sidebarWidth, this.canvasWidth),
      y: clamp(
        p.y,
        this.config.layout.timelineHeight + this.config.layout.waveformHeight,
        this.canvasHeight,
      ),
    };

    const start = rangeStart(this.boxSelection.start, this.boxSelection.end);
    const end = rangeEnd(this.boxSelection.start, this.boxSelection.end);

    this.boxSelection.startTime = this.absolutePxToTime(start.x);
    this.boxSelection.endTime = this.absolutePxToTime(end.x);

    this.boxSelection.startChannel = this.absolutePxToChannel(start.y) || 0;
    this.boxSelection.endChannel = this.absolutePxToChannel(end.y) || 0;
  };

  private handleMouseMove = (e: MouseEvent) => {
    const { x, y } = this.getLocalCoordinates(e);

    if (mouse.middleButtonHeld(e)) {
      this.updatePan(x);
    } else if (this.panOffset) {
      this.applyPan();
    }

    if (this.seeking) {
      const clamped = Math.min(
        Math.max(this.config.layout.sidebarWidth, x),
        this.canvasWidth,
      );
      const time = this.absolutePxToTime(clamped);
      this.seek(time, e.ctrlKey);
    }

    if (this.boxSelection) {
      if (mouse.leftButtonHeld(e)) {
        this.updateBoxSelection({ x, y });
      } else {
        this.boxSelection = undefined;
      }
      this.requestDraw();
    }

    if (this.grabbing) {
      this.updateGrab({ x, y });
      this.requestDraw();
    }

    if (this.scaling) {
      this.updateScale({ x, y });
      this.requestDraw();
    }
  };

  private handleMouseUp = (e: MouseEvent) => {
    if (e.button === MIDDLE_MOUSE_BUTTON) {
      this.applyPan();
    } else if (e.button === LEFT_MOUSE_BUTTON) {
      if (this.boxSelection) {
        const size = abs(
          difference(this.boxSelection.start, this.boxSelection.end),
        );

        // Don't count it as a box select unless the box is bigger than 2x2 px
        if (size.x > 2 && size.y > 2) {
          this.data?.boxSelect(this.boxSelection);
        }

        this.boxSelection = undefined;
      }
    }
    this.seeking = false;

    this.requestDraw();
  };

  private handleWheel = (e: WheelEvent) => {
    e.preventDefault();

    // Very hacky way to detect touchpad: if the delta is "small" it's probably
    // not a wheel (wheel seems to give values of around 100?)
    const isTouchpad = true; // Math.max(Math.abs(e.deltaX), Math.abs(e.deltaY)) < 50;

    // On touchpad, ctrlKey is set by the browser when doing a pinch-to-zoom. On
    // mouse, we zoom by default (no ctrlKey), unless the shift key is held.
    const zooming = isTouchpad ? e.ctrlKey : !e.shiftKey;

    if (zooming) {
      const { x, y: _ } = this.getLocalCoordinates(e);
      const anchorTime = this.absolutePxToTime(x);

      const zoomPerDelta = 0.0005;
      this.zoom = clamp(this.zoom - e.deltaY * zoomPerDelta, 0, 1);

      const newTime = this.absolutePxToTime(x);
      this.basePosition = Math.max(this.basePosition + anchorTime - newTime, 0);
    } else {
      // If not zooming, then scroll-pan
      const delta = isTouchpad ? e.deltaX : e.deltaY;
      const pxPerDelta = 1;
      const offset = (delta * pxPerDelta) / this.pxPerSecond;

      this.basePosition = Math.max(this.basePosition + offset, 0);
    }

    this.requestDraw();
  };

  private handleKeyDown = (e: KeyboardEvent): boolean => {
    // Ignore if an input is focused
    const target = e.target as EventTarget & { nodeName: string; type: string };
    if (target?.nodeName === 'INPUT' && target?.type === 'text') {
      return false;
    }

    // Ignore if the event is being fired because the key is held
    if (e.repeat) return false;

    const normalizedKey = e.key.toLowerCase();

    if (normalizedKey === 'b') {
      // Benchmark
      let start = performance.now();
      this.data?.channels.forEach((channel) =>
        channel.keyframes.forEach((keyframe) => (keyframe.selected = false)),
      );
      let duration = performance.now() - start;
      console.log('Iterating over all keyframes took', duration);

      start = performance.now();
      const cloned = JSON.parse(JSON.stringify(this.data?.channels));
      cloned.length;
      duration = performance.now() - start;
      console.log('Cloning keyframes took', duration);
    }

    let combo = '';
    if (apple() ? e.metaKey : e.ctrlKey) combo += 'ctrl_';
    if (e.shiftKey) combo += 'shift_';
    combo += normalizedKey;

    const command = keybinds[combo];
    if (command) {
      this.execute(command);
      e.preventDefault();
      return true;
    }

    return false;
  };

  play = () => {
    this.audio.play();
    this.requestDraw();
  };

  pause = () => {
    this.audio.pause();
  };

  playPause = () => {
    if (this.audio.isPlaying()) {
      this.pause();
    } else {
      this.play();
    }
  };

  setPlaybackRate = (rate: number) => {
    this.audio.playbackRate = rate;
  };

  download = () => {
    if (!this.data) return;

    const marshaled = JSON.stringify(toLegacyFormat(this.data.channels));
    downloadFile('My show.json', marshaled);
  };

  export = async (): Promise<Project> => {
    return {
      name: '',
      data: { tracks: this.data?.channels || [] },
      audio: await localPersistence.getAudio(),
    };
  };

  private commandHandlers: Record<Command, () => void> = {
    play: this.play,
    pause: this.pause,
    playtoggle: this.playPause,
    undo: () => this.data?.undo(),
    redo: () => this.data?.redo(),
    invert: () => this.data?.invertSelected(),
    shiftUp: () => this.data?.shiftSelected('up'),
    shiftDown: () => this.data?.shiftSelected('down'),
    flipVertically: () => this.data?.flipSelected(),
    grab: this.startGrab,
    scale: this.startScale,
    align: () => this.data?.alignSelected(),
    snapToCursor: () => this.data?.snapTo(this.audio.currentTime),
    equallySpace: () => this.data?.equallySpaceSelected(),
    duplicate: () => {
      this.data?.duplicateSelected();
      this.startGrab();
    },
    cancel: this.cancelGrab,
    delete: () => this.data?.deleteSelected(),
    dedup: () => this.data?.dedup(),
    pickAudioFile: () => this.persistence.pickAudio(),
    selectAll: () => this.data?.selectAll(true),

    downloadLegacy: this.download,
  };

  execute = (command: Command) => {
    this.commandHandlers[command]();
    this.requestDraw();
  };

  executeWithArgs = <T extends ComplexCommand>(command: T, arg: ArgOf<T>) => {
    if (command === 'setVolume') {
      this.audio.volume = arg as number;
    }
  };

  ///////////////////
  // State ?

  getPrompt = (): string => {
    if (this.grabbing) {
      return `Moving keyframes; (Right-click or Esc to cancel)`;
    }

    if (this.scaling) {
      return `Scaling keyframes; (Right-click or Esc to cancel)`;
    }

    if (this.boxSelection) {
      return `Box-selecting; (Right-click or Esc to cancel)`;
    }

    return '';
  };

  hasExistingData = () => {
    return true;
    return (
      this.data?.channels.find((t) => t.keyframes.length > 0) !== undefined
    );
  };
}

export default Timeline;
