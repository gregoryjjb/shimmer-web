import { Component, createSignal } from 'solid-js';
import { Track, mapJSONToMemory } from './timeline/timeline-data';
import FileInput from './components/FileInput';

const parseShowFile = async (f: File): Promise<Track[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsText(f, 'UTF-8');

    reader.onload = (event) => {
      try {
        const raw = event.target?.result || '';

        if (typeof raw !== 'string') {
          throw new Error('Loaded an ArrayBuffer but expected a string');
        }

        const parsed = JSON.parse(raw);

        if (typeof parsed !== 'object') {
          throw new Error('Must parse to object');
        }

        if (!parsed) {
          throw new Error('Blank show file');
        }

        if (!parsed.hasOwnProperty('tracks')) {
          throw new Error('Show is missing tracks');
        }

        const tracks = mapJSONToMemory(parsed)

        // TODO: more validations on the shape of the tracks and keyframes
        resolve(tracks);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = (event) => {
      reject(
        event.target?.error ||
          new Error(`Unknown error while reading ${f.name}`),
      );
    };
  });
};

const OpenProjectForm: Component<{
  onSubmit?: (result: { audio: File; tracks: Track[] }) => void;
}> = (props) => {
  const [tracksErr, setTracksErr] = createSignal('');
  const [tracks, setTracks] = createSignal<Track[]>();

  const [audioFile, setAudioFile] = createSignal<File>();

  return (
    <form
      class="flex flex-col items-start gap-4"
      onSubmit={(e) => {
        e.preventDefault();

        if (tracksErr()) return;

        const t = tracks();
        if (!t) return;

        const a = audioFile();
        if (!a) return;

        props.onSubmit?.({
          audio: a,
          tracks: t,
        });
      }}
    >
      <FileInput
        label="Select project file"
        accept=".json"
        onChange={async (f) => {
          if (!f) return;

          try {
            const tracks = await parseShowFile(f);
            setTracks(tracks);
            setTracksErr('');
          } catch (err) {
            setTracksErr(String(err));
          }
        }}
      />
      <p class="font-semibold text-red-500">{tracksErr()}</p>
      <FileInput
        label="Select audio file"
        accept=".mp3"
        onChange={(f) => setAudioFile(() => f)}
      />
      <div class="flex w-full justify-end">
        <button
          type="submit"
          class="rounded bg-emerald-500 px-3 py-2 font-semibold text-black"
        >
          Open
        </button>
      </div>
    </form>
  );
};

export default OpenProjectForm;
