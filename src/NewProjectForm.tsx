import { Component, Show, createMemo, createSignal } from 'solid-js';
import FileInput from './components/FileInput';

const NewProjectForm: Component<{
  onSubmit?: (result: { name: string; file: File }) => void;
}> = (props) => {
  const [name, setName] = createSignal('Untitled project');
  const [file, setFile] = createSignal<File>();

  const invalidRegex = /[<>/\\:"|?*\n]/m;
  const nameValid = createMemo(() => {
    const n = name();
    const invalid = invalidRegex.test(name());

    return n.length > 0 && !invalid;
  });

  return (
    <form
      class="flex flex-col gap-4 items-start"
      onSubmit={(e) => {
        e.preventDefault();
        console.log(e);

        const f = file();
        if (!f) return;

        props.onSubmit?.({
          name: name(),
          file: f,
        });
      }}
    >
      <div class="flex flex-col">
        <label for="project-name" class="text-sm font-semibold mb-1">
          Name
        </label>
        <input
          id="project-name"
          value={name()}
          class="bg-zinc-700 hover:bg-zinc-600 focus:bg-zinc-600 p-2 rounded"
          onInput={(e) => setName(e.target.value)}
        />
        <Show when={!nameValid()}>
          <p>Invalid</p>
        </Show>
      </div>
      <FileInput onChange={(f) => setFile(() => f)} />
      <div class="flex justify-end w-full">
        <button
          type="submit"
          class="px-3 py-2 font-semibold bg-emerald-500 rounded text-black"
        >
          Create
        </button>
      </div>
    </form>
  );
};

export default NewProjectForm;
