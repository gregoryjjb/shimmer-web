import { Component } from 'solid-js';
import { useTimeline } from './TimelineContext';
import TrackTree from './TrackTree';
import { stringifyTime } from './timeline/utils';

const Sidebar: Component = () => {
  const ctx = useTimeline();
  const layout = ctx.timeline.layout;

  return (
    <aside
      class="relative shrink-0 border-r border-sky-800 bg-zinc-900"
      style={{ width: `${layout.sidebarWidth}px` }}
    >
      <output class="absolute left-3 top-0 rounded-sm border px-1 py-0.5 text-sm">
        {stringifyTime(ctx.currentTime(), 'milliseconds')}
      </output>
      <TrackTree />
    </aside>
  );
};

export default Sidebar;
