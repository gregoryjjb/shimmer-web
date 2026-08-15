import { onCleanup, onMount } from 'solid-js';
import './App.css';
import Editor from './Editor';
import { TimelineProvider } from './TimelineContext';

function App() {
  // All this event handler stuff lets us unfocus button and other input
  // elements after clicking them, so that spacebar still activates playback
  let pointerSelect: HTMLSelectElement | undefined;

  const elementTarget = (event: Event) => {
    return event.target instanceof Element ? event.target : undefined;
  };

  const handlePointerDown = (event: PointerEvent) => {
    pointerSelect = elementTarget(event)?.closest('select') ?? undefined;
  };

  const handlePointerUp = (event: PointerEvent) => {
    elementTarget(event)?.closest<HTMLElement>('button, input[type="range"]')?.blur();
  };

  const handleChange = (event: Event) => {
    const select = elementTarget(event)?.closest('select');
    if (!select || select !== pointerSelect) return;

    select.blur();
    pointerSelect = undefined;
  };

  onMount(() => {
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('change', handleChange);
  });

  onCleanup(() => {
    document.removeEventListener('pointerdown', handlePointerDown);
    document.removeEventListener('pointerup', handlePointerUp);
    document.removeEventListener('change', handleChange);
  });

  return (
    <TimelineProvider>
      <Editor />
    </TimelineProvider>
  );
}

export default App;
