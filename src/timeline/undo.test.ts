import { expect, test, describe } from 'vitest';

import { UndoHistory } from './undo';

describe('UndoHistory', () => {
  test('success', () => {
    const uh = new UndoHistory<string>(5, 'base');

    uh.push('first');
    uh.push('second');
    uh.push('third');

    expect(uh.undo()).toBe('third');
    expect(uh.head()).toBe('second');

    uh.push('third again');
    expect(uh.head()).toBe('third again');

    uh.push('fourth');
    expect(uh.head()).toBe('fourth');

    uh.push('fifth');
    expect(uh.head()).toBe('fifth');

    uh.push('sixth');
    expect(uh.head()).toBe('sixth');

    expect(uh.undo()).toBe('sixth');
    expect(uh.undo()).toBe('fifth');
    expect(uh.undo()).toBe('fourth');
    expect(uh.undo()).toBe('third again');
  });

  test('simple undo', () => {
    const uh = new UndoHistory<string>(10, 'base');

    uh.push('uno');
    uh.push('dos');
    uh.push('tres');

    expect(uh.head()).toBe('tres');

    expect(uh.undo()).toBe('tres');
    expect(uh.head()).toBe('dos');
  });

  test('overflow buffer', () => {
    const uh = new UndoHistory<string>(4, 'base');

    uh.push('uno');
    uh.push('dos');
    uh.push('tres');
    uh.push('cuatro'); // Overflows the buffer
    uh.push('cinco');

    expect(uh.head()).toBe('cinco');

    uh.undo();
    uh.undo();
    expect(uh.head()).toBe('tres');

    expect(uh.undo()).toBe('tres');
    expect(uh.undo()).toBeUndefined();
  });

  test('nothing to undo', () => {
    const uh = new UndoHistory<string>(4, 'base');

    expect(uh.undo()).toBeUndefined();

    uh.push('one');
    uh.undo();

    expect(uh.head()).toBe('base');
    expect(uh.undo()).toBeUndefined();
  });

  test('simple redo', () => {
    const uh = new UndoHistory<string>(4, 'base');

    uh.push('uno');
    uh.push('dos');
    uh.push('tres');

    uh.undo();
    expect(uh.head()).toBe('dos');

    expect(uh.redo()).toBe('tres');
    expect(uh.head()).toBe('tres');
    expect(uh.redo()).toBeUndefined();
    expect(uh.head()).toBe('tres');
  });

  test('overflow buffer redo', () => {
    const uh = new UndoHistory<string>(4, 'base');

    uh.push('uno');
    uh.push('dos');
    uh.push('tres');
    uh.push('cuatro');

    expect(uh.undo()).toBe('cuatro');
    expect(uh.undo()).toBe('tres');
    expect(uh.undo()).toBe('dos');
    expect(uh.undo()).toBeUndefined();

    expect(uh.redo()).toBe('dos');
    expect(uh.redo()).toBe('tres');
    expect(uh.redo()).toBe('cuatro');
    expect(uh.redo()).toBeUndefined();
  });

  test('push clears redo buffer', () => {
    const uh = new UndoHistory<string>(5, 'base');

    uh.push('uno');
    uh.push('dos');
    uh.push('tres');
    uh.push('cuatro');

    uh.undo();
    uh.undo();
    uh.undo();

    expect(uh.redo()).toBe('dos');

    uh.push('three');
    expect(uh.head()).toBe('three');
    expect(uh.redo()).toBeUndefined();
    expect(uh.head()).toBe('three');
  });
});
