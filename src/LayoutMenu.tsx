import { createSignal, Show } from 'solid-js';
import { Menu, MenuItem } from './MenuBar';
import { ModalTitle, createModal } from './components/Modal';
import { useTimeline } from './TimelineContext';
import { downloadFile } from './timeline/export';
import { fileToString } from './files';
import LayoutEditor from './LayoutEditor';

export default function LayoutMenu() {
  const ctx = useTimeline();
  const [editing, setEditing] = createSignal(false);
  const [ErrorModal, errorModal] = createModal();
  const [error, setError] = createSignal('');
  let input!: HTMLInputElement;
  return (
    <>
      <Menu name="Layout">
        <MenuItem
          disabled={ctx.layout.loading()}
          name="Import layout"
          onClick={() => input.click()}
        />
        <MenuItem
          name="Export layout"
          disabled={ctx.layout.loading()}
          onClick={() =>
            downloadFile('layout.json', JSON.stringify(ctx.layout.document(), null, 2))
          }
        />
        <MenuItem
          name="Edit layout"
          disabled={ctx.layout.loading()}
          onClick={() => {
            if (ctx.layout.error()) {
              setError(ctx.layout.error());
              errorModal.show();
            } else {
              ctx.timeline.pause();
              setEditing(true);
            }
          }}
        />
      </Menu>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        class="hidden"
        aria-label="Import layout JSON"
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (!file) return;
          try {
            await ctx.layout.replace(await fileToString(file), { preserveUpdatedAt: true });
          } catch (error) {
            setError(error instanceof Error ? error.message : String(error));
            errorModal.show();
          }
        }}
      />
      <Show when={editing()}>
        <LayoutEditor
          layout={ctx.layout.document()}
          onClose={() => setEditing(false)}
          onSave={ctx.layout.replace}
        />
      </Show>
      <ErrorModal>
        <ModalTitle>Import layout</ModalTitle>
        <p role="alert" class="text-sm text-rose-400">
          {error()}
        </p>
      </ErrorModal>
    </>
  );
}
