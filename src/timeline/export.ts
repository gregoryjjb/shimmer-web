import JSZip from 'jszip';
import { Group, Keyframe, LayoutNode, Project, ProjectData, Track } from './types';

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

const parseKeyframe = (raw: any, path: string): Keyframe => {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${path} is not an object`);
  }

  const ts = raw.ts;
  if (typeof ts !== 'number') {
    throw new Error(`${path}.ts must be a number`);
  }

  const value = raw.value;
  if (typeof value !== 'number') {
    throw new Error(`${path}.value must be a number`);
  }

  const keyframe: Keyframe = { ts, value };
  if (typeof raw.selected === 'boolean' && raw.selected) {
    keyframe.selected = true;
  }
  return keyframe;
};

const parseLocked = (raw: any, path: string): boolean => {
  if (raw.locked === undefined) return false;
  if (typeof raw.locked !== 'boolean') {
    throw new Error(`${path}.locked must be a boolean`);
  }
  return raw.locked;
};

const parseTrack = (raw: any, path: string): Track => {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${path} is not an object`);
  }

  const id = raw.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error(`${path}.id must be a non-empty string`);
  }
  console.log('Parsed track', id);

  if (!Array.isArray(raw.keyframes)) {
    throw new Error(`${path}.keyframes must be an array`);
  }

  const keyframes = raw.keyframes.map((kf: any, i: number) =>
    parseKeyframe(kf, `${path}.keyframes[${i}]`),
  );

  return { type: 'track', id, keyframes, locked: parseLocked(raw, path) };
};

const parseGroup = (raw: any, path: string): Group => {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${path} is not an object`);
  }

  const id = raw.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error(`${path}.id must be a non-empty string`);
  }
  console.log('Parsed group', id);

  if (!Array.isArray(raw.children)) {
    throw new Error(`${path}.children must be an array`);
  }

  const children = raw.children.map((child: any, i: number) =>
    parseLayoutNode(child, `${path}.children[${i}]`),
  );

  return { type: 'group', id, children };
};

const parseLayoutNode = (raw: any, path: string): LayoutNode => {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${path} is not an object`);
  }

  if (raw.type === 'track') {
    return parseTrack(raw, path);
  } else if (raw.type === 'group') {
    return parseGroup(raw, path);
  }

  throw new Error(`${path}.type must be 'track' or 'group', got '${raw.type}'`);
};

const collectIds = (nodes: LayoutNode[]): string[] => {
  const ids: string[] = [];
  for (const node of nodes) {
    ids.push(node.id);
    if (node.type === 'group') {
      ids.push(...collectIds(node.children));
    }
  }
  return ids;
};

const validateUniqueIds = (nodes: LayoutNode[]) => {
  const ids = collectIds(nodes);
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      console.log('Failing nodes', nodes);
      throw new Error(`Duplicate node ID: '${id}'`);
    }
    seen.add(id);
  }
};

/**
 * Parses any version of a project data object and returns
 * a valid ProjectData. Unversioned (old format) data is silently
 * upgraded to the current format.
 */
export const parseProjectData = (data: any): ProjectData => {
  if (typeof data === 'string') {
    data = JSON.parse(data);
  }

  if (typeof data !== 'object' || data === null) {
    throw new Error('Project data must be an object');
  }

  // Old format: no version field — silently upgrade
  if (data.version === undefined) {
    console.log('Upgrading old format data');

    if (!Array.isArray(data.tracks)) {
      throw new Error('Project data missing tracks array');
    }

    const tracks: Track[] = data.tracks.map((trackIn: any, i: number) => {
      if (typeof trackIn !== 'object' || trackIn === null) {
        throw new Error(`tracks[${i}] is not an object`);
      }

      if (!Array.isArray(trackIn.keyframes)) {
        throw new Error(`tracks[${i}].keyframes must be an array`);
      }

      const keyframes = trackIn.keyframes.map((kf: any, j: number) => {
        const ts = coalesce(kf.ts, kf.timestamp, kf.time);
        if (typeof ts !== 'number') {
          throw new Error(`tracks[${i}].keyframes[${j}] missing or invalid timestamp`);
        }

        const valueIn = coalesce(kf.value, kf.state);
        if (valueIn === undefined) {
          throw new Error(`tracks[${i}].keyframes[${j}] missing value or state field`);
        }
        const value = Number(valueIn);
        if (isNaN(value)) {
          throw new Error(`tracks[${i}].keyframes[${j}] value is not a valid number`);
        }

        const keyframe: Keyframe = { ts, value };
        if (typeof kf.selected === 'boolean' && kf.selected) {
          keyframe.selected = true;
        }
        return keyframe;
      });

      return {
        type: 'track' as const,
        id: trackIn.name || trackIn.id || `Track ${i}`,
        keyframes,
        locked: parseLocked(trackIn, `tracks[${i}]`),
      };
    });

    validateUniqueIds(tracks);
    return { version: '2', tracks };
  }

  // Current format: strict parsing
  if (data.version !== '2') {
    throw new Error(`Unknown project data version: '${data.version}'`);
  }

  if (!Array.isArray(data.tracks)) {
    throw new Error('Project data missing tracks array');
  }

  const tracks: LayoutNode[] = data.tracks.map((node: any, i: number) =>
    parseLayoutNode(node, `tracks[${i}]`),
  );

  validateUniqueIds(tracks);
  return { version: '2', tracks };
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
