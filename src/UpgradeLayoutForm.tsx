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
      class="flex min-h-0 flex-1 flex-col gap-4"
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

      <div class="grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div class="flex min-h-0 flex-col rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
          <h2 class="mb-2 text-sm font-semibold text-zinc-100">
            {sourceIDs.length} existing tracks
          </h2>
          <div class="min-h-0 overflow-y-auto pr-1">
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
        </div>

        <div class="flex min-h-0 flex-col rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
          <h2 class="mb-3 text-sm font-semibold text-zinc-100">{targetIDs.length} new tracks</h2>
          <div class="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
            <For each={targetData}>
              {(node) => (
                <TargetNodeMapping
                  node={node}
                  sourceIDs={sourceIDs}
                  mapping={mapping()}
                  onTrackChange={(targetID, sourceID) =>
                    setMapping((current) => ({
                      ...current,
                      [targetID]: sourceID,
                    }))
                  }
                  onGroupChange={(targetTrackIDs, sourceID) =>
                    setMapping((current) => {
                      const next = { ...current };

                      for (const targetTrackID of targetTrackIDs) {
                        next[targetTrackID] = sourceID;
                      }

                      return next;
                    })
                  }
                />
              )}
            </For>
          </div>
        </div>
      </div>

      {/* <div class="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
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
      </div> */}

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

const TargetNodeMapping: Component<{
  node: LayoutNode;
  sourceIDs: string[];
  mapping: Record<string, string | undefined>;
  onTrackChange: (targetID: string, sourceID: string | undefined) => void;
  onGroupChange: (targetTrackIDs: string[], sourceID: string | undefined) => void;
  depth?: number;
}> = (props) => {
  const depth = props.depth ?? 0;

  const indentPx = 20;

  if (props.node.type === 'track') {
    return (
      <label
        class="-m-2 grid items-center gap-2 rounded p-2 focus-within:bg-zinc-500 hover:bg-zinc-500 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.4fr)]"
        style={{ 'margin-left': `${depth * indentPx}px` }}
      >
        <span class="truncate text-sm text-zinc-100">{props.node.id}</span>
        <span class="text-zinc-500">=</span>
        <MappingSelect
          sourceIDs={props.sourceIDs}
          value={props.mapping[props.node.id]}
          onChange={(sourceID) => props.onTrackChange(props.node.id, sourceID)}
        />
      </label>
    );
  }

  const childTrackIDs = collectTrackIDs([props.node]);
  const groupValue = createMemo(() => {
    const assigned = childTrackIDs
      .map((targetID) => props.mapping[targetID])
      .filter((value): value is string => value !== undefined);

    if (assigned.length !== childTrackIDs.length) return undefined;

    const first = assigned[0];
    return assigned.every((value) => value === first) ? first : undefined;
  });

  return (
    <div class="flex flex-col gap-2">
      <label
        class="grid items-center gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.4fr)]"
        style={{ 'margin-left': `${depth * indentPx}px` }}
      >
        <span class="truncate text-sm font-semibold text-zinc-200">{props.node.id}</span>
        <span class="text-zinc-500">=</span>
        <MappingSelect
          sourceIDs={props.sourceIDs}
          value={groupValue()}
          placeholder="Mixed / unassigned"
          onChange={(sourceID) => props.onGroupChange(childTrackIDs, sourceID)}
        />
      </label>

      <div class="flex flex-col gap-2">
        <For each={props.node.children}>
          {(child) => (
            <TargetNodeMapping
              node={child}
              sourceIDs={props.sourceIDs}
              mapping={props.mapping}
              onTrackChange={props.onTrackChange}
              onGroupChange={props.onGroupChange}
              depth={depth + 1}
            />
          )}
        </For>
      </div>
    </div>
  );
};

const MappingSelect: Component<{
  sourceIDs: string[];
  value: string | undefined;
  onChange: (sourceID: string | undefined) => void;
  placeholder?: string;
}> = (props) => {
  return (
    <select
      class="rounded bg-transparent p-2 text-sm text-zinc-100 hover:bg-zinc-600 focus:bg-zinc-600"
      value={props.value ?? ''}
      onInput={(e) => props.onChange(e.currentTarget.value || undefined)}
    >
      <option value="">{props.placeholder ?? 'Unassigned'}</option>
      <For each={props.sourceIDs}>{(sourceID) => <option value={sourceID}>{sourceID}</option>}</For>
    </select>
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

  return {
    version: '2',
    tracks: targetData.map((node) => cloneMappedNode(node, sourceTrackByID, mapping)),
  };
}

function cloneMappedNode(
  node: LayoutNode,
  sourceTrackByID: Record<string, Track>,
  mapping: Record<string, string | undefined>,
): LayoutNode {
  if (node.type === 'group') {
    return {
      ...node,
      children: node.children.map((child) => cloneMappedNode(child, sourceTrackByID, mapping)),
    };
  }

  const oldID = mapping[node.id];
  const sourceTrack = oldID ? sourceTrackByID[oldID] : undefined;

  return {
    ...node,
    keyframes: sourceTrack ? sourceTrack.keyframes.map((keyframe) => ({ ...keyframe })) : [],
    locked: sourceTrack?.locked ?? false,
  };
}
