import { TimelineEmitter } from './events';
import { BEAT_TRACK_ID, createBeatTrack } from './beat';
import {
  iterateLeaves,
  iterateNodes,
  iterateTracks,
  iterateUnlockedTracks,
  materializeLayout,
} from './layout';
import { OpenedProject } from './persist';
import { Keyframe, LayoutNode, LayoutNodeID, ProjectData, Track, TrackID, Tracks } from './types';
import { UndoHistory } from './undo';
import { stringifyTime } from './utils';

export const newTracks = (): Tracks => ({ [BEAT_TRACK_ID]: createBeatTrack() });

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

type BinarySearchSide = 'left' | 'right';

export const binarySearch = (
  array: readonly Keyframe[],
  time: number,
  side?: BinarySearchSide,
): number | undefined => {
  if (array.length === 0) return undefined;

  // Left returns the last timestamp <= time; right returns the first >= time.
  // Without a side, return the nearest keyframe, preferring the earlier time
  // when distances tie. Use an upper bound for left and a lower bound otherwise.
  let start = 0;
  let end = array.length;
  while (start < end) {
    const middle = Math.floor((start + end) / 2);
    const timestamp = array[middle].ts;
    if (timestamp < time || (side === 'left' && timestamp === time)) start = middle + 1;
    else end = middle;
  }

  if (side === 'left') return start === 0 ? undefined : start - 1;
  if (side === 'right') return start === array.length ? undefined : start;
  if (start === 0) return 0;
  if (start === array.length) return array.length - 1;
  return time - array[start - 1].ts <= array[start].ts - time ? start - 1 : start;
};

