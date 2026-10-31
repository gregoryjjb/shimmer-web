import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { BEAT_FLASH_DURATION_SECONDS, BEAT_TRACK_ID } from '../timeline/beat';
import { flattenTracks } from '../timeline/layout';
import { isOn } from '../timeline/timeline-data';
import { DeepReadonly, LayoutNode, Tracks } from '../timeline/types';
import { loadVisualizer } from './storage';
import { clamp, VisualizerConfig } from './types';

export default function VisualizerPanel(props: {
  layout: readonly DeepReadonly<LayoutNode>[];
  tracks: DeepReadonly<Tracks>;
  currentTime: number;
  playing: boolean;
  loading: boolean;
  refreshKey: number;
  onClose: () => void;
  onEdit: () => void;
}) {
  let panel!: HTMLElement;
  let disposed = false;
  let loadVersion = 0;
  let currentURL = '';
  let drag: { pointer: number; x: number; y: number; left: number; top: number } | undefined;
  let resize:
    | {
        pointer: number;
        x: number;
        y: number;
        width: number;
        left: number;
        top: number;
        ratio: number;
        fromLeft: boolean;
      }
    | undefined;
  const [position, setPosition] = createSignal({ x: 16, y: 120 });
  const [width, setWidth] = createSignal(420);
  const [aspectRatio, setAspectRatio] = createSignal<number>();
  const [config, setConfig] = createSignal<VisualizerConfig>(Object.create(null));
  const [imageURL, setImageURL] = createSignal('');
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal('');
  const rows = createMemo(() =>
    flattenTracks(props.layout, props.tracks).filter((row) => row.type === 'track'),
  );

  const constrainPosition = (x: number, y: number) => {
    const bounds = panel.getBoundingClientRect();
    setPosition({
      x: clamp(x, 8, Math.max(8, window.innerWidth - bounds.width - 8)),
      y: clamp(y, 8, Math.max(8, window.innerHeight - bounds.height - 8)),
    });
  };
  function fitWidth(
    requested: number,
    availableWidth: number,
    availableHeight: number,
    ratio: number,
  ) {
    // Only the border adds to the image's proportional dimensions.
    const maximum = Math.max(1, Math.min(availableWidth, (availableHeight - 2) * ratio + 2));
    return clamp(requested, Math.min(240, maximum), maximum);
  }

  const keepInView = () => {
    const ratio = aspectRatio();
    if (ratio) setWidth(fitWidth(width(), window.innerWidth - 16, window.innerHeight - 16, ratio));
    constrainPosition(position().x, position().y);
  };

  async function load() {
    const version = ++loadVersion;
    setLoading(true);
    setError('');
    try {
      const saved = await loadVisualizer();
      if (disposed || version !== loadVersion) return;
      const url = saved.image ? URL.createObjectURL(saved.image) : '';
      if (currentURL) URL.revokeObjectURL(currentURL);
      currentURL = url;
      setAspectRatio(undefined);
      setConfig(saved.config);
      setImageURL(url);
    } catch (cause) {
      if (!disposed && version === loadVersion) {
        setError(cause instanceof Error ? cause.message : 'Could not load the visualizer.');
      }
    } finally {
      if (!disposed && version === loadVersion) setLoading(false);
    }
  }

  createEffect(() => {
    props.refreshKey;
    void load();
  });

  onMount(() => {
    constrainPosition(window.innerWidth - panel.getBoundingClientRect().width - 16, 120);
    window.addEventListener('resize', keepInView);
    const observer = new ResizeObserver(keepInView);
    observer.observe(panel);
    onCleanup(() => {
      observer.disconnect();
      window.removeEventListener('resize', keepInView);
    });
  });
  onCleanup(() => {
    disposed = true;
    if (currentURL) URL.revokeObjectURL(currentURL);
  });

  function startDrag(event: PointerEvent & { currentTarget: HTMLElement }) {
    if (event.button !== 0 || (event.target as Element).closest('button')) return;
    event.preventDefault();
    drag = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: position().x,
      top: position().y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent) {
    if (!drag || drag.pointer !== event.pointerId) return;
    constrainPosition(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y);
  }

  function endDrag(event: PointerEvent & { currentTarget: HTMLElement }) {
    if (drag?.pointer !== event.pointerId) return;
    drag = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function resizeTo(
    requested: number,
    left: number,
    top: number,
    originalWidth: number,
    ratio: number,
    fromLeft: boolean,
  ) {
    const availableWidth = fromLeft ? left + originalWidth - 8 : window.innerWidth - left - 8;
    const nextWidth = fitWidth(requested, availableWidth, window.innerHeight - top - 8, ratio);
    setWidth(nextWidth);
    setPosition({ x: fromLeft ? left + originalWidth - nextWidth : left, y: top });
  }

  function startResize(event: PointerEvent & { currentTarget: HTMLElement }, fromLeft: boolean) {
    const ratio = aspectRatio();
    if (event.button !== 0 || !ratio) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = panel.getBoundingClientRect();
    resize = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      width: bounds.width,
      left: bounds.left,
      top: bounds.top,
      ratio,
      fromLeft,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveResize(event: PointerEvent) {
    if (!resize || event.pointerId !== resize.pointer) return;
    const dx = (event.clientX - resize.x) * (resize.fromLeft ? -1 : 1);
    const dy = event.clientY - resize.y;
    // Project both pointer axes onto the image's aspect-ratio diagonal.
    const delta = (dx + dy / resize.ratio) / (1 + 1 / resize.ratio ** 2);
    resizeTo(
      resize.width + delta,
      resize.left,
      resize.top,
      resize.width,
      resize.ratio,
      resize.fromLeft,
    );
  }

  function endResize(event: PointerEvent & { currentTarget: HTMLElement }) {
    if (resize?.pointer !== event.pointerId) return;
    resize = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function resizeWithKeyboard(event: KeyboardEvent, fromLeft: boolean) {
    const ratio = aspectRatio();
    if (!ratio || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const grow = event.key === 'ArrowDown' || event.key === (fromLeft ? 'ArrowLeft' : 'ArrowRight');
    const bounds = panel.getBoundingClientRect();
    resizeTo(
      bounds.width + (grow ? 20 : -20),
      bounds.left,
      bounds.top,
      bounds.width,
      ratio,
      fromLeft,
    );
  }

  return (
    <Portal>
      <section
        ref={panel}
        aria-label="Live visualizer"
        class="fixed left-[var(--panel-x)] top-[var(--panel-y)] z-20 flex max-h-[calc(100dvh-16px)] w-[var(--panel-width)] max-w-[calc(100vw-16px)] cursor-move touch-none flex-col overflow-hidden rounded-xl border border-zinc-600 bg-zinc-900 text-zinc-100 shadow-2xl"
        style={{
          '--panel-x': `${position().x}px`,
          '--panel-y': `${position().y}px`,
          '--panel-width': `${width()}px`,
        }}
        onPointerDown={startDrag}
        onPointerMove={move}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={() => {
          drag = undefined;
        }}
      >
        <div
          role="group"
          aria-label="Visualizer controls"
          class="absolute right-1 top-1 z-10 flex select-none items-center gap-1"
        >
          <Show when={imageURL()}>
            <button
              type="button"
              aria-label="Edit visualizer configuration"
              class="rounded bg-zinc-900/80 px-2 py-1 text-xs hover:bg-zinc-700 disabled:opacity-50"
              disabled={props.loading}
              onClick={props.onEdit}
            >
              Edit
            </button>
          </Show>
          <button
            type="button"
            aria-label="Close visualizer panel"
            class="rounded bg-zinc-900/80 px-2 py-1 hover:bg-zinc-700"
            onClick={props.onClose}
          >
            ✕
          </button>
        </div>
        <div class="min-h-0 overflow-auto">
          <Show
            when={!loading()}
            fallback={
              <p class="py-8 text-center text-sm text-zinc-400" role="status">
                Loading visualizer…
              </p>
            }
          >
            <Show
              when={!error()}
              fallback={
                <div class="space-y-3 pt-10 text-sm">
                  <p role="alert" class="text-red-300">
                    {error()}
                  </p>
                  <button
                    type="button"
                    class="rounded bg-zinc-700 px-3 py-2 hover:bg-zinc-600"
                    onClick={() => void load()}
                  >
                    Retry loading
                  </button>
                </div>
              }
            >
              <Show
                when={imageURL()}
                fallback={
                  <div class="space-y-3 px-6 pb-6 pt-10 text-center text-sm text-zinc-400">
                    <p>Upload a house photo and save your light layout to preview the show.</p>
                    <button
                      type="button"
                      class="rounded bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-700 disabled:opacity-50"
                      disabled={props.loading}
                      onClick={props.onEdit}
                    >
                      Set up visualizer
                    </button>
                  </div>
                }
              >
                <div class="relative w-full">
                  <img
                    src={imageURL()}
                    alt="House with live show lights"
                    draggable={false}
                    class="block h-auto w-full select-none rounded"
                    onLoad={(event) => {
                      const image = event.currentTarget;
                      if (image.naturalWidth && image.naturalHeight) {
                        setAspectRatio(image.naturalWidth / image.naturalHeight);
                        keepInView();
                      }
                    }}
                    onError={() => setError('The saved house image could not be displayed.')}
                  />
                  <svg
                    viewBox="0 0 1 1"
                    preserveAspectRatio="none"
                    aria-label="Live lights"
                    class="pointer-events-none absolute inset-0 h-full w-full"
                  >
                    <For each={rows()}>
                      {(row) => {
                        const active = createMemo(
                          () =>
                            !props.loading &&
                            row.keyframes !== undefined &&
                            isOn(
                              row.keyframes,
                              props.currentTime,
                              row.id === BEAT_TRACK_ID ? BEAT_FLASH_DURATION_SECONDS : undefined,
                            ),
                        );
                        return (
                          <Show when={active()}>
                            <For each={config()[row.id] ?? []}>
                              {(object) => (
                                <rect
                                  data-track={row.id}
                                  x={object.x}
                                  y={object.y}
                                  width={object.width}
                                  height={object.height}
                                  fill={object.color}
                                >
                                  <title>{row.id}</title>
                                </rect>
                              )}
                            </For>
                          </Show>
                        );
                      }}
                    </For>
                  </svg>
                </div>
              </Show>
            </Show>
          </Show>
        </div>
        <Show when={aspectRatio() && !loading() && !error()}>
          <For each={['left', 'right'] as const}>
            {(corner) => (
              <button
                type="button"
                aria-label={`Resize visualizer from bottom ${corner}`}
                title="Drag to resize. Arrow keys also resize; image proportions stay locked."
                class="absolute bottom-0 h-6 w-6 touch-none select-none bg-transparent focus-visible:outline-offset-[-3px]"
                classList={{
                  'left-0 cursor-nesw-resize': corner === 'left',
                  'right-0 cursor-nwse-resize': corner === 'right',
                }}
                onPointerDown={(event) => startResize(event, corner === 'left')}
                onPointerMove={moveResize}
                onPointerUp={endResize}
                onPointerCancel={endResize}
                onLostPointerCapture={() => {
                  resize = undefined;
                }}
                onKeyDown={(event) => resizeWithKeyboard(event, corner === 'left')}
              />
            )}
          </For>
        </Show>
      </section>
    </Portal>
  );
}
