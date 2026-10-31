import localforage from 'localforage';
import { defaultLayout, LayoutDocument, parseLayoutDocument } from './document';

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
  return saved === null ? defaultLayout() : parseLayoutDocument(saved);
}
