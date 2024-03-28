import {
  ParentComponent,
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  useContext,
} from 'solid-js';
import { createStoredSignal } from './hooks/createStorageSignal';
import { LocalPersistence, localPersistence } from './timeline/persistence';
import Timeline from './timeline/timeline';

const makeTimelineContext = () => {
  const timeline = new Timeline();

  const [loading, setLoading] = createSignal(false);
  timeline.on('loading', (l) => setLoading(l));

  const [playing, setPlaying] = createSignal(false);
  timeline.on('play', () => setPlaying(true));
  timeline.on('pause', () => setPlaying(false));

  const [volume, setVolume] = createStoredSignal('volume', 0.5);
  createEffect(() => {
    timeline.executeWithArgs('setVolume', volume());
  });

  const [selectedCount, setSelectedCount] = createSignal(0);
  timeline.on('selected', (n) => setSelectedCount(n));

  const [prompt, setPrompt] = createSignal('');
  timeline.on('render', () => setPrompt(timeline.getPrompt()));

  const [projectName, setProjectName] = createStoredSignal('projectName', '');

  timeline.on('autosave', (data) => localPersistence.saveData(data));

  onMount(() => {
    console.log('MOUNT');
    LocalPersistence.loadExisting().then((lp) => {
      if (lp) {
        console.log('Loading local data');

        timeline.load({
          name: 'What',
          audio: lp.get('audio'),
          data: { tracks: JSON.parse(lp.get('tracks')) },
        });
      } else {
        console.log('No data found locally');
      }
    });
  });

  onCleanup(() => {
    timeline.destroy();
  });

  const value = {
    timeline,
    loading,
    playing,
    volume,
    setVolume,
    selectedCount,
    prompt,
    projectName,
    setProjectName,
  };

  return value;
};

type TimelineContextValue = ReturnType<typeof makeTimelineContext>;

const TimelineContext = createContext<TimelineContextValue>();

export const TimelineProvider: ParentComponent = (props) => {
  return (
    <TimelineContext.Provider value={makeTimelineContext()}>
      {props.children}
    </TimelineContext.Provider>
  );
};

export const useTimeline = () => {
  const c = useContext(TimelineContext);
  if (!c) {
    throw new Error('Must call useTimeline under a TimelineProvider');
  }
  return c;
};
