import JSZip from 'jszip';
import { Component, createSignal } from 'solid-js';
import FileInput from './components/FileInput';
import GradientButton from './components/GradientButton';
import { mapJSONToMemory } from './timeline/timeline-data';
import { Project, Track } from './timeline/types';

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
          throw new Error('Blank JSON file');
        }

        if (!parsed.hasOwnProperty('tracks')) {
          throw new Error('JSON is missing tracks');
        }

        const tracks = mapJSONToMemory(parsed);

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
  onSubmit?: (result: Project) => void;
}> = (props) => {
  const [legacy, setLegacy] = createSignal(false);

  const [zipFile, setZipFile] = createSignal<File>();
  const [jsonFile, setJsonFile] = createSignal<File>();
  const [audioFile, setAudioFile] = createSignal<File>();

  const [err, setErr] = createSignal('');

  return (
    <form
      class="flex flex-col items-start gap-4"
      onSubmit={async (e) => {
        e.preventDefault();

        try {
          if (legacy()) {
            // Handle audio+json separately
            const audio = audioFile();
            if (!audio) {
              throw 'Select an audio file';
            }

            const data = jsonFile();
            if (!data) {
              throw 'Select a JSON file';
            }

            const name = data.name.replace(/\.[^\.]*$/, '');
            const tracks = await parseShowFile(data);

            setErr('');
            props.onSubmit?.({
              name,
              audio,
              tracks,
            });
          } else {
            // Handle zip
            const f = zipFile();
            if (!f) {
              throw 'Select a file';
            }

            const name = f.name.replace(/\.[^\.]*$/, '');
            const zip = await JSZip.loadAsync(f);

            const dataFile = zip.file('data.json');
            if (!dataFile) {
              throw 'Missing data.json';
            }

            const audioFile = zip.file('audio.mp3');
            if (!audioFile) {
              throw 'Missing audio.mp3';
            }

            const tracks = JSON.parse(await dataFile.async('string'));
            const audio = await audioFile.async('blob');

            setErr('');
            props.onSubmit?.({
              name,
              audio,
              tracks,
            });
          }
        } catch (e) {
          console.error(e);
          setErr(String(e));
        }
      }}
    >
      <label class="text-sm font-semibold">
        Use legacy format
        <input
          type="checkbox"
          class="ml-2"
          onChange={(e) => setLegacy(e.target.checked)}
        />
      </label>
      {legacy() ? (
        <div class="flex h-32 w-full flex-row gap-4">
          <FileInput
            class="flex-1"
            label="Select json file"
            accept=".json"
            onChange={async (f) => {
              setJsonFile(() => f);
              setErr('');
            }}
          />
          <FileInput
            class="flex-1"
            label="Select audio file"
            accept=".mp3"
            onChange={(f) => {
              setAudioFile(() => f);
              setErr('');
            }}
          />
        </div>
      ) : (
        <FileInput
          label="Select zip file"
          accept=".zip"
          class="h-32 w-full"
          onChange={(f) => {
            setZipFile(() => f);
            setErr('');
          }}
        />
      )}
      <div class="flex w-full items-center justify-end">
        <button class="rounded-xl border border-zinc-300 px-3 py-2 font-semibold text-zinc-300">
          Cancel
        </button>
        <p class="mr-4 flex-1 text-end text-rose-400">
          {!!err() && '⚠ ' + err()}
        </p>
        <GradientButton
          component="button"
          type="submit"
          class="rounded-xl px-3 py-2 font-semibold text-black"
        >
          Open
        </GradientButton>
      </div>
    </form>
  );
};

export default OpenProjectForm;
