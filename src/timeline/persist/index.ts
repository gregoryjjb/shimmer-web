import { debounce, DebouncedFunc } from 'lodash-es';

import { ProjectData } from '../types';

export { LocalPersistor } from './local';

/**
 * A Persistor is something capable of loading and saving
 * projects (i.e. either locally or to a remote server)
 */
export interface Persistor {
  loadName: () => Promise<string>;
  saveName: (value: string) => Promise<void>;

  loadData: () => Promise<ProjectData | undefined>;
  saveData: (value: ProjectData) => Promise<void>;

  loadAudio: () => Promise<Blob | undefined>;
  saveAudio: (value: Blob) => Promise<void>;
}

/**
 * In-memory representation of a project backed by some kind of persistence.
 *
 * I'm not a huge fan of how this keeps a duplicate copy of everything in memory.
 */
export class OpenedProject {
  autosave = true;

  private _name: string;
  private _data: ProjectData;
  private _audio: Blob;

  private persistor: Persistor;

  /**
   * Debounced wrapper around the backing persistor's saveData
   */
  private autosaveData: DebouncedFunc<Persistor['saveData']>;

  constructor(name: string, data: ProjectData, audio: Blob, persistor: Persistor) {
    this._name = name;
    this._data = data;
    this._audio = audio;

    this.persistor = persistor;

    this.autosaveData = debounce(persistor.saveData, 1000, { leading: false, trailing: true });
  }

  /**
   * Reads the project into memory from the provided
   * Persistor and creates a new OpenedProject for it
   */
  static async open(p: Persistor): Promise<OpenedProject> {
    const [name, data, audio] = await Promise.all([p.loadName(), p.loadData(), p.loadAudio()]);

    if (!data) throw new Error('missing data');
    if (!audio) throw new Error('missing audio');

    return new OpenedProject(name, data, audio, p);
  }

  get name() {
    return this._name;
  }

  get data() {
    return this._data;
  }

  get audio() {
    return this._audio;
  }

  saveData(value: ProjectData) {
    this._data = value;

    if (this.autosave) this.autosaveData(value);
  }

  saveAudio(value: Blob) {
    this._audio = value;

    if (this.autosave) this.persistor.saveAudio(value);
  }
}
