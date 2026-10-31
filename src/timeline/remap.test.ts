import { expect, test } from 'vitest';
import { remapChannels } from './remap';

test('channel mapping copies original data independently and preserves unmapped tracks and Beat', () => {
  const source = {
    A: { locked: false, keyframes: [{ ts: 1, value: 1 }] },
    B: { locked: true, keyframes: [{ ts: 2, value: 0 }] },
    Beat: { locked: true, keyframes: [{ ts: 3, value: 0 }] },
  };
  const mapped = remapChannels(source, { A: 'B', B: 'A', 'Roof 1': 'A', 'Roof 2': 'A', Beat: 'A' });
  expect(mapped.A).toEqual(source.B);
  expect(mapped.B).toEqual(source.A);
  expect(mapped.Beat).toEqual(source.Beat);
  mapped['Roof 1'].keyframes[0].ts = 8;
  expect(mapped['Roof 2'].keyframes[0].ts).toBe(1);
  expect(source.A.keyframes[0].ts).toBe(1);
  expect(remapChannels(source, { 'Roof 1': undefined })).toEqual(source);
});
