import { expect, test, describe, vi } from 'vitest';

import { TimelineEmitter } from './events';
import TimelineData, { binarySearch, newTracks } from './timeline-data';
import { Keyframe, Tracks } from './types';
import { flattenTracks, iterateLeaves } from './layout';
import { OpenedProject, Persistor } from './persist';

const keyframes = [0, 10, 20, 30, 40, 50, 60, 70].map<Keyframe>((n) => ({
  selected: false,
  ts: n,
  value: 0,
}));

function makeData(tracks: Tracks = {}) {
  const emitter = new TimelineEmitter();
  const data = new TimelineData(emitter);
  const saveData = vi.fn();
  const persistor: Persistor = {
    saveData,
    loadData: async () => undefined,
    saveName: async () => {},
    loadName: async () => '',
    saveAudio: async () => {},
    loadAudio: async () => undefined,
  };
  const project = new OpenedProject('Test', { version: '3', tracks }, new Blob(), persistor);
  project.autosave = false;
  data.load(project);
  return { data, emitter, project };
}

const track = (ts: number, selected = false) => ({
  locked: false,
  keyframes: [{ ts, value: 1, selected }],
});

describe('show editing with a separate house layout', () => {
  test('imports preserve timestamps and edits, undo, and redo save the current time', async () => {
    const { data, project } = makeData({ 'Roof 1': track(1, true) });
    const imported = { ...data.data, updatedAt: '2025-01-01T00:00:00.000Z' };
    data.replaceAll(imported);
    expect(data.data.updatedAt).toBe(imported.updatedAt);
    expect(project.data.updatedAt).toBe(imported.updatedAt);
    data.load(project);
    expect(data.data.updatedAt).toBe(imported.updatedAt);

    const stored = vi.spyOn(project, 'saveData');
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const actions = [() => data.moveSelected(1), data.undo, data.redo];
      for (const [index, action] of actions.entries()) {
        const now = new Date(Date.UTC(2026, 10, 8, 12, index));
        vi.setSystemTime(now);
        action();
        expect(data.data.updatedAt).toBe(now.toISOString());
        expect(project.data.updatedAt).toBe(now.toISOString());
        expect(stored).toHaveBeenLastCalledWith(data.data);
      }
      expect(imported.updatedAt).toBe('2025-01-01T00:00:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });

  test('empty shows render without creating stored house tracks', () => {
    const { data } = makeData();
    expect(data.channels).toEqual([]);
    expect(
      flattenTracks(data.layout, data.data.tracks).find((row) => row.id === 'Roof 1'),
    ).toMatchObject({ keyframes: [], locked: false });
    expect(data.findNearest(1)).toBeUndefined();
    expect(() => data.selectAll(true)).not.toThrow();
    expect(() => data.alignSelected()).not.toThrow();
    expect(() => data.dedup()).not.toThrow();
    expect(data.data.tracks).toEqual({});
  });

  test('group insertion creates only descendants and skips locked channels', () => {
    const { data } = makeData({ 'Roof 2': { locked: true, keyframes: [] } });
    data.insertAuto('Roof parkview', 12.5, 1);
    expect(Object.keys(data.data.tracks)).toHaveLength(8);
    expect(data.data.tracks['Roof 1'].keyframes).toEqual([{ ts: 12.5, value: 1 }]);
    expect(data.data.tracks['Roof 2'].keyframes).toEqual([]);
    expect(data.data.tracks['Roof 9']).toBeUndefined();
    data.undo();
    expect(Object.keys(data.data.tracks)).toEqual(['Roof 2']);
    data.redo();
    expect(data.data.tracks['Roof 1'].keyframes).toHaveLength(1);
  });

  test('locking a group leaves unrelated tracks alone and clears selection', () => {
    const { data } = makeData({ 'Roof 1': track(1, true), 'Fence 1': track(2, true) });
    data.setNodeLocked('Roof parkview', true);
    expect(data.data.tracks['Roof 1'].locked).toBe(true);
    expect(data.data.tracks['Roof 1'].keyframes[0].selected).toBeUndefined();
    expect(data.data.tracks['Roof 8'].locked).toBe(true);
    expect(data.data.tracks['Fence 1'].locked).toBe(false);
    expect(data.data.tracks['Fence 1'].keyframes[0].selected).toBe(true);
  });

  test('shifts into empty rows in display order and restores sparse data on undo', () => {
    const { data } = makeData({ 'Roof 1': track(1, true), Z: track(5), A: track(4) });
    data.shiftSelected('down');
    expect(data.data.tracks['Roof 1'].keyframes).toEqual([]);
    expect(data.data.tracks['Roof 2'].keyframes[0].ts).toBe(1);
    data.undo();
    expect(data.data.tracks['Roof 2']).toBeUndefined();
    const ids = Array.from(iterateLeaves(...data.layout), (node) => node.id);
    expect(ids.slice(-2)).toEqual(['A', 'Z']);
    expect(ids).toEqual(
      flattenTracks(data.layout)
        .filter((row) => row.type === 'track')
        .map((row) => row.id),
    );
  });

  test('flip preserves gaps between selected rows', () => {
    const { data } = makeData({
      'Roof 1': track(1, true),
      'Roof 3': track(3, true),
      'Roof 4': track(4, true),
    });
    data.flipSelected();
    expect(data.data.tracks['Roof 1'].keyframes[0].ts).toBe(4);
    expect(data.data.tracks['Roof 2'].keyframes[0].ts).toBe(3);
    expect(data.data.tracks['Roof 3'].keyframes).toEqual([]);
    expect(data.data.tracks['Roof 4'].keyframes[0].ts).toBe(1);
  });

  test('box selection uses IDs, preserves additive selection, and respects locks', () => {
    const { data, emitter } = makeData({
      'Roof 1': track(1),
      Extra: track(8, true),
      'Roof 2': { ...track(1), locked: true },
    });
    const edit = vi.fn();
    emitter.on('edit', edit);
    const box = {
      startTime: 1,
      endTime: 2,
      trackIDs: ['Roof 1', 'Roof 1', 'Roof 2', 'Missing'],
      keepExisting: true,
    };
    data.boxSelect(box);
    expect(data.data.tracks['Roof 1'].keyframes[0].selected).toBe(true);
    expect(data.data.tracks.Extra.keyframes[0].selected).toBe(true);
    expect(!!data.data.tracks['Roof 2'].keyframes[0].selected).toBe(false);
    data.boxSelect(box);
    expect(edit).toHaveBeenCalledTimes(1);
    data.boxSelect({ ...box, keepExisting: false });
    expect(data.data.tracks.Extra.keyframes[0].selected).toBeUndefined();
    expect(data.data.tracks.Missing).toBeUndefined();
  });

  test('select all includes unmatched channels and avoids no-op history', () => {
    const { data, emitter } = makeData({ Extra: track(1), Locked: { ...track(2), locked: true } });
    const edit = vi.fn();
    emitter.on('edit', edit);
    data.selectAll(false);
    expect(edit).not.toHaveBeenCalled();
    data.selectAll(true);
    expect(data.data.tracks.Extra.keyframes[0].selected).toBe(true);
    expect(data.data.tracks.Locked.keyframes[0].selected).toBeUndefined();
    data.selectAll(true);
    expect(edit).toHaveBeenCalledTimes(1);
  });

  test('Beat can be created by insertion or analysis and occurs once', () => {
    expect(newTracks().Beat).toEqual({ keyframes: [], locked: true });
    const { data } = makeData();
    data.insertBeat(1);
    expect(data.data.tracks.Beat.keyframes).toEqual([{ ts: 1, value: 0 }]);
    expect(
      Array.from(iterateLeaves(...data.layout)).filter((node) => node.id === 'Beat'),
    ).toHaveLength(1);
    data.undo();
    expect(data.data.tracks.Beat).toBeUndefined();
    data.replaceBeats([3, 1, 1, NaN]);
    expect(data.data.tracks.Beat.keyframes).toEqual([
      { ts: 1, value: 0 },
      { ts: 3, value: 0 },
    ]);
  });

  test('dedup removes only duplicate frames, preserving later animation', () => {
    const { data } = makeData({
      Extra: {
        locked: false,
        keyframes: [
          { ts: 1, value: 1, selected: true },
          { ts: 1.0001, value: 1, selected: true },
          { ts: 3, value: 0 },
        ],
      },
    });
    data.dedup();
    expect(data.data.tracks.Extra.keyframes.map((k) => k.ts)).toEqual([1, 3]);
    data.undo();
    expect(data.data.tracks.Extra.keyframes).toHaveLength(3);
  });
});

describe('collapsed layout groups', () => {
  test('collapse preserves data, selection, redo history, and nested collapse state', () => {
    const { data, emitter, project } = makeData({
      'Roof 1': track(1, true),
      Extra: track(2, true),
    });
    data.moveSelected(1);
    data.undo();
    const saved = structuredClone(data.data);
    const save = vi.spyOn(project, 'saveData');
    const changed = vi.fn();
    const selected = vi.fn();
    emitter.on('dataChanged', changed);
    emitter.on('selected', selected);
    data.setGroupCollapsed('Roof parkview', true);
    data.setGroupCollapsed('Roof', true);
    expect(data.data).toEqual(saved);
    expect(save).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    expect(selected).toHaveBeenLastCalledWith(1);
    data.redo();
    expect(data.data.tracks['Roof 1'].keyframes[0].ts).toBe(2);
    expect(data.collapsedGroupIDs).toEqual(['Roof parkview', 'Roof']);
    data.undo();
    expect(data.data.tracks).toEqual(saved.tracks);
    data.setGroupCollapsed('Roof', false);
    expect(data.visibleRows.find((row) => row.id === 'Roof parkview')?.collapsed).toBe(true);
    expect(data.visibleRows.some((row) => row.id === 'Roof 1')).toBe(false);
    data.setGroupCollapsed('Roof parkview', false);
    expect(data.data.tracks['Roof 1'].keyframes[0].selected).toBe(true);
    expect(selected).toHaveBeenLastCalledWith(2);
  });

  test('visible rows have contiguous coordinates while full layout remains available', () => {
    const { data } = makeData();
    const count = data.visibleRows.length;
    data.setCollapsedGroups(['Roof parkview', 'Roof 1', 'Missing']);
    expect(data.collapsedGroupIDs).toEqual(['Roof parkview']);
    expect(data.visibleRows).toHaveLength(count - 8);
    data.visibleRows.forEach((row, i) => {
      expect(row.startY).toBe(i * 30);
      expect(row.endY).toBe((i + 1) * 30);
    });
    expect(flattenTracks(data.layout)).toHaveLength(count);
  });

  test.each([
    ['move', (data: TimelineData) => data.moveSelected(2)],
    ['scale', (data: TimelineData) => data.scaleSelected(0, 2)],
    ['delete', (data: TimelineData) => data.deleteSelected()],
    ['invert', (data: TimelineData) => data.invertSelected()],
    ['duplicate', (data: TimelineData) => data.duplicateSelected()],
    ['align', (data: TimelineData) => data.alignSelected()],
    ['snap', (data: TimelineData) => data.snapTo(10)],
    ['space', (data: TimelineData) => data.equallySpaceSelected()],
    ['dedup', (data: TimelineData) => data.dedup()],
    ['select all', (data: TimelineData) => data.selectAll(true)],
    ['deselect all', (data: TimelineData) => data.selectAll(false)],
    ['select single', (data: TimelineData) => data.selectSingle('Extra', 1, 0.1, false)],
    [
      'box select',
      (data: TimelineData) =>
        data.boxSelect({
          startTime: 0,
          endTime: 2,
          trackIDs: ['Extra', 'Roof 1', 'Locked'],
          keepExisting: false,
        }),
    ],
  ])('%s skips hidden and locked tracks, preserving their selections', (_name, operation) => {
    const frames = [1, 1.0001, 4, 9].map((ts) => ({ ts, value: 1, selected: true }));
    const { data } = makeData({
      'Roof 1': { locked: false, keyframes: structuredClone(frames) },
      Extra: { locked: false, keyframes: structuredClone(frames) },
      Locked: { locked: true, keyframes: structuredClone(frames) },
    });
    // Exercise even a retained selection on a locked track.
    data.data.tracks.Locked.keyframes[0].selected = true;
    data.setGroupCollapsed('Roof', true);
    const hidden = structuredClone(data.data.tracks['Roof 1']);
    const locked = structuredClone(data.data.tracks.Locked);
    operation(data);
    expect(data.data.tracks['Roof 1']).toEqual(hidden);
    expect(data.data.tracks.Locked).toEqual(locked);
  });

  test('shifts across collapsed groups and locked tracks without moving hidden selections', () => {
    const { data } = makeData({
      'Roof 8': track(8, true),
      'Roof 9': track(9, true),
      'Fence 1': { ...track(10), locked: true },
    });
    data.setGroupCollapsed('Roof hamilton', true);
    data.shiftSelected('down');
    expect(data.data.tracks['Roof 8'].keyframes).toEqual([]);
    expect(data.data.tracks['Fence 2'].keyframes[0].ts).toBe(8);
    expect(data.data.tracks['Roof 9'].keyframes).toEqual(track(9, true).keyframes);
    data.shiftSelected('up');
    expect(data.data.tracks['Roof 8'].keyframes[0].ts).toBe(8);
  });

  test('flip uses visible unlocked order and ignores hidden selections', () => {
    const { data } = makeData({
      'Roof 8': track(8, true),
      'Roof 9': track(9, true),
      'Fence 1': { ...track(10), locked: true },
      'Fence 2': track(11, true),
    });
    data.setGroupCollapsed('Roof hamilton', true);
    data.flipSelected();
    expect(data.data.tracks['Roof 8'].keyframes[0].ts).toBe(11);
    expect(data.data.tracks['Fence 2'].keyframes[0].ts).toBe(8);
    expect(data.data.tracks['Roof 9'].keyframes).toEqual(track(9, true).keyframes);
  });

  test('group insertion and locking only affect visible descendants', () => {
    const { data } = makeData({
      'Roof 1': track(1, true),
      'Roof 9': { ...track(9), locked: true },
    });
    data.setGroupCollapsed('Roof parkview', true);
    data.insertAuto('Roof', 5, 1);
    expect(data.data.tracks['Roof 1'].keyframes).toEqual(track(1, true).keyframes);
    expect(data.data.tracks['Roof 2']).toBeUndefined();
    expect(data.data.tracks['Roof 9'].keyframes).toHaveLength(1);
    expect(data.data.tracks['Roof 10'].keyframes).toEqual([{ ts: 5, value: 1 }]);
    data.setNodeLocked('Roof', true);
    expect(data.data.tracks['Roof 1']).toEqual(track(1, true));
    expect(data.visibleRows.find((row) => row.id === 'Roof')?.locked).toBe(true);
    data.setNodeLocked('Roof', false);
    expect(data.data.tracks['Roof 9'].locked).toBe(false);
    data.insertAuto('Roof parkview', 6, 1);
    expect(data.data.tracks['Roof 1']).toEqual(track(1, true));
  });

  test('hidden selections do not determine selected bounds or snapping', () => {
    const { data } = makeData({ 'Roof 1': track(100, true), Extra: track(5, true) });
    data.setGroupCollapsed('Roof', true);
    expect(data.firstLastSelected()).toEqual({ first: 5, last: 5 });
    expect(data.findNearest(99)?.ts).toBe(5);
    data.selectAll(false);
    expect(data.firstLastSelected()).toEqual({ first: 0, last: 0 });
    expect(data.data.tracks['Roof 1'].keyframes[0].selected).toBe(true);
  });

  test('beat insertion and replacement respect an existing track lock', () => {
    const { data } = makeData({ Beat: { ...track(1), locked: true } });
    data.insertBeat(2);
    data.replaceBeats([3, 4]);
    expect(data.data.tracks.Beat.keyframes.map((kf) => kf.ts)).toEqual([1]);
    data.setNodeLocked('Beat', false);
    data.insertBeat(2);
    expect(data.data.tracks.Beat.keyframes.map((kf) => kf.ts)).toEqual([1, 2]);
    data.replaceBeats([3, 4]);
    expect(data.data.tracks.Beat.keyframes.map((kf) => kf.ts)).toEqual([3, 4]);
  });
});

describe('binarySearch2', () => {
  test('simple', () => {
    const actual = binarySearch(keyframes, 16);
    expect(actual).toBe(2);
  });

  test('left', () => {
    expect(binarySearch(keyframes, 12, 'left')).toBe(1);
    expect(binarySearch(keyframes, 18, 'left')).toBe(1);
  });

  test('right', () => {
    expect(binarySearch(keyframes, 12, 'right')).toBe(2);
    expect(binarySearch(keyframes, 18, 'right')).toBe(2);
  });

  test('out of range left', () => {
    const actual = binarySearch(keyframes, -1);
    expect(actual).toBe(0);
  });

  test('out of range left, side left', () => {
    const actual = binarySearch(keyframes, -1, 'left');
    expect(actual).toBeUndefined();
  });

  test('out of range left, side right', () => {
    const actual = binarySearch(keyframes, -1, 'right');
    expect(actual).toBe(0);
  });

  test('out of range right', () => {
    const actual = binarySearch(keyframes, 80);
    expect(actual).toBe(keyframes.length - 1);
  });

  test('exact match', () => {
    const actual = binarySearch(keyframes, 40);
    expect(actual).toBe(4);
  });

  test('side constraints include exact matches consistently for single and multiple keyframes', () => {
    const single = [{ ts: 10, value: 1 }];
    const pair = [...single, { ts: 20, value: 0 }];
    expect(binarySearch(single, 10, 'left')).toBe(0);
    expect(binarySearch(single, 10, 'right')).toBe(0);
    expect(binarySearch(pair, 10, 'right')).toBe(0);
    expect(binarySearch(pair, 20, 'left')).toBe(1);
  });

  test('directional searches match inclusive bounds across empty arrays, duplicates, and endpoints', () => {
    for (const times of [[], [10], [10, 20], [0, 10, 20, 30], [10, 10, 10], [0, 10, 10, 20]]) {
      const frames = times.map((ts) => ({ ts, value: 0 }));
      for (const time of [-1, 0, 5, 10, 15, 20, 25, 30, 31]) {
        const before = times
          .map((ts, index) => ({ ts, index }))
          .filter((frame) => frame.ts <= time);
        const after = times.findIndex((ts) => ts >= time);
        expect(binarySearch(frames, time, 'left'), `left: [${times}] at ${time}`).toBe(
          before[before.length - 1]?.index,
        );
        expect(binarySearch(frames, time, 'right'), `right: [${times}] at ${time}`).toBe(
          after === -1 ? undefined : after,
        );
        const nearest = binarySearch(frames, time);
        if (times.length === 0) expect(nearest).toBeUndefined();
        else {
          expect(nearest).toBeDefined();
          expect(Math.abs(times[nearest!] - time)).toBe(
            Math.min(...times.map((ts) => Math.abs(ts - time))),
          );
        }
      }
    }
  });
});
