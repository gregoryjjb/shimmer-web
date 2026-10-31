import { BEAT_TRACK_ID } from './beat';
import { DeepReadonly, Keyframe, LayoutNode, LayoutNodeID, Tracks } from './types';

export const HOUSE_LAYOUT: LayoutNode[] = [
  {
    type: 'group',
    id: 'Root',
    children: [
      {
        type: 'group',
        id: 'Roof',
        children: [
          {
            type: 'group',
            id: 'Roof parkview',
            children: [
              { type: 'track', id: 'Roof 1' },
              { type: 'track', id: 'Roof 2' },
              { type: 'track', id: 'Roof 3' },
              { type: 'track', id: 'Roof 4' },
              { type: 'track', id: 'Roof 5' },
              { type: 'track', id: 'Roof 6' },
              { type: 'track', id: 'Roof 7' },
              { type: 'track', id: 'Roof 8' },
            ],
          },
          {
            type: 'group',
            id: 'Roof hamilton',
            children: [
              { type: 'track', id: 'Roof 9' },
              { type: 'track', id: 'Roof 10' },
              { type: 'track', id: 'Roof 11' },
              { type: 'track', id: 'Roof 12' },
              { type: 'track', id: 'Roof 13' },
              { type: 'track', id: 'Roof 14' },
              { type: 'track', id: 'Roof 15' },
              { type: 'track', id: 'Roof 16' },
              { type: 'track', id: 'Roof 17' },
              { type: 'track', id: 'Roof 18' },
            ],
          },
        ],
      },
      {
        type: 'group',
        id: 'Fence',
        children: [
          { type: 'track', id: 'Fence 1' },
          { type: 'track', id: 'Fence 2' },
          { type: 'track', id: 'Fence 3' },
          { type: 'track', id: 'Fence 4' },
          { type: 'track', id: 'Fence 5' },
          { type: 'track', id: 'Fence 6' },
          { type: 'track', id: 'Fence 7' },
          { type: 'track', id: 'Fence 8' },
          { type: 'track', id: 'Fence 9' },
          { type: 'track', id: 'Fence 10' },
        ],
      },
      {
        type: 'group',
        id: 'Tree left',
        children: [
          { type: 'track', id: 'Tree left 1' },
          { type: 'track', id: 'Tree left 2' },
          { type: 'track', id: 'Tree left 3' },
          { type: 'track', id: 'Tree left 4' },
        ],
      },
      {
        type: 'group',
        id: 'Tree center',
        children: [
          { type: 'track', id: 'Tree center 1' },
          { type: 'track', id: 'Tree center 2' },
          { type: 'track', id: 'Tree center 3' },
          { type: 'track', id: 'Tree center 4' },
        ],
      },
      {
        type: 'group',
        id: 'Tree right',
        children: [
          { type: 'track', id: 'Tree right 1' },
          { type: 'track', id: 'Tree right 2' },
          { type: 'track', id: 'Tree right 3' },
          { type: 'track', id: 'Tree right 4' },
        ],
      },
      {
        type: 'group',
        id: 'Bushes',
        children: [
          { type: 'track', id: 'Bush 1' },
          { type: 'track', id: 'Bush 2' },
          { type: 'track', id: 'Bush 3' },
          { type: 'track', id: 'Bush 4' },
        ],
      },
    ],
  },
];

/** Join the house layout with any additional channels in this show. */
export function materializeLayout(tracks: DeepReadonly<Tracks>): LayoutNode[] {
  const remaining = new Set(Object.keys(tracks));
  remaining.delete(BEAT_TRACK_ID);
  for (const node of iterateLeaves(...HOUSE_LAYOUT)) remaining.delete(node.id);
  return [
    ...(tracks[BEAT_TRACK_ID] ? [{ type: 'track' as const, id: BEAT_TRACK_ID }] : []),
    ...HOUSE_LAYOUT,
    ...Array.from(remaining)
      .sort()
      .map((id) => ({ type: 'track' as const, id })),
  ];
}

