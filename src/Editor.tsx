import JSZip from 'jszip';
import { Component, createEffect } from 'solid-js';
import './App.css';
import { ModalTitle, createModal } from './components/Modal';
import { fileToString } from './files';
import { setShowHelp, showHelp } from './global';
import Help from './Help';
import { Menu, MenuBar, MenuItem, MenuItemSpacer } from './MenuBar';
import NewProjectForm from './NewProjectForm';
import OpenProjectForm from './OpenProjectForm';
import { SampleProjectButton } from './SampleProjectButton';
import { Command, SimpleCommand, keybindFor, nameFor } from './timeline/commands';
import { downloadFile, parseProjectData } from './timeline/export';
import { newTracks } from './timeline/timeline-data';
import TimelineCanvas from './TimelineCanvas';
import { useTimeline } from './TimelineContext';
import Toolbar from './Toolbar';
import { UpgradeLayoutForm } from './UpgradeLayoutForm';

function Editor() {
  const ctx = useTimeline();

  createEffect(() => {
    document.querySelector('title')!.innerHTML = `${ctx.projectName()} | Shimmer Editor`;
  });

  const handleCommand = (c: Command) => {
    ctx.timeline.execute(c);
  };

  const [NewProjectModal, modal] = createModal();
  const [OpenProjectModal, openModal] = createModal();
  const [LayoutModal, layoutModal] = createModal();

  const beatAnalysisMessage = () => {
    const analysis = ctx.beatAnalysis();

    switch (analysis.state) {
      case 'running':
        return 'Analyzing beats with Essentia…';
      case 'complete':
        return `Detected ${analysis.beats.length} beats at ${analysis.bpm.toFixed(1)} BPM`;
      case 'error':
        return `Beat analysis failed: ${analysis.message}`;
    }
  };

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
    const filename = `${ctx.projectName() || 'Untitled project'}.shmr`;
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
          <MenuItem name="Upgrade layout" onClick={() => layoutModal.show()} />
        </Menu>
        <Menu name="Edit">
          <CommandMenuItem command="undo" />
          <CommandMenuItem command="redo" />
          <MenuItemSpacer />
          <MenuItem
            name={
              ctx.beatAnalysis().state === 'running'
                ? 'Analyzing beats…'
                : 'Analyze beats with Essentia'
            }
            onClick={() => void ctx.analyzeBeats()}
            disabled={ctx.loading() || ctx.beatAnalysis().state === 'running'}
          />
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
        {/* Disabling because name editing is not hooked up to persistence properly */}
        {/* <input
          class="-mx-2 -my-1 rounded-md bg-transparent px-2 py-1 text-white transition-colors hover:bg-zinc-800 focus:bg-zinc-700 focus:outline-none"
          placeholder="Untitled project"
          value={ctx.projectName()}
          onChange={(e) => ctx.setProjectName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        /> */}
        <p class="-mx-2 -my-1 rounded-md bg-transparent px-2 py-1 text-white transition-colors hover:bg-zinc-800 focus:bg-zinc-700 focus:outline-none">
          {ctx.projectName()}
        </p>
        <Toolbar />
      </div>
      <TimelineCanvas />
      <div class="border-t border-zinc-400 bg-zinc-800 px-2 py-1 text-sm">
        <p>
          {beatAnalysisMessage() || ctx.prompt() || `${ctx.selectedCount()} keyframes selected`}
        </p>
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

            ctx.loadProject({
              name: project.name,
              // TODO: generate blank projects somewhere else
              data: { version: '2', tracks: blankData },
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
            ctx.loadProject(payload);
          }}
          onCancel={() => openModal.hide()}
        />
      </OpenProjectModal>

      <LayoutModal>
        <ModalTitle>Upgrade layout</ModalTitle>
        <UpgradeLayoutForm onClose={() => layoutModal.hide()} />
      </LayoutModal>
    </div>
  );
}

export default Editor;
