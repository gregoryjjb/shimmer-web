export type ShowJSON = {
  id: number;
  name: string;
};

export type ShowDataJSON = {
  tracks: ShowTrackJSON[];
};

export type ShowTrackJSON = {
  id: string;
  keyframes: ShowKeyframeJSON[];
};

export type ShowKeyframeJSON = {
  time: number;
  state: number;
};

export type TrackGroup = {
  name: string;
  tracks: (Track | TrackGroup)[];
};

export type Keyframe = {
  ts: number;
  value: number;
  selected?: boolean;
};

export type LayoutNode = Group | Track;

export type LayoutNodeID = string;

export type TrackID = LayoutNodeID;

export type Group = {
  type: 'group';
  id: string;

  children: LayoutNode[];
};

export type Track = {
  type: 'track';
  id: string;

  keyframes: Keyframe[];
};

export interface Project {
  name: string;
  data: ProjectData;
  audio: Blob;
}

/**
 * ProjectData is the stuff that gets saved as json
 */
export interface ProjectData {
  version: '2';
  tracks: LayoutNode[];
}
