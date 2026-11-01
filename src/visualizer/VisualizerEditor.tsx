import { createMemo, createSignal, For, Index, onCleanup, onMount, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { flattenTracks } from '../timeline/layout';
import { DeepReadonly, LayoutNode } from '../timeline/types';
import { readRectangle, serializeRectangle } from './clipboard';
import { optimizeBackgroundImage } from './background-image';
import { LayoutVisuals } from '../layout/document';
import { clamp, constrainObject, parseConfig, VisualizerConfig, VisualizerObject } from './types';

type Selection = { track: string; index: number };
type Drag = Selection & {
  pointer: number;
  startX: number;
  startY: number;
  original: VisualizerObject;
  resize: boolean;
};

export default function VisualizerEditor(props: {
  layout: readonly DeepReadonly<LayoutNode>[];
  onClose: () => void;
  visuals: DeepReadonly<LayoutVisuals>;
  onSave: (visuals: LayoutVisuals) => Promise<void>;
}) {
  let dialog!: HTMLDialogElement;
  let canvas: SVGSVGElement | undefined;
  let disposed = false;
  let uploadVersion = 0;
  let drag: Drag | undefined;
  const rows = createMemo(() => flattenTracks(props.layout));
  const [config, setConfig] = createSignal<VisualizerConfig>(Object.create(null));
  const [track, setTrack] = createSignal<string>();
  const [selection, setSelection] = createSignal<Selection>();
  const [imageURL, setImageURL] = createSignal('');
  const [color, setColor] = createSignal('#facc15');
  const [loading, setLoading] = createSignal(true);
  const [uploading, setUploading] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [loadFailed, setLoadFailed] = createSignal(false);
  const [error, setError] = createSignal('');
  const [clipboardMessage, setClipboardMessage] = createSignal('');
  const busy = () => loading() || uploading() || saving() || loadFailed();
  const objects = createMemo(() =>
    rows()
      .filter((row) => row.type === 'track')
      .flatMap((row) =>
        (config()[row.id] ?? []).map((object, index) => ({ track: row.id, index, object })),
      ),
  );
  const selectedObject = () => {
    const selected = selection();
    return selected && config()[selected.track]?.[selected.index];
  };
  const isSelected = (item: Selection) =>
    selection()?.track === item.track && selection()?.index === item.index;

  const close = () => {
    if (!saving()) props.onClose();
  };
  const showError = (cause: unknown) =>
    setError(cause instanceof Error ? cause.message : 'Something went wrong. Please try again.');

  async function displayImage(url: string) {
    const preview = new Image();
    preview.src = url;
    try {
      await preview.decode();
      return url;
    } catch {
      throw new Error('This image could not be opened. Try a PNG, JPEG, or WebP image.');
    }
  }

  async function load() {
    setLoading(true);
    setLoadFailed(false);
    setError('');
    try {
      const saved = props.visuals;
      const url = saved.backgroundImage ? await displayImage(saved.backgroundImage) : '';
      if (disposed) return;
      setConfig(parseConfig(JSON.stringify(saved.trackObjects)));
      setImageURL(url);
      setTrack(rows().find((row) => row.type === 'track')?.id);
    } catch (cause) {
      if (!disposed) {
        setLoadFailed(true);
        showError(cause);
      }
    } finally {
      if (!disposed) setLoading(false);
    }
  }

  onMount(() => {
    dialog.showModal();
    // File pickers and the app's button-blur behavior can move focus to body.
    // Stop keyboard events before they reach the timeline's window listeners.
    const stopKeys = (event: KeyboardEvent) => event.stopPropagation();
    document.addEventListener('keydown', stopKeys);
    document.addEventListener('copy', copyRectangle);
    document.addEventListener('paste', pasteClipboard);
    onCleanup(() => {
      document.removeEventListener('keydown', stopKeys);
      document.removeEventListener('copy', copyRectangle);
      document.removeEventListener('paste', pasteClipboard);
    });
    void load();
  });
  onCleanup(() => {
    disposed = true;
    dialog.close();
  });

  function isEditingText(target: EventTarget | null) {
    return (
      target instanceof Element &&
      !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
    );
  }

  function copyRectangle(event: ClipboardEvent) {
    const object = selectedObject();
    if (
      event.defaultPrevented ||
      busy() ||
      !object ||
      !event.clipboardData ||
      isEditingText(event.target) ||
      window.getSelection()?.isCollapsed === false
    )
      return;
    event.clipboardData.setData('text/plain', serializeRectangle(object));
    event.preventDefault();
    setClipboardMessage('Rectangle copied. Select a track and paste.');
  }

  function pasteClipboard(event: ClipboardEvent) {
    if (event.defaultPrevented || busy() || !event.clipboardData) return;
    const file =
      Array.from(event.clipboardData.items)
        .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
        ?.getAsFile() ??
      Array.from(event.clipboardData.files).find((item) => item.type.startsWith('image/'));
    if (file) {
      event.preventDefault();
      setClipboardMessage('');
      void upload(file);
      return;
    }
    if (isEditingText(event.target) || !imageURL()) return;
    const name = track();
    if (name === undefined || !rows().some((row) => row.type === 'track' && row.id === name))
      return;
    const object = readRectangle(event.clipboardData.getData('text/plain'));
    if (!object) return;
    event.preventDefault();
    const index = config()[name]?.length ?? 0;
    setConfig((previous) =>
      Object.assign(Object.create(null), {
        ...previous,
        [name]: [...(previous[name] ?? []), object],
      }),
    );
    select({ track: name, index });
    setClipboardMessage(`Rectangle pasted into ${name}.`);
  }

  async function upload(file?: File) {
    if (!file || busy()) return;
    const version = ++uploadVersion;
    setUploading(true);
    setError('');
    try {
      if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
      const url = await displayImage(await optimizeBackgroundImage(file));
      if (disposed || version !== uploadVersion) {
        return;
      }
      setImageURL(url);
    } catch (cause) {
      if (!disposed && version === uploadVersion) showError(cause);
    } finally {
      if (!disposed && version === uploadVersion) setUploading(false);
    }
  }

  function select(item: Selection) {
    setTrack(item.track);
    setSelection(item);
  }

  function update(item: Selection, change: Partial<VisualizerObject>) {
    setConfig((previous) =>
      Object.assign(Object.create(null), {
        ...previous,
        [item.track]: previous[item.track].map((object, index) =>
          index === item.index ? constrainObject({ ...object, ...change }) : object,
        ),
      }),
    );
  }

  function add() {
    const name = track();
    if (name === undefined || busy() || !imageURL()) return;
    const previous = config()[name] ?? [];
    const offset = (previous.length % 8) * 0.025;
    setConfig((value) =>
      Object.assign(Object.create(null), {
        ...value,
        [name]: [
          ...previous,
          {
            x: 0.4 + offset,
            y: 0.4 + offset,
            width: 0.12,
            height: 0.06,
            color: color(),
          },
        ],
      }),
    );
    select({ track: name, index: previous.length });
  }

  function duplicate() {
    const selected = selection();
    const original = selectedObject();
    if (!selected || !original || busy()) return;
    const offset = (position: number, size: number) =>
      clamp(position + (position + size + 0.025 <= 1 ? 0.025 : -0.025), 0, 1 - size);
    const copy = {
      ...original,
      x: offset(original.x, original.width),
      y: offset(original.y, original.height),
    };
    const index = config()[selected.track].length;
    setConfig((previous) =>
      Object.assign(Object.create(null), {
        ...previous,
        [selected.track]: [...previous[selected.track], copy],
      }),
    );
    select({ track: selected.track, index });
  }

  function remove() {
    const selected = selection();
    if (!selected || busy()) return;
    setConfig((previous) =>
      Object.assign(Object.create(null), {
        ...previous,
        [selected.track]: previous[selected.track].filter((_, index) => index !== selected.index),
      }),
    );
    setSelection(undefined);
  }

  function startDrag(event: PointerEvent, item: Selection, resize = false) {
    if (busy() || event.button !== 0 || !canvas) return;
    event.preventDefault();
    dialog.focus();
    select(item);
    const bounds = canvas.getBoundingClientRect();
    drag = {
      ...item,
      pointer: event.pointerId,
      resize,
      startX: (event.clientX - bounds.left) / bounds.width,
      startY: (event.clientY - bounds.top) / bounds.height,
      original: { ...config()[item.track][item.index] },
    };
    canvas.setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointer || !canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const dx = (event.clientX - bounds.left) / bounds.width - drag.startX;
    const dy = (event.clientY - bounds.top) / bounds.height - drag.startY;
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

  async function save() {
    const backgroundImage = imageURL();
    if (!backgroundImage || busy()) return;
    setSaving(true);
    setError('');
    try {
      await props.onSave({ trackObjects: config(), backgroundImage });
      props.onClose();
    } catch (cause) {
      showError(cause);
    } finally {
      if (!disposed) setSaving(false);
    }
  }

  return (
    <Portal>
      <dialog
        ref={dialog}
        class="max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-[1200px] rounded-2xl border border-zinc-700 bg-zinc-900 p-0 text-zinc-100 shadow-[0_24px_80px_#0008] backdrop:bg-zinc-950/80 open:flex open:flex-col [&_button:disabled]:cursor-default [&_button:disabled]:opacity-[0.45]"
        tabIndex={-1}
        aria-labelledby="visualizer-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <header class="flex items-center justify-between gap-3 border-b border-zinc-700 px-5 py-4 max-[700px]:p-3">
          <div>
            <h1 id="visualizer-title" class="text-xl font-semibold">
              Edit visualizer
            </h1>
            <p class="mt-1 text-sm text-zinc-400">Map your lights onto a photo of your house.</p>
          </div>
          <button
            class="relative whitespace-nowrap rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-[13px] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-500 hover:bg-zinc-700"
            aria-label="Close visualizer"
            disabled={saving()}
            onClick={close}
          >
            ✕
          </button>
        </header>
        <Show when={error()}>
          <div role="alert" class="mx-5 mt-3 rounded-lg bg-red-950 p-3 text-sm text-red-200">
            {error()}
            <Show when={loadFailed()}>
              <button
                class="relative ml-3 whitespace-nowrap rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-[13px] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-500 hover:bg-zinc-700"
                onClick={() => void load()}
              >
                Retry loading
              </button>
            </Show>
          </div>
        </Show>
        <div class="flex min-h-0 overflow-auto" aria-busy={loading() || uploading() || saving()}>
          <aside
            class="shrink-0 grow-0 basis-[220px] overflow-auto border-r border-zinc-700 px-3 py-5 max-[700px]:basis-[150px] max-[700px]:px-1.5 max-[700px]:py-3"
            aria-label="Visualizer tracks"
          >
            <h2 class="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Tracks
            </h2>
            <div class="max-h-[38vh] overflow-auto">
              <For
                each={rows()}
                fallback={<p class="text-sm text-zinc-400">Open a show to add tracks.</p>}
              >
                {(row) => (
                  <Show
                    when={row.type === 'track'}
                    fallback={
                      <div
                        class="py-2 pl-[var(--track-indent)] text-xs font-semibold text-zinc-400 [overflow-wrap:anywhere]"
                        style={{ '--track-indent': `${8 + row.depth * 14}px` }}
                      >
                        {row.id}
                      </div>
                    }
                  >
                    <button
                      class="flex w-full items-center justify-between gap-2 rounded-md py-2 pl-[var(--track-indent)] pr-2 text-left text-[13px] hover:bg-zinc-800 aria-pressed:bg-indigo-700 aria-pressed:text-white aria-pressed:hover:bg-indigo-700"
                      style={{ '--track-indent': `${8 + row.depth * 14}px` }}
                      disabled={busy()}
                      aria-pressed={track() === row.id}
                      title={row.id}
                      onClick={() => {
                        setTrack(row.id);
                        setSelection(undefined);
                      }}
                    >
                      <span class="truncate">{row.id}</span>
                      <span class="text-xs text-zinc-400">{config()[row.id]?.length ?? 0}</span>
                    </button>
                  </Show>
                )}
              </For>
            </div>
            <div class="mt-4 border-t border-zinc-700 pt-4">
              <h2 class="mb-2 text-sm font-semibold">Objects on this track</h2>
              <div class="max-h-[18vh] overflow-auto">
                <For
                  each={config()[track() ?? ''] ?? []}
                  fallback={<p class="text-xs text-zinc-400">No rectangles yet.</p>}
                >
                  {(object, index) => (
                    <button
                      class="flex w-full items-center justify-between gap-2 rounded-md p-2 text-left text-[13px] hover:bg-zinc-800 aria-pressed:bg-indigo-700 aria-pressed:text-white aria-pressed:hover:bg-indigo-700"
                      disabled={busy()}
                      aria-pressed={isSelected({ track: track()!, index: index() })}
                      onClick={() => select({ track: track()!, index: index() })}
                    >
                      <span class="flex items-center gap-2">
                        <span
                          class="h-3 w-3 rounded-sm bg-[var(--object-color)]"
                          style={{ '--object-color': object.color }}
                        />
                        Rectangle {index() + 1}
                      </span>
                    </button>
                  )}
                </For>
              </div>
            </div>
          </aside>
          <main class="flex min-w-0 flex-1 flex-col gap-3.5 overflow-auto p-5 max-[700px]:p-3">
            <div class="flex flex-wrap items-center gap-3">
              <label class="relative cursor-pointer whitespace-nowrap rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-[13px] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-500 hover:bg-zinc-700 [&:has(input:disabled)]:cursor-default [&:has(input:disabled)]:opacity-[0.45]">
                {imageURL() ? 'Replace image' : 'Upload house image'}
                <input
                  class="absolute inset-0 w-full cursor-pointer opacity-0"
                  type="file"
                  accept="image/*"
                  aria-label="Upload house image"
                  disabled={busy()}
                  onChange={(event) => {
                    void upload(event.currentTarget.files?.[0]);
                    event.currentTarget.value = '';
                  }}
                />
              </label>
              <span class="text-xs text-zinc-400">Or paste an image with Ctrl+V / ⌘V</span>
              <button
                class="relative whitespace-nowrap rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-[13px] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-500 hover:bg-zinc-700"
                disabled={busy() || !imageURL() || track() === undefined}
                onClick={add}
              >
                + Add rectangle
              </button>
              <span class="text-xs text-zinc-400" role="status">
                {loading()
                  ? 'Loading visualizer…'
                  : uploading()
                    ? 'Opening image…'
                    : `${objects().length} ${objects().length === 1 ? 'object' : 'objects'}`}
                {clipboardMessage() && ` · ${clipboardMessage()}`}
              </span>
            </div>
            <div class="flex min-h-[180px] flex-[1_0_auto] items-center justify-center rounded-[10px] border border-zinc-700 bg-zinc-950 p-3">
              <Show
                when={imageURL()}
                fallback={
                  <div class="flex flex-col items-center gap-3 px-5 py-[65px] text-center text-[13px] text-zinc-400">
                    <span class="text-4xl" aria-hidden="true">
                      ⌂
                    </span>
                    <p class="text-lg text-zinc-200">Start with your house</p>
                    <p>Upload or paste a photo to begin placing your lights.</p>
                  </div>
                }
              >
                <div class="relative m-auto w-fit max-w-full">
                  <img
                    class="block h-auto max-h-[48vh] w-auto max-w-full select-none"
                    src={imageURL()}
                    alt="House used as the background for light placement"
                    draggable={false}
                  />
                  <svg
                    class="absolute inset-0 h-full w-full touch-none overflow-visible"
                    ref={canvas}
                    viewBox="0 0 1 1"
                    preserveAspectRatio="none"
                    aria-label="Light placement canvas"
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
                            onPointerDown={(event) => startDrag(event, item())}
                          >
                            <title>
                              {item().track}: rectangle {item().index + 1}
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
                              onPointerDown={(event) => startDrag(event, item(), true)}
                            >
                              <title>Resize rectangle</title>
                            </rect>
                          </Show>
                        </g>
                      )}
                    </Index>
                  </svg>
                </div>
              </Show>
            </div>
            <fieldset class="flex flex-wrap items-end gap-3" disabled={busy()}>
              <label class="flex flex-col gap-1.5 text-xs text-zinc-400">
                Color
                <input
                  class="h-[34px] w-[52px] rounded-md border border-zinc-600 bg-zinc-800 p-[3px] text-white"
                  type="color"
                  aria-label="Rectangle color"
                  value={selectedObject()?.color ?? color()}
                  onInput={(event) => {
                    setColor(event.currentTarget.value);
                    const selected = selection();
                    if (selected) update(selected, { color: event.currentTarget.value });
                  }}
                />
              </label>
              <Show when={selectedObject()}>
                <For each={['x', 'y', 'width', 'height'] as const}>
                  {(key) => (
                    <label class="flex flex-col gap-1.5 text-xs text-zinc-400">
                      {{ x: 'X', y: 'Y', width: 'Width', height: 'Height' }[key]} (%)
                      <input
                        class="h-[34px] w-[76px] rounded-md border border-zinc-600 bg-zinc-800 px-1.5 py-1 text-white"
                        type="number"
                        min={key === 'x' || key === 'y' ? 0 : 0.5}
                        max="100"
                        step="0.5"
                        value={Math.round((selectedObject()?.[key] ?? 0) * 10000) / 100}
                        onChange={(event) => {
                          const value = event.currentTarget.valueAsNumber;
                          const selected = selection();
                          if (selected && Number.isFinite(value))
                            update(selected, { [key]: value / 100 });
                          event.currentTarget.value = String(
                            Math.round((selectedObject()?.[key] ?? 0) * 10000) / 100,
                          );
                        }}
                      />
                    </label>
                  )}
                </For>
                <button
                  class="relative self-end whitespace-nowrap rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-[13px] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-500 hover:bg-zinc-700"
                  onClick={duplicate}
                >
                  Duplicate
                </button>
                <button
                  class="relative self-end whitespace-nowrap rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-[13px] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-500 hover:bg-zinc-700"
                  onClick={remove}
                >
                  Delete
                </button>
              </Show>
            </fieldset>
          </main>
        </div>
        <footer class="flex flex-wrap items-center gap-3 border-t border-zinc-700 px-5 py-4 max-[700px]:p-3">
          <button
            class="relative whitespace-nowrap rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-[13px] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-500 hover:bg-zinc-700"
            disabled={saving()}
            onClick={close}
          >
            Cancel
          </button>
          <button
            class="relative whitespace-nowrap rounded-lg border border-indigo-500 bg-indigo-600 px-3 py-2 text-[13px] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-500 hover:bg-indigo-700"
            disabled={busy() || !imageURL()}
            onClick={() => void save()}
          >
            {saving() ? 'Saving…' : 'Save and close'}
          </button>
        </footer>
      </dialog>
    </Portal>
  );
}
