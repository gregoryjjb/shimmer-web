import { TimelineEmitter } from './events';
import { OpenedProject } from './persist';
import { Keyframe, LayoutNode, LayoutNodeID, ProjectData, Track, TrackID } from './types';
import { UndoHistory } from './undo';
import { stringifyTime } from './utils';

export const newTracks = (count: number): LayoutNode[] => {
  // TODO: don't hardcode the default layout template
  return [
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
                { type: 'track', id: 'Roof 1', keyframes: [], locked: false },
                { type: 'track', id: 'Roof 2', keyframes: [], locked: false },
                { type: 'track', id: 'Roof 3', keyframes: [], locked: false },
                { type: 'track', id: 'Roof 4', keyframes: [], locked: false },
                { type: 'track', id: 'Roof 5', keyframes: [], locked: false },
                { type: 'track', id: 'Roof 6', keyframes: [], locked: false },
                { type: 'track', id: 'Roof 7', keyframes: [], locked: false },
                { type: 'track', id: 'Roof 8', keyframes: [], locked: false },
              ],
            },
            {
              type: 'group',
              id: 'Roof hamilton',
              children: [
                { type: 'track', id: 'Roof 9', keyframes: [], locked: false },
                { type: 'track', id: 'Roof 10', keyframes: [], locked: false },
                { type: 'track', id: 'Roof 11', keyframes: [], locked: false },
                { type: 'track', id: 'Roof 12', keyframes: [], locked: false },
                { type: 'track', id: 'Roof 13', keyframes: [], locked: false },
                { type: 'track', id: 'Roof 14', keyframes: [], locked: false },
                { type: 'track', id: 'Roof 15', keyframes: [], locked: false },
                { type: 'track', id: 'Roof 16', keyframes: [], locked: false },
                { type: 'track', id: 'Roof 17', keyframes: [], locked: false },
                { type: 'track', id: 'Roof 18', keyframes: [], locked: false },
              ],
            },
          ],
        },
        {
          type: 'group',
          id: 'Fence',
          children: [
            { type: 'track', id: 'Fence 1', keyframes: [], locked: false },
            { type: 'track', id: 'Fence 2', keyframes: [], locked: false },
            { type: 'track', id: 'Fence 3', keyframes: [], locked: false },
            { type: 'track', id: 'Fence 4', keyframes: [], locked: false },
            { type: 'track', id: 'Fence 5', keyframes: [], locked: false },
            { type: 'track', id: 'Fence 6', keyframes: [], locked: false },
            { type: 'track', id: 'Fence 7', keyframes: [], locked: false },
            { type: 'track', id: 'Fence 8', keyframes: [], locked: false },
            { type: 'track', id: 'Fence 9', keyframes: [], locked: false },
            { type: 'track', id: 'Fence 10', keyframes: [], locked: false },
          ],
        },
      ],
    },
  ];
};

const compareKeyframes = (a: Keyframe, b: Keyframe): number => {
  if (a.ts < b.ts) return -1;
  if (a.ts > b.ts) return 1;
  return 0;
};

const setSelected = (kf: Keyframe, selected: boolean) => {
  if (selected) {
    kf.selected = true;
  } else {
    delete kf.selected;
  }
};

// export const mapJSONToMemory = (dataJSON: ShowDataJSON) => {
//   const tracks: Track[] = dataJSON.tracks.map((c) => {
//     const track: Track = {
//       name: c.id,
//       keyframes: [],
//     };
//     for (let k of c.keyframes) {
//       track.keyframes.push({
//         ts: k.time,
//         value: !!k.state ? 1 : 0,
//         selected: false,
//       });
//     }
//     return track;
//   });

//   return tracks;
// };

type BinarySearchSide = 'left' | 'right';

