import { Component, Index, createMemo } from 'solid-js';
import { Icon } from 'solid-heroicons';
import { lockClosed, lockOpen } from 'solid-heroicons/solid-mini';
import { useTimeline } from './TimelineContext';
import { BEAT_FLASH_DURATION_SECONDS, BEAT_TRACK_ID } from './timeline/beat';
import colors from './timeline/colors';
import { isOn } from './timeline/timeline-data';
import { flattenTracks } from './timeline/timeline';

const christmasLights = [
  { color: '#ff4b3e', core: '#ff9188', glow: 'rgba(255, 75, 62, 0.65)' },
  { color: '#ff982b', core: '#ffbd70', glow: 'rgba(255, 152, 43, 0.65)' },
  { color: '#ffd23f', core: '#ffe27d', glow: 'rgba(255, 210, 63, 0.65)' },
  { color: '#35c759', core: '#82dc98', glow: 'rgba(53, 199, 89, 0.65)' },
  { color: '#3f7cff', core: '#89a8ff', glow: 'rgba(63, 124, 255, 0.65)' },
];

const beatLight = {
  color: colors.emerald[400],
  glow: 'rgba(52, 211, 153, 0.65)',
};

const TrackTree: Component = () => {
  const ctx = useTimeline();
  // This is not reactive; if the layout can change
  // during runtime then we need to make it reactive
  const layout = ctx.timeline.layout;

  const rows = createMemo(() => flattenTracks(ctx.projectData().tracks));
  const colorOffsets = createMemo(() => {
    let offset = 0;
    return rows().map((row) => {
      const rowOffset = offset;
      if (row.id !== BEAT_TRACK_ID) offset += Array.from(row.id).length;
      return rowOffset;
    });
  });

  return (
    <div
      class="pointer-events-none absolute bottom-0 left-0 z-10 overflow-hidden bg-slate-950"
      style={{
        top: `${layout.timelineHeight + layout.waveformHeight}px`,
        width: `${layout.sidebarWidth}px`,
      }}
    >
      <div style={{ transform: `translateY(-${ctx.pan().y}px)` }}>
        <Index each={rows()}>
          {(row, rowIndex) => {
            const isBeat = () => row().id === BEAT_TRACK_ID;
            const rowIsOn = createMemo(() => {
              const keyframes = row().keyframes;
              return (
                keyframes !== undefined &&
                isOn(
                  keyframes,
                  ctx.currentTime(),
                  isBeat() ? BEAT_FLASH_DURATION_SECONDS : undefined,
                )
              );
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
                    'text-zinc-400': !rowIsOn(),
                  }}
                  style={{
                    color: rowIsOn() && isBeat() ? beatLight.color : undefined,
                    'text-shadow':
                      rowIsOn() && isBeat()
                        ? `0 0 1px white, 0 0 3px ${beatLight.color}, 0 0 7px ${beatLight.glow}`
                        : 'none',
                  }}
                  title={row().id}
                >
                  {rowIsOn() && !isBeat() ? (
                    <Index each={Array.from(row().id)}>
                      {(character, index) => {
                        const light =
                          christmasLights[
                            (colorOffsets()[rowIndex] + index) % christmasLights.length
                          ];
                        return (
                          <span
                            style={{
                              color: light.core,
                              'text-shadow': `0 0 1px white, 0 0 3px ${light.color}, 0 0 7px ${light.glow}`,
                            }}
                          >
                            {character()}
                          </span>
                        );
                      }}
                    </Index>
                  ) : (
                    row().id
                  )}
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
