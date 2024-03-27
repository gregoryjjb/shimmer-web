import { Component, Show, createMemo, createSignal } from 'solid-js';

const FileInput: Component<{
  class?: string;
  label?: string;
  accept?: string;
  onChange?: (f: File | undefined) => void;
}> = (props) => {
  let inputRef: HTMLInputElement;

  const [file, setFile] = createSignal<File | undefined>();

  return (
    <div class={'relative ' + props.class}>
      <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center rounded-lg border-2 border-dashed">
        <p>{file()?.name || props.label || 'Choose a file'}</p>
        {file() && <p>{((file()?.size || 0) / 1024 / 1024).toFixed(1)} MiB</p>}
      </div>
      <input
        type="file"
        accept={props.accept}
        ref={inputRef!}
        class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
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
