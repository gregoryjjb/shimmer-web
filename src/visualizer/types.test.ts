import { expect, test } from 'vitest';
import { constrainObject, parseConfig } from './types';

const rectangle = { x: 0.2, y: 0.3, width: 0.1, height: 0.05, color: '#ff8800' };
test('rejects invalid rectangles', () => {
  for (const invalid of [
    [],
    { Roof: {} },
    { Roof: [{ ...rectangle, color: 'red' }] },
    { Roof: [{ ...rectangle, width: -1 }] },
    { Roof: [{ ...rectangle, x: 2 }] },
  ])
    expect(() => parseConfig(JSON.stringify(invalid))).toThrow();
});
test('keeps moved and resized rectangles inside the image', () => {
  expect(constrainObject({ ...rectangle, x: -0.4, y: 1 })).toEqual({ ...rectangle, x: 0, y: 0.95 });
  const resized = constrainObject({ ...rectangle, width: 3, height: -0.2 });
  expect(resized.width).toBe(1);
  expect(resized.height).toBe(0.005);
  expect(resized.x).toBe(0);
  expect(resized.y + resized.height).toBeLessThanOrEqual(1);
});
