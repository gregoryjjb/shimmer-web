import JSZip from 'jszip';
import { Component } from 'solid-js';
import './App.css';
import Help from './Help';
import { Menu, MenuBar, MenuItem, MenuItemSpacer } from './MenuBar';
import NewProjectForm from './NewProjectForm';
import OpenProjectForm from './OpenProjectForm';
import { SampleProjectButton } from './SampleProjectButton';
import { useTimeline } from './TimelineContext';
import Toolbar from './Toolbar';
import { ModalTitle, createModal } from './components/Modal';
import { fileToString } from './files';
import { setShowHelp, showHelp } from './global';
import {
  Command,
  SimpleCommand,
  keybindFor,
  nameFor,
} from './timeline/commands';
import { downloadFile, parseProjectData } from './timeline/export';
import { newTracks } from './timeline/timeline-data';

function App() {
  const ctx = useTimeline();

  const handleCommand = (c: Command) => {
    ctx.timeline.execute(c);
  };

  const [NewProjectModal, modal] = createModal();
  const [OpenProjectModal, openModal] = createModal();

  const replaceJSON = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.click();

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) {
        console.error('no file selected?');
        return;
      }

      const contents = await fileToString(file);
      const data = parseProjectData(contents);

      ctx.timeline.replaceData(data);
    });
  };

  const exportZip = async () => {
    const zip = new JSZip();
    const dump = await ctx.timeline.export();
    zip.file('data.json', JSON.stringify(dump.data));
    zip.file('audio.mp3', dump.audio);
    const content = await zip.generateAsync({ type: 'blob' });
    const filename = `${ctx.projectName() || 'Untitled project'}.zip`;
    downloadFile(filename, content);
  };

  const CommandMenuItem: Component<{
    command: SimpleCommand;
    requireSelected?: boolean;
  }> = (props) => {
    return (
      <MenuItem
        name={nameFor(props.command)}
        keybind={keybindFor(props.command)}
        onClick={() => handleCommand(props.command)}
        disabled={props.requireSelected && ctx.selectedCount() === 0}
      />
    );
  };

  return (
    <div class="flex h-screen flex-col">
      <MenuBar>
        <Menu name="File">
          <MenuItem name="New project" onClick={() => modal.show()} />
          <MenuItem name="Open" onClick={() => openModal.show()} />
          <MenuItem name="Download" onClick={exportZip} />
          <MenuItemSpacer />
          <MenuItem name="Replace JSON" onClick={replaceJSON} />
        </Menu>
        <Menu name="Edit">
          <CommandMenuItem command="undo" />
          <CommandMenuItem command="redo" />
          <MenuItemSpacer />
          <CommandMenuItem requireSelected command="invert" />
          <CommandMenuItem requireSelected command="align" />
          <CommandMenuItem requireSelected command="snapToCursor" />
          <CommandMenuItem requireSelected command="equallySpace" />
          <CommandMenuItem requireSelected command="duplicate" />
          <CommandMenuItem requireSelected command="delete" />
          <MenuItemSpacer />
          <CommandMenuItem requireSelected command="dedup" />
          <CommandMenuItem requireSelected command="shiftUp" />
          <CommandMenuItem requireSelected command="shiftDown" />
          <CommandMenuItem requireSelected command="flipVertically" />
        </Menu>
        <Menu name="Help">
          <MenuItem name="Show help" onClick={() => setShowHelp(true)} />
        </Menu>
        <SampleProjectButton class="ml-2" />
      </MenuBar>
      <div class="flex flex-col gap-3 p-3">
        <input
          class="-mx-2 -my-1 rounded-md bg-transparent px-2 py-1 text-white transition-colors hover:bg-zinc-800 focus:bg-zinc-700 focus:outline-none"
          placeholder="Untitled project"
          value={ctx.projectName()}
          onChange={(e) => ctx.setProjectName(e.target.value)}
          onKeyDown={(e) =>
            e.key === 'Enter' && (e.target as HTMLInputElement).blur()
          }
        />
        <Toolbar />
      </div>
      <div
        class="min-h-0 flex-1"
        ref={(el) => {
          ctx.timeline.attach(el);
        }}
      />
      <div class="border-t border-zinc-400 bg-zinc-800 px-2 py-1 text-sm">
        <p>{ctx.prompt() || `${ctx.selectedCount()} keyframes selected`}</p>
      </div>
      {showHelp() && <Help onClose={() => setShowHelp(false)} />}
      {ctx.loading() && (
        <div class="fixed inset-0 flex items-center justify-center bg-black/25">
          <p class="text-3xl text-white">LOADING...</p>
        </div>
      )}
      <NewProjectModal>
        <ModalTitle>New project</ModalTitle>
        <NewProjectForm
          onSubmit={async (project) => {
            const blankData = newTracks(project.channelCount);
            modal.hide();

            ctx.timeline.load({
              name: project.name,
              data: { tracks: blankData },
              audio: project.file,
            });
          }}
        />
      </NewProjectModal>

      <OpenProjectModal>
        <ModalTitle>Open project</ModalTitle>
        <OpenProjectForm
          onSubmit={async (payload) => {
            openModal.hide();
            ctx.timeline.load(payload);
          }}
          onCancel={() => openModal.hide()}
        />
      </OpenProjectModal>
    </div>
  );
}

export default App;
