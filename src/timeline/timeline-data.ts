import { TimelineEmitter } from './events';
import { Keyframe, ShowDataJSON, Track } from './types';
import { UndoHistory } from './undo';
import { stringifyTime } from './utils';

export const newTracks = (count: number): Track[] => {
  return Array.from(Array(count).keys()).map((n) => ({
    name: `${n}`,
    keyframes: [],
  }));
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

export const mapJSONToMemory = (dataJSON: ShowDataJSON) => {
  const tracks: Track[] = dataJSON.tracks.map((c) => {
    const track: Track = {
      name: c.id,
      keyframes: [],
    };
    for (let k of c.keyframes) {
      track.keyframes.push({
        ts: k.time,
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
    this.emitter.emit('autosave', JSON.stringify(d));
  };

  private takeUndoSnapshot = (action: string) => {
    const marshaled = JSON.stringify(this.channels);

    this.undoHistory.push({
      action,
      channels: marshaled,
    });

    this.emitter.emit('autosave', marshaled);
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

    this.emitter.emit('autosave', snapshot.channels);
    this.channels = JSON.parse(snapshot.channels);
    this.emit(`Undo '${undid.action}'`);
  };

  redo = () => {
    const redone = this.undoHistory.redo();
    if (!redone) {
      this.emit('Nothing to redo');
      return;
    }

    this.emit(`Redo '${redone.action}'`);
    this.emitter.emit('autosave', redone.channels);
    this.channels = JSON.parse(redone.channels);
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
   * Returns the keyframe closest to the provided time across all channels.
   * Returns undefined if none found.
   */
  findNearest = (time: number): Keyframe | undefined => {
    let found: Keyframe | undefined;

    this.channels.forEach((channel) => {
      const index = binarySearch(channel.keyframes, time);
      if (index === undefined) return;
      const kf = channel.keyframes[index];

      if (!found || Math.abs(kf.ts - time) < Math.abs(found.ts - time)) {
        found = kf;
      }
    });

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

  private insert = (channel: number, time: number, value: number) => {
    this.channels[channel].keyframes.push({
      ts: time,
      value,
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

  boxSelect = ({ startTime, endTime, startChannel, endChannel, keepExisting }: BoxSelection) => {
    let anyStateChanged = false;
    for (let i = 0; i < this.channels.length; i++) {
      const track = this.channels[i];
      const trackGood = i >= startChannel && i <= endChannel;
      for (const keyframe of track.keyframes) {
        const shouldSelect =
          (trackGood && keyframe.ts >= startTime && keyframe.ts <= endTime) ||
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
    const selected = this.channels.map((track) => track.keyframes.filter((k) => k.selected));

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
   * Flip selected keyframes vertically across channels
   */
  flipSelected = () => {
    const selected = this.channels.map((track) => track.keyframes.filter((kf) => kf.selected));

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
      this.channels[channel].keyframes.push(...keyframes);
      this.channels[channel].keyframes.sort(compareKeyframes);
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
    const selectedIndexes: number[][] = this.channels.map(() => []);

    let timeSum = 0;

    this.channels.forEach((track, i) => {
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
        this.channels[channel].keyframes[i].ts = avg;
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
    this.channels.forEach((track) => {
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
    });

    if (count > 0) {
      this.markEdit(`Snapped ${count} keyframes to ${stringifyTime(time, 'milliseconds')}`);
    } else {
      this.emit('No keyframes selected');
    }
  };

  equallySpaceSelected = () => {
    const keyframes = this.channels.flatMap((track) => track.keyframes.filter((kf) => kf.selected));

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
    const markedForDeletion: number[][] = this.channels.map(() => []);

    this.channels.forEach((track, i) => {
      let lastTimestamp: number | undefined;

      track.keyframes.forEach((kf, j) => {
        if (kf.selected) {
          if (lastTimestamp === undefined) {
            lastTimestamp = kf.ts;
          } else if (kf.ts - lastTimestamp < threshold) {
            markedForDeletion[i].push(j);
          }
        }
      });
    });

    const count = markedForDeletion.map((is) => is.length).reduce((lens, len) => lens + len);

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

type ActionHandler<T extends Action> = (action: T, args: ActionArgs[T]) => boolean;

export default TimelineData;
