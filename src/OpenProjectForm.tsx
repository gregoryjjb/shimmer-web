import JSZip from 'jszip';
import { Component, createSignal } from 'solid-js';
import FileInput from './components/FileInput';
import GradientButton from './components/GradientButton';
import { parseProjectData, projectFromFile } from './timeline/export';
import { Project } from './timeline/types';
import { fileToString } from './files';
import clsx from 'clsx';

const OpenProjectForm: Component<{
  onSubmit?: (result: Project) => void;
  onCancel?: () => void;
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

            const project = await projectFromFile(f);

            setErr('');
            props.onSubmit?.(project);
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
      <div
        class={clsx(
          'flex h-32 w-full flex-row gap-4',
          legacy() ? 'flex' : 'hidden',
        )}
      >
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
      <FileInput
        label="Select zip file"
        accept=".zip"
        class={clsx('h-32 w-full', legacy() && 'hidden')}
        onChange={(f) => {
          setZipFile(() => f);
          setErr('');
        }}
      />
      <div class="flex w-full items-center justify-end">
        <button
          type="button"
          class="hocus:text-zinc-300 hocus:bg-zinc-800 rounded-xl border border-zinc-800 px-3 py-2 font-semibold text-zinc-400 transition-colors"
          onClick={props.onCancel}
        >
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
