import { Component, Show, createMemo, createSignal } from 'solid-js';
import FileInput from './components/FileInput';
import GradientButton from './components/GradientButton';

const NewProjectForm: Component<{
  onSubmit?: (result: { name: string; file: File; channelCount: number }) => void;
}> = (props) => {
  const nameInvalidRegex = /[<>/\\:"|?*\n]/m;
  const [name, setName] = createSignal('');
  const nameError = createMemo(() => {
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
          name: name().trim(),
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
            placeholder="Untitled project"
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
        class="h-32 w-full"
        label="Choose a music mp3 file"
        accept=".mp3"
        onChange={(f) => {
          setFile(() => f);
          console.log('File onchange');
        }}
      />
      <div class="flex w-full justify-end">
        <GradientButton
          component="button"
          type="submit"
          class="rounded-xl px-3 py-2 font-semibold text-black"
        >
          Create
        </GradientButton>
      </div>
    </form>
  );
};

export default NewProjectForm;
