// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { defaultLayout, LayoutDocument } from './document';

const stores = vi.hoisted(() => ({
  layouts: { getItem: vi.fn(), setItem: vi.fn() },
  images: { getItem: vi.fn() },
}));
vi.mock('localforage', () => ({
  default: {
    INDEXEDDB: 'asyncStorage',
    createInstance: ({ storeName }: { storeName: string }) =>
      storeName === 'layouts' ? stores.layouts : stores.images,
  },
}));
import { loadLayout, saveLayout } from './storage';

const rectangle = { x: 0.2, y: 0.3, width: 0.1, height: 0.05, color: '#ff8800' };
const document: LayoutDocument = {
  tree: [{ type: 'track', id: 'Roof' }],
  visuals: {
    backgroundImage: 'data:image/png;base64,cGhvdG8=',
    trackObjects: { Roof: [rectangle] },
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  stores.layouts.getItem.mockResolvedValue(null);
  stores.images.getItem.mockResolvedValue(null);
  stores.layouts.setItem.mockResolvedValue(undefined);
});

test('first use returns the default tree without writing it over anything', async () => {
  expect(await loadLayout()).toEqual(defaultLayout());
  expect(stores.layouts.setItem).not.toHaveBeenCalled();
});

test('saves tree, objects and embedded image together under one IndexedDB key', async () => {
  await saveLayout(document);
  expect(stores.layouts.setItem).toHaveBeenCalledWith('current', document);
  stores.layouts.getItem.mockResolvedValue(document);
  expect(await loadLayout()).toEqual(document);
  expect(stores.images.getItem).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
});

test('migrates the existing tree, objects and Blob photo without changing UI preferences', async () => {
  localStorage.setItem('shimmer.layout', JSON.stringify(document.tree));
  localStorage.setItem('shimmer.visualizer', JSON.stringify(document.visuals.trackObjects));
  localStorage.setItem('shimmer.visualizer.width', '600');
  stores.images.getItem.mockResolvedValue(new Blob(['photo'], { type: 'image/png' }));
  expect(await loadLayout()).toEqual(document);
  expect(stores.layouts.setItem).toHaveBeenCalledWith('current', document);
  expect(localStorage.getItem('shimmer.visualizer.width')).toBe('600');
});

test('storage errors are surfaced and corrupt saved documents are not replaced by defaults', async () => {
  stores.layouts.setItem.mockRejectedValue(new Error('Storage full'));
  await expect(saveLayout(document)).rejects.toThrow('Storage full');
  stores.layouts.getItem.mockResolvedValue({ tree: 'broken' });
  stores.layouts.setItem.mockClear();
  await expect(loadLayout()).rejects.toThrow();
  expect(stores.layouts.setItem).not.toHaveBeenCalled();
  expect(stores.images.getItem).not.toHaveBeenCalled();
});
