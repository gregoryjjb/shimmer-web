
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
  timestamp: number;
  value: number;
  selected: boolean;
};

export interface Project {
  name: string;
  tracks: Track[];
  audio: Blob;
}

