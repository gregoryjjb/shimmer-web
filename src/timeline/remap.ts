import { BEAT_TRACK_ID } from './beat';
import { Tracks } from './types';

/** Copy from the original show so chained mappings do not overwrite their sources. */
export function remapChannels(source: Tracks, mapping: Record<string, string | undefined>): Tracks {
  const tracks = structuredClone(source);
  for (const [target, from] of Object.entries(mapping)) {
    if (target === BEAT_TRACK_ID || !from || !Object.prototype.hasOwnProperty.call(source, from))
      continue;
    Object.defineProperty(tracks, target, {
      value: structuredClone(source[from]),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return tracks;
}
