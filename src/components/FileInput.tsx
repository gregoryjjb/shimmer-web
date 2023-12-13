import { Component, Show, createMemo, createSignal } from 'solid-js';

const FileInput: Component<{
  onChange?: (f: File | undefined) => void;
}> = (props) => {
  let inputRef: HTMLInputElement;

  const [file, setFile] = createSignal<File | undefined>();

  return (
    <div class="w-full h-32 relative">
      <div class="absolute inset-0 border-2 border-dashed rounded-lg flex flex-col items-center justify-center">
        <p>{file()?.name || 'Choose a file'}</p>
        {file() && <p>{((file()?.size || 0) / 1024 / 1024).toFixed(1)} MiB</p>}
      </div>
      <input
        type="file"
        ref={inputRef!}
        class="absolute inset-0 w-full h-full opacity-0"
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