export const binarySearch = (
  array: Keyframe[],
  time: number,
  side?: BinarySearchSide,
): number | undefined => {
  let start = 0;
  let end = array.length - 1;
  let found: number | undefined;

  /**
   * Returns undefined if the given index does not fit the left/right
   * constraint, otherwise returns the index
   */
  const valid = (index: number): number | undefined => {
    const keyframe = array[index];
    if (
      !side ||
      (side === 'left' && keyframe.ts < time) ||
      (side === 'right' && keyframe.ts > time)
    ) {
      return index;
    } else {
      return undefined;
    }
  };

  // No keyframes
  if (array.length === 0) {
    return undefined;
  }

  // Only one keyframe
  if (array.length === 1) {
    return valid(0);
  }

  // Out of bounds left side
  if (array[start].ts > time) {
    return valid(start);
  }

  // Out of bounds right side
  if (array[end].ts < time) {
    return valid(end);
  }

  while (found === undefined) {
    // console.debug('Searching in range', start, end);

    const length = end - start + 1;

    if (length === 1) {
      found = start;
    } else if (length === 2) {
      // Two left, pick the closest one
      if (side === 'left') {
        found = start;
      } else if (side === 'right') {
        found = end;
      } else {
        const left = array[start];
        const right = array[end];

        const leftDist = time - left.ts;
        const rightDist = right.ts - time;

        if (leftDist <= rightDist) {
          found = start;
        } else {
          found = end;
        }
      }
    } else {
      const mid = Math.round((start + end) / 2);
      const kf = array[mid];

      if (time > kf.ts) {
        start = mid;
      } else {
        end = mid;
      }
    }
  }

  return found;
};

interface UndoSnapshot {
  action: string;
  data: string;
}

const perfEvent = (event: string) => {
  const start = performance.now();

  return () => {
    const delta = performance.now() - start;
  };
};

export interface BoxSelection {
  startTime: number;
  endTime: number;
  tracks: Track[];
  keepExisting: boolean;
}

class TimelineData {
  openedProject?: OpenedProject;

  data: ProjectData;

  private emitter: TimelineEmitter;
  private undoHistory: UndoHistory<UndoSnapshot>;

  constructor(emitter: TimelineEmitter) {
    this.emitter = emitter;

    this.data = {
      version: '2',
      tracks: [],
    };

    this.undoHistory = new UndoHistory(100, {
      action: 'Initial state',
      data: JSON.stringify(this.data),
    });
  }

  private _channels: Track[] | undefined;

  /**
   * Returns a flat list of all tracks in the project
   */
  get channels() {
    if (!this._channels) {
      this._channels = [];

      const queue: LayoutNode[] = [];

      queue.push(...this.data.tracks);

      while (queue.length > 0) {
        const next = queue.pop();
        if (!next) break;

        if (next.type === 'group') {
          // Push in reverse order so they are iterated over immediately
          queue.push(...[...next.children].reverse());
        } else {
          this._channels.push(next);
        }
      }
    }

    return this._channels;
  }

  // TODO: clear this every time the tracks are modified (not the keyframes)
  private _trackLookup: Record<TrackID, Track> | undefined;
  private _nodeLookup: Record<LayoutNodeID, LayoutNode> | undefined;

  get trackLookup() {
    return this._trackLookup ?? {};
  }

  get nodeLookup() {
    return this._nodeLookup ?? {};
  }

  private rebuildIndexes() {
    this._channels = undefined;

    this._trackLookup = {};
    this._nodeLookup = {};

    for (let next of iterateNodes(...this.data.tracks)) {
      this._nodeLookup[next.id] = next;
      if (next.type === 'track') {
        this._trackLookup[next.id] = next;
      }
    }
  }

  /* Load a project for editing; clears undo history */
  load = (project: OpenedProject) => {
    this.openedProject = project;
    this.data = structuredClone(project.data);

    // Clear indexes
    this.rebuildIndexes();

    this.undoHistory = new UndoHistory(100, {
      action: 'Initial state',
      data: JSON.stringify(this.data),
    });

    this.emitDataChanged();
  };

