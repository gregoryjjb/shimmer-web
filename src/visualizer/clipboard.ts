import { parseConfig, VisualizerObject } from './types';

const RECTANGLE_TYPE = 'shimmer/visualizer-rectangle';

export function serializeRectangle(object: VisualizerObject): string {
  return JSON.stringify({ type: RECTANGLE_TYPE, version: 1, object });
}

export function readRectangle(text: string): VisualizerObject | undefined {
  try {
    const payload = JSON.parse(text);
    if (payload?.type !== RECTANGLE_TYPE || payload.version !== 1) return;
    // Clipboard content is external input; use the same validation as saved data.
    return parseConfig(JSON.stringify({ rectangle: [payload.object] })).rectangle[0];
  } catch {
    return;
  }
}
