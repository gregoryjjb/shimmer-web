// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render } from 'solid-js/web';
import { LayoutNode } from '../timeline/types';
import { LayoutVisuals } from '../layout/document';
import { VisualizerConfig } from './types';
let visuals: LayoutVisuals;
const saveVisualizer = vi.fn<(config: VisualizerConfig, image: string) => Promise<void>>();
import VisualizerEditor from './VisualizerEditor';
import { serializeRectangle } from './clipboard';
import { optimizeBackgroundImage } from './background-image';

vi.mock('./background-image', () => ({ optimizeBackgroundImage: vi.fn() }));

const tracks: LayoutNode[] = [
  {
    type: 'group',
    id: 'House',
    children: [
      { type: 'track', id: 'Roof' },
      {
        type: 'group',
        id: 'Windows',
        children: [{ type: 'track', id: 'Left window' }],
      },
    ],
  },
];
let dispose: (() => void) | undefined;
let host: HTMLDivElement;
const button = (text: string) => {
  const element = Array.from(document.querySelectorAll('button')).find(
    (item) => item.textContent?.trim() === text,
  );
  if (!element) throw new Error(`Missing button: ${text}`);
  return element;
};
const trackButton = (name: string) =>
  document.querySelector<HTMLButtonElement>(`button[title="${name}"]`)!;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(optimizeBackgroundImage).mockResolvedValue('data:image/webp;base64,d2VicA==');
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      decode = vi.fn().mockResolvedValue(undefined);
    },
  );
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:test-house'),
    revokeObjectURL: vi.fn(),
  });
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
  visuals = {
    trackObjects: Object.create(null),
    backgroundImage: 'data:image/png;base64,cGhvdG8=',
  };
  vi.mocked(saveVisualizer).mockResolvedValue(undefined);
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  host.remove();
  vi.unstubAllGlobals();
});

async function open() {
  const close = vi.fn();
  dispose = render(
    () => (
      <VisualizerEditor
        layout={tracks}
        visuals={visuals}
        onSave={(value) => saveVisualizer(value.trackObjects, value.backgroundImage!)}
        onClose={close}
      />
    ),
    host,
  );
  await vi.waitFor(() => expect(button('+ Add rectangle').disabled).toBe(false));
  return close;
}

test('nested groups are labels and multiple rectangles retain a single track owner', async () => {
  await open();
  expect(trackButton('House')).toBeNull();
  expect(trackButton('Windows')).toBeNull();
  expect(document.querySelector('aside[aria-label="Visualizer tracks"]')?.textContent).toContain(
    'Windows',
  );
  button('+ Add rectangle').click();
  button('Duplicate').click();
  expect(button('Rectangle 2').getAttribute('aria-pressed')).toBe('true');
  trackButton('Left window').click();
  button('+ Add rectangle').click();
  button('Save and close').click();
  await vi.waitFor(() => expect(saveVisualizer).toHaveBeenCalledOnce());
  const saved = vi.mocked(saveVisualizer).mock.calls[0][0];
  expect(Object.keys(saved)).toEqual(['Roof', 'Left window']);
  expect(saved.Roof).toHaveLength(2);
  expect(saved.Roof[1]).toMatchObject({
    width: saved.Roof[0].width,
    height: saved.Roof[0].height,
    color: saved.Roof[0].color,
  });
  expect(saved.Roof[1]).not.toBe(saved.Roof[0]);
  expect(saved['Left window']).toHaveLength(1);
  expect(saved.Roof[0]).not.toBe(saved['Left window'][0]);
});

test('cancel leaves the previously loaded objects untouched and writes nothing', async () => {
  const config = { Roof: [{ x: 0.2, y: 0.2, width: 0.1, height: 0.1, color: '#ffffff' }] };
  visuals = { trackObjects: config, backgroundImage: 'data:image/png;base64,cGhvdG8=' };
  const close = await open();
  button('Rectangle 1').click();
  button('Delete').click();
  button('Cancel').click();
  expect(close).toHaveBeenCalledOnce();
  expect(saveVisualizer).not.toHaveBeenCalled();
  expect(config.Roof).toHaveLength(1);
});

test('save errors preserve the draft and allow retry', async () => {
  const close = await open();
  button('+ Add rectangle').click();
  vi.mocked(saveVisualizer).mockRejectedValueOnce(new Error('Storage is full'));
  button('Save and close').click();
  await vi.waitFor(() =>
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Storage is full'),
  );
  expect(close).not.toHaveBeenCalled();
  expect(button('Rectangle 1')).toBeDefined();
  button('Save and close').click();
  await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
});

test('keyboard events cannot reach the timeline, even when the file picker leaves body focused', async () => {
  await open();
  const timelineKey = vi.fn();
  window.addEventListener('keydown', timelineKey);
  try {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(timelineKey).not.toHaveBeenCalled();
    dispose?.();
    dispose = undefined;
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(timelineKey).toHaveBeenCalledOnce();
  } finally {
    window.removeEventListener('keydown', timelineKey);
  }
});

function paste(file?: File) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      items: file
        ? [{ kind: 'file', type: file.type, getAsFile: () => file }]
        : [{ kind: 'string', type: 'text/plain' }],
      files: file ? [file] : [],
      getData: () => '',
    },
  });
  document.body.dispatchEvent(event);
  return event;
}

