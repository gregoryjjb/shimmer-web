export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface RectRange {
  position: Point;
  size: Size;
}

export const clamp = (n: number, min: number, max: number): number => {
  return Math.min(Math.max(n, min), max);
};

export const pointsToRect = (p1: Point, p2: Point): RectRange => {
  const x = Math.min(p1.x, p2.x);
  const y = Math.min(p1.y, p2.y);

  const width = Math.max(p1.x, p2.x) - x;
  const height = Math.max(p1.y, p2.y) - y;

  return {
    position: { x, y },
    size: { width, height },
  };
};

/**
 * Returns the start (top left) of a range represented by two points
 */
export const rangeStart = (p1: Point, p2: Point): Point => {
  const x = Math.min(p1.x, p2.x);
  const y = Math.min(p1.y, p2.y);

  return { x, y };
};

/**
 * Returns the end (bottom right) of a range represented by two points
 */
export const rangeEnd = (p1: Point, p2: Point): Point => {
  const x = Math.max(p1.x, p2.x);
  const y = Math.max(p1.y, p2.y);

  return { x, y };
};

/**
 * Returns a - b as a new point
 */
export const difference = (a: Point, b: Point): Point => {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
  };
};

/**
 * @returns the absolute value of p
 */
export const abs = (p: Point): Point => {
  return {
    x: Math.abs(p.x),
    y: Math.abs(p.y),
  };
};

const timeResolutions = {
  minutes: 0,
  seconds: 1,
  milliseconds: 2,
};

export type TimestampResolution = keyof typeof timeResolutions;

/**
 * Convert a timestamp into a nice digital clock style string (12:34:567)
 * @param time The timestamp in seconds
 * @param resolution What to round to
 * @returns stringified time
 */
export const stringifyTime = (time: number, resolution: TimestampResolution): string => {
  const res = timeResolutions[resolution];

  let t = '';

  if (res >= timeResolutions.minutes) {
    t = Math.floor(time / 60)
      .toString()
      .padStart(2, '0');
  }

  if (res >= timeResolutions.seconds) {
    t +=
      ':' +
      Math.floor(time % 60)
        .toString()
        .padStart(2, '0');
  }

  if (res >= timeResolutions.milliseconds) {
    t +=
      ':' +
      Math.floor((time * 1000) % 1000)
        .toString()
        .padStart(3, '0');
  }

  return t;
};
