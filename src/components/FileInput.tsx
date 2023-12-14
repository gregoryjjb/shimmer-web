import { Component, Show, createMemo, createSignal } from 'solid-js';

const FileInput: Component<{
  onChange?: (f: File | undefined) => void;
}> = (props) => {
  let inputRef: HTMLInputElement;

  const [file, setFile] = createSignal<File | undefined>();

  return (
    <div class="relative h-32 w-full">
      <div class="absolute inset-0 flex flex-col items-center justify-center rounded-lg border-2 border-dashed">
        <p>{file()?.name || 'Choose a file'}</p>
        {file() && <p>{((file()?.size || 0) / 1024 / 1024).toFixed(1)} MiB</p>}
      </div>
      <input
        type="file"
        ref={inputRef!}
        class="absolute inset-0 h-full w-full opacity-0"
        onChange={(e) => {
          // if (!e.target.files?.length) return;

          const f = e.target.files?.item(0);
          if (!f) return;
          setFile(() => f);
          props.onChange && props.onChange(f);
        }}
      />
    </div>
  );
};

export default FileInput;