test('pasting an image replaces the draft background and saves it with existing rectangles', async () => {
  await open();
  button('+ Add rectangle').click();
  const screenshot = new File(['screenshot'], 'clipboard.png', { type: 'image/png' });
  expect(paste(screenshot).defaultPrevented).toBe(true);
  await vi.waitFor(() => expect(button('Save and close').disabled).toBe(false));
  expect(optimizeBackgroundImage).toHaveBeenCalledWith(screenshot);
  expect(document.querySelector('img')?.getAttribute('src')).toBe(
    'data:image/webp;base64,d2VicA==',
  );
  expect(saveVisualizer).not.toHaveBeenCalled();
  button('Save and close').click();
  await vi.waitFor(() => expect(saveVisualizer).toHaveBeenCalledOnce());
  const [config, image] = vi.mocked(saveVisualizer).mock.calls[0];
  expect(config.Roof).toHaveLength(1);
  expect(image).toBe('data:image/webp;base64,d2VicA==');
});

test('uploads are optimized, and compression failures preserve the current background', async () => {
  await open();
  expect(optimizeBackgroundImage).not.toHaveBeenCalled();
  const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
  const file = new File(['photo'], 'house.jpg', { type: 'image/jpeg' });
  Object.defineProperty(input, 'files', { value: [file] });
  vi.mocked(optimizeBackgroundImage).mockRejectedValueOnce(new Error('Cannot encode WebP'));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() =>
    expect(document.querySelector('[role=alert]')?.textContent).toContain('Cannot encode WebP'),
  );
  expect(document.querySelector('img')?.getAttribute('src')).toBe(visuals.backgroundImage);
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() =>
    expect(document.querySelector('img')?.getAttribute('src')).toBe(
      'data:image/webp;base64,d2VicA==',
    ),
  );
  expect(optimizeBackgroundImage).toHaveBeenLastCalledWith(file);
  button('Save and close').click();
  await vi.waitFor(() =>
    expect(saveVisualizer).toHaveBeenCalledWith({}, 'data:image/webp;base64,d2VicA=='),
  );
  expect(optimizeBackgroundImage).toHaveBeenCalledTimes(2);
});

test('normal text paste is untouched and the image paste handler is removed on close', async () => {
  await open();
  vi.mocked(URL.createObjectURL).mockClear();
  expect(paste().defaultPrevented).toBe(false);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  dispose?.();
  dispose = undefined;
  expect(paste(new File(['image'], 'test.png', { type: 'image/png' })).defaultPrevented).toBe(
    false,
  );
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

function rectangleClipboard() {
  const data = new Map<string, string>();
  return {
    items: [],
    files: [],
    getData: (type: string) => data.get(type) ?? '',
    setData: (type: string, value: string) => data.set(type, value),
  };
}

function sendClipboard(
  type: 'copy' | 'paste',
  clipboard: ReturnType<typeof rectangleClipboard>,
  target: Element = document.body,
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: clipboard });
  target.dispatchEvent(event);
  return event;
}

test('copying then pasting into another track creates independent copies of the copied snapshot', async () => {
  const original = { x: 0.2, y: 0.3, width: 0.15, height: 0.1, color: '#abcdef' };
  visuals = {
    trackObjects: { Roof: [original] },
    backgroundImage: 'data:image/png;base64,cGhvdG8=',
  };
  await open();
  button('Rectangle 1').click();
  const clipboard = rectangleClipboard();
  expect(sendClipboard('copy', clipboard).defaultPrevented).toBe(true);
  const color = document.querySelector<HTMLInputElement>('input[type="color"]')!;
  color.value = '#ff0000';
  color.dispatchEvent(new Event('input', { bubbles: true }));
  trackButton('Left window').click();
  expect(sendClipboard('paste', clipboard).defaultPrevented).toBe(true);
  expect(button('Rectangle 1').getAttribute('aria-pressed')).toBe('true');
  sendClipboard('paste', clipboard);
  expect(button('Rectangle 2').getAttribute('aria-pressed')).toBe('true');
  expect(saveVisualizer).not.toHaveBeenCalled();
  button('Save and close').click();
  await vi.waitFor(() => expect(saveVisualizer).toHaveBeenCalledOnce());
  const config = vi.mocked(saveVisualizer).mock.calls[0][0];
  expect(config.Roof).toEqual([{ ...original, color: '#ff0000' }]);
  expect(config['Left window']).toEqual([original, original]);
  expect(config['Left window'][0]).not.toBe(config['Left window'][1]);
  expect(config['Left window'][0]).not.toBe(config.Roof[0]);
});

test('rectangle clipboard ignores invalid payloads and editable fields, and stops handling events after close', async () => {
  await open();
  button('+ Add rectangle').click();
  const clipboard = rectangleClipboard();
  const input = document.querySelector<HTMLInputElement>('input[type="number"]')!;
  expect(sendClipboard('copy', clipboard, input).defaultPrevented).toBe(false);
  expect(clipboard.getData('text/plain')).toBe('');
  sendClipboard('copy', clipboard);
  expect(sendClipboard('paste', clipboard, input).defaultPrevented).toBe(false);
  for (const text of [
    'plain text',
    '{broken',
    serializeRectangle({ x: 2, y: 0, width: 0.1, height: 0.1, color: '#ffffff' }),
  ]) {
    clipboard.setData('text/plain', text);
    expect(sendClipboard('paste', clipboard).defaultPrevented).toBe(false);
  }
  expect(
    document.querySelectorAll('svg[aria-label="Light placement canvas"] g > rect:first-child'),
  ).toHaveLength(1);
  sendClipboard('copy', clipboard);
  dispose?.();
  dispose = undefined;
  expect(sendClipboard('paste', clipboard).defaultPrevented).toBe(false);
  expect(sendClipboard('copy', clipboard).defaultPrevented).toBe(false);
});
