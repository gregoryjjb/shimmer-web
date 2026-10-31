import { Index, Show, createMemo, createSignal } from 'solid-js';
import { Icon } from 'solid-heroicons';
import { bars_3, folder, folderPlus, musicalNote, plus, trash } from 'solid-heroicons/solid-mini';
import GradientButton from './components/GradientButton';
import { parseLayout } from './timeline/layout';
import { DeepReadonly, LayoutNode } from './timeline/types';

type Row = { node: LayoutNode; path: number[] };
type DropPosition = 'before' | 'inside' | 'after';
type DropTarget = { path: number[]; position: DropPosition } | 'root';

const within = (path: number[], parent: number[]) =>
  parent.length <= path.length && parent.every((index, i) => path[i] === index);

function siblingsAt(nodes: LayoutNode[], path: number[]) {
  for (const index of path.slice(0, -1)) {
    const node = nodes[index];
    if (node.type !== 'group') throw new Error('Expected a group');
    nodes = node.children;
  }
  return nodes;
}

export default function LayoutEditorForm(props: {
  layout: DeepReadonly<LayoutNode[]>;
  onSave: (layout: LayoutNode[], origins: Record<string, string>) => void | Promise<void>;
  onCancel: () => void;
}) {
  const initial = parseLayout(props.layout);
  const rememberOrigins = (nodes: LayoutNode[]) =>
    nodes.forEach((node) => {
      if (node.type === 'group') rememberOrigins(node.children);
      else (node as LayoutNode & { originalId: string }).originalId = node.id;
    });
  rememberOrigins(initial);
  const [draft, setDraft] = createSignal(initial);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal('');
  const [dragged, setDragged] = createSignal<number[]>();
  const [dropTarget, setDropTarget] = createSignal<DropTarget>();
  const clearDrag = () => {
    setDragged(undefined);
    setDropTarget(undefined);
  };
  const rows = createMemo(() => {
    const result: Row[] = [];
    const visit = (nodes: LayoutNode[], path: number[]) =>
      nodes.forEach((node, index) => {
        const childPath = [...path, index];
        result.push({ node, path: childPath });
        if (node.type === 'group') visit(node.children, childPath);
      });
    visit(draft(), []);
    return result;
  });
  const edit = (change: (nodes: LayoutNode[]) => void) => {
    const nodes = structuredClone(draft());
    change(nodes);
    setDraft(nodes);
    setError('');
  };
  const add = (type: 'group' | 'track', parent?: number[]) => {
    const names = new Set(rows().map(({ node }) => node.id));
    const prefix = type === 'group' ? 'Group' : 'Track';
    let number = 1;
    while (names.has(`${prefix} ${number}`)) number++;
    const id = `${prefix} ${number}`;
    edit((nodes) => {
      const children = parent ? siblingsAt(nodes, [...parent, 0]) : nodes;
      children.push(type === 'group' ? { type, id, children: [] } : { type, id });
    });
  };
  const targetAt = (
    event: DragEvent & { currentTarget: HTMLDivElement },
    row?: Row,
  ): DropTarget | undefined => {
    const source = dragged();
    if (!source || (row && within(row.path, source))) return;
    if (!row) return 'root';
    const bounds = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientY - bounds.top) / bounds.height;
    const position =
      row.node.type === 'group' && fraction >= 0.25 && fraction <= 0.75
        ? 'inside'
        : fraction < 0.5
          ? 'before'
          : 'after';
    return { path: row.path, position };
  };
  const dragOver = (event: DragEvent & { currentTarget: HTMLDivElement }, row?: Row) => {
    const target = targetAt(event, row);
    setDropTarget(target);
    if (!target) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  };
  const drop = (event: DragEvent & { currentTarget: HTMLDivElement }, row?: Row) => {
    const source = dragged();
    const target = targetAt(event, row);
    if (!source || !target) {
      clearDrag();
      return;
    }
    event.preventDefault();
    edit((nodes) => {
      const sourceSiblings = siblingsAt(nodes, source);
      const sourceIndex = source[source.length - 1];
      // Resolve destination references before removal so shifted sibling indexes don't matter.
      const targetSiblings = target === 'root' ? nodes : siblingsAt(nodes, target.path);
      const targetNode =
        target === 'root' ? undefined : targetSiblings[target.path[target.path.length - 1]];
      const [node] = sourceSiblings.splice(sourceIndex, 1);
      if (target === 'root') nodes.push(node);
      else if (target.position === 'inside' && targetNode?.type === 'group')
        targetNode.children.push(node);
      else
        targetSiblings.splice(
          targetSiblings.indexOf(targetNode!) + (target.position === 'after' ? 1 : 0),
          0,
          node,
        );
    });
    clearDrag();
  };
  const Action = (props: {
    label: string;
    icon: typeof plus;
    disabled?: boolean;
    onClick: () => void;
  }) => (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      disabled={props.disabled}
      class="shrink-0 rounded p-1.5 text-zinc-300 hover:bg-zinc-700 disabled:opacity-25"
      onClick={props.onClick}
    >
      <Icon path={props.icon} class="h-4 w-4" />
    </button>
  );

  return (
    <form
      class="flex min-h-0 flex-col gap-4"
      inert={saving()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          if (dragged()) clearDrag();
          else if (!saving()) props.onCancel();
        }
      }}
      onSubmit={async (event) => {
        event.preventDefault();
        if (saving()) return;
        setSaving(true);
        try {
          const origins = Object.fromEntries(
            rows()
              .filter((row) => row.node.type === 'track')
              .flatMap(({ node }) => {
                const original = (node as LayoutNode & { originalId?: string }).originalId;
                return original === undefined ? [] : [[node.id, original]];
              }),
          );
          await props.onSave(parseLayout(draft()), origins);
        } catch (error) {
          setError(error instanceof Error ? error.message : String(error));
        } finally {
          setSaving(false);
        }
      }}
    >
      <div class="min-h-0 overflow-auto rounded-lg border border-zinc-800 p-2">
        <Index each={rows()}>
          {(row) => {
            const index = () => row().path[row().path.length - 1];
            const indicator = () => {
              const target = dropTarget();
              if (!target || target === 'root') return;
              if (target.position === 'after') {
                const next = rows()[rows().indexOf(row()) + 1];
                if (within(row().path, target.path) && (!next || !within(next.path, target.path)))
                  return 'after';
              } else if (target.path.join('.') === row().path.join('.')) return target.position;
            };
            const indicatorDepth = () => {
              const target = dropTarget();
              return target && target !== 'root' ? target.path.length - 1 : 0;
            };
            return (
              <div
                class="relative flex items-center gap-1 rounded py-1 hover:bg-zinc-800/60"
                data-layout-row={row().path.join('.')}
                data-drop-position={indicator()}
                classList={{
                  'bg-indigo-500/20 ring-1 ring-inset ring-indigo-400': indicator() === 'inside',
                  'opacity-40': !!dragged() && within(row().path, dragged()!),
                }}
                style={{ 'padding-left': `${(row().path.length - 1) * 20}px` }}
                onDragOver={(event) => dragOver(event, row())}
                onDrop={(event) => drop(event, row())}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                    setDropTarget(undefined);
                }}
              >
                <Show when={indicator() === 'before' || indicator() === 'after'}>
                  <div
                    class="pointer-events-none absolute right-0 h-0.5 bg-indigo-400"
                    style={{ left: `${indicatorDepth() * 20}px` }}
                    classList={{
                      'top-0': indicator() === 'before',
                      'bottom-0': indicator() === 'after',
                    }}
                  />
                </Show>
                <button
                  type="button"
                  draggable="true"
                  aria-label={`Drag ${row().node.id}`}
                  title={`Drag ${row().node.id}`}
                  class="shrink-0 cursor-grab rounded p-1.5 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200 active:cursor-grabbing"
                  onDragStart={(event) => {
                    setDragged([...row().path]);
                    if (event.dataTransfer) {
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', row().node.id);
                      event.dataTransfer.setDragImage(event.currentTarget.parentElement!, 20, 16);
                    }
                  }}
                  onDragEnd={clearDrag}
                >
                  <Icon path={bars_3} class="h-4 w-4" />
                </button>
                <Icon
                  path={row().node.type === 'group' ? folder : musicalNote}
                  class="h-4 w-4 shrink-0 text-zinc-400"
                />
                <input
                  aria-label={`${row().node.type === 'group' ? 'Group' : 'Track'} name`}
                  class="min-w-[6rem] flex-1 rounded bg-transparent px-2 py-1 text-sm text-zinc-100 focus:bg-zinc-700 focus:outline-none"
                  value={row().node.id}
                  onInput={(event) => {
                    const name = event.currentTarget.value;
                    edit((nodes) => {
                      siblingsAt(nodes, row().path)[index()].id = name;
                    });
                  }}
                />
                <Show when={row().node.type === 'group'}>
                  <Action
                    label={`Add track to ${row().node.id}`}
                    icon={plus}
                    onClick={() => add('track', row().path)}
                  />
                  <Action
                    label={`Add group to ${row().node.id}`}
                    icon={folderPlus}
                    onClick={() => add('group', row().path)}
                  />
                </Show>
                <Action
                  label={`Remove ${row().node.id}`}
                  icon={trash}
                  onClick={() =>
                    edit((nodes) => {
                      siblingsAt(nodes, row().path).splice(index(), 1);
                    })
                  }
                />
              </div>
            );
          }}
        </Index>
        <Show when={dragged()}>
          <div
            aria-label="Move to root"
            class="mt-2 rounded border border-dashed border-zinc-600 p-3 text-center text-sm text-zinc-400"
            classList={{ 'border-indigo-400 bg-indigo-500/20': dropTarget() === 'root' }}
            onDragOver={(event) => dragOver(event)}
            onDrop={(event) => drop(event)}
            onDragLeave={() => setDropTarget(undefined)}
          >
            Move to root
          </div>
        </Show>
      </div>
      <div class="flex gap-2">
        <button
          type="button"
          class="rounded-lg bg-zinc-700 px-3 py-2 text-sm hover:bg-zinc-600"
          onClick={() => add('group')}
        >
          Add group
        </button>
        <button
          type="button"
          class="rounded-lg bg-zinc-700 px-3 py-2 text-sm hover:bg-zinc-600"
          onClick={() => add('track')}
        >
          Add track
        </button>
      </div>
      <Show when={error()}>
        <p role="alert" class="text-sm text-rose-400">
          {error()}
        </p>
      </Show>
      <div class="flex justify-end gap-3">
        <button
          type="button"
          class="rounded-xl border border-zinc-800 px-3 py-2 font-semibold text-zinc-400 transition-colors hocus:bg-zinc-800 hocus:text-zinc-300"
          onClick={props.onCancel}
        >
          Cancel
        </button>
        <GradientButton
          component="button"
          type="submit"
          class="rounded-xl px-3 py-2 font-semibold text-black"
        >
          Save
        </GradientButton>
      </div>
    </form>
  );
}
