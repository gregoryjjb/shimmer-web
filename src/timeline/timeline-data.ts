import { TimelineEmitter } from './events';
import { localPersistence } from './persistence';
import { ShowDataJSON } from './types';
import { UndoHistory } from './undo';
import { clamp } from './utils';

export type Track = {
  name: string;
  keyframes: Keyframe[];
};

export type Keyframe = {
  timestamp: number;
  value: number;
  selected: boolean;
};

export const newTracks = (count: number): Track[] => {
  return Array.from(Array(count).keys()).map((n) => ({
    name: `${n}`,
    keyframes: [],
  }));
};

const compareKeyframes = (a: Keyframe, b: Keyframe): number => {
  if (a.timestamp < b.timestamp) return -1;
  if (a.timestamp > b.timestamp) return 1;
  return 0;
};

export const mapJSONToMemory = (dataJSON: ShowDataJSON) => {
  const tracks: Track[] = dataJSON.tracks.map((c) => {
    const track: Track = {
      name: c.id,
      keyframes: [],
    };
    for (let k of c.keyframes) {
      track.keyframes.push({
        timestamp: k.time,
        value: !!k.state ? 1 : 0,
        selected: false,
      });
    }
    return track;
  });

  return tracks;
};

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
      (side === 'left' && keyframe.timestamp < time) ||
      (side === 'right' && keyframe.timestamp > time)
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
  if (array[start].timestamp > time) {
    return valid(start);
  }

  // Out of bounds right side
  if (array[end].timestamp < time) {
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

        const leftDist = time - left.timestamp;
        const rightDist = right.timestamp - time;

        if (leftDist <= rightDist) {
          found = start;
        } else {
          found = end;
        }
      }
    } else {
      const mid = Math.round((start + end) / 2);
      const kf = array[mid];

      if (time > kf.timestamp) {
        start = mid;
      } else {
        end = mid;
      }
    }
  }

  return found;
};

const deepClone = <T>(v: T): T => {
  return JSON.parse(JSON.stringify(v));
};

interface UndoSnapshot {
  action: string;
  channels: string;
}

const perfEvent = (event: string) => {
  const start = performance.now();

  return () => {
    const delta = performance.now() - start;
    console.log('EVENT', event, delta);
  };
};

export interface BoxSelection {
  startTime: number;
  endTime: number;
  startChannel: number;
  endChannel: number;
  keepExisting: boolean;
}

class TimelineData {
  channels: Track[];

  private emitter: TimelineEmitter;
  private undoHistory: UndoHistory<UndoSnapshot>;

  constructor(emitter: TimelineEmitter, data: Track[]) {
    this.emitter = emitter;
    this.channels = data;
    this.undoHistory = new UndoHistory(100, {
      action: 'Initial state',
      channels: JSON.stringify(data),
    });
  }

  /**
   * Replaces all data with the provided. CLEARS UNDO HISTORY!
   */
  replace = (data: Track[]) => {
    const d = structuredClone(data);
    this.channels = d;
    this.undoHistory = new UndoHistory(100, {
      action: 'Initial state',
      channels: JSON.stringify(d),
    });
  };

  private takeUndoSnapshot = (action: string) => {
    console.log('Undo snapshot taken:', action);

    const marshaled = JSON.stringify(this.channels);

    this.undoHistory.push({
      action,
      channels: marshaled,
    });

    localPersistence.saveData(marshaled);
  };

  private emit = (action: string) => {
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

    localPersistence.saveData(snapshot.channels);
    this.channels = JSON.parse(snapshot.channels);
    this.emit(`Undo '${undid.action}'`);
    console.log(this.undoHistory.debug().map((s) => s?.action));
  };

  redo = () => {
    const redone = this.undoHistory.redo();
    if (!redone) {
      this.emit('Nothing to redo');
      console.log('Nothing to redo');
      return;
    }

    console.log('Redo:', redone.action);
    this.emit(`Redo '${redone.action}'`);
    localPersistence.saveData(redone.channels);
    this.channels = JSON.parse(redone.channels);
    console.log(this.undoHistory.debug().map((s) => s?.action));
  };

