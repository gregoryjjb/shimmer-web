// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { LayoutNode, Tracks } from '../timeline/types';
import { LayoutVisuals } from '../layout/document';
let visuals: LayoutVisuals;
import VisualizerPanel from './VisualizerPanel';

const rectangle = { x: 0.2, y: 0.3, width: 0.1, height: 0.05, color: '#ff8800' };
const layout: LayoutNode[] = [
  {
    type: 'group',
    id: 'House',
    children: [
      { type: 'track', id: 'Roof' },
      { type: 'track', id: 'Door' },
    ],
  },
  { type: 'track', id: 'Beat' },
];
const tracks: Tracks = {
  Roof: {
    locked: true,
    keyframes: [
      { ts: 1, value: 1 },
      { ts: 3, value: 0 },
    ],
  },
  Door: {
    locked: false,
    keyframes: [
      { ts: 2, value: 1 },
      { ts: 4, value: 0 },
    ],
  },
  Beat: { locked: true, keyframes: [{ ts: 5, value: 1 }] },
};
let dispose: (() => void) | undefined;
let host: HTMLDivElement;
const lights = () =>
  Array.from(document.querySelectorAll('svg[aria-label="Live lights"] rect')).map((rect) =>
    rect.getAttribute('data-track'),
  );

beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:house'), revokeObjectURL: vi.fn() });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  visuals = {
    trackObjects: {
      Roof: [rectangle, { ...rectangle, x: 0.4 }],
      Door: [rectangle],
      Beat: [rectangle],
      House: [rectangle],
      Missing: [rectangle],
    },
    backgroundImage: 'data:image/png;base64,aG91c2U=',
  };
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  host.remove();
  vi.unstubAllGlobals();
});

function open() {
  const [time, setTime] = createSignal(0);
  const [playing, setPlaying] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [currentVisuals, setVisuals] = createSignal(visuals);
  const [data, setData] = createSignal(tracks);
  const close = vi.fn();
  const edit = vi.fn();
  dispose = render(
    () => (
      <VisualizerPanel
        layout={layout}
        tracks={data()}
        currentTime={time()}
        playing={playing()}
        loading={loading()}
        visuals={currentVisuals()}
        onClose={close}
        onEdit={edit}
      />
    ),
    host,
  );
  return { setTime, setPlaying, setLoading, setVisuals, setData, close, edit };
}

test('shows only active track rectangles at exact transitions and when seeking backward', async () => {
  const panel = open();
  await vi.waitFor(() => expect(document.querySelector('img')).not.toBeNull());
  expect(lights()).toEqual([]);
  panel.setPlaying(true);
  panel.setTime(1);
  expect(lights()).toEqual(['Roof', 'Roof']);
  panel.setTime(2);
  expect(lights()).toEqual(['Roof', 'Roof', 'Door']);
  panel.setTime(3);
  expect(lights()).toEqual(['Door']);
  panel.setTime(4);
  expect(lights()).toEqual([]);
  panel.setPlaying(false);
  panel.setTime(1.5);
  expect(lights()).toEqual(['Roof', 'Roof']);
  panel.setLoading(true);
  expect(lights()).toEqual([]);
  panel.setLoading(false);
  panel.setData({});
  expect(lights()).toEqual([]);
  expect(document.querySelector('img')).not.toBeNull();
});

test('beat rectangles flash for the same duration as the timeline track tree', async () => {
  const panel = open();
  await vi.waitFor(() => expect(document.querySelector('img')).not.toBeNull());
  panel.setTime(5);
  expect(lights()).toEqual(['Beat']);
  panel.setTime(5.05);
  expect(lights()).toEqual(['Beat']);
  panel.setTime(5.11);
  expect(lights()).toEqual([]);
});

