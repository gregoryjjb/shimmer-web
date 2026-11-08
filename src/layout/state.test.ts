// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { createLayoutState } from './state';
import { loadLayout, saveLayout } from './storage';
import { LayoutDocument } from './document';
import TimelineData from '../timeline/timeline-data';
import { TimelineEmitter } from '../timeline/events';
import { validateLayoutTracks } from '../timeline/layout';

vi.mock('./storage', () => ({ loadLayout: vi.fn(), saveLayout: vi.fn() }));
const initial: LayoutDocument = {
  tree: [{ type: 'track', id: 'Roof' }],
  visuals: { trackObjects: {} },
};
const rectangle = { x: 0.2, y: 0.3, width: 0.1, height: 0.05, color: '#ff8800' };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadLayout).mockResolvedValue(initial);
  vi.mocked(saveLayout).mockResolvedValue(undefined);
});

test('failed saves leave the shared document and timeline intact, and can be retried', async () => {
  const timeline = new TimelineData(new TimelineEmitter());
  const state = createLayoutState(timeline.setLayout, (tree) =>
    validateLayoutTracks(tree, timeline.data.tracks),
  );
  await state.ready;
  const replacement = { tree: [{ type: 'track', id: 'New' }], visuals: { trackObjects: {} } };
  vi.mocked(saveLayout).mockRejectedValueOnce(new Error('Storage full'));
  await expect(state.replace(replacement)).rejects.toThrow('Storage full');
  expect(state.document()).toEqual(initial);
  expect(timeline.baseLayout).toEqual(initial.tree);
  await state.replace(replacement);
  expect(state.document()).toEqual(replacement);
  expect(timeline.baseLayout).toEqual(replacement.tree);
});

test('saves the combined layout without changing show data or undo', async () => {
  const timeline = new TimelineData(new TimelineEmitter());
  const state = createLayoutState(timeline.setLayout, (tree) =>
    validateLayoutTracks(tree, timeline.data.tracks),
  );
  await state.ready;
  timeline.replaceAll({
    version: '3',
    tracks: { Roof: { locked: false, keyframes: [{ ts: 1, value: 1 }] } },
  });
  const show = JSON.stringify(timeline.data);
  await state.replace({
    tree: [{ type: 'track', id: 'New roof' }],
    visuals: {
      backgroundImage: 'data:image/png;base64,cGhvdG8=',
      trackObjects: { 'New roof': [rectangle] },
    },
  });
  expect(state.document().visuals.trackObjects).toEqual({ 'New roof': [rectangle] });
  expect(JSON.stringify(timeline.data)).toBe(show);
  await state.replace({ tree: [], visuals: { trackObjects: {} } });
  expect(state.document().visuals).toEqual({ trackObjects: {} });
  expect(JSON.stringify(timeline.data)).toBe(show);
  timeline.undo();
  expect(timeline.data.tracks).toEqual({});
  expect(state.document().tree).toEqual([]);
  expect(timeline.baseLayout).toEqual([]);
});

test('validation rejects group/show collisions before changing storage', async () => {
  const timeline = new TimelineData(new TimelineEmitter());
  const state = createLayoutState(timeline.setLayout, (tree) =>
    validateLayoutTracks(tree, timeline.data.tracks),
  );
  await state.ready;
  timeline.replaceAll({ version: '3', tracks: { Roof: { locked: false, keyframes: [] } } });
  await expect(
    state.replace({ tree: [{ type: 'group', id: 'Roof', children: [] }], visuals: {} }),
  ).rejects.toThrow('conflicts');
  expect(saveLayout).not.toHaveBeenCalled();
  expect(state.document()).toEqual(initial);
});
