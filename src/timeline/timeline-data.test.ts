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
          { type: 'track', id: 'track-1', keyframes: [] },
          {
            type: 'group',
            id: 'nested-group',
            children: [{ type: 'track', id: 'track-2', keyframes: [] }],
          },
        ],
      },
      { type: 'track', id: 'track-3', keyframes: [] },
    ],
  });

  data.insertAuto('group-a', 12.5, 1);

  expect(data.trackLookup['track-1'].keyframes).toEqual([{ ts: 12.5, value: 1 }]);
  expect(data.trackLookup['track-2'].keyframes).toEqual([{ ts: 12.5, value: 1 }]);
  expect(data.trackLookup['track-3'].keyframes).toEqual([]);
});
