export type VisualizerObject = {
  /** Coordinates and dimensions are fractions of the image, from 0 to 1. */
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
};

export type VisualizerConfig = Record<string, VisualizerObject[]>;

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function constrainObject(object: VisualizerObject): VisualizerObject {
  const width = clamp(object.width, 0.005, 1);
  const height = clamp(object.height, 0.005, 1);
  return {
    ...object,
    width,
    height,
    x: clamp(object.x, 0, 1 - width),
    y: clamp(object.y, 0, 1 - height),
  };
}

export function parseConfig(value: string | null): VisualizerConfig {
  if (value === null) return Object.create(null);
  const data: unknown = JSON.parse(value);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('The saved visualizer configuration is invalid.');
  }
  const result: VisualizerConfig = Object.create(null);
  for (const [name, objects] of Object.entries(data)) {
    if (!Array.isArray(objects)) throw new Error('Invalid visualizer objects.');
    result[name] = objects.map((object) => {
      if (
        !object ||
        !['x', 'y', 'width', 'height'].every(
          (key) => typeof object[key] === 'number' && Number.isFinite(object[key]),
        ) ||
        typeof object.color !== 'string' ||
        !/^#[0-9a-f]{6}$/i.test(object.color) ||
        object.x < 0 ||
        object.y < 0 ||
        object.width <= 0 ||
        object.height <= 0 ||
        object.x + object.width > 1.000001 ||
        object.y + object.height > 1.000001
      ) {
        throw new Error('The saved visualizer contains an invalid rectangle.');
      }
      const { x, y, width, height, color } = object;
      return { x, y, width, height, color };
    });
  }
  return result;
}
