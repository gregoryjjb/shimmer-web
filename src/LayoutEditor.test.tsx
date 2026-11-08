// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render } from 'solid-js/web';
import LayoutEditor from './LayoutEditor';
import { LayoutDocument } from './layout/document';
import { optimizeBackgroundImage } from './visualizer/background-image';
import { serializeRectangle } from './visualizer/clipboard';

vi.mock('./visualizer/background-image', () => ({ optimizeBackgroundImage: vi.fn() }));
const rectangle = { x: 0.2, y: 0.2, width: 0.1, height: 0.1, color: '#ff8800' };
let layout: LayoutDocument;
let host: HTMLDivElement;
let dispose: (() => void) | undefined;
const save = vi.fn<(layout: LayoutDocument) => Promise<void>>();
const close = vi.fn();
const button = (text: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.textContent?.trim() === text,
  )!;
const action = (label: string) =>
  document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
const objects = () =>
  document.querySelectorAll<SVGRectElement>(
    'svg[aria-label="Light placement canvas"] rect[role=button]',
  );
const changeName = (oldName: string, name: string) => {
  const input = Array.from(document.querySelectorAll<HTMLInputElement>('input')).find(
    (input) => input.value === oldName,
  )!;
  input.value = name;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
  vi.mocked(optimizeBackgroundImage).mockResolvedValue('data:image/webp;base64,d2VicA==');
  save.mockResolvedValue(undefined);
  layout = {
    tree: [
      {
        type: 'group',
        id: 'House',
        children: [
          { type: 'track', id: 'Roof' },
          { type: 'track', id: 'Porch' },
        ],
      },
    ],
    visuals: { backgroundImage: 'data:image/png;base64,cGhvdG8=', trackObjects: {} },
  };
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const open = () => {
  dispose = render(() => <LayoutEditor layout={layout} onSave={save} onClose={close} />, host);
};
const saveDraft = async () => {
  button('Save').click();
  await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
  return save.mock.calls[0][0];
};

test('adds objects to selected tracks and saves tree renames and visuals together', async () => {
  open();
  button('Add object').click();
  action('Select track Porch').click();
  button('Add object').click();
  changeName('Porch', 'Front porch');
  expect(objects()[1].getAttribute('aria-label')).toBe('Front porch: object 1');
  const saved = await saveDraft();
  expect(saved.visuals.trackObjects.Roof).toHaveLength(1);
  expect(saved.visuals.trackObjects['Front porch']).toHaveLength(1);
  expect(saved.visuals.trackObjects.Porch).toBeUndefined();
  expect(JSON.stringify(saved.tree)).not.toContain('key');
  expect(layout.visuals.trackObjects).toEqual({});
  expect(optimizeBackgroundImage).not.toHaveBeenCalled();
});

test('cancel discards both sections and removing a group removes its objects', async () => {
  layout.visuals.trackObjects = { Roof: [rectangle] };
  open();
  changeName('Roof', 'New roof');
  button('Add object').click();
  button('Cancel').click();
  expect(close).toHaveBeenCalledOnce();
  expect(save).not.toHaveBeenCalled();
  expect(layout.visuals.trackObjects.Roof).toEqual([rectangle]);
  dispose?.();
  close.mockClear();
  open();
  action('Remove House').click();
  expect(objects()).toHaveLength(0);
  expect(button('Add object').disabled).toBe(true);
  expect(await saveDraft()).toEqual({
    tree: [],
    visuals: { backgroundImage: layout.visuals.backgroundImage, trackObjects: {} },
  });
});

function pointer(target: Element, type: string, x: number, y: number) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  target.dispatchEvent(event);
}
test('selects, moves, resizes, recolors and deletes objects without deleting text-field selections', async () => {
  layout.visuals.trackObjects = { Roof: [rectangle] };
  open();
  const canvas = document.querySelector<SVGSVGElement>('svg[aria-label="Light placement canvas"]')!;
  canvas.setPointerCapture = vi.fn();
  canvas.hasPointerCapture = vi.fn(() => true);
  canvas.releasePointerCapture = vi.fn();
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    width: 1000,
    height: 500,
    left: 0,
    top: 0,
  } as DOMRect);
  pointer(objects()[0], 'pointerdown', 200, 100);
  pointer(canvas, 'pointermove', 400, 200);
  pointer(canvas, 'pointerup', 400, 200);
  expect(Number(objects()[0].getAttribute('x'))).toBeCloseTo(0.4);
  expect(Number(objects()[0].getAttribute('y'))).toBeCloseTo(0.4);
  pointer(action('Resize object'), 'pointerdown', 500, 250);
  pointer(canvas, 'pointermove', 700, 350);
  pointer(canvas, 'pointerup', 700, 350);
  expect(Number(objects()[0].getAttribute('width'))).toBeCloseTo(0.3);
  expect(Number(objects()[0].getAttribute('height'))).toBeCloseTo(0.3);
  const color = document.querySelector<HTMLInputElement>('input[type=color]')!;
  color.value = '#abcdef';
  color.dispatchEvent(new Event('input', { bubbles: true }));
  expect(objects()[0].getAttribute('fill')).toBe('#abcdef');
  document
    .querySelector('input[aria-label="Track name"]')!
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
  expect(objects()).toHaveLength(1);
  button('Add object').click();
  action('Delete object').click();
  expect(objects()).toHaveLength(1);
  objects()[0].dispatchEvent(new FocusEvent('focus'));
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
  expect(objects()).toHaveLength(0);
});

