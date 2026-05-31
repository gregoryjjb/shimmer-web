import { onCleanup, onMount } from 'solid-js';
import './App.css';
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

  return <div class="min-h-0 flex-1" ref={container} />;
}

export default TimelineCanvas;
