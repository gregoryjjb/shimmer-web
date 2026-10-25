import localforage from 'localforage';
import { parseConfig, VisualizerConfig } from './types';

export const CONFIG_KEY = 'shimmer.visualizer';
const images = localforage.createInstance({
  driver: localforage.INDEXEDDB,
  name: 'shimmer-editor',
  storeName: 'visualizer_images',
});

export async function loadVisualizer() {
  const config = parseConfig(localStorage.getItem(CONFIG_KEY));
  const image = await images.getItem<Blob>('house');
  if (image !== null && !(image instanceof Blob)) {
    throw new Error('The saved house image could not be read.');
  }
  return { config, image };
}

export async function saveVisualizer(config: VisualizerConfig, image: Blob) {
  const serialized = JSON.stringify(parseConfig(JSON.stringify(config)));
  const previousImage = await images.getItem<Blob>('house');
  await images.setItem('house', image);
  try {
    localStorage.setItem(CONFIG_KEY, serialized);
  } catch (error) {
    // Keep the previous image paired with the previous configuration if storage is full.
    if (previousImage) await images.setItem('house', previousImage);
    else await images.removeItem('house');
    throw error;
  }
}
