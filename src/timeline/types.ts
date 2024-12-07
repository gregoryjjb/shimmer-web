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

export type Track = {
  name: string;
  keyframes: Keyframe[];
};

export type Keyframe = {
  ts: number;
  value: number;
  selected?: boolean;
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
  tracks: Track[];
}