  binarySearch = (
    trackIndex: number,
    time: number,
    side?: BinarySearchSide,
  ): number | undefined => {
    const array = this.channels[trackIndex]?.keyframes;
    if (!array) return undefined;

    return binarySearch(array, time, side);
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
          if (keyframe.timestamp < first) first = keyframe.timestamp;
          if (keyframe.timestamp > last) last = keyframe.timestamp;
        }
      }
    }

    if (!isFinite(first)) first = 0;

    return { first, last };
  };

  private insert = (channel: number, time: number, value: number) => {
    this.channels[channel].keyframes.push({
      timestamp: time,
      value,
      selected: false,
    });
    this.channels[channel].keyframes.sort(compareKeyframes);
  };

  insertSingle = (channel: number, time: number, value: number) => {
    this.insert(channel, time, value);

    this.markEdit('Inserted keyframe');
  };

  insertColumn = (time: number, value: number) => {
    for (let i = 0; i < this.channels.length; i++) {
      this.insert(i, time, value);
    }
    this.markEdit('Inserted keyframe column');
  };

  selectSingle = (
    channel: number,
    time: number,
    tolerance: number,
    keepExisting: boolean,
  ): number | undefined => {
    const p = perfEvent('selectSingle');

    const index = this.binarySearch(channel, time);
    if (index === undefined) {
      if (!keepExisting) this.selectAll(false);
      p();
      return;
    }

    const kf = this.channels[channel].keyframes[index];
    const landed = Math.abs(kf.timestamp - time) <= tolerance;

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
      kf.selected = true;
    } else {
      kf.selected = !kf.selected;
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

        keyframe.selected = selected;
      }
    }

    if (anyStateChanged) {
      const msg = selected ? 'Select all' : 'Deselect all';
      this.markEdit(msg);
    }
  };

  boxSelect = ({
    startTime,
    endTime,
    startChannel,
    endChannel,
    keepExisting,
  }: BoxSelection) => {
    let anyStateChanged = false;
    for (let i = 0; i < this.channels.length; i++) {
      const track = this.channels[i];
      const trackGood = i >= startChannel && i <= endChannel;
      for (const keyframe of track.keyframes) {
        const shouldSelect =
          (trackGood &&
            keyframe.timestamp >= startTime &&
            keyframe.timestamp <= endTime) ||
          (keepExisting && keyframe.selected);

        if (shouldSelect != keyframe.selected) {
          keyframe.selected = shouldSelect;
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

    for (let i = 0; i < this.channels.length; i++) {
      const track = this.channels[i];
      const selected = track.keyframes.find((k) => k.selected);
      const newIndex = i + offset;

      if (selected) count++;

      if (selected && (newIndex < 0 || newIndex >= this.channels.length)) {
        this.emit('Cannot shift keyframes, no more room');
        return;
      }
    }
    if (count === 0) {
      this.emit('No keyframes selected');
      return;
    }

    // Grab selected
    const selected = this.channels.map((track) =>
      track.keyframes.filter((k) => k.selected),
    );

    // Delete selected
    for (const track of this.channels) {
      track.keyframes = track.keyframes.filter((k) => !k.selected);
    }

    // Re-insert shifted
    this.channels.forEach((track, i) => {
      const toInsert = selected[i - offset];
      if (!toInsert) return;

      track.keyframes.push(...toInsert);
      track.keyframes.sort(compareKeyframes);
    });

    this.markEdit(`Shifted keyframes ${direction}`);
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
          keyframe.timestamp += time;
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
          keyframe.timestamp =
            (keyframe.timestamp - pivotTime) * scaleFactor + pivotTime;
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
          keyframe.selected = false;
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
    const selectedIndexes: number[][] = this.channels.map(() => []);

    let timeSum = 0;

    this.channels.forEach((track, i) => {
      track.keyframes.forEach((keyframe, j) => {
        if (keyframe.selected) {
          selectedIndexes[i].push(j);
          timeSum += keyframe.timestamp;
        }
      });
    });

    const count = selectedIndexes
      .map((is) => is.length)
      .reduce((lens, len) => lens + len);
    const avg = timeSum / count;

    selectedIndexes.forEach((indexes, channel) => {
      indexes.forEach((i) => {
        this.channels[channel].keyframes[i].timestamp = avg;
      });
    });

    if (count) {
      this.markEdit(`Aligned ${count} keyframes`);
    } else {
      this.emit('No keyframes selected');
    }
  };

  dedup = () => {
    // Keyframes closer than this (in seconds) are merged
    const threshold = 0.001; // 1ms
    const markedForDeletion: number[][] = this.channels.map(() => []);

    this.channels.forEach((track, i) => {
      let lastTimestamp: number | undefined;

      track.keyframes.forEach((kf, j) => {
        if (kf.selected) {
          if (lastTimestamp === undefined) {
            lastTimestamp = kf.timestamp;
          } else if (kf.timestamp - lastTimestamp < threshold) {
            markedForDeletion[i].push(j);
          }
        }
      });
    });

    const count = markedForDeletion
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
  private delete = (indexes: number[][]) => {
    indexes.forEach((idx, channel) => {
      for (let ii = idx.length - 1; ii >= 0; ii--) {
        this.channels[channel].keyframes.splice(idx[ii]);
      }
    });
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

type ActionHandler<T extends Action> = (
  action: T,
  args: ActionArgs[T],
) => boolean;

export default TimelineData;
