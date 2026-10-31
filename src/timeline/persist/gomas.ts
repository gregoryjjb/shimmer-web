import { Persistor } from '.';
import { ProjectData } from '../types';

export function GomasPersistor(host: string, name: string) {
  return {
    loadName: () => Promise.resolve(name),

    saveName: () => {
      throw new Error('not implemented');
    },

    loadData: async (): Promise<unknown> => {
      const url = new URL(`/api/shows/${encodeURIComponent(name)}/data`, host);

      const result = await fetch(url.toString()).then((res) => res.json());

      return result;
    },

    saveData: async (value: ProjectData) => {
      const url = new URL(`/api/shows/${encodeURIComponent(name)}/data`, host);

      await fetch(url, {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(value),
      });

      // TODO: check if success?
    },

    loadAudio: async (): Promise<Blob | undefined> => {
      const url = new URL(`/api/shows/${encodeURIComponent(name)}/audio`, host);

      const result = await fetch(url.toString()).then((res) => res.blob());

      return result;
    },

    saveAudio: async (value: Blob) => {
      throw new Error('not implemented');
    },
  } satisfies Persistor;
}
