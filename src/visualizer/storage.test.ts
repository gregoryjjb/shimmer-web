// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { constrainObject, parseConfig, VisualizerConfig } from './types';

const images = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
}));
vi.mock('localforage', () => ({
  default: { INDEXEDDB: 'asyncStorage', createInstance: () => images },
}));
import { CONFIG_KEY, loadVisualizer, saveVisualizer } from './storage';

const rectangle = { x: 0.2, y: 0.3, width: 0.1, height: 0.05, color: '#ff8800' };
const config: VisualizerConfig = { Roof: [rectangle, { ...rectangle, x: 0.5 }], Door: [] };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  localStorage.clear();
  images.getItem.mockResolvedValue(null);
  images.setItem.mockResolvedValue(undefined);
  images.removeItem.mockResolvedValue(undefined);
});

describe('visualizer persistence', () => {
  test('loads an empty visualizer on first use', async () => {
    expect(await loadVisualizer()).toEqual({ config: {}, image: null });
  });

  test('stores only the requested schema in localStorage and the image in IndexedDB', async () => {
    const image = new Blob(['house'], { type: 'image/png' });
    await saveVisualizer(config, image);
    expect(JSON.parse(localStorage.getItem(CONFIG_KEY)!)).toEqual(config);
    expect(images.setItem).toHaveBeenCalledWith('house', image);
    images.getItem.mockResolvedValue(image);
    expect(await loadVisualizer()).toEqual({ config, image });
  });

  test('does not change saved objects if writing the image fails', async () => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    images.setItem.mockRejectedValue(new Error('IndexedDB unavailable'));
    await expect(saveVisualizer({}, new Blob())).rejects.toThrow('IndexedDB unavailable');
    expect(JSON.parse(localStorage.getItem(CONFIG_KEY)!)).toEqual(config);
  });

  test('restores the previous image if localStorage rejects a save', async () => {
    const previousImage = new Blob(['old house']);
    const nextImage = new Blob(['new house']);
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    images.getItem.mockResolvedValue(previousImage);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded');
    });
    await expect(saveVisualizer({}, nextImage)).rejects.toThrow('Quota exceeded');
    expect(images.setItem).toHaveBeenNthCalledWith(1, 'house', nextImage);
    expect(images.setItem).toHaveBeenNthCalledWith(2, 'house', previousImage);
    expect(JSON.parse(localStorage.getItem(CONFIG_KEY)!)).toEqual(config);
  });

  test('removes the new image after a failed first save', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded');
    });
    await expect(saveVisualizer(config, new Blob())).rejects.toThrow('Quota exceeded');
    expect(images.removeItem).toHaveBeenCalledWith('house');
  });

  test('rejects corrupt saved data instead of silently overwriting it', async () => {
    localStorage.setItem(CONFIG_KEY, '{broken');
    await expect(loadVisualizer()).rejects.toThrow();
    for (const invalid of [
      [],
      { Roof: {} },
      { Roof: [{ ...rectangle, color: 'red' }] },
      { Roof: [{ ...rectangle, width: -1 }] },
      { Roof: [{ ...rectangle, x: 2 }] },
    ]) {
      expect(() => parseConfig(JSON.stringify(invalid))).toThrow();
    }
  });

  test('supports track names that match object prototype properties', () => {
    const parsed = parseConfig(
      JSON.stringify({ ['__proto__']: [rectangle], constructor: [rectangle] }),
    );
    expect(parsed['__proto__']).toEqual([rectangle]);
    expect(parsed['constructor']).toEqual([rectangle]);
    expect(parsed['toString']).toBeUndefined();
  });
});

test('keeps moved and resized rectangles inside the image with positive dimensions', () => {
  expect(constrainObject({ ...rectangle, x: -0.4, y: 1 })).toEqual({ ...rectangle, x: 0, y: 0.95 });
  const resized = constrainObject({ ...rectangle, width: 3, height: -0.2 });
  expect(resized.width).toBe(1);
  expect(resized.height).toBe(0.005);
  expect(resized.x).toBe(0);
  expect(resized.y + resized.height).toBeLessThanOrEqual(1);
});
