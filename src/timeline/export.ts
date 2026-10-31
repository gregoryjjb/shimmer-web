import JSZip from 'jszip';
import { Keyframe, Project, ProjectData, Track } from './types';
import { HOUSE_LAYOUT, iterateNodes } from './layout';

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

const reservedNames = new Set(
  Array.from(iterateNodes(...HOUSE_LAYOUT))
    .filter((node) => node.type === 'group')
    .map((node) => node.id),
);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parseKeyframe(raw: unknown): Keyframe {
  if (
    !isObject(raw) ||
    typeof raw.ts !== 'number' ||
    !Number.isFinite(raw.ts) ||
    typeof raw.value !== 'number' ||
    !Number.isFinite(raw.value)
  ) {
    throw new Error('Each keyframe must have finite numeric ts and value fields');
  }
  return { ts: raw.ts, value: raw.value, ...(raw.selected === true ? { selected: true } : {}) };
}

/** Convert older file formats before the shared flat-track validation. */
function upgradeTracks(data: Record<string, unknown>): unknown {
  if (data.version === '3') return data.tracks;
  if (data.version !== undefined && data.version !== '2') {
    throw new Error('Unsupported project data version: ' + data.version);
  }
  if (!Array.isArray(data.tracks)) throw new Error('Project data must contain a tracks array');

  const tracks = new Map<string, unknown>();
  const addTrack = (name: unknown, raw: unknown) => {
    if (typeof name !== 'string' || !name.trim()) {
      throw new Error('Track names must be non-empty strings');
    }
    if (tracks.has(name)) throw new Error('Duplicate track name: ' + name);
    tracks.set(name, raw);
  };

  if (data.version === '2') {
    const visit = (node: unknown) => {
      if (!isObject(node)) throw new Error('Layout nodes must be objects');
      if (node.type === 'group') {
        if (!Array.isArray(node.children)) throw new Error('Groups must contain a children array');
        node.children.forEach(visit);
      } else if (node.type === 'track') {
        addTrack(node.id, node);
      } else {
        throw new Error('Layout node type must be track or group');
      }
    };
    data.tracks.forEach(visit);
  } else {
    data.tracks.forEach((raw, index) => {
      if (!isObject(raw) || !Array.isArray(raw.keyframes)) {
        throw new Error('Each track must contain a keyframes array');
      }
      const keyframes = raw.keyframes.map((keyframe: unknown) => {
        if (!isObject(keyframe)) throw new Error('Keyframes must be objects');
        // The original format accepted timestamp aliases and numeric/boolean states.
        const ts = [keyframe.ts, keyframe.timestamp, keyframe.time].find((v) => v !== undefined);
        const value = keyframe.value !== undefined ? keyframe.value : keyframe.state;
        return { ts, value: Number(value), selected: keyframe.selected };
      });
      addTrack(raw.name || raw.id || `Track ${index}`, { locked: raw.locked, keyframes });
    });
  }

  return Object.fromEntries(tracks);
}

/** Read any supported show format into version 3. Layout is supplied independently. */
export function parseProjectData(input: unknown): ProjectData {
  const data: unknown = typeof input === 'string' ? JSON.parse(input) : input;
  if (!isObject(data)) throw new Error('Project data must be an object');
  const tracks = upgradeTracks(data);
  if (!isObject(tracks)) throw new Error('Project data must contain a tracks object');

  const entries = Object.entries(tracks).map(([name, raw]): [string, Track] => {
    if (!name.trim()) throw new Error('Track names must not be empty');
    if (reservedNames.has(name))
      throw new Error('Track name conflicts with a house group: ' + name);
    if (!isObject(raw) || !Array.isArray(raw.keyframes)) {
      throw new Error('Track ' + name + ' must contain a keyframes array');
    }
    if (raw.locked !== undefined && typeof raw.locked !== 'boolean') {
      throw new Error('Track ' + name + ' locked must be a boolean');
    }
    return [
      name,
      {
        locked: raw.locked ?? false,
        keyframes: raw.keyframes.map(parseKeyframe).sort((a, b) => a.ts - b.ts),
      },
    ];
  });
  return { version: '3', tracks: Object.fromEntries(entries) };
}

/** The archive contains show data and audio only. */
export async function projectToBlob(project: Project): Promise<Blob> {
  const zip = new JSZip();
  zip.file('data.json', JSON.stringify(parseProjectData(project.data)));
  zip.file('audio.mp3', project.audio);
  return zip.generateAsync({ type: 'blob' });
}

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
