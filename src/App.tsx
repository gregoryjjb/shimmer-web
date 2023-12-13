import { createSignal, onCleanup, onMount } from 'solid-js';
import solidLogo from './assets/solid.svg';
import viteLogo from '/vite.svg';
import './App.css';
import Timeline from './timeline/timeline';
import { ShowDataJSON } from './timeline/types';
import Toolbar from './Toolbar';
import { Command } from './timeline/commands';
import { LocalPersistence, localPersistence } from './timeline/persistence';
import { Menu, MenuBar, MenuItem, MenuItemSpacer } from './MenuBar';
import { createStoredSignal } from './hooks/createStorageSignal';
import { ModalTitle, createModal } from './components/Modal';
import NewProjectForm from './NewProjectForm';

const show: ShowDataJSON = {
  tracks: [
    { id: 'Channel 1', keyframes: [] },
    { id: 'Channel 2', keyframes: [] },
    { id: 'Channel 3', keyframes: [] },
    { id: 'Channel 4', keyframes: [] },
    { id: 'Channel 5', keyframes: [] },
    { id: 'Channel 6', keyframes: [] },
    { id: 'Channel 7', keyframes: [] },
    { id: 'Channel 8', keyframes: [] },
  ],
};

function App() {
  let t: Timeline;

  const [playing, setPlaying] = createSignal(false);
  const [editLog, setEditLog] = createSignal<
    { time: number; message: string }[]
  >([]);
  const [selectedCount, setSelectedCount] = createSignal(0);

  const [volume] = createStoredSignal('volume', 0.5);

  const handleCommand = (c: Command) => {
    t.execute(c);
  };

  const [NewProjectModal, modal] = createModal();

  const importLegacy = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.click();

    input.addEventListener('change', (e) => {
      const file = input.files?.[0];
      if (!file) {
        console.error('no file selected?');
        return;
      }

      const reader = new FileReader();
      reader.readAsText(file, 'UTF-8');

      reader.onload = (e) => {
        const raw = e.target?.result || '';
        if (typeof raw !== 'string') {
          throw new Error('Got non-string');
        }

        t.loadLegacyJSON(JSON.parse(raw));
      };
    });
  };

  return (
    <div class="h-screen flex flex-col">
      <MenuBar>
        <Menu name="File">
          <MenuItem name="New project" onClick={() => modal.show()} />
          <MenuItem name="Open" />
          <MenuItem name="Download" />
          <MenuItem name="Import legacy JSON" onClick={importLegacy} />
        </Menu>
        <Menu name="Edit">
          <MenuItem name="Undo" />
          <MenuItem name="Redo" />
          <MenuItemSpacer />
          <MenuItem name="Invert state" />
          <MenuItem name="Shift up" />
          <MenuItem name="Shift down" />
        </Menu>
      </MenuBar>
      <div class="p-3 flex flex-col gap-3">
        <input class="bg-transparent p-0 text-white" value="Untitled show" />
        <Toolbar
          selectedCount={selectedCount()}
          playing={playing()}
          onCommand={handleCommand}
          onComplexCommand={(c, a) => {
            t?.executeWithArgs(c, a);
          }}
          onPlaybackRateChange={(rate) => t?.setPlaybackRate(rate)}
        />
      </div>
      <div
        class="flex-1 min-h-0"
        // style={{
        //   position: 'absolute',
        //   top: '78px',
        //   left: '33px',
        //   right: '69px',
        // }}
        ref={(el) => {
          console.log('Creating new timeline');
          t = new Timeline(el);
          t.on('play', () => setPlaying(true));
          t.on('pause', () => setPlaying(false));
          t.on('edit', (action) =>
            setEditLog((a) => [{ time: Date.now(), message: action }, ...a])
          );
          t.on('selected', (n) => setSelectedCount(n));

          t.executeWithArgs('setVolume', volume());

          // fetch('/queen_of_the_winter_night.json')
          //   .then((res) => res.json())
          //   .then((json) => {
          //     // t.load(json, '/halloween_1978_pT4FY3NrhGg.opus');
          //     t.load(json, '/queen_of_the_winter_night.mp3');
          //   });

          LocalPersistence.loadExisting().then((lp) => {
            if (lp) {
              t.loadPersistence(lp);
            }
          });

          onCleanup(() => {
            t.destroy();
          });
        }}
      />
      <p>{selectedCount()} keyframes selected</p>
      <ul class="fixed left-0 bottom-0 flex flex-col-reverse text-white font-mono">
        {editLog().map((a) => (
          <li>
            {new Date(a.time).toLocaleTimeString()} {a.message}
          </li>
        ))}
      </ul>
      <NewProjectModal>
        <ModalTitle>New project</ModalTitle>
        <NewProjectForm />
      </NewProjectModal>
    </div>
  );
}

export default App;