/**
 * Iterates over all nodes in the tree, including groups
 */
export function iterateNodes(...nodes: LayoutNode[]) {
  return {
    *[Symbol.iterator]() {
      const queue: LayoutNode[] = [];

      queue.push(...[...nodes].reverse());

      while (queue.length > 0) {
        const next = queue.pop();
        if (!next) break;

        yield next;

        if (next.type === 'group') {
          // Push in reverse order so they are iterated over immediately
          queue.push(...[...next.children].reverse());
        }
      }
    },
  };
}

/**
 * Iterates over all leaf nodes (tracks)
 */
export function iterateLeaves(...nodes: LayoutNode[]) {
  return {
    *[Symbol.iterator]() {
      for (let next of iterateNodes(...nodes)) {
        if (next.type === 'track') {
          yield next;
        }
      }
    },
  };
}

export function iterateTracks(layout: LayoutNode[], tracks: Tracks) {
  return {
    *[Symbol.iterator]() {
      for (let next of iterateNodes(...layout)) {
        if (next.type === 'track' && Object.prototype.hasOwnProperty.call(tracks, next.id)) {
          yield { node: next, track: tracks[next.id] };
        }
      }
    },
  };
}

/**
 * Iterates over all unlocked leaf nodes (tracks)
 */
export function iterateUnlockedTracks(layout: LayoutNode[], tracks: Tracks) {
  return {
    *[Symbol.iterator]() {
      for (const next of iterateLeaves(...layout)) {
        if (Object.prototype.hasOwnProperty.call(tracks, next.id) && !tracks[next.id].locked) {
          yield { node: next, track: tracks[next.id] };
        }
      }
    },
  };
}

export type LayoutRow = {
  type: 'track' | 'group';
  id: LayoutNodeID;
  depth: number;
  startY: number;
  endY: number;
  locked: boolean;
  collapsed?: boolean;
  hasVisibleTracks?: boolean;
  keyframes?: DeepReadonly<Keyframe[]>;
};

export function flattenTracks(
  nodes: readonly DeepReadonly<LayoutNode>[],
  tracks: DeepReadonly<Tracks> = {},
  collapsedGroups: ReadonlySet<LayoutNodeID> = new Set(),
): LayoutRow[] {
  const result: LayoutRow[] = [];

  // Need to be real constants
  const groupHeight = 30;
  const trackHeight = 30;

  let currentY = 0;

  function allLocked(node: DeepReadonly<LayoutNode>): boolean {
    if (node.type === 'track') return tracks[node.id]?.locked ?? false;
    return node.children.length > 0 && node.children.every(allLocked);
  }

  function traverse(node: DeepReadonly<LayoutNode>, currentDepth: number): boolean | null {
    if (node.type === 'track') {
      const track = tracks[node.id];
      result.push({
        type: 'track',
        id: node.id,
        depth: currentDepth,
        startY: currentY,
        endY: (currentY += trackHeight),
        locked: track?.locked ?? false,
        keyframes: track?.keyframes ?? [],
      });
      return track?.locked ?? false;
    }

    const row: LayoutRow = {
      type: 'group',
      id: node.id,
      depth: currentDepth,
      startY: currentY,
      endY: (currentY += groupHeight),
      locked: false,
      collapsed: collapsedGroups.has(node.id),
      hasVisibleTracks: false,
    };
    result.push(row);

    if (row.collapsed) {
      row.locked = allLocked(node);
      return null;
    }

    const childLockStates = node.children
      .map((child) => traverse(child, currentDepth + 1))
      .filter((locked): locked is boolean => locked !== null);
    row.hasVisibleTracks = childLockStates.length > 0;
    row.locked = childLockStates.length > 0 && childLockStates.every(Boolean);
    return row.hasVisibleTracks ? row.locked : null;
  }

  nodes.forEach((node) => traverse(node, 0));

  return result;
}
