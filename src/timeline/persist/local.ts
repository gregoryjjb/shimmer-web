import localforage from 'localforage';

import { ProjectData } from '../types';
import { Persistor } from '.';

localforage.config({
  driver: localforage.INDEXEDDB,
  name: 'shimmer-editor',
});

async function loadName(): Promise<string> {
  throw new Error('not implemented');
}

async function saveName(value: string): Promise<void> {
  throw new Error('not implemented');
}

async function loadData(): Promise<ProjectData | undefined> {
  const data = (await localforage.getItem('data')) as ProjectData;

  // TODO: replace with zod validation?
  // if (!data) return;
  // if (!data.tracks) return;
  // if (!data.beats) return;

  return data;
}

async function loadAudio(): Promise<Blob | undefined> {
  const audio = await localforage.getItem('audio');

  if (!(audio instanceof Blob)) return;

  return audio as Blob;
}

async function saveData(value: ProjectData) {
  await localforage.setItem('data', value);

  console.debug('Wrote data to local indexeddb');
}

async function saveAudio(value: Blob) {
  await localforage.setItem('audio', value);

  console.debug('Wrote audio to local indexeddb');
}

/**
 * The LocalPersistor uses local browser storage (IndexedDB and localstorage)
 */
export const LocalPersistor = {
  loadName,
  saveName,

  loadData,
  loadAudio,

  saveData,
  saveAudio,
} satisfies Persistor;
