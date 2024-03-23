import localforage from 'localforage';
import { Emitter } from './events';
import { Track } from './timeline-data';

localforage.config({
  driver: localforage.INDEXEDDB,
  name: 'gomas-web',
});

type Metadata = {
  name: string;
};

export type Project = {
  metadata: Metadata;
  tracks: string;
  audio: Blob;
};

export interface IPersistence {
  saveData: (value: any) => void;
  getData: () => Promise<unknown>;

  getAudio: () => Promise<Blob>;

  get: <T extends keyof Project>(key: T) => Promise<Project[T]>;
  set: <T extends keyof Project>(key: T, value: Project[T]) => Promise<void>;

  // onChange: <T extends keyof Project>(
  //   key: T,
  //   handler: (value: Project[T]) => void
  // ) => void;
}

export class LocalPersistence {
  private queued?: unknown | undefined;
  private timeout?: number;

  private project?: Project;

  static new = async (project: Project) => {
    const p = new LocalPersistence();
    p.project = project;

    await Promise.all([p.saveData(project.tracks), p.saveAudio(project.audio)]);

    return p;
  };

  static loadExisting = async (): Promise<LocalPersistence | null> => {
    const lp = new LocalPersistence();

    const tracks = await lp.getData();
    if (!tracks) {
      console.log('[LocalPersistence] No tracks');
      return null;
    }

    const audio = await lp.getAudio();
    if (!audio || !(audio instanceof Blob)) {
      console.log('[LocalPersistence] No audio');
      return null;
    }

    const metadata = {
      name: 'Replace this with something',
    };

    lp.project = {
      metadata,
      tracks: tracks as string,
      audio,
    };

    return lp;
  };

  get = async <T extends keyof Project>(key: T): Promise<Project[T]> => {
    if (!this.project) {
      throw new Error();
    }

    return this.project[key];
  };

  set = async <T extends keyof Project>(
    key: T,
    value: Project[T],
  ): Promise<void> => {
    await localforage.setItem(key, value);
  };

  saveData = (value: unknown) => {
    this.queued = value;

    if (this.timeout === undefined) {
      this.timeout = window.setTimeout(this.saveQueued, 0);
    }
  };

  getData = async (): Promise<unknown> => {
    const result = await localforage.getItem('tracks');
    return result;
  };

  saveAudio = async (data: Blob) => {
    await localforage.setItem('audio', data);
  };

  getAudio = async (): Promise<Blob> => {
    return (await localforage.getItem('audio')) as Blob;
  };

  private saveQueued = async () => {
    while (this.queued !== undefined) {
      const toSave = this.queued;
      this.queued = undefined;

      await localforage.setItem('tracks', toSave);
    }

    this.timeout = undefined;
  };
}

export const localPersistence = new LocalPersistence();

export class Persistence extends Emitter<{
  audioChanged: Blob;
}> {
  private audioInput: HTMLInputElement;

  constructor() {
    super();

    this.audioInput = document.createElement('input');
    this.audioInput.type = 'file';
    this.audioInput.addEventListener(
      'change',
      this.handleAudioFileChange as (e: Event) => void,
    );
  }

  storeAudio = async (data: Blob) => {
    await localforage.setItem('audio', data);
  };

  retrieveAudio = async (): Promise<Blob | undefined> => {
    try {
      const result = await localforage.getItem('audio');
      if (result instanceof Blob) {
        return result;
      }

      console.warn('audio from indexeddb was not a blob');
      return undefined;
    } catch (err) {
      console.error('failed to load audio locally:', err);
      return undefined;
    }
  };

  pickAudio = () => {
    this.audioInput.click();
  };

  private handleAudioFileChange = (
    event: Event & { target: HTMLInputElement },
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    this.storeAudio(file);
    this.emit('audioChanged', file);
  };
}