  /**
   * Replaces all project data as a single edit action
   */
  replaceAll = (data: ProjectData) => {
    this.data = structuredClone(data);

    this.rebuildIndexes();

    this.takeUndoSnapshot('Replaced all data');
  };

  private takeUndoSnapshot = (action: string) => {
    const marshaled = JSON.stringify(this.data);

    this.undoHistory.push({
      action,
      data: marshaled,
    });

    this.openedProject?.saveData(this.data);
    this.emitDataChanged();
  };

  private emitDataChanged = () => {
    this.emitter.emit('dataChanged', this.data);
  };

  private emit = (action: string) => {
    console.log('data emit:', action);
    this.emitter.emit('edit', action);
    this.emitSelected();
  };

  private markEdit = (action: string) => {
    this.takeUndoSnapshot(action);
    this.emit(action);
  };

  private emitSelected = () => {
    let count = 0;
    for (const track of this.channels) {
      for (const keyframe of track.keyframes) {
        if (keyframe.selected) count++;
      }
    }
    this.emitter.emit('selected', count);
  };

  undo = () => {
    const undid = this.undoHistory.undo();
    const snapshot = this.undoHistory.head();
    if (!undid || !snapshot) {
      this.emit('Nothing to undo');
      return;
    }

    this.data = JSON.parse(snapshot.data);
    this.rebuildIndexes();
    this.openedProject?.saveData(this.data);
    this.emitDataChanged();
    this.emit(`Undo '${undid.action}'`);
  };

  redo = () => {
    const redone = this.undoHistory.redo();
    if (!redone) {
      this.emit('Nothing to redo');
      return;
    }

    this.data = JSON.parse(redone.data);
    this.rebuildIndexes();
    this.openedProject?.saveData(this.data);
    this.emitDataChanged();
    this.emit(`Redo '${redone.action}'`);
  };

  binarySearch = (trackID: TrackID, time: number, side?: BinarySearchSide): number | undefined => {
    const array = this.trackLookup[trackID]?.keyframes;
    if (!array) return undefined;

    return binarySearch(array, time, side);
  };

  /**
   * Returns the keyframe closest to the provided time across all channels.
   * Returns undefined if none found.
   */
  findNearest = (time: number): Keyframe | undefined => {
    let found: Keyframe | undefined;

    for (const track of iterateLeaves(...this.data.tracks)) {
      const index = binarySearch(track.keyframes, time);
      if (index === undefined) {
        continue;
      }

      const kf = track.keyframes[index];

      if (!found || Math.abs(kf.ts - time) < Math.abs(found.ts - time)) {
        found = kf;
      }
    }

    return found;
  };

  /**
   * @returns the timestamps of the first and last selected keyframes
   */
  firstLastSelected = () => {
    let first = Number.POSITIVE_INFINITY;
    let last = 0;

    for (const track of this.channels) {
      for (const keyframe of track.keyframes) {
        if (keyframe.selected) {
          if (keyframe.ts < first) first = keyframe.ts;
          if (keyframe.ts > last) last = keyframe.ts;
        }
      }
    }

    if (!isFinite(first)) first = 0;

    return { first, last };
  };

  private insert = (trackID: TrackID, time: number, value: number) => {
    this.trackLookup[trackID].keyframes.push({
      ts: time,
      value,
    });
    this.trackLookup[trackID].keyframes.sort(compareKeyframes);
  };

  /**
   * Inserts a keyframe on the track referenced by nodeID. If the provided
   * nodeID is a group, inserts a keyframe on every child track.
   */
  insertAuto = (nodeID: LayoutNodeID, time: number, value: number) => {
    const node = this.nodeLookup[nodeID];

    const trackIDs = [];

    for (let child of iterateNodes(node)) {
      if (child.type === 'track') {
        trackIDs.push(child.id);
      }
    }

    for (const id of trackIDs) {
      this.insert(id, time, value);
    }

    this.markEdit(`Inserted ${trackIDs.length} keyframe(s)`);
  };

