import { blobToDataURL } from '../files';

const MAX_PIXELS = 1_000_000;
const WEBP_QUALITY = 0.65;

export async function optimizeBackgroundImage(file: Blob): Promise<string> {
  const sourceURL = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = sourceURL;
    await image.decode();
    const { naturalWidth: width, naturalHeight: height } = image;
    if (!width || !height) throw new Error('Could not read the image dimensions');

    const scale = Math.min(1, Math.sqrt(MAX_PIXELS / (width * height)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(width * scale));
    canvas.height = Math.max(1, Math.floor(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not resize the background image');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const compressed = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) reject(new Error('Could not compress the background image'));
          else if (blob.type !== 'image/webp')
            reject(new Error('This browser cannot encode WebP images'));
          else resolve(blob);
        },
        'image/webp',
        WEBP_QUALITY,
      );
    });
    return await blobToDataURL(compressed);
  } finally {
    URL.revokeObjectURL(sourceURL);
  }
}
