import { Index, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Icon } from 'solid-heroicons';
import { trash, xMark } from 'solid-heroicons/solid-mini';
import GradientButton from './components/GradientButton';
import LayoutTreeEditor from './LayoutTreeEditor';
import { LayoutDocument } from './layout/document';
import { createLayoutDraft, draftTracks, saveLayoutDraft } from './layout/draft';
import { DeepReadonly } from './timeline/types';
import { optimizeBackgroundImage } from './visualizer/background-image';
import { readRectangle, serializeRectangle } from './visualizer/clipboard';
import { VisualizerObject, clamp, constrainObject } from './visualizer/types';

type Selection = { track: string; index: number };
type Drag = Selection & {
  pointer: number;
  x: number;
  y: number;
  original: VisualizerObject;
  resize: boolean;
};

export default function LayoutEditor(props: {
  layout: DeepReadonly<LayoutDocument>;
  onSave: (layout: LayoutDocument) => Promise<void>;
  onClose: () => void;
}) {
  let nextKey = 0;
  const createKey = () => String(nextKey++);
  const [tree, setTree] = createSignal(createLayoutDraft(props.layout, createKey));
  const tracks = createMemo(() => draftTracks(tree()));
  const [track, setTrack] = createSignal<string | undefined>(tracks()[0]?.key);
  const [selection, setSelection] = createSignal<Selection>();
  const [image, setImage] = createSignal(props.layout.visuals.backgroundImage ?? '');
  const [imageRatio, setImageRatio] = createSignal(1);
  const [imageAreaSize, setImageAreaSize] = createSignal({ width: 1, height: 1 });
  const [color, setColor] = createSignal('#facc15');
  const [saving, setSaving] = createSignal(false);
  const [uploading, setUploading] = createSignal(false);
  const [error, setError] = createSignal('');
  const busy = () => saving() || uploading();
  const selectedTrack = () => tracks().find((item) => item.key === track());
  const selectedObject = () => {
    const selected = selection();
    return (
      selected && tracks().find((item) => item.key === selected.track)?.objects[selected.index]
    );
  };
  const isSelected = (item: Selection) =>
    selection()?.track === item.track && selection()?.index === item.index;
  const objects = createMemo(() =>
    tracks().flatMap((item) =>
      item.objects.map((object, index) => ({ track: item.key, name: item.id, index, object })),
    ),
  );
  let dialog!: HTMLDialogElement;
  let input!: HTMLInputElement;
  let imageArea!: HTMLDivElement;
  let canvas: SVGSVGElement | undefined;
  let disposed = false;
  let drag: Drag | undefined;

  const showError = (cause: unknown) =>
    setError(cause instanceof Error ? cause.message : String(cause));
  const close = () => {
    if (!saving()) props.onClose();
  };
  const selectTrack = (key: string | undefined) => {
    setTrack(key);
    setSelection(undefined);
  };
  const select = (item: Selection) => {
    setTrack(item.track);
    setSelection(item);
  };
  function editObjects(key: string, change: (objects: VisualizerObject[]) => VisualizerObject[]) {
    const draft = structuredClone(tree());
    const target = draftTracks(draft).find((item) => item.key === key);
    if (!target) return;
    target.objects = change(target.objects);
    setTree(draft);
  }
  function add(object?: VisualizerObject) {
    const target = selectedTrack();
    if (!target || busy() || !image()) return;
    const index = target.objects.length;
    const offset = (index % 8) * 0.025;
    const added = object ?? {
      x: 0.4 + offset,
      y: 0.4 + offset,
      width: 0.12,
      height: 0.06,
      color: color(),
    };
    editObjects(target.key, (objects) => [...objects, { ...added }]);
    select({ track: target.key, index });
  }
  function update(item: Selection, change: Partial<VisualizerObject>) {
    editObjects(item.track, (objects) =>
      objects.map((object, index) =>
        index === item.index ? constrainObject({ ...object, ...change }) : object,
      ),
    );
  }
  function remove() {
    const selected = selection();
    if (!selected || busy()) return;
    editObjects(selected.track, (objects) =>
      objects.filter((_, index) => index !== selected.index),
    );
    setSelection(undefined);
  }
  async function upload(file?: File) {
    if (!file || busy()) return;
    setUploading(true);
    setError('');
    try {
      if (!file.type.startsWith('image/')) throw new Error('Please choose an image file');
      const url = await optimizeBackgroundImage(file);
      if (!disposed) setImage(url);
    } catch (cause) {
      if (!disposed) showError(cause);
    } finally {
      if (!disposed) setUploading(false);
    }
  }
  async function save() {
    if (busy()) return;
    setSaving(true);
    setError('');
    try {
      await props.onSave(saveLayoutDraft(tree(), image()));
      props.onClose();
    } catch (cause) {
      if (!disposed) showError(cause);
    } finally {
      if (!disposed) setSaving(false);
    }
  }
  const editingText = (target: EventTarget | null) =>
    target instanceof Element &&
    !!target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])');
  function copy(event: ClipboardEvent) {
    const object = selectedObject();
    if (
      event.defaultPrevented ||
      busy() ||
      !object ||
      !event.clipboardData ||
      editingText(event.target) ||
      window.getSelection()?.isCollapsed === false
    )
      return;
    event.clipboardData.setData('text/plain', serializeRectangle(object));
    event.preventDefault();
  }
  function paste(event: ClipboardEvent) {
    if (event.defaultPrevented || busy() || !event.clipboardData || editingText(event.target))
      return;
    const file =
      Array.from(event.clipboardData.items)
        .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
        ?.getAsFile() ??
      Array.from(event.clipboardData.files).find((file) => file.type.startsWith('image/'));
    if (file) {
      event.preventDefault();
      void upload(file);
      return;
    }
    const object = readRectangle(event.clipboardData.getData('text/plain'));
    if (!object || !selectedTrack() || !image()) return;
    event.preventDefault();
    add(object);
  }
  function keyDown(event: KeyboardEvent) {
    // File pickers and button blur can leave body focused; never let editor shortcuts reach the timeline.
    event.stopPropagation();
    if (event.defaultPrevented || busy()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (
      (event.key === 'Delete' || event.key === 'Backspace') &&
      !editingText(event.target) &&
      selectedObject()
    ) {
      event.preventDefault();
      remove();
    }
  }
  onMount(() => {
    dialog.showModal();
    const observer = new ResizeObserver(([entry]) =>
      setImageAreaSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(imageArea);
    onCleanup(() => observer.disconnect());
    document.addEventListener('keydown', keyDown);
    document.addEventListener('copy', copy);
    document.addEventListener('paste', paste);
  });
  onCleanup(() => {
    disposed = true;
    document.removeEventListener('keydown', keyDown);
    document.removeEventListener('copy', copy);
    document.removeEventListener('paste', paste);
    dialog.close();
  });
  function startDrag(event: PointerEvent, item: Selection, resize = false) {
    if (busy() || event.button !== 0 || !canvas) return;
    event.preventDefault();
    dialog.focus();
    select(item);
    const bounds = canvas.getBoundingClientRect();
    const object = selectedObject();
    if (!object || !bounds.width || !bounds.height) return;
    drag = {
      ...item,
      pointer: event.pointerId,
      x: event.clientX / bounds.width,
      y: event.clientY / bounds.height,
      original: { ...object },
      resize,
    };
    canvas.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent) {
    if (!drag || drag.pointer !== event.pointerId || !canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const dx = event.clientX / bounds.width - drag.x;
    const dy = event.clientY / bounds.height - drag.y;
    const original = drag.original;
    update(
      drag,
      drag.resize
        ? {
            width: clamp(original.width + dx, 0.005, 1 - original.x),
            height: clamp(original.height + dy, 0.005, 1 - original.y),
          }
        : { x: original.x + dx, y: original.y + dy },
    );
  }
  function endDrag(event: PointerEvent) {
    if (drag?.pointer !== event.pointerId) return;
    drag = undefined;
    if (canvas?.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }

  return (
    <Portal>
      <dialog
        ref={dialog}
        aria-labelledby="layout-editor-title"
        tabIndex={-1}
        class="h-[85dvh] max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-[1400px] rounded-xl border border-zinc-700 bg-zinc-900 p-0 text-zinc-100 shadow-2xl backdrop:bg-black/60 open:flex open:flex-col [&_button:disabled]:cursor-default [&_button:disabled]:opacity-40"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <header class="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div class="flex items-center gap-3">
            <h1 id="layout-editor-title" class="text-lg font-bold">
              Edit layout
            </h1>
            <span class="text-sm text-zinc-400">
              {tracks().length} {tracks().length === 1 ? 'track' : 'tracks'}
            </span>
          </div>
          <button
            type="button"
            aria-label="Close layout editor"
            class="rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-white"
            disabled={saving()}
            onClick={close}
          >
            <Icon path={xMark} class="h-5 w-5" />
          </button>
        </header>
        <div
          class="grid min-h-0 flex-1 grid-cols-[380px_minmax(0,1fr)] overflow-auto max-md:grid-cols-1"
          inert={saving()}
        >
          <LayoutTreeEditor
            tree={tree()}
            createKey={createKey}
            onChange={setTree}
            selectedTrack={selectedTrack()?.key}
            onSelect={selectTrack}
          />
          <section
            aria-label="Layout visuals"
            class="flex min-h-0 flex-col gap-3 p-3 max-md:min-h-[320px]"
          >
            <div class="flex shrink-0 flex-wrap items-center gap-2">
              <input
                ref={input}
                type="file"
                accept="image/*"
                class="hidden"
                aria-label="Upload background image"
                onChange={(event) => {
                  void upload(event.currentTarget.files?.[0]);
                  event.currentTarget.value = '';
                }}
              />
              <button
                type="button"
                class="rounded-lg bg-zinc-700 px-3 py-2 text-sm hover:bg-zinc-600"
                disabled={busy()}
                onClick={() => input.click()}
              >
                {uploading() ? 'Compressing…' : image() ? 'Change image' : 'Add image'}
              </button>
              <button
                type="button"
                class="rounded-lg bg-zinc-700 px-3 py-2 text-sm hover:bg-zinc-600"
                disabled={busy() || !image() || !selectedTrack()}
                onClick={() => add()}
              >
                Add object
              </button>
              <input
                type="color"
                aria-label="Object color"
                title="Object color"
                class="h-9 w-10 cursor-pointer rounded border border-zinc-600 bg-zinc-800 p-1"
                disabled={busy()}
                value={selectedObject()?.color ?? color()}
                onInput={(event) => {
                  const value = event.currentTarget.value;
                  setColor(value);
                  const selected = selection();
                  if (selected && selectedObject()) update(selected, { color: value });
                }}
              />
              <button
                type="button"
                aria-label="Delete object"
                title="Delete object"
                class="rounded-lg p-2 text-zinc-400 hover:bg-zinc-700 hover:text-white"
                disabled={busy() || !selectedObject()}
                onClick={remove}
              >
                <Icon path={trash} class="h-5 w-5" />
              </button>
            </div>
            <div
              ref={imageArea}
              class="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/60 p-3"
            >
              <Show when={image()}>
                <div
                  class="relative m-auto shrink-0"
                  style={{
                    width: `${Math.min(
                      imageAreaSize().width,
                      imageAreaSize().height * imageRatio(),
                    )}px`,
                  }}
                >
                  <img
                    src={image()}
                    alt="Layout background"
                    draggable={false}
                    class="block h-auto w-full select-none"
                    onLoad={(event) =>
                      setImageRatio(
                        event.currentTarget.naturalWidth / event.currentTarget.naturalHeight,
                      )
                    }
                    onError={() => setError('Could not display the background image')}
                  />
                  <svg
                    ref={canvas}
                    viewBox="0 0 1 1"
                    preserveAspectRatio="none"
                    aria-label="Light placement canvas"
                    class="absolute inset-0 h-full w-full touch-none overflow-visible"
                    onPointerDown={(event) => {
                      if (event.target === event.currentTarget) {
                        setSelection(undefined);
                        dialog.focus();
                      }
                    }}
                    onPointerMove={move}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onLostPointerCapture={() => {
                      drag = undefined;
                    }}
                  >
                    <Index each={objects()}>
                      {(item) => (
                        <g>
                          <rect
                            x={item().object.x}
                            y={item().object.y}
                            width={item().object.width}
                            height={item().object.height}
                            fill={item().object.color}
                            fill-opacity={track() === item().track ? 0.8 : 0.4}
                            stroke={isSelected(item()) ? 'white' : item().object.color}
                            stroke-width={isSelected(item()) ? 2 : 1}
                            vector-effect="non-scaling-stroke"
                            class="cursor-move"
                            tabIndex={0}
                            role="button"
                            aria-label={`${item().name}: object ${item().index + 1}`}
                            onFocus={() => select(item())}
                            onPointerDown={(event) => startDrag(event, item())}
                          >
                            <title>
                              {item().name}: object {item().index + 1}
                            </title>
                          </rect>
                          <Show when={isSelected(item())}>
                            <rect
                              x={item().object.x + item().object.width - 0.008}
                              y={item().object.y + item().object.height - 0.008}
                              width="0.016"
                              height="0.016"
                              fill="white"
                              stroke="#18181b"
                              stroke-width="1"
                              vector-effect="non-scaling-stroke"
                              class="cursor-nwse-resize"
                              aria-label="Resize object"
                              onPointerDown={(event) => startDrag(event, item(), true)}
                            />
                          </Show>
                        </g>
                      )}
                    </Index>
                  </svg>
                </div>
              </Show>
            </div>
          </section>
        </div>
        <footer class="flex shrink-0 items-center justify-end gap-3 border-t border-zinc-800 px-4 py-3">
          <Show when={error()}>
            <p role="alert" class="mr-auto text-sm text-rose-400">
              {error()}
            </p>
          </Show>
          <button
            type="button"
            class="rounded-xl border border-zinc-700 px-3 py-2 font-semibold text-zinc-400 hover:bg-zinc-800 hover:text-white"
            disabled={saving()}
            onClick={close}
          >
            Cancel
          </button>
          <GradientButton
            component="button"
            type="button"
            class="rounded-xl px-3 py-2 font-semibold text-black"
            disabled={busy()}
            onClick={() => void save()}
          >
            {saving() ? 'Saving…' : 'Save'}
          </GradientButton>
        </footer>
      </dialog>
    </Portal>
  );
}
