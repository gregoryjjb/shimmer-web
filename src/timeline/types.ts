export type DeepReadonly<T> = T extends (...args: any[]) => any
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export type Keyframe = {
  ts: number;
  value: number;
  selected?: boolean;
};

export type LayoutNode = LayoutGroup | LayoutTrack;

export type LayoutNodeID = string;

export type TrackID = LayoutNodeID;

export type LayoutGroup = {
  type: 'group';
  id: string;

  children: LayoutNode[];
};

export type LayoutTrack = {
  type: 'track';
  id: string;
};

export type Track = {
  keyframes: Keyframe[];
  locked: boolean;
};

export type Tracks = Record<TrackID, Track>;

export interface Project {
  name: string;
  data: ProjectData;
  audio: Blob;
}

/**
 * ProjectData is the stuff that gets saved as json
 */
export interface ProjectData {
  version: '3';
  tracks: Tracks;
}
