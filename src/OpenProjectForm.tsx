import JSZip from 'jszip';
import { Component, createSignal } from 'solid-js';
import FileInput from './components/FileInput';
import GradientButton from './components/GradientButton';
import { parseProjectData } from './timeline/export';
import { Project } from './timeline/types';
import { fileToString } from './files';

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

            const datafile = jsonFile();
            if (!datafile) {
              throw 'Select a JSON file';
            }

            const name = datafile.name.replace(/\.[^\.]*$/, '');
            const data = parseProjectData(await fileToString(datafile));

            setErr('');
            props.onSubmit?.({
              name,
              audio,
              data,
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

            const data = JSON.parse(await dataFile.async('string'));
            const audio = await audioFile.async('blob');

            setErr('');
            props.onSubmit?.({
              name,
              audio,
              data,
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
