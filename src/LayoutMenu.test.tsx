// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render } from 'solid-js/web';
import { MenuBar } from './MenuBar';
import LayoutMenu from './LayoutMenu';
import TimelineData from './timeline/timeline-data';
import { TimelineEmitter } from './timeline/events';
import { downloadFile } from './timeline/export';
import { createLayoutState } from './layout/state';
import { loadLayout, saveLayout } from './layout/storage';
import { parseLayout } from './timeline/layout';
vi.mock('./layout/storage', () => ({ loadLayout: vi.fn(), saveLayout: vi.fn() }));
let layoutState: ReturnType<typeof createLayoutState>;

vi.mock('./TimelineContext', () => ({
  useTimeline: () => ({ timeline: { pause: vi.fn() }, layout: layoutState }),
}));
vi.mock('./timeline/export', async (original) => ({
  ...(await original<object>()),
  downloadFile: vi.fn(),
}));
let data: TimelineData;
let host: HTMLDivElement;
let dispose: () => void;
const button = (name: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.textContent?.trim() === name,
  )!;
const action = (name: string) =>
  document.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`)!;
const open = () => {
  button('Layout').click();
  button('Edit layout').click();
};
const saveAndClose = async () => {
  button('Save').click();
  await vi.waitFor(() =>
    expect(document.querySelector('dialog[aria-labelledby="layout-editor-title"]')).toBeNull(),
  );
};
const initial = [
  { type: 'group', id: 'Garden', children: [{ type: 'track', id: 'Lamp' }] },
  { type: 'track', id: 'Extra' },
];

function dragEvent(target: Element, type: string, y = 20) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY: y });
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn(),
      setDragImage: vi.fn(),
    },
  });
  target.dispatchEvent(event);
  return event;
}

function drag(
  source: string,
  target: string | undefined,
  position: 'before' | 'inside' | 'after' = 'inside',
) {
  const handle = action(`Drag ${source}`);
  dragEvent(handle, 'dragstart');
  const row = target
    ? action(`Drag ${target}`).closest('[data-layout-row]')!
    : document.querySelector('[aria-label="Move to root"]')!;
  vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ top: 0, height: 40 } as DOMRect);
  const y = position === 'before' ? 2 : position === 'after' ? 38 : 20;
  dragEvent(row, 'dragover', y);
  dragEvent(row, 'drop', y);
  dragEvent(handle, 'dragend');
}

beforeEach(async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
  data = new TimelineData(new TimelineEmitter());
  vi.mocked(loadLayout).mockResolvedValue({
    tree: parseLayout(initial),
    visuals: { trackObjects: {} },
  });
  vi.mocked(saveLayout).mockResolvedValue(undefined);
  layoutState = createLayoutState(data.setLayout, () => {});
  await layoutState.ready;
  vi.mocked(downloadFile).mockClear();
  host = document.createElement('div');
  document.body.append(host);
  dispose = render(
    () => (
      <MenuBar>
        <LayoutMenu />
      </MenuBar>
    ),
    host,
  );
});
afterEach(() => {
  dispose();
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('exports the chosen layout without unmatched show channels', () => {
  data.replaceAll({ version: '3', tracks: { Other: { locked: false, keyframes: [] } } });
  button('Layout').click();
  button('Export layout').click();
  expect(downloadFile).toHaveBeenCalledWith(
    'layout.json',
    JSON.stringify(layoutState.document(), null, 2),
  );
});

test('imports JSON and leaves the existing layout intact on invalid input', async () => {
  const input = host.querySelector<HTMLInputElement>('input[type=file]')!;
  const upload = (text: string) => {
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File([text], 'layout.json')],
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  upload(JSON.stringify({ tree: [{ type: 'track', id: 'New' }], visuals: { trackObjects: {} } }));
  await vi.waitFor(() => expect(data.baseLayout).toEqual([{ type: 'track', id: 'New' }]));
  upload('{broken');
  await vi.waitFor(() => expect(document.querySelector('[role=alert]')).not.toBeNull());
  expect(data.baseLayout).toEqual([{ type: 'track', id: 'New' }]);
});

test('imports and exports the original timestamp, leaving invalid or missing timestamps undefined', async () => {
  const input = host.querySelector<HTMLInputElement>('input[type=file]')!;
  for (const updatedAt of ['2025-03-04T05:06:07.000Z', 'invalid', undefined]) {
    vi.mocked(saveLayout).mockClear();
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File([JSON.stringify({ tree: initial, updatedAt })], 'layout.json')],
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(saveLayout).toHaveBeenCalledTimes(1));
    const expected = updatedAt === 'invalid' ? undefined : updatedAt;
    expect(layoutState.document().updatedAt).toBe(expected);
    expect(vi.mocked(saveLayout).mock.calls[0][0].updatedAt).toBe(expected);
    button('Layout').click();
    button('Export layout').click();
    const exported = JSON.parse(vi.mocked(downloadFile).mock.lastCall![1] as string);
    expect(exported.updatedAt).toBe(expected);
  }
});

test('edits names and nesting, with save and cancel isolated from show data', async () => {
  open();
  drag('Extra', 'Garden');
  drag('Extra', 'Lamp', 'before');
  drag('Lamp', 'Garden', 'after');
  action('Add track to Garden').click();
  action('Add group to Garden').click();
  action('Remove Group 1').click();
  const input = Array.from(document.querySelectorAll<HTMLInputElement>('input')).find(
    (input) => input.value === 'Track 1',
  )!;
  input.value = 'New lamp';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  expect(data.baseLayout).toEqual(initial);
  await saveAndClose();
  const expected = [
    {
      type: 'group',
      id: 'Garden',
      children: [
        { type: 'track', id: 'Extra' },
        { type: 'track', id: 'New lamp' },
      ],
    },
    { type: 'track', id: 'Lamp' },
  ];
  expect(data.baseLayout).toEqual(expected);
  expect(data.data.tracks).toEqual({});
  open();
  action('Remove Garden').click();
  button('Cancel').click();
  expect(data.baseLayout).toEqual(expected);
  open();
  expect(action('Remove Garden')).not.toBeNull();
});

test('dragging reorders siblings in both directions and can move nodes to root', async () => {
  open();
  expect(document.querySelector('[aria-label="Indent Extra"]')).toBeNull();
  expect(document.querySelector('[aria-label="Move Extra up"]')).toBeNull();
  drag('Garden', 'Extra', 'after');
  await saveAndClose();
  expect(data.baseLayout.map((node) => node.id)).toEqual(['Extra', 'Garden']);
  open();
  drag('Garden', 'Extra', 'before');
  drag('Lamp', undefined);
  await saveAndClose();
  expect(data.baseLayout).toEqual([
    { type: 'group', id: 'Garden', children: [] },
    { type: 'track', id: 'Extra' },
    { type: 'track', id: 'Lamp' },
  ]);
});

test('can move whole groups between parents and into empty groups', async () => {
  open();
  action('Add group to Garden').click();
  drag('Extra', 'Group 1');
  drag('Group 1', undefined);
  await saveAndClose();
  expect(data.baseLayout).toEqual([
    initial[0],
    { type: 'group', id: 'Group 1', children: [{ type: 'track', id: 'Extra' }] },
  ]);
});

test('rejects self/descendant drops and clears the indicator when a drag is canceled', async () => {
  open();
  drag('Garden', 'Lamp', 'after');
  drag('Garden', 'Garden');
  await saveAndClose();
  expect(data.baseLayout).toEqual(initial);
  open();
  const handle = action('Drag Extra');
  dragEvent(handle, 'dragstart');
  const group = action('Drag Garden').closest('[data-layout-row]')!;
  vi.spyOn(group, 'getBoundingClientRect').mockReturnValue({ top: 0, height: 40 } as DOMRect);
  expect(dragEvent(group, 'dragover').defaultPrevented).toBe(true);
  expect(group.getAttribute('data-drop-position')).toBe('inside');
  dragEvent(group, 'dragover', 38);
  expect(group.hasAttribute('data-drop-position')).toBe(false);
  expect(action('Drag Lamp').closest('[data-layout-row]')!.getAttribute('data-drop-position')).toBe(
    'after',
  );
  dragEvent(handle, 'dragend');
  expect(group.hasAttribute('data-drop-position')).toBe(false);
  expect(document.querySelector('[aria-label="Move to root"]')).toBeNull();
  await saveAndClose();
  expect(data.baseLayout).toEqual(initial);
});

test('validates duplicate names before applying the edited layout', () => {
  open();
  const input = document.querySelector<HTMLInputElement>('input[aria-label="Group name"]')!;
  input.value = 'Lamp';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  button('Save').click();
  expect(document.querySelector('[role=alert]')?.textContent).toContain('Duplicate name: Lamp');
  expect(data.baseLayout).toEqual(initial);
});

test('renaming and removing a track updates its visual mapping and export keeps the photo', async () => {
  const visuals = {
    backgroundImage: 'data:image/png;base64,cGhvdG8=',
    trackObjects: { Lamp: [{ x: 0.2, y: 0.3, width: 0.1, height: 0.05, color: '#ff8800' }] },
  };
  await layoutState.replace({ tree: layoutState.document().tree, visuals });
  open();
  const input = Array.from(document.querySelectorAll<HTMLInputElement>('input')).find(
    (input) => input.value === 'Lamp',
  )!;
  input.value = 'Porch';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await saveAndClose();
  expect(layoutState.document().visuals.trackObjects).toEqual({ Porch: visuals.trackObjects.Lamp });
  button('Layout').click();
  button('Export layout').click();
  const exported = JSON.parse(
    vi.mocked(downloadFile).mock.calls[vi.mocked(downloadFile).mock.calls.length - 1][1] as string,
  );
  expect(exported.visuals.backgroundImage).toBe(visuals.backgroundImage);
  expect(exported.visuals.trackObjects.Porch).toEqual(visuals.trackObjects.Lamp);
  open();
  action('Remove Porch').click();
  await saveAndClose();
  expect(layoutState.document().visuals.trackObjects).toEqual({});
});

test('tree save failures keep the draft open and preserve both stored sections', async () => {
  open();
  action('Remove Lamp').click();
  vi.mocked(saveLayout).mockRejectedValueOnce(new Error('Storage full'));
  button('Save').click();
  await vi.waitFor(() =>
    expect(document.querySelector('[role=alert]')?.textContent).toContain('Storage full'),
  );
  expect(data.baseLayout).toEqual(initial);
  expect(action('Remove Lamp')).toBeNull();
  await saveAndClose();
  expect(data.baseLayout).toEqual([{ type: 'group', id: 'Garden', children: [] }, initial[1]]);
});
