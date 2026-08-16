import { onCleanup, onMount } from 'solid-js';
import './App.css';
import Sidebar from './Sidebar';
import { useTimeline } from './TimelineContext';

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
    <div class="flex min-h-0 flex-1 overflow-hidden">
      <Sidebar />
      <div class="relative min-w-0 flex-1 overflow-hidden" ref={container} />
    </div>
  );
}

export default TimelineCanvas;
