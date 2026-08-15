import { Component, Index, createMemo } from 'solid-js';
import { Icon } from 'solid-heroicons';
import { lockClosed, lockOpen } from 'solid-heroicons/solid-mini';
import { useTimeline } from './TimelineContext';
import { isOn } from './timeline/timeline-data';
import { flattenTracks } from './timeline/timeline';

const TrackTree: Component = () => {
  const ctx = useTimeline();
  // This is not reactive; if the layout can change
  // during runtime then we need to make it reactive
  const layout = ctx.timeline.layout;

  const rows = createMemo(() => flattenTracks(ctx.projectData().tracks));

  return (
    <div
      class="pointer-events-none absolute bottom-0 left-0 z-10 overflow-hidden"
      style={{
        top: `${layout.timelineHeight + layout.waveformHeight}px`,
        width: `${layout.sidebarWidth}px`,
      }}
    >
      <div style={{ transform: `translateY(-${ctx.pan().y}px)` }}>
        <Index each={rows()}>
          {(row) => {
            const rowIsOn = createMemo(() => {
              const keyframes = row().keyframes;
              return keyframes !== undefined && isOn(keyframes, ctx.currentTime());
            });
            const nextLocked = () => !row().locked;
            const action = () => (row().locked ? 'Unlock' : 'Lock');
            const subject = () => (row().type === 'group' ? 'group' : 'track');

            return (
              <div
                class="pointer-events-none flex items-center gap-1 pr-1"
                style={{
                  height: `${layout.channelHeight}px`,
                  'padding-left': `${8 + row().depth * 10}px`,
                }}
              >
                <span
                  class="min-w-0 flex-1 truncate text-base leading-none"
                  classList={{
                    'text-yellow-300': rowIsOn(),
                    'text-zinc-400': !rowIsOn(),
                  }}
                  style={{
                    'text-shadow': rowIsOn() ? '0 0 6px rgba(253, 224, 71, 0.65)' : 'none',
                  }}
                  title={row().id}
                >
                  {row().id}
                </span>
                <button
                  type="button"
                  class="pointer-events-auto shrink-0 rounded p-1 transition-colors hover:bg-zinc-600/80"
                  classList={{
                    'text-zinc-500 hover:text-white': !row().locked,
                    'text-rose-300': row().locked,
                  }}
                  title={`${action()} ${subject()} ${row().id}`}
                  aria-label={`${action()} ${subject()} ${row().id}`}
                  aria-pressed={row().locked}
                  onClick={() => ctx.timeline.setNodeLocked(row().id, nextLocked())}
                >
                  <Icon path={row().locked ? lockClosed : lockOpen} class="h-4 w-4" />
                </button>
              </div>
            );
          }}
        </Index>
      </div>
    </div>
  );
};

export default TrackTree;
