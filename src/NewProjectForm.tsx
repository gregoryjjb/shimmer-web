import { Component, Show, createMemo, createSignal } from 'solid-js';
import FileInput from './components/FileInput';

const NewProjectForm: Component<{
  onSubmit?: (result: { name: string; file: File, channelCount: number }) => void;
}> = (props) => {
  const [name, setName] = createSignal('Untitled project');
  const [channelCount, setChannelCount] = createSignal(8);
  const [file, setFile] = createSignal<File>();

  const invalidRegex = /[<>/\\:"|?*\n]/m;
  const nameValid = createMemo(() => {
    const n = name();
    const invalid = invalidRegex.test(name());

    return n.length > 0 && !invalid;
  });

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
      <div class="flex flex-col">
        <label for="project-name" class="mb-1 text-sm font-semibold">
          Name
        </label>
        <input
          id="project-name"
          value={name()}
          class="rounded bg-zinc-700 p-2 hover:bg-zinc-600 focus:bg-zinc-600"
          onInput={(e) => setName(e.target.value)}
        />

        <label for="channel-count" class="mb-1 text-sm font-semibold">
          Number of channels
        </label>
        <input
          id="channel-count"
          type="number"
          min="1"
          step="1"
          value={channelCount()}
          class="rounded bg-zinc-700 p-2 hover:bg-zinc-600 focus:bg-zinc-600"
          onInput={(e) => setChannelCount(parseInt(e.target.value))}
        />

        <Show when={!nameValid()}>
          <p>Invalid</p>
        </Show>
      </div>
      <FileInput onChange={(f) => setFile(() => f)} />
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
