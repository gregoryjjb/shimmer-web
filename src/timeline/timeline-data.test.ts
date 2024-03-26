import { expect, test, describe } from 'vitest';

import { binarySearch } from './timeline-data';
import { Keyframe } from './types';

const keyframes = [0, 10, 20, 30, 40, 50, 60, 70].map<Keyframe>((n) => ({
  selected: false,
  timestamp: n,
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
