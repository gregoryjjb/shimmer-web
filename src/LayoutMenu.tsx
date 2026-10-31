import { createSignal } from 'solid-js';
import { Menu, MenuItem } from './MenuBar';
import { ModalTitle, createModal } from './components/Modal';
import { useTimeline } from './TimelineContext';
import { downloadFile } from './timeline/export';
import { fileToString } from './files';
import LayoutEditorForm from './LayoutEditorForm';

export default function LayoutMenu() {
  const ctx = useTimeline();
  const [EditModal, editor] = createModal();
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
            } else editor.show();
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
            await ctx.layout.replace(await fileToString(file));
          } catch (error) {
            setError(error instanceof Error ? error.message : String(error));
            errorModal.show();
          }
        }}
      />
      <EditModal>
        <ModalTitle>Edit layout</ModalTitle>
        <LayoutEditorForm
          layout={ctx.layout.document().tree}
          onCancel={editor.hide}
          onSave={async (tree, origins) => {
            await ctx.layout.updateTree(tree, origins);
            editor.hide();
          }}
        />
      </EditModal>
      <ErrorModal>
        <ModalTitle>Import layout</ModalTitle>
        <p role="alert" class="text-sm text-rose-400">
          {error()}
        </p>
      </ErrorModal>
    </>
  );
}
