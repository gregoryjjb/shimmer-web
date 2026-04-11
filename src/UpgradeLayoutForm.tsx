import { Component, For, Show, createMemo, createSignal } from 'solid-js';
import GradientButton from './components/GradientButton';
import { useTimeline } from './TimelineContext';
import { iterateNodes, newTracks } from './timeline/timeline-data';
import { Keyframe, LayoutNode, ProjectData, Track } from './timeline/types';

export const UpgradeLayoutForm: Component<{
  onClose?: () => void;
}> = (props) => {
  const ctx = useTimeline();

  const sourceData = ctx.timeline.getData().tracks;
  const targetData = newTracks(0);

  const sourceIDs = collectTrackIDs(sourceData);
  const targetIDs = collectTrackIDs(targetData);

  const defaultMapping = Object.fromEntries(
    targetIDs.map((targetID, index) => [targetID, sourceIDs[index]]),
  ) as Record<string, string | undefined>;

  // Mapping from new track to old track (tracks only, not groups!)
  const [mapping, setMapping] = createSignal<Record<string, string | undefined>>(defaultMapping);

  const assignmentsBySource = createMemo(() => {
    const grouped: Record<string, string[]> = {};

    for (const [targetID, sourceID] of Object.entries(mapping())) {
      if (!sourceID) continue;
      grouped[sourceID] ??= [];
      grouped[sourceID].push(targetID);
    }

    return grouped;
  });

  return (
    <form
      class="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();

        const upgraded = upgradeLayout({
          sourceData,
          targetData,
          mapping: mapping(),
        });

        ctx.timeline.replaceData(upgraded);
        props.onClose?.();
      }}
    >
      <p class="text-sm text-zinc-300">
        Choose which existing node ID should feed each node in the new layout. You can reuse the
        same source more than once.
      </p>

      <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div class="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
          <h2 class="mb-2 text-sm font-semibold text-zinc-100">Existing node IDs</h2>
          <Show
            when={sourceIDs.length > 0}
            fallback={
              <p class="text-sm text-zinc-400">No track IDs found in the current layout.</p>
            }
          >
            <div class="flex flex-wrap gap-2">
              <For each={sourceIDs}>
                {(id) => (
                  <span class="rounded-md bg-zinc-800 px-2 py-1 text-sm text-zinc-200">{id}</span>
                )}
              </For>
            </div>
          </Show>
        </div>

        <div class="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
          <h2 class="mb-3 text-sm font-semibold text-zinc-100">New layout mapping</h2>
          <div class="flex max-h-[24rem] flex-col gap-3 overflow-y-auto pr-1">
            <For each={targetIDs}>
              {(targetID) => (
                <label class="grid items-center gap-2 rounded-md bg-zinc-900/80 p-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.4fr)]">
                  <span class="truncate font-medium text-zinc-100">{targetID}</span>
                  <span class="text-zinc-500">=</span>
                  <select
                    class="rounded bg-zinc-700 p-2 text-sm text-zinc-100 hover:bg-zinc-600 focus:bg-zinc-600"
                    value={mapping()[targetID] ?? ''}
                    onInput={(e) =>
                      setMapping((current) => ({
                        ...current,
                        [targetID]: e.currentTarget.value || undefined,
                      }))
                    }
                  >
                    <option value="">Unassigned</option>
                    <For each={sourceIDs}>
                      {(sourceID) => <option value={sourceID}>{sourceID}</option>}
                    </For>
                  </select>
                </label>
              )}
            </For>
          </div>
        </div>
      </div>

      <div class="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
        <h2 class="mb-2 text-sm font-semibold text-zinc-100">Mapping summary</h2>
        <Show
          when={Object.keys(assignmentsBySource()).length > 0}
          fallback={<p class="text-sm text-zinc-400">No target nodes have been assigned yet.</p>}
        >
          <div class="flex flex-col gap-2 text-sm text-zinc-300">
            <For each={Object.entries(assignmentsBySource())}>
              {([sourceID, mappedTargets]) => (
                <p>
                  <span class="font-medium text-zinc-100">{sourceID}</span>
                  {' -> '}
                  {mappedTargets.join(', ')}
                </p>
              )}
            </For>
          </div>
        </Show>
      </div>

      <div class="flex w-full items-center justify-end gap-3">
        <button
          type="button"
          class="rounded-xl border border-zinc-800 px-3 py-2 font-semibold text-zinc-400 transition-colors hocus:bg-zinc-800 hocus:text-zinc-300"
          onClick={() => props.onClose?.()}
        >
          Cancel
        </button>
        <GradientButton
          component="button"
          type="submit"
          class="rounded-xl px-3 py-2 font-semibold text-black"
        >
          Apply
        </GradientButton>
      </div>
    </form>
  );
};

/**
 * Collects IDs of leaf tracks only
 */
function collectTrackIDs(nodes: LayoutNode[]) {
  const ids: string[] = [];

  for (const node of iterateNodes(...nodes)) {
    if (node.type === 'track') {
      ids.push(node.id);
    }
  }

  return ids;
}

function upgradeLayout({
  sourceData,
  targetData,
  mapping,
}: {
  sourceData: LayoutNode[];
  targetData: LayoutNode[];
  mapping: Record<string, string | undefined>;
}): ProjectData {
  const sourceTrackByID: Record<string, Track> = {};

  for (const track of iterateNodes(...sourceData)) {
    if (track.type === 'track') {
      sourceTrackByID[track.id] = track;
    }
  }

  for (const newTrack of iterateNodes(...targetData)) {
    const oldID = mapping[newTrack.id];

    if (oldID) {
      if (newTrack.type !== 'track') {
        throw new Error(`Mapping was created for non-track node "${newTrack.id}"`);
      }

      newTrack.keyframes = sourceTrackByID[oldID].keyframes;
    }
  }

  return {
    version: '2',
    tracks: targetData,
  };
}