  selectSingle = (
    trackID: TrackID,
    time: number,
    tolerance: number,
    keepExisting: boolean,
  ): number | undefined => {
    const p = perfEvent('selectSingle');

    const index = this.binarySearch(trackID, time);
    if (index === undefined) {
      if (!keepExisting) this.selectAll(false);
      p();
      return;
    }

    const kf = this.trackLookup[trackID]?.keyframes[index];
    const landed = Math.abs(kf.ts - time) <= tolerance;

    if (!landed) {
      if (!keepExisting) this.selectAll(false);
      p();
      return;
    }

    if (!keepExisting) {
      for (const track of this.channels) {
        for (const keyframe of track.keyframes) {
          keyframe.selected = false;
        }
      }
      setSelected(kf, true);
    } else {
      setSelected(kf, !kf.selected);
    }

    this.markEdit('Selected keyframe');
    p();
  };

  selectAll = (selected: boolean) => {
    let anyStateChanged = false;

    for (const track of this.channels) {
      for (const keyframe of track.keyframes) {
        if (keyframe.selected !== selected) {
          anyStateChanged = true;
        }

        setSelected(keyframe, selected);
      }
    }

    if (anyStateChanged) {
      const msg = selected ? 'Select all' : 'Deselect all';
      this.markEdit(msg);
    }
  };

  boxSelect = ({ startTime, endTime, tracks, keepExisting }: BoxSelection) => {
    let anyStateChanged = false;

    for (const track of this.channels) {
      for (const keyframe of track.keyframes) {
        setSelected(keyframe, false);
      }
    }

    for (const track of tracks) {
      for (const keyframe of track.keyframes) {
        const shouldSelect =
          (keyframe.ts >= startTime && keyframe.ts <= endTime) ||
          (keepExisting && !!keyframe.selected);

        if (shouldSelect != keyframe.selected) {
          setSelected(keyframe, shouldSelect);
          anyStateChanged = true;
        }
      }
    }
    if (anyStateChanged) {
      this.markEdit('Box-selected keyframes');
    }
  };

  deleteSelected = () => {
    let count = 0;

    for (const track of this.channels) {
      track.keyframes = track.keyframes.filter((k) => {
        if (k.selected) count++;
        return !k.selected;
      });
    }

    if (count) {
      this.markEdit(`Deleted ${count} keyframes`);
    } else {
      this.emit('No keyframes selected');
    }
  };

  invertSelected = () => {
    let count = 0;

    for (const track of this.channels) {
      for (const keyframe of track.keyframes) {
        if (keyframe.selected) {
          keyframe.value = keyframe.value === 0 ? 1 : 0;
          count++;
        }
      }
    }

    if (count) {
      this.markEdit(`Inverted ${count} keyframes`);
    } else {
      this.emit('No keyframes selected');
    }
  };

  /**
   * Shift the selected keyframes up or down a channel
   */
  shiftSelected = (direction: 'up' | 'down') => {
    const offset = direction === 'up' ? -1 : 1;
    let count = 0;

    const channels = Array.from(this.channels);

    for (let i = 0; i < channels.length; i++) {
      const track = channels[i];
      const selected = track.keyframes.find((k) => k.selected);
      const newIndex = i + offset;

      if (selected) count++;

      if (selected && (newIndex < 0 || newIndex >= channels.length)) {
        this.emit('Cannot shift keyframes, no more room');
        return;
      }
    }
    if (count === 0) {
      this.emit('No keyframes selected');
      return;
    }

    // Grab selected
    const selected = channels.map((track) => track.keyframes.filter((k) => k.selected));

    // Delete selected
    for (const track of this.channels) {
      track.keyframes = track.keyframes.filter((k) => !k.selected);
    }

    // Re-insert shifted
    channels.forEach((track, i) => {
      const toInsert = selected[i - offset];
      if (!toInsert) return;

      track.keyframes.push(...toInsert);
      track.keyframes.sort(compareKeyframes);
    });

    this.markEdit(`Shifted keyframes ${direction}`);
  };

