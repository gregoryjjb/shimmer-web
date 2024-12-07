import JSZip from 'jszip';
import { Keyframe, Project, ProjectData, Track } from './types';

export const toLegacyFormat = (tracks: Track[]) => {
  return {
    projectData: {
      name: 'Old format name',
      id: 'old_format_id',
    },
    tracks: tracks.map((track, i) => ({
      id: i,
      keyframes: track.keyframes.map((k) => ({
        time: k.ts,
        state: k.value,
      })),
    })),
  };
};

export const downloadFile = (name: string, contents: string | Blob) => {
  const file = new File([contents], name, { type: 'text/json' });
  const url = URL.createObjectURL(file);

  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const stringify = (v: any): string => {
  if (v === undefined) return '';
  return String(v);
};

const coalesce = (...v: any[]): any => {
  for (let i = 0; i < v.length; i++) {
    if (v[i] !== undefined) return v[i];
  }
};

/**
 * Parses any new or old data object and returns the cleaned result
 */
export const parseProjectData = (data: any): ProjectData => {
  if (typeof data === 'string') {
    data = JSON.parse(data);
  }

  const tracksIn = data.tracks;

  if (!tracksIn || !Array.isArray(tracksIn)) {
    throw 'No tracks data present';
  }

  const tracks: Track[] = (tracksIn as any[]).map((trackIn, i) => {
    const name = stringify(trackIn.name) || stringify(trackIn.id) || '';

    const keyframesIn = trackIn.keyframes;
    if (!keyframesIn || !Array.isArray(keyframesIn)) {
      throw `tracks[${i}] missing keyframes`;
    }

    const keyframes: Keyframe[] = (keyframesIn as any[]).map((keyframeIn, j) => {
      const timestamp = coalesce(keyframeIn.ts, keyframeIn.timestamp, keyframeIn.time);
      if (timestamp === undefined) {
        throw `tracks[${i}].keyframes[${j}] missing timestamp field, checked: ts, timestamp, time`;
      }
      if (typeof timestamp !== 'number') {
        throw `tracks[${i}].keyframes[${j}] timestamp is not a number`;
      }

      const valueIn = coalesce(keyframeIn.value, keyframeIn.state);
      if (valueIn === undefined) {
        throw `tracks[${i}].keyframes[${j}] missing value or state field`;
      }
      if (!(typeof valueIn === 'number' || typeof valueIn === 'boolean')) {
        throw `tracks[${i}].keyframes[${j}] value is not a number or boolean`;
      }
      const value = Number(valueIn);

      const selected = typeof keyframeIn.selected === 'boolean' ? keyframeIn.selected : false;

      const keyframe: Keyframe = {
        ts: timestamp,
        value,
      };
      if (selected) {
        keyframe.selected = true;
      }
      return keyframe;
    });

    return {
      name,
      keyframes,
    };
  });

  return {
    tracks,
  };
};

export const projectFromFile = async (file: File): Promise<Project> => {
  const name = file.name.replace(/\.[^\.]*$/, '');

  return await projectFromBlob(name, file);
};

export const projectFromBlob = async (name: string, blob: Blob): Promise<Project> => {
  const zip = await JSZip.loadAsync(blob);

  const dataFile = zip.file('data.json');
  if (!dataFile) {
    throw 'Missing data.json';
  }

  const audioFile = zip.file('audio.mp3');
  if (!audioFile) {
    throw 'Missing audio.mp3';
  }

  const data = parseProjectData(await dataFile.async('string'));
  const audio = await audioFile.async('blob');

  return {
    name,
    audio,
    data,
  };
};

export const projectFromURL = async (url: string): Promise<Project> => {
  const filename = url.split('#')[0].split('?')[0].split('/').pop();
  const name = filename?.replace(/\.[^\.]*$/, '') || '';

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error('project fetch failed');
  }

  return await projectFromBlob(name, await res.blob());
};
