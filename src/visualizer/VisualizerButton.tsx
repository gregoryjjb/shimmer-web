import { createSignal, Show } from 'solid-js';
import { useTimeline } from '../TimelineContext';
import VisualizerEditor from './VisualizerEditor';
import VisualizerPanel from './VisualizerPanel';

export default function VisualizerButton() {
  const ctx = useTimeline();
  const [open, setOpen] = createSignal(false);
  const [showPreview, setShowPreview] = createSignal(false);
  const [revision, setRevision] = createSignal(0);
  const edit = () => {
    ctx.timeline.pause();
    setOpen(true);
  };
  return (
    <>
      <button
        type="button"
        class="rounded-lg bg-zinc-700 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-600 disabled:opacity-50"
        disabled={ctx.loading()}
        onClick={edit}
      >
        Edit visualizer
      </button>
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
          tracks={ctx.projectData().tracks}
          currentTime={ctx.currentTime()}
          playing={ctx.playing()}
          loading={ctx.loading()}
          refreshKey={revision()}
          onClose={() => setShowPreview(false)}
          onEdit={edit}
        />
      </Show>
      <Show when={open()}>
        <VisualizerEditor
          tracks={ctx.projectData().tracks}
          onClose={() => setOpen(false)}
          onSave={() => setRevision((value) => value + 1)}
        />
      </Show>
    </>
  );
}
