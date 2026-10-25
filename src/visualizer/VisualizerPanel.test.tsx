// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { LayoutNode } from '../timeline/types';
import { loadVisualizer } from './storage';
import VisualizerPanel from './VisualizerPanel';

vi.mock('./storage', () => ({ loadVisualizer: vi.fn() }));

const rectangle = { x: 0.2, y: 0.3, width: 0.1, height: 0.05, color: '#ff8800' };
const tracks: LayoutNode[] = [
  {
    type: 'group',
    id: 'House',
    children: [
      {
        type: 'track',
        id: 'Roof',
        locked: true,
        keyframes: [
          { ts: 1, value: 1 },
          { ts: 3, value: 0 },
        ],
      },
      {
        type: 'track',
        id: 'Door',
        locked: false,
        keyframes: [
          { ts: 2, value: 1 },
          { ts: 4, value: 0 },
        ],
      },
    ],
  },
  { type: 'track', id: 'Beat', locked: true, keyframes: [{ ts: 5, value: 1 }] },
];
let dispose: (() => void) | undefined;
let host: HTMLDivElement;
const lights = () =>
  Array.from(document.querySelectorAll('svg[aria-label="Live lights"] rect')).map((rect) =>
    rect.getAttribute('data-track'),
  );

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:house'), revokeObjectURL: vi.fn() });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.mocked(loadVisualizer).mockResolvedValue({
    config: {
      Roof: [rectangle, { ...rectangle, x: 0.4 }],
      Door: [rectangle],
      Beat: [rectangle],
      House: [rectangle],
      Missing: [rectangle],
    },
    image: new Blob(['house']),
  });
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
  const [revision, setRevision] = createSignal(0);
  const [data, setData] = createSignal(tracks);
  const close = vi.fn();
  const edit = vi.fn();
  dispose = render(
    () => (
      <VisualizerPanel
        tracks={data()}
        currentTime={time()}
        playing={playing()}
        loading={loading()}
        refreshKey={revision()}
        onClose={close}
        onEdit={edit}
      />
    ),
    host,
  );
  return { setTime, setPlaying, setLoading, setRevision, setData, close, edit };
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
  panel.setData([]);
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

test('refreshes saved configurations and releases image URLs on replacement and close', async () => {
  const panel = open();
  await vi.waitFor(() => expect(document.querySelector('img')).not.toBeNull());
  panel.setTime(1);
  vi.mocked(loadVisualizer).mockResolvedValue({
    config: { Roof: [{ ...rectangle, color: '#00ff00' }] },
    image: new Blob(['new photo']),
  });
  vi.mocked(URL.createObjectURL).mockReturnValue('blob:new-house');
  panel.setRevision(1);
  await vi.waitFor(() =>
    expect(document.querySelector('img')?.getAttribute('src')).toBe('blob:new-house'),
  );
  expect(lights()).toEqual(['Roof']);
  expect(document.querySelector('rect')?.getAttribute('fill')).toBe('#00ff00');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:house');
  dispose?.();
  dispose = undefined;
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:new-house');
});

test('offers setup when no image is saved and retries failed loads', async () => {
  vi.mocked(loadVisualizer).mockRejectedValueOnce(new Error('Storage unavailable'));
  const panel = open();
  await vi.waitFor(() =>
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Storage unavailable'),
  );
  vi.mocked(loadVisualizer).mockResolvedValue({ config: {}, image: null });
  Array.from(document.querySelectorAll('button'))
    .find((button) => button.textContent === 'Retry loading')!
    .click();
  await vi.waitFor(() => expect(document.body.textContent).toContain('Set up visualizer'));
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
});
