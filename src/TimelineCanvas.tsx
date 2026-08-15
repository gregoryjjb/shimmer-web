import { onCleanup, onMount } from 'solid-js';
import './App.css';
import { useTimeline } from './TimelineContext';
import TrackTree from './TrackTree';

function TimelineCanvas() {
  const ctx = useTimeline();
  let container!: HTMLDivElement;

  onMount(() => {
    ctx.timeline.attach(container);
  });

  onCleanup(() => {
    ctx.timeline.detach();
  });

  return (
    <div class="relative min-h-0 flex-1 overflow-hidden" ref={container}>
      <TrackTree />
    </div>
  );
}

export default TimelineCanvas;
