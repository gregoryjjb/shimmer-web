/* @refresh reload */
import {
  ParentComponent,
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  useContext,
} from 'solid-js';
import { createBeatAnalysis, essentiaBeatAnalyzer } from './beat-analysis';
import { createStoredSignal } from './hooks/createStorageSignal';
import { OpenedProject, Persistor } from './timeline/persist';
import { LocalPersistor } from './timeline/persist/local';
import Timeline from './timeline/timeline';
import { DeepReadonly, Project, ProjectData } from './timeline/types';
import { GomasPersistor } from './timeline/persist/gomas';
import { validateLayoutTracks } from './timeline/layout';
import { createLayoutState } from './layout/state';

const makeTimelineContext = () => {
  const timeline = new Timeline();
  const layout = createLayoutState(timeline.setLayout, (tree) =>
    validateLayoutTracks(tree, timeline.projectData.tracks),
  );
  const [storedCollapsedGroups, storeCollapsedGroups] = createStoredSignal<readonly string[]>(
    'shimmer.layout.collapsedGroups',
    [],
  );
  void layout.ready.then(() => timeline.setCollapsedGroups(storedCollapsedGroups()));
  timeline.on('collapsedGroupsChanged', storeCollapsedGroups);
  const [visibleRows, setVisibleRows] = createSignal(timeline.visibleRows);
  timeline.on('collapsedGroupsChanged', () => setVisibleRows(timeline.visibleRows));
  timeline.on('dataChanged', () => setVisibleRows(timeline.visibleRows));
  timeline.on('layoutChanged', () => setVisibleRows(timeline.visibleRows));
  const beatAnalysis = createBeatAnalysis({
    analyzer: essentiaBeatAnalyzer,
    readAudio: () => {
      const buffer = timeline.getAudioBuffer();
      if (!buffer) throw new Error(`Can't analyze beats without audio`);

      return {
        samples: new Float32Array(buffer.getChannelData(0)),
        sampleRate: buffer.sampleRate,
      };
    },
    applyBeats: timeline.replaceBeats,
  });

  const [projectData, setProjectData] = createSignal<DeepReadonly<ProjectData>>(
    timeline.projectData,
    { equals: false },
  );
  timeline.on('dataChanged', (data) => setProjectData(data));
  const [trackLayout, setTrackLayout] = createSignal(timeline.trackLayout);
  timeline.on('dataChanged', () => setTrackLayout(timeline.trackLayout));
  timeline.on('layoutChanged', () => setTrackLayout(timeline.trackLayout));
  const [loadError, setLoadError] = createSignal('');

  const [pan, setPan] = createSignal(timeline.pan);
  timeline.on('pan', setPan);

  const [loading, setLoading] = createSignal(false);
  timeline.on('loading', (l) => {
    if (l) beatAnalysis.cancel();
    setLoading(l);
  });

  const [playing, setPlaying] = createSignal(false);
  timeline.on('play', () => setPlaying(true));
  timeline.on('pause', () => setPlaying(false));

  const [volume, setVolume] = createStoredSignal('volume', 0.5);
  createEffect(() => {
    timeline.executeWithArgs('setVolume', volume());
  });

  const [selectedCount, setSelectedCount] = createSignal(0);
  timeline.on('selected', (n) => setSelectedCount(n));

  const [currentTime, setCurrentTime] = createSignal(timeline.currentTime);
  const [prompt, setPrompt] = createSignal('');
  timeline.on('render', () => {
    setCurrentTime(timeline.currentTime);
    setPrompt(timeline.getPrompt());
  });

  const [projectName, setProjectName] = createSignal('');

  onMount(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));

    const host = params.get('host');
    const name = params.get('name');

    let persistence: Persistor;

    if (host !== null && name !== null) {
      console.log('Opening remote persistence');
      persistence = GomasPersistor(host, name);
    } else {
      console.log('Using local persistence');
      persistence = LocalPersistor;
    }

    layout.ready
      .then(() => OpenedProject.open(persistence))
      .then(async (project) => {
        if (timeline.destroyed) return;

        await timeline.load(project);
        setProjectName(project.name);
      })
      .catch((error) => {
        if (
          !timeline.destroyed &&
          String(error) !== 'Error: missing data' &&
          String(error) !== 'Error: missing audio'
        ) {
          setLoadError(String(error));
        }
      });
  });

  onCleanup(() => {
    timeline.destroy();
  });

  const loadProject = async (project: Project) => {
    // TODO: some kind of confirmation dialog?

    setProjectName(project.name);

    const openedProject = new OpenedProject(
      project.name,
      project.data,
      project.audio,
      LocalPersistor,
    );

    await timeline.load(openedProject);
    await openedProject.persist();
    setLoadError('');
  };

  const value = {
    timeline,
    layout,
    projectData,
    trackLayout,
    visibleRows,
    loadError,
    pan,
    loading,
    playing,
    beatAnalysis: beatAnalysis.state,
    analyzeBeats: beatAnalysis.run,
    volume,
    setVolume,
    selectedCount,
    currentTime,
    prompt,
    projectName,
    setProjectName,
    loadProject,
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
