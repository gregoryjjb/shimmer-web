import { Component, Show, createMemo, createSignal } from 'solid-js';
import FileInput from './components/FileInput';

const NewProjectForm: Component<{
  onSubmit?: (result: {
    name: string;
    file: File;
    channelCount: number;
  }) => void;
}> = (props) => {
  const nameInvalidRegex = /[<>/\\:"|?*\n]/m;
  const [name, setName] = createSignal('Untitled project');
  const nameError = createMemo(() => {
    const n = name().trim();
    if (n.length === 0) return 'is required';

    const invalid = nameInvalidRegex.test(name());
    if (invalid) return `cannot contain: ${nameInvalidRegex.toString()}`;
  });

  const [channelCount, setChannelCount] = createSignal(8);
  const [file, setFile] = createSignal<File>();

  return (
    <form
      class="flex flex-col items-start gap-4"
      onSubmit={(e) => {
        e.preventDefault();

        const f = file();
        if (!f) return;

        props.onSubmit?.({
          name: name(),
          file: f,
          channelCount: channelCount(),
        });
      }}
    >
      <div class="flex w-full flex-row gap-4">
        <div class="flex flex-1 flex-col">
          <label for="project-name" class="mb-1 text-sm font-semibold">
            Name
            <Show when={nameError()}>
              <span class="text-red-400"> {nameError()}</span>
            </Show>
          </label>
          <input
            id="project-name"
            value={name()}
            class="w-full rounded bg-zinc-700 p-2 hover:bg-zinc-600 focus:bg-zinc-600"
            onInput={(e) => setName(e.target.value)}
          />
        </div>

        <div class="flex flex-1 flex-col">
          <label for="channel-count" class="mb-1 text-sm font-semibold">
            Number of channels
          </label>
          <input
            id="channel-count"
            type="number"
            min="1"
            step="1"
            value={channelCount()}
            class="w-full rounded bg-zinc-700 p-2 hover:bg-zinc-600 focus:bg-zinc-600"
            onInput={(e) => setChannelCount(parseInt(e.target.value))}
          />
        </div>
      </div>
      <FileInput
        label="Choose a music mp3 file"
        accept=".mp3"
        onChange={(f) => {
          setFile(() => f);
          console.log('File onchange');
        }}
      />
      <div class="flex w-full justify-end">
        <button
          type="submit"
          class="rounded bg-emerald-500 px-3 py-2 font-semibold text-black"
        >
          Create
        </button>
      </div>
    </form>
  );
};

export default NewProjectForm;
