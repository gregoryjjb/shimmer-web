// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import TrackTree from './TrackTree';
import Timeline from './timeline/timeline';

vi.mock('./TimelineContext', () => ({ useTimeline: () => context }));
vi.mock('./timeline/timeline-audio', () => ({
  default: class {
    currentTime = 0;
    on() {}
    destroy() {}
  },
}));

function makeContext(timeline: Timeline) {
  const [visibleRows, setRows] = createSignal(timeline.visibleRows);
  const [pan, setPan] = createSignal(timeline.pan);
  timeline.on('collapsedGroupsChanged', () => setRows(timeline.visibleRows));
  timeline.on('dataChanged', () => setRows(timeline.visibleRows));
  timeline.on('pan', setPan);
  return { timeline, visibleRows, pan, currentTime: () => 0 };
}

let context: ReturnType<typeof makeContext>;
let timeline: Timeline;
let host: HTMLDivElement;
let canvasHost: HTMLDivElement;
let dispose: () => void;
const button = (label: string) => host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
const rowY = (id: string) => 140 + timeline.visibleRows.find((row) => row.id === id)!.startY + 15;
const pointer = (
  target: EventTarget,
  type: string,
  x: number,
  y: number,
  button = 0,
  buttons = 0,
) =>
  target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button, buttons }),
  );

beforeEach(() => {
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  host = document.createElement('div');
  canvasHost = document.createElement('div');
  document.body.append(host, canvasHost);
  timeline = new Timeline();
  timeline.attach(canvasHost);
  timeline.resizeCanvas(1000, 600);
  timeline.replaceData({
    version: '3',
    tracks: {
      'Roof 1': { locked: false, keyframes: [{ ts: 1, value: 1, selected: true }] },
      'Fence 1': { locked: false, keyframes: [{ ts: 1, value: 1 }] },
      'Fence 2': { locked: false, keyframes: [{ ts: 1, value: 1 }] },
      'Fence 3': { locked: true, keyframes: [{ ts: 1, value: 1 }] },
    },
  });
  context = makeContext(timeline);
  dispose = render(() => <TrackTree />, host);
});

afterEach(() => {
  dispose();
  timeline.destroy();
  host.remove();
  canvasHost.remove();
  vi.unstubAllGlobals();
});

test('disclosure buttons hide descendants and preserve nested collapse choices', () => {
  button('Collapse group Roof parkview').click();
  expect(button('Expand group Roof parkview').getAttribute('aria-expanded')).toBe('false');
  expect(host.querySelector('[title="Roof 1"]')).toBeNull();
  button('Collapse group Roof').click();
  expect(host.querySelector('[title="Roof parkview"]')).toBeNull();
  expect(button('Lock group Roof').disabled).toBe(true);
  button('Expand group Roof').click();
  expect(button('Expand group Roof parkview')).not.toBeNull();
  expect(host.querySelector('[title="Roof 1"]')).toBeNull();
  button('Expand group Roof parkview').click();
  expect(host.querySelector('[title="Roof 1"]')).not.toBeNull();
});

test('canvas selection and insertion target the rows displayed after collapsing', () => {
  button('Collapse group Roof').click();
  const canvas = canvasHost.querySelector('canvas')!;
  const pixelsPerSecond = Math.sqrt(8 * 1000);
  pointer(canvas, 'mousedown', pixelsPerSecond, rowY('Fence 1'));
  pointer(window, 'mouseup', pixelsPerSecond, rowY('Fence 1'));
  expect(timeline.projectData.tracks['Fence 1'].keyframes[0].selected).toBe(true);
  expect(timeline.projectData.tracks['Roof 1'].keyframes[0].selected).toBe(true);
  pointer(canvas, 'mousedown', pixelsPerSecond * 2, rowY('Fence 1'), 2);
  expect(timeline.projectData.tracks['Fence 1'].keyframes.map((kf) => kf.ts)).toEqual([1, 2]);
  expect(timeline.projectData.tracks['Roof 1'].keyframes).toHaveLength(1);
});

test('box selection uses visible row coordinates and skips locked tracks', () => {
  button('Collapse group Roof').click();
  const canvas = canvasHost.querySelector('canvas')!;
  pointer(canvas, 'mousedown', 1, rowY('Fence 1') - 10);
  pointer(window, 'mousemove', 150, rowY('Fence 3') + 10, 0, 1);
  pointer(window, 'mouseup', 150, rowY('Fence 3') + 10);
  expect(timeline.projectData.tracks['Fence 1'].keyframes[0].selected).toBe(true);
  expect(timeline.projectData.tracks['Fence 2'].keyframes[0].selected).toBe(true);
  expect(timeline.projectData.tracks['Fence 3'].keyframes[0].selected).toBeUndefined();
  expect(timeline.projectData.tracks['Roof 1'].keyframes[0].selected).toBe(true);
});

test('collapsing clamps vertical scroll and synchronizes the sidebar', () => {
  const canvas = canvasHost.querySelector('canvas')!;
  pointer(canvas, 'mousedown', 300, 400, 1);
  pointer(window, 'mousemove', 300, -1600, 1, 4);
  pointer(window, 'mouseup', 300, -1600, 1);
  expect(timeline.pan.y).toBeGreaterThan(0);
  timeline.setGroupCollapsed('Root', true);
  expect(timeline.pan.y).toBe(0);
  expect(context.pan().y).toBe(0);
  expect(timeline.visibleRows.map((row) => row.id)).toEqual(['Root']);
});
