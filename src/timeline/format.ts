

type Keyframe = {
  ts: number;
  value: number;
  selected?: boolean;
};

type TrackID = string;

type Track = {
  keyframes: Keyframe[];
}

type Project = {
  tracks: Record<TrackID, Track>;
}

export function unmarshalProject(data: any) {
  if (typeof data === 'string') {
    data = JSON.parse(data);
  }

  if (typeof data !== 'object') {
    throw new Error('project must be an object');
  }
}
