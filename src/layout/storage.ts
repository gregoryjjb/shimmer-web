import localforage from 'localforage';
import { blobToDataURL } from '../files';
import { defaultLayout, LayoutDocument, parseLayoutDocument, withVisuals } from './document';
import { parseConfig } from '../visualizer/types';
import { parseLayout } from '../timeline/layout';

const layouts = localforage.createInstance({
  driver: localforage.INDEXEDDB,
  name: 'shimmer-editor',
  storeName: 'layouts',
});

export async function saveLayout(document: LayoutDocument) {
  await layouts.setItem('current', parseLayoutDocument(document));
}

export async function loadLayout(): Promise<LayoutDocument> {
  const saved = await layouts.getItem('current');
  if (saved !== null) return parseLayoutDocument(saved);

  // Carry the existing browser setup into the single-document store once.
  const previousTree = localStorage.getItem('shimmer.layout');
  const previousObjects = localStorage.getItem('shimmer.visualizer');
  const images = localforage.createInstance({
    driver: localforage.INDEXEDDB,
    name: 'shimmer-editor',
    storeName: 'visualizer_images',
  });
  const image = await images.getItem<Blob>('house');
  if (image !== null && !(image instanceof Blob))
    throw new Error('The saved house image could not be read');
  const document = defaultLayout();
  if (previousTree) document.tree = parseLayout(previousTree);
  const migrated = withVisuals(document, {
    ...(image ? { backgroundImage: await blobToDataURL(image) } : {}),
    trackObjects: parseConfig(previousObjects),
  });
  if (previousTree !== null || previousObjects !== null || image) await saveLayout(migrated);
  return migrated;
}
