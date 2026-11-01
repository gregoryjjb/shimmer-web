// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { optimizeBackgroundImage } from './background-image';

let dimensions: { naturalWidth: number; naturalHeight: number };
let encoded: Blob | null;
let canvas: HTMLCanvasElement;
const drawImage = vi.fn();
const decode = vi.fn();

beforeEach(() => {
  dimensions = { naturalWidth: 4000, naturalHeight: 3000 };
  encoded = new Blob(['webp'], { type: 'image/webp' });
  decode.mockResolvedValue(undefined);
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      get naturalWidth() {
        return dimensions.naturalWidth;
      }
      get naturalHeight() {
        return dimensions.naturalHeight;
      }
      decode = decode;
    },
  );
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:source'), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    canvas = this;
    return { drawImage } as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
    callback(encoded),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test.each([
  [4000, 3000],
  [3000, 4000],
  [2000, 2000],
  [800, 600],
])('encodes %ix%i as WebP, preserving aspect ratio without upscaling', async (width, height) => {
  dimensions = { naturalWidth: width, naturalHeight: height };
  expect(await optimizeBackgroundImage(new Blob())).toBe('data:image/webp;base64,d2VicA==');
  expect(canvas.width * canvas.height).toBeLessThanOrEqual(1_000_000);
  expect(canvas.width / canvas.height).toBeCloseTo(width / height, 2);
  if (width * height <= 1_000_000) {
    expect([canvas.width, canvas.height]).toEqual([width, height]);
  } else expect(canvas.width * canvas.height).toBeGreaterThan(995_000);
  expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, canvas.width, canvas.height);
  expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.65);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:source');
});

test.each([null, new Blob(['png'], { type: 'image/png' })])(
  'rejects failed or unsupported encoding',
  async (output) => {
    encoded = output;
    await expect(optimizeBackgroundImage(new Blob())).rejects.toThrow();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:source');
  },
);

test('releases the source URL even if decoding fails', async () => {
  decode.mockRejectedValueOnce(new Error('Invalid image'));
  await expect(optimizeBackgroundImage(new Blob())).rejects.toThrow('Invalid image');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:source');
});