  /**
   * Flip selected keyframes vertically across channels
   */
  flipSelected = () => {
    const channels = Array.from(this.channels);

    const selected = channels.map((track) => track.keyframes.filter((kf) => kf.selected));

    const startIndex = selected.findIndex((kfs) => kfs.length > 0);
    const toFlip = selected.filter((kfs) => kfs.length > 0);

    if (toFlip.length < 2) {
      this.emit('Must have 2 or more channels of keyframes selected to flip');
      return;
    }

    // Delete selected
    for (const track of this.channels) {
      track.keyframes = track.keyframes.filter((k) => !k.selected);
    }

    toFlip.reverse().forEach((keyframes, i) => {
      const channel = i + startIndex;
      channels[channel].keyframes.push(...keyframes);
      channels[channel].keyframes.sort(compareKeyframes);
    });

    this.markEdit('Flipped keyframes');
  };

  /**
   * Move selected keyframes by the given time
   */
  moveSelected = (time: number) => {
    let count = 0;

    for (const track of this.channels) {
      let tcount = 0;
      for (const keyframe of track.keyframes) {
        if (keyframe.selected) {
          keyframe.ts += time;
          tcount++;
        }
      }
      if (tcount > 0) {
        track.keyframes.sort(compareKeyframes);
      }
      count += tcount;
    }

    if (count) {
      this.markEdit(`Moved ${count} keyframes`);
    } else {
      this.emit('No keyframes selected');
    }
  };

  scaleSelected = (pivotTime: number, scaleFactor: number) => {
    let count = 0;

    for (const track of this.channels) {
      let tcount = 0;
      for (const keyframe of track.keyframes) {
        if (keyframe.selected) {
          tcount++;
          keyframe.ts = (keyframe.ts - pivotTime) * scaleFactor + pivotTime;
        }
      }
      if (tcount > 0) {
        track.keyframes.sort(compareKeyframes);
      }
      count += tcount;
    }

    if (count) {
      this.markEdit(`Scaled ${count} keyframes`);
    } else {
      this.emit('No keyframes selected');
    }
  };

  duplicateSelected = () => {
    let count = 0;

    for (const track of this.channels) {
      const duplicated: Keyframe[] = [];
      for (const keyframe of track.keyframes) {
        if (keyframe.selected) {
          const dup = structuredClone(keyframe);
          setSelected(keyframe, false);
          duplicated.push(dup);
        }
      }
      count += duplicated.length;

      if (duplicated.length > 0) {
        track.keyframes.push(...duplicated);
        track.keyframes.sort(compareKeyframes);
      }
    }

    if (count) {
      this.markEdit(`Duplicated ${count} keyframes`);
    } else {
      this.emit('No keyframes selected');
    }
  };

  alignSelected = () => {
    const channels = Array.from(this.channels);

    const selectedIndexes: number[][] = channels.map(() => []);

    let timeSum = 0;

    channels.forEach((track, i) => {
      track.keyframes.forEach((keyframe, j) => {
        if (keyframe.selected) {
          selectedIndexes[i].push(j);
          timeSum += keyframe.ts;
        }
      });
    });

    const count = selectedIndexes.map((is) => is.length).reduce((lens, len) => lens + len);
    const avg = timeSum / count;

    selectedIndexes.forEach((indexes, channel) => {
      indexes.forEach((i) => {
        channels[channel].keyframes[i].ts = avg;
      });
    });

    if (count) {
      this.markEdit(`Aligned ${count} keyframes`);
    } else {
      this.emit('No keyframes selected');
    }
  };