export const isOn = (
  keyframes: readonly Keyframe[],
  time: number,
  flashDurationSeconds?: number,
): boolean => {
  const index = binarySearch(keyframes, time, 'left');
  if (index === undefined) return false;

  const keyframe = keyframes[index];
  if (flashDurationSeconds !== undefined) {
    return time - keyframe.ts < flashDurationSeconds;
  }

  return keyframe.value > 0;
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
  trackIDs: TrackID[];
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
      version: '3',
      tracks: {},
    };

    this.undoHistory = new UndoHistory(100, {
      action: 'Initial state',
      data: JSON.stringify(this.data),
    });
  }

  get layout(): LayoutNode[] {
    return materializeLayout(this.data.tracks);
  }

  iterateTracks = () => iterateTracks(this.layout, this.data.tracks);

  /** Stored show tracks, independent of layout positions. */
  get channels() {
    return Object.values(this.data.tracks);
  }

  get nodeLookup(): Record<LayoutNodeID, LayoutNode> {
    return Object.fromEntries(Array.from(iterateNodes(...this.layout), (node) => [node.id, node]));
  }

  private ensureTrack(id: TrackID): Track {
    return (this.data.tracks[id] ??=
      id === BEAT_TRACK_ID ? createBeatTrack() : { keyframes: [], locked: false });
  }

  /** Include empty layout positions when performing vertical edits. */
  private get editableTrackIDs(): TrackID[] {
    return Array.from(iterateLeaves(...this.layout))
      .filter((node) => !this.data.tracks[node.id]?.locked)
      .map((node) => node.id);
  }

  /* Load a project for editing; clears undo history */
  load = (project: OpenedProject) => {
    this.openedProject = project;
    this.data = structuredClone(project.data);

    this.deselectLockedTracks();

    this.undoHistory = new UndoHistory(100, {
      action: 'Initial state',
      data: JSON.stringify(this.data),
    });

    this.emitDataChanged();
    this.emitSelected();
  };

  /**
   * Replaces all project data as a single edit action
   */
  replaceAll = (data: ProjectData) => {
    this.data = structuredClone(data);

    this.deselectLockedTracks();

    this.markEdit('Replaced all data');
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
    for (const { track } of this.unlockedTracks) {
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
    this.openedProject?.saveData(this.data);
    this.emitDataChanged();
    this.emit(`Redo '${redone.action}'`);
  };

  binarySearch = (trackID: TrackID, time: number, side?: BinarySearchSide): number | undefined => {
    const array = this.data.tracks[trackID]?.keyframes;
    if (!array) return undefined;

    return binarySearch(array, time, side);
  };

  /**
   * Returns the keyframe closest to the provided time across all channels.
   * Returns undefined if none found.
   */
  findNearest = (time: number): Keyframe | undefined => {
    let found: Keyframe | undefined;

    for (const { track } of this.iterateTracks()) {
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

    for (const { track } of this.unlockedTracks) {
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
    const track = this.ensureTrack(trackID);
    track.keyframes.push({
      ts: time,
      value,
    });
    track.keyframes.sort(compareKeyframes);
  };

  private get unlockedTracks() {
    return iterateUnlockedTracks(this.layout, this.data.tracks);
  }

  private deselectLockedTracks = () => {
    let count = 0;

    for (const track of this.channels) {
      if (!track.locked) continue;

      for (const keyframe of track.keyframes) {
        if (!keyframe.selected) continue;

        setSelected(keyframe, false);
        count++;
      }
    }

    return count;
  };

  setNodeLocked = (nodeID: LayoutNodeID, locked: boolean) => {
    const node = this.nodeLookup[nodeID];
    if (!node) return;

    let changed = 0;
    for (const leaf of iterateLeaves(node)) {
      if (!locked && !this.data.tracks[leaf.id]) continue;
      const track = this.ensureTrack(leaf.id);
      if (locked) {
        for (const keyframe of track.keyframes) {
          if (!keyframe.selected) continue;
          setSelected(keyframe, false);
        }
      }

      if (track.locked !== locked) {
        track.locked = locked;
        changed++;
      }
    }

    if (changed > 0) {
      this.markEdit(`${locked ? 'Locked' : 'Unlocked'} ${changed} track(s)`);
    }
  };

  /**
   * Inserts a keyframe on the track referenced by nodeID. If the provided
   * nodeID is a group, inserts a keyframe on every child track.
   */
  insertAuto = (nodeID: LayoutNodeID, time: number, value: number) => {
    const node = this.nodeLookup[nodeID];
    if (!node) return;

    const unlockedTrackIDs = Array.from(iterateLeaves(node))
      .filter((leaf) => !this.data.tracks[leaf.id]?.locked)
      .map((leaf) => leaf.id);

    if (unlockedTrackIDs.length === 0) {
      this.emit('No unlocked tracks to insert into');
      return;
    }

    for (const id of unlockedTrackIDs) {
      this.insert(id, time, value);
    }

    this.markEdit(`Inserted ${unlockedTrackIDs.length} keyframe(s)`);
  };

  insertBeat = (time: number) => {
    const beatTrack = this.ensureTrack(BEAT_TRACK_ID);

    const nearestIndex = binarySearch(beatTrack.keyframes, time);
    const nearest = nearestIndex === undefined ? undefined : beatTrack.keyframes[nearestIndex];
    if (nearest && Math.abs(nearest.ts - time) < 0.001) {
      this.emit('Beat already exists at the current time');
      return;
    }

    this.insert(BEAT_TRACK_ID, time, 0);
    this.markEdit('Inserted beat');
  };

  replaceBeats = (times: readonly number[]) => {
    const sorted = times.filter((time) => Number.isFinite(time) && time >= 0).sort((a, b) => a - b);
    const unique = sorted.filter((time, index) => index === 0 || time - sorted[index - 1] >= 0.001);

    if (unique.length === 0) {
      this.emit('No beats detected');
      return;
    }

    const beatTrack = this.ensureTrack(BEAT_TRACK_ID);
    beatTrack.keyframes = unique.map((ts) => ({ ts, value: 0 }));
    this.markEdit(`Detected ${unique.length} beats`);
  };

  selectSingle = (
    trackID: TrackID,
    time: number,
    tolerance: number,
    keepExisting: boolean,
  ): number | undefined => {
    const p = perfEvent('selectSingle');
    const track = this.data.tracks[trackID];

    if (!track || track.locked) {
      if (!keepExisting) this.selectAll(false);
      p();
      return;
    }

    const index = this.binarySearch(trackID, time);
    if (index === undefined) {
      if (!keepExisting) this.selectAll(false);
      p();
      return;
    }

    const kf = track.keyframes[index];
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

    for (const track of Object.values(this.data.tracks)) {
      const shouldSelect = selected && !track.locked;

      for (const keyframe of track.keyframes) {
        if (!!keyframe.selected !== shouldSelect) {
          anyStateChanged = true;
        }

        setSelected(keyframe, shouldSelect);
      }
    }

    if (anyStateChanged) {
      this.markEdit(selected ? 'Select all' : 'Deselect all');
    }
  };

  boxSelect = ({ startTime, endTime, trackIDs, keepExisting }: BoxSelection) => {
    let anyStateChanged = false;
    const selectableTrackIDs = new Set(trackIDs);

    for (const [trackID, track] of Object.entries(this.data.tracks)) {
      for (const keyframe of track.keyframes) {
        const shouldSelect =
          !track.locked &&
          ((selectableTrackIDs.has(trackID) &&
            keyframe.ts >= startTime &&
            keyframe.ts <= endTime) ||
            (keepExisting && !!keyframe.selected));

        if (shouldSelect !== !!keyframe.selected) {
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

    for (const { track } of this.unlockedTracks) {
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

    for (const { track } of this.unlockedTracks) {
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
    const ids = this.editableTrackIDs;
    const offset = direction === 'up' ? -1 : 1;
    const selected = ids.map(
      (id) => this.data.tracks[id]?.keyframes.filter((k) => k.selected) ?? [],
    );
    if (!selected.some((frames) => frames.length)) {
      this.emit('No keyframes selected');
      return;
    }
    if (
      selected.some((frames, i) => frames.length && (i + offset < 0 || i + offset >= ids.length))
    ) {
      this.emit('Cannot shift keyframes, no more room');
      return;
    }
    for (const id of ids) {
      const track = this.data.tracks[id];
      if (track) track.keyframes = track.keyframes.filter((k) => !k.selected);
    }
    selected.forEach((frames, i) => {
      if (!frames.length) return;
      const target = this.ensureTrack(ids[i + offset]);
      target.keyframes.push(...frames);
      target.keyframes.sort(compareKeyframes);
    });
    this.markEdit('Shifted keyframes ' + direction);
  };

  /** Mirror selected keyframes across their first and last layout positions. */
  flipSelected = () => {
    const ids = this.editableTrackIDs;
    const selected = ids.map(
      (id) => this.data.tracks[id]?.keyframes.filter((k) => k.selected) ?? [],
    );
    const occupied = selected.flatMap((frames, i) => (frames.length ? [i] : []));
    if (occupied.length < 2) {
      this.emit('Must have 2 or more channels of keyframes selected to flip');
      return;
    }
    const first = occupied[0];
    const last = occupied[occupied.length - 1];
    for (const i of occupied) {
      const track = this.data.tracks[ids[i]];
      track.keyframes = track.keyframes.filter((k) => !k.selected);
    }
    for (const i of occupied) {
      const target = this.ensureTrack(ids[first + last - i]);
      target.keyframes.push(...selected[i]);
      target.keyframes.sort(compareKeyframes);
    }
    this.markEdit('Flipped keyframes');
  };

  /**
   * Move selected keyframes by the given time
   */
  moveSelected = (time: number) => {
    let count = 0;

    for (const { track } of this.unlockedTracks) {
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

    for (const { track } of this.unlockedTracks) {
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

    for (const { track } of this.unlockedTracks) {
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
    const channels = Array.from(this.unlockedTracks, ({ track }) => track);

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

    const count = selectedIndexes.map((is) => is.length).reduce((lens, len) => lens + len, 0);
    const avg = timeSum / count;

    selectedIndexes.forEach((indexes, channel) => {
      indexes.forEach((i) => {
        channels[channel].keyframes[i].ts = avg;
      });
      channels[channel].keyframes.sort(compareKeyframes);
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
    for (let { track } of this.unlockedTracks) {
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
    const keyframes = Array.from(this.unlockedTracks).flatMap(({ track }) =>
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

    for (const { track } of this.unlockedTracks) track.keyframes.sort(compareKeyframes);
    this.markEdit(`Spaced ${keyframes.length} keyframes`);
  };

  dedup = () => {
    // Keyframes closer than this (in seconds) are merged
    const threshold = 0.001; // 1ms
    const markedForDeletion: Record<TrackID, number[]> = {};

    for (const { track, node } of this.unlockedTracks) {
      let lastTimestamp: number | undefined;

      track.keyframes.forEach((kf, j) => {
        if (kf.selected) {
          if (lastTimestamp === undefined) {
            lastTimestamp = kf.ts;
          } else if (kf.ts - lastTimestamp < threshold) {
            if (!markedForDeletion[node.id]) {
              markedForDeletion[node.id] = [];
            }

            markedForDeletion[node.id].push(j);
          } else {
            lastTimestamp = kf.ts;
          }
        }
      });
    }

    const count = Object.values(markedForDeletion)
      .map((is) => is.length)
      .reduce((lens, len) => lens + len, 0);

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
      const track = this.data.tracks[trackID];

      for (let ii = indexes.length - 1; ii >= 0; ii--) {
        track.keyframes.splice(indexes[ii], 1);
      }
    });
  };
}

export default TimelineData;
