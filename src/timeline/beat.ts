import { LayoutNode, Track } from './types';

export const BEAT_TRACK_ID = 'Beat';
export const BEAT_FLASH_DURATION_SECONDS = 0.1;

export const createBeatTrack = (): Track => ({
  type: 'track',
  id: BEAT_TRACK_ID,
  keyframes: [],
  locked: true,
});

/**
 * Ensures Beat is a top-level track at the start of the layout. Existing Beat
 * data is preserved, even if the track was previously nested in a group.
 */
export const ensureBeatTrackFirst = (nodes: LayoutNode[]): LayoutNode[] => {
  let beatTrack: Track | undefined;

  const withoutBeat = (currentNodes: LayoutNode[]): LayoutNode[] => {
    const result: LayoutNode[] = [];

    for (const node of currentNodes) {
      if (node.id === BEAT_TRACK_ID) {
        if (node.type !== 'track') {
          throw new Error(`'${BEAT_TRACK_ID}' is reserved for the beat track`);
        }

        beatTrack = node;
        continue;
      }

      if (node.type === 'group') {
        result.push({ ...node, children: withoutBeat(node.children) });
      } else {
        result.push(node);
      }
    }

    return result;
  };

  const remainingNodes = withoutBeat(nodes);
  return [beatTrack ?? createBeatTrack(), ...remainingNodes];
};