function clipboard() {
  const data = new Map<string, string>();
  return {
    items: [],
    files: [],
    getData: (type: string) => data.get(type) ?? '',
    setData: (type: string, value: string) => data.set(type, value),
  };
}
function sendClipboard(type: string, data: object, target: Element = document.body) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: data });
  target.dispatchEvent(event);
  return event;
}
test('copy/paste snapshots the object and creates independent copies on the selected track', async () => {
  layout.visuals.trackObjects = { Roof: [rectangle] };
  open();
  objects()[0].dispatchEvent(new FocusEvent('focus'));
  const data = clipboard();
  expect(sendClipboard('copy', data).defaultPrevented).toBe(true);
  const color = document.querySelector<HTMLInputElement>('input[type=color]')!;
  color.value = '#abcdef';
  color.dispatchEvent(new Event('input', { bubbles: true }));
  action('Select track Porch').click();
  expect(sendClipboard('paste', data).defaultPrevented).toBe(true);
  sendClipboard('paste', data);
  changeName('Porch', 'Door');
  const saved = await saveDraft();
  expect(saved.visuals.trackObjects.Door).toEqual([rectangle, rectangle]);
  expect(saved.visuals.trackObjects.Door[0]).not.toBe(saved.visuals.trackObjects.Door[1]);
  expect(saved.visuals.trackObjects.Roof).toEqual([{ ...rectangle, color: '#abcdef' }]);
});

test('clipboard respects editable fields, invalid payloads and editor lifetime', () => {
  open();
  button('Add object').click();
  const data = clipboard();
  const input = document.querySelector('input[aria-label="Track name"]')!;
  expect(sendClipboard('copy', data, input).defaultPrevented).toBe(false);
  sendClipboard('copy', data);
  expect(sendClipboard('paste', data, input).defaultPrevented).toBe(false);
  for (const text of ['plain text', '{broken', serializeRectangle({ ...rectangle, x: 2 })]) {
    data.setData('text/plain', text);
    expect(sendClipboard('paste', data).defaultPrevented).toBe(false);
  }
  expect(objects()).toHaveLength(1);
  sendClipboard('copy', data);
  dispose?.();
  dispose = undefined;
  expect(sendClipboard('paste', data).defaultPrevented).toBe(false);
  expect(sendClipboard('copy', data).defaultPrevented).toBe(false);
});

test('uploads and pasted images are compressed and failed replacements preserve the draft', async () => {
  open();
  button('Add object').click();
  const file = new File(['photo'], 'house.jpg', { type: 'image/jpeg' });
  const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(input, 'files', { value: [file] });
  vi.mocked(optimizeBackgroundImage).mockRejectedValueOnce(new Error('Cannot encode WebP'));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() =>
    expect(document.querySelector('[role=alert]')?.textContent).toContain('Cannot encode WebP'),
  );
  expect(document.querySelector('img')?.getAttribute('src')).toBe(layout.visuals.backgroundImage);
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() =>
    expect(document.querySelector('img')?.getAttribute('src')).toBe(
      'data:image/webp;base64,d2VicA==',
    ),
  );
  expect(
    sendClipboard('paste', {
      items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
      files: [file],
    }).defaultPrevented,
  ).toBe(true);
  await vi.waitFor(() => expect(button('Save').disabled).toBe(false));
  const saved = await saveDraft();
  expect(saved.visuals.backgroundImage).toBe('data:image/webp;base64,d2VicA==');
  expect(saved.visuals.trackObjects.Roof).toHaveLength(1);
  expect(optimizeBackgroundImage).toHaveBeenCalledTimes(3);
});

test('saves tree-only layouts and retains the combined draft when persistence fails', async () => {
  delete layout.visuals.backgroundImage;
  open();
  changeName('House', 'Garden');
  save.mockRejectedValueOnce(new Error('Storage full'));
  button('Save').click();
  await vi.waitFor(() =>
    expect(document.querySelector('[role=alert]')?.textContent).toContain('Storage full'),
  );
  expect(close).not.toHaveBeenCalled();
  expect(action('Drag Garden')).not.toBeNull();
  button('Save').click();
  await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(save.mock.calls[1][0].tree[0].id).toBe('Garden');
  expect(save.mock.calls[1][0].visuals.backgroundImage).toBeUndefined();
});

test('editor keys never reach timeline listeners, including when body has focus', () => {
  open();
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
