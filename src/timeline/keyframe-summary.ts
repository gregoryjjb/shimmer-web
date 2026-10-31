import { binarySearch } from './timeline-data';
import { DeepReadonly, LayoutNode, Tracks } from './types';

export const KEYFRAME_SUMMARY_RADIUS = 20;
type Span = { start: number; end: number };

/** Summarize all descendants, including locked tracks and nested collapsed groups. */
export function groupKeyframeSpans(
  node: DeepReadonly<LayoutNode>,
  tracks: DeepReadonly<Tracks>,
  startTime: number,
  endTime: number,
  timeToX: (time: number) => number,
): Span[] {
  const positions: number[] = [];
  function visit(node: DeepReadonly<LayoutNode>) {
    if (node.type === 'group') {
      node.children.forEach(visit);
      return;
    }
    const frames = tracks[node.id]?.keyframes;
    if (!frames) return;
    const first = binarySearch(frames, startTime, 'right');
    if (first === undefined) return;
    for (let i = first; i < frames.length && frames[i].ts <= endTime; i++) {
      positions.push(timeToX(frames[i].ts));
    }
  }
  visit(node);
  positions.sort((a, b) => a - b);

  const spans: Span[] = [];
  for (const x of positions) {
    const start = x - KEYFRAME_SUMMARY_RADIUS;
    const end = x + KEYFRAME_SUMMARY_RADIUS;
    const previous = spans[spans.length - 1];
    if (previous && start <= previous.end) previous.end = end;
    else spans.push({ start, end });
  }
  return spans;
}

export function drawKeyframeSummary(
  ctx: CanvasRenderingContext2D,
  spans: readonly Span[],
  centerY: number,
  viewportWidth: number,
  color: string,
) {
  if (!spans.length) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const span of spans) {
    const start = Math.max(0, span.start);
    const end = Math.min(viewportWidth, span.end);
    if (start >= end) continue;
    const y = (x: number) => centerY + Math.sin((x - span.start) / 4) * 3;
    ctx.moveTo(start, y(start));
    for (let x = start + 2; x < end; x += 2) ctx.lineTo(x, y(x));
    ctx.lineTo(end, y(end));
  }
  ctx.stroke();
  ctx.restore();
}
