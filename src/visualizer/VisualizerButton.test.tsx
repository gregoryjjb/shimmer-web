// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render } from 'solid-js/web';
import VisualizerButton from './VisualizerButton';

vi.mock('../TimelineContext', () => ({
  useTimeline: () => ({ loading: () => false, timeline: { pause: vi.fn() } }),
}));
vi.mock('./VisualizerPanel', () => ({
  default: (props: { onClose: () => void }) => <button onClick={props.onClose}>Close panel</button>,
}));
vi.mock('./VisualizerEditor', () => ({ default: () => null }));

let host: HTMLDivElement;
let dispose: () => void;
beforeEach(() => {
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => {
  dispose?.();
  host.remove();
});
const mount = () => {
  dispose = render(() => <VisualizerButton />, host);
};
const toggle = () => host.querySelector<HTMLButtonElement>('button[aria-pressed]')!;

test('restores visibility across mounts and saves both toggle and panel-close actions', () => {
  mount();
  expect(host.textContent).not.toContain('Edit visualizer');
  expect(toggle().textContent).toBe('Show visualizer');
  toggle().click();
  expect(localStorage.getItem('shimmer.visualizer.visible')).toBe('true');
  dispose();
  mount();
  expect(toggle().textContent).toBe('Hide visualizer');
  Array.from(host.querySelectorAll('button'))
    .find((button) => button.textContent === 'Close panel')!
    .click();
  expect(localStorage.getItem('shimmer.visualizer.visible')).toBe('false');
  toggle().click();
  toggle().click();
  expect(localStorage.getItem('shimmer.visualizer.visible')).toBe('false');
  dispose();
  mount();
  expect(toggle().textContent).toBe('Show visualizer');
});

test('toggling visibility preserves saved geometry', () => {
  localStorage.setItem('shimmer.visualizer.visible', 'true');
  localStorage.setItem('shimmer.visualizer.position', JSON.stringify({ x: 100, y: 150 }));
  localStorage.setItem('shimmer.visualizer.width', '600');
  mount();
  toggle().click();
  expect(localStorage.getItem('shimmer.visualizer.visible')).toBe('false');
  expect(JSON.parse(localStorage.getItem('shimmer.visualizer.position')!)).toEqual({
    x: 100,
    y: 150,
  });
  expect(localStorage.getItem('shimmer.visualizer.width')).toBe('600');
});
