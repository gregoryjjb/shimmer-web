import { Component, For, createMemo } from 'solid-js';
import { Icon } from 'solid-heroicons';
import { lockClosed, lockOpen } from 'solid-heroicons/solid-mini';
import { useTimeline } from './TimelineContext';
import { DeepReadonly, LayoutNode, LayoutNodeID } from './timeline/types';

type LockState = 'locked' | 'unlocked';

type TrackTreeRow = {
  id: LayoutNodeID;
  type: LayoutNode['type'];
  depth: number;
  lockState: LockState;
};

type ReadonlyLayoutNode = DeepReadonly<LayoutNode>;

const combineLockStates = (states: LockState[]): LockState => {
  return states.length > 0 && states.every((state) => state === 'locked') ? 'locked' : 'unlocked';
};

const flattenNode = (
  node: ReadonlyLayoutNode,
  depth = 0,
): { rows: TrackTreeRow[]; lockState: LockState } => {
  if (node.type === 'track') {
    const lockState = node.locked ? 'locked' : 'unlocked';
    return {
      lockState,
      rows: [{ id: node.id, type: node.type, depth, lockState }],
    };
  }

  const children = node.children.map((child) => flattenNode(child, depth + 1));
  const lockState = combineLockStates(children.map((child) => child.lockState));

  return {
    lockState,
    rows: [
      { id: node.id, type: node.type, depth, lockState },
      ...children.flatMap((child) => child.rows),
    ],
  };
};

const TrackTree: Component = () => {
  const ctx = useTimeline();
  // This is not reactive; if the layout can change
  // during runtime then we need to make it reactive
  const layout = ctx.timeline.layout;

  const rows = createMemo(() => ctx.projectData().tracks.flatMap((node) => flattenNode(node).rows));

  return (
    <div
      class="pointer-events-none absolute bottom-0 left-0 z-10 overflow-hidden"
      style={{
        top: `${layout.timelineHeight + layout.waveformHeight}px`,
        width: `${layout.sidebarWidth}px`,
      }}
    >
      <div style={{ transform: `translateY(-${ctx.pan().y}px)` }}>
        <For each={rows()}>
          {(row) => {
            const nextLocked = row.lockState !== 'locked';
            const action = nextLocked ? 'Lock' : 'Unlock';
            const subject = row.type === 'group' ? 'group' : 'track';

            return (
              <div
                class="pointer-events-none flex items-center gap-1 pr-1"
                style={{
                  height: `${layout.channelHeight}px`,
                  'padding-left': `${8 + row.depth * 10}px`,
                }}
              >
                <span
                  class="min-w-0 flex-1 truncate text-base leading-none text-zinc-950"
                  title={row.id}
                >
                  {row.id}
                </span>
                <button
                  type="button"
                  class="pointer-events-auto shrink-0 rounded p-1 transition-colors hover:bg-zinc-600/80 hover:text-white"
                  classList={{
                    'text-zinc-500': row.lockState === 'unlocked',
                    'bg-zinc-700/60 text-zinc-100': row.lockState === 'locked',
                  }}
                  title={`${action} ${subject} ${row.id}`}
                  aria-label={`${action} ${subject} ${row.id}`}
                  aria-pressed={row.lockState === 'locked'}
                  onClick={() => ctx.timeline.setNodeLocked(row.id, nextLocked)}
                >
                  <Icon
                    path={row.lockState === 'unlocked' ? lockOpen : lockClosed}
                    class="h-4 w-4"
                  />
                </button>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
};

export default TrackTree;
