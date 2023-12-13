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
