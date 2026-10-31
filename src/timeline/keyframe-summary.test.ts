import { describe, expect, test, vi } from 'vitest';
import { drawKeyframeSummary, groupKeyframeSpans } from './keyframe-summary';
import { LayoutNode, Tracks } from './types';

const group: LayoutNode = {
  type: 'group',
  id: 'House',
  children: [
    { type: 'track', id: 'Roof' },
    {
      type: 'group',
      id: 'Nested',
      children: [
        { type: 'track', id: 'Locked' },
        { type: 'track', id: 'Empty' },
      ],
    },
  ],
};
const tracks: Tracks = {
  Roof: {
    locked: false,
    keyframes: [
      { ts: 1, value: 1, selected: true },
      { ts: 5, value: 0 },
    ],
  },
  Locked: {
    locked: true,
    keyframes: [
      { ts: 1.1, value: 0 },
      { ts: 1.2, value: 1 },
      { ts: 8, value: 1 },
    ],
  },
  Unrelated: { locked: false, keyframes: [{ ts: 3, value: 1 }] },
};

describe('collapsed group summaries', () => {
  test('merges nearby timestamps across nested and locked tracks without bridging gaps', () => {
    const original = structuredClone(tracks);
    expect(groupKeyframeSpans(group, tracks, 0, 10, (t) => t * 100)).toEqual([
      { start: 90, end: 130 },
      { start: 490, end: 510 },
      { start: 790, end: 810 },
    ]);
    expect(tracks).toEqual(original);
  });

  test('uses the current zoom and pan and only collects timestamps in the requested range', () => {
    expect(groupKeyframeSpans(group, tracks, 1.2, 5, (t) => (t - 1) * 50)).toEqual([
      { start: expect.closeTo(0), end: 20 },
      { start: 190, end: 210 },
    ]);
  });

  test('empty groups and time ranges have no summary', () => {
    expect(groupKeyframeSpans(group, {}, 0, 10, (t) => t)).toEqual([]);
    expect(groupKeyframeSpans(group, tracks, 2, 4, (t) => t)).toEqual([]);
  });

  test('drawing keeps separate waves, clips to the viewport, and stays within the row', () => {
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      strokeStyle: '',
      lineWidth: 0,
      lineCap: '',
      lineJoin: '',
    };
    drawKeyframeSummary(
      ctx as unknown as CanvasRenderingContext2D,
      [
        { start: -10, end: 10 },
        { start: 90, end: 110 },
      ],
      45,
      100,
      '#aaa',
    );
    expect(ctx.moveTo.mock.calls.map(([x]) => x)).toEqual([0, 90]);
    expect(ctx.lineTo.mock.calls.some(([x]) => x === 10)).toBe(true);
    expect(ctx.lineTo.mock.calls[ctx.lineTo.mock.calls.length - 1][0]).toBe(100);
    for (const [x, y] of [...ctx.moveTo.mock.calls, ...ctx.lineTo.mock.calls]) {
      expect(x >= 0 && x <= 100 && (x <= 10 || x >= 90)).toBe(true);
      expect(y).toBeGreaterThanOrEqual(42);
      expect(y).toBeLessThanOrEqual(48);
    }
    expect(new Set(ctx.lineTo.mock.calls.map(([, y]) => y)).size).toBeGreaterThan(2);
    expect(ctx.strokeStyle).toBe('#aaa');
    expect(ctx.stroke).toHaveBeenCalledOnce();
    expect(ctx.restore).toHaveBeenCalledOnce();
  });
});
