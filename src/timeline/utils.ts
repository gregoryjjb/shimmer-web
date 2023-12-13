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
}
