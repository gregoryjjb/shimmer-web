import { createSignal, Show } from 'solid-js';
import { useTimeline } from '../TimelineContext';
import VisualizerEditor from './VisualizerEditor';
import VisualizerPanel from './VisualizerPanel';
import { createStoredSignal } from '../hooks/createStorageSignal';

export default function VisualizerButton() {
  const ctx = useTimeline();
  const [open, setOpen] = createSignal(false);
  const [showPreview, setShowPreview] = createStoredSignal('shimmer.visualizer.visible', false);
  const edit = () => {
    ctx.timeline.pause();
    setOpen(true);
  };
  return (
    <>
      <button
        type="button"
        class="rounded-lg bg-zinc-700 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-600 disabled:opacity-50"
        aria-pressed={showPreview()}
        disabled={ctx.loading()}
        onClick={() => setShowPreview((visible) => !visible)}
      >
        {showPreview() ? 'Hide visualizer' : 'Show visualizer'}
      </button>
      <Show when={showPreview()}>
        <VisualizerPanel
          layout={ctx.trackLayout()}
          tracks={ctx.projectData().tracks}
          currentTime={ctx.currentTime()}
          playing={ctx.playing()}
          loading={ctx.loading()}
          visuals={ctx.layout.document().visuals}
          layoutLoading={ctx.layout.loading()}
          layoutError={ctx.layout.error()}
          onClose={() => setShowPreview(false)}
          onEdit={edit}
        />
      </Show>
      <Show when={open()}>
        <VisualizerEditor
          layout={ctx.trackLayout()}
          onClose={() => setOpen(false)}
          visuals={ctx.layout.document().visuals}
          onSave={ctx.layout.updateVisuals}
        />
      </Show>
    </>
  );
}