  /**
   * Set all selected keyframes to this time
   */
  snapTo = (time: number) => {
    let count = 0;
    for (let track of this.channels) {
      let tcount = 0;
      track.keyframes.forEach((kf) => {
        if (kf.selected) {
          kf.ts = time;
          tcount++;
        }
      });

      if (tcount > 0) {
        track.keyframes.sort(compareKeyframes);
      }
      count += tcount;
    }

    if (count > 0) {
      this.markEdit(`Snapped ${count} keyframes to ${stringifyTime(time, 'milliseconds')}`);
    } else {
      this.emit('No keyframes selected');
    }
  };

  equallySpaceSelected = () => {
    const keyframes = Array.from(this.channels).flatMap((track) =>
      track.keyframes.filter((kf) => kf.selected),
    );

    if (keyframes.length < 2) {
      this.emit('Must select 2+ keyframes');
      return;
    }

    keyframes.sort(compareKeyframes);

    const batched: Keyframe[][] = [];
    const threshold = 0.001;

    keyframes.forEach((kf, i) => {
      const prev = keyframes[i - 1];

      const currentBatch = batched[batched.length - 1];
      const lastKeyframe = currentBatch ? currentBatch[currentBatch.length - 1] : undefined;

      if (lastKeyframe && kf.ts - lastKeyframe.ts < threshold) {
        currentBatch.push(kf);
      } else {
        batched.push([kf]);
      }
    });

    if (batched.length < 2) {
      this.emit('Keyframes cannot be spaced');
      return;
    }

    const start = keyframes[0].ts;
    const end = keyframes[keyframes.length - 1].ts;
    const increment = (end - start) / (batched.length - 1);

    batched.forEach((batch, i) => {
      batch.forEach((kf) => (kf.ts = start + increment * i));
    });

    this.markEdit(`Spaced ${keyframes.length} keyframes`);
  };

  dedup = () => {
    // Keyframes closer than this (in seconds) are merged
    const threshold = 0.001; // 1ms
    const markedForDeletion: Record<TrackID, number[]> = {};

    for (const track of this.channels) {
      let lastTimestamp: number | undefined;

      track.keyframes.forEach((kf, j) => {
        if (kf.selected) {
          if (lastTimestamp === undefined) {
            lastTimestamp = kf.ts;
          } else if (kf.ts - lastTimestamp < threshold) {
            if (!markedForDeletion[track.id]) {
              markedForDeletion[track.id] = [];
            }

            markedForDeletion[track.id].push(j);
          }
        }
      });
    }

    const count = Object.values(markedForDeletion)
      .map((is) => is.length)
      .reduce((lens, len) => lens + len);

    if (count) {
      this.delete(markedForDeletion);
      this.markEdit(`Deduped ${count} keyframes`);
    } else {
      this.emit(`Didn't dedup anything`);
    }
  };

  // Deletes the provided indexes (array of indexes by channel)
  private delete = (indexes: Record<TrackID, number[]>) => {
    Object.entries(indexes).forEach(([trackID, indexes]) => {
      const track = this.trackLookup[trackID];

      for (let ii = indexes.length - 1; ii >= 0; ii--) {
        track.keyframes.splice(indexes[ii]);
      }
    });
  };
}

/**
 * Iterates over all nodes in the tree, including groups
 */
export function iterateNodes(...nodes: LayoutNode[]) {
  return {
    *[Symbol.iterator]() {
      const queue: LayoutNode[] = [];

      queue.push(...nodes);

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

interface ActionResult {
  changed: boolean;
}

type ActionFunc = (...args: any) => ActionResult;

type ActionArgs = {
  insert: {
    channel: number;
    time: number;
    value: number;
  };
  select: {
    channel: number;
    time: number;
    tolerance: number;
  };
};
type Action = keyof ActionArgs;

interface ActionReturns<T> extends ActionResult {}

type ActionHandler<T extends Action> = (action: T, args: ActionArgs[T]) => boolean;

export default TimelineData;
