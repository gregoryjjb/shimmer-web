import { expect, test, describe } from 'vitest';

import { TimelineEmitter } from './events';
import TimelineData, { binarySearch } from './timeline-data';
import { Keyframe } from './types';

const keyframes = [0, 10, 20, 30, 40, 50, 60, 70].map<Keyframe>((n) => ({
  selected: false,
  ts: n,
  value: 0,
}));

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

test('insertAuto on a group inserts keyframes on all descendant tracks', () => {
  const data = new TimelineData(new TimelineEmitter());

  data.replaceAll({
    version: '2',
    tracks: [
      {
        type: 'group',
        id: 'group-a',
        children: [
          { type: 'track', id: 'track-1', keyframes: [], locked: false },
          {
            type: 'group',
            id: 'nested-group',
            children: [{ type: 'track', id: 'track-2', keyframes: [], locked: false }],
          },
        ],
      },
      { type: 'track', id: 'track-3', keyframes: [], locked: false },
    ],
  });

  data.insertAuto('group-a', 12.5, 1);

  expect(data.trackLookup['track-1'].keyframes).toEqual([{ ts: 12.5, value: 1 }]);
  expect(data.trackLookup['track-2'].keyframes).toEqual([{ ts: 12.5, value: 1 }]);
  expect(data.trackLookup['track-3'].keyframes).toEqual([]);
});