test('updates the image and rectangles immediately when shared layout changes', async () => {
  const panel = open();
  panel.setTime(1);
  panel.setVisuals({
    trackObjects: { Roof: [{ ...rectangle, color: '#00ff00' }] },
    backgroundImage: 'data:image/png;base64,bmV3',
  });
  expect(document.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,bmV3');
  expect(lights()).toEqual(['Roof']);
  expect(document.querySelector('rect')?.getAttribute('fill')).toBe('#00ff00');
  panel.setVisuals({ trackObjects: {} });
  expect(document.querySelector('img')).toBeNull();
  expect(lights()).toEqual([]);
});

test('offers setup when the shared layout has no image', () => {
  visuals = { trackObjects: {} };
  const panel = open();
  Array.from(document.querySelectorAll('button'))
    .find((button) => button.textContent === 'Set up visualizer')!
    .click();
  expect(panel.edit).toHaveBeenCalledOnce();
  document.querySelector<HTMLButtonElement>('[aria-label="Close visualizer panel"]')!.click();
  expect(panel.close).toHaveBeenCalledOnce();
});

test('resizes from either corner within viewport limits while playback continues', async () => {
  vi.stubGlobal('innerWidth', 1200);
  vi.stubGlobal('innerHeight', 1000);
  const playback = open();
  await vi.waitFor(() => expect(document.querySelector('img')).not.toBeNull());
  const panel = document.querySelector<HTMLElement>('[aria-label="Live visualizer"]')!;
  const image = panel.querySelector('img')!;
  const panelWidth = () => parseFloat(panel.style.getPropertyValue('--panel-width'));
  const panelLeft = () => parseFloat(panel.style.getPropertyValue('--panel-x'));
  vi.spyOn(panel, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        left: panelLeft(),
        top: parseFloat(panel.style.getPropertyValue('--panel-y')),
        width: panelWidth(),
        height: (panelWidth() - 2) / 2 + 2,
      }) as DOMRect,
  );
  Object.defineProperties(image, { naturalWidth: { value: 1200 }, naturalHeight: { value: 600 } });
  image.dispatchEvent(new Event('load'));
  playback.setVisuals({ ...visuals, trackObjects: { ...visuals.trackObjects } });
  // Saving objects with the same background must preserve its measured aspect ratio.
  expect(panel.querySelectorAll('[aria-label^="Resize visualizer"]')).toHaveLength(2);
  const left = panel.querySelector<HTMLButtonElement>(
    '[aria-label="Resize visualizer from bottom left"]',
  )!;
  const right = panel.querySelector<HTMLButtonElement>(
    '[aria-label="Resize visualizer from bottom right"]',
  )!;
  for (const handle of [left, right]) {
    handle.setPointerCapture = vi.fn();
    handle.hasPointerCapture = vi.fn(() => true);
    handle.releasePointerCapture = vi.fn();
  }
  function pointer(handle: HTMLElement, type: string, x: number, y: number) {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: x,
      clientY: y,
    });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    handle.dispatchEvent(event);
  }
  const originalLeft = panelLeft();
  pointer(left, 'pointerdown', 0, 0);
  pointer(left, 'pointermove', -200, 100);
  expect(panelWidth()).toBeCloseTo(620);
  expect(panelLeft()).toBeCloseTo(originalLeft - 200);
  playback.setPlaying(true);
  playback.setTime(2);
  expect(lights()).toEqual(['Roof', 'Roof', 'Door']);
  pointer(left, 'pointermove', -5000, 2500);
  expect(panelLeft()).toBeGreaterThanOrEqual(8);
  expect(panelLeft() + panelWidth()).toBeLessThanOrEqual(1192);
  pointer(left, 'pointerup', -5000, 2500);
  expect(left.releasePointerCapture).toHaveBeenCalledWith(1);
  pointer(right, 'pointerdown', 0, 0);
  pointer(right, 'pointermove', -5000, -2500);
  expect(panelWidth()).toBe(240);
  pointer(right, 'pointerup', -5000, -2500);
  const key = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
  right.dispatchEvent(key);
  expect(key.defaultPrevented).toBe(true);
  expect(panelWidth()).toBe(260);
  const savedPosition = JSON.parse(localStorage.getItem('shimmer.visualizer.position')!);
  expect(localStorage.getItem('shimmer.visualizer.width')).toBe('260');
  expect(savedPosition.x).toBe(panelLeft());
  dispose?.();
  open();
  const restored = document.querySelector<HTMLElement>('[aria-label="Live visualizer"]')!;
  expect(restored.style.getPropertyValue('--panel-width')).toBe('260px');
  expect(restored.style.getPropertyValue('--panel-x')).toBe(`${savedPosition.x}px`);
  expect(restored.style.getPropertyValue('--panel-y')).toBe(`${savedPosition.y}px`);
});

test('restores saved position, persists dragging, and keeps it when reopened', () => {
  localStorage.setItem('shimmer.visualizer.position', JSON.stringify({ x: 100, y: 80 }));
  localStorage.setItem('shimmer.visualizer.width', '300');
  open();
  const panel = document.querySelector<HTMLElement>('[aria-label="Live visualizer"]')!;
  expect(panel.style.getPropertyValue('--panel-x')).toBe('100px');
  expect(panel.style.getPropertyValue('--panel-y')).toBe('80px');
  panel.setPointerCapture = vi.fn();
  for (const [type, x, y] of [
    ['pointerdown', 100, 80],
    ['pointermove', 150, 110],
  ] as const) {
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    panel.dispatchEvent(event);
  }
  expect(JSON.parse(localStorage.getItem('shimmer.visualizer.position')!)).toEqual({
    x: 150,
    y: 110,
  });
  expect(localStorage.getItem('shimmer.visualizer.width')).toBe('300');
  dispose?.();
  open();
  const restored = document.querySelector<HTMLElement>('[aria-label="Live visualizer"]')!;
  expect(restored.style.getPropertyValue('--panel-x')).toBe('150px');
  expect(restored.style.getPropertyValue('--panel-y')).toBe('110px');
});
