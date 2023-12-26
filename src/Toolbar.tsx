import { Component, JSX, ParentComponent } from 'solid-js';

import { Icon } from 'solid-heroicons';
import {
  play,
  pause,
  lightBulb,
  chevronDoubleUp,
  chevronDoubleDown,
  arrowUturnLeft,
  arrowUturnRight,
  trash,
  handRaised,
  musicalNote,
  arrowDownTray,
  bars_3,
} from 'solid-heroicons/solid-mini';
import {
  ArgOf,
  Command,
  ComplexCommand,
  ComplexCommandHandler,
} from './timeline/commands';
import VolumeSlider from './VolumeSlider/VolumeSlider';

const ToolbarButton: ParentComponent<{
  class?: string;
  tooltip?: string;
  grouped?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  path: typeof play;
}> = (props) => {
  return (
    <button
      class={"p-2 " + props.class}
      classList={{
        'rounded-lg': !props.grouped,
        'first:rounded-tl-lg first:rounded-bl-lg last:rounded-tr-lg last:rounded-br-lg':
          props.grouped,
        'text-zinc-100 hover:bg-zinc-600 bg-zinc-700': !props.disabled,
        'text-zinc-500 bg-zinc-800': props.disabled,
      }}
      title={props.tooltip}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.children}
      <Icon path={props.path} class="h-5 w-5" />
    </button>
  );
};

const ToolbarButtonGroup: ParentComponent = (props) => (
  <div class="flex flex-row gap-px">{props.children}</div>
);

const Bar: Component = () => {
  return <div class="mx-2 h-6 w-px bg-zinc-400" />;
};

const Toolbar: Component<{
  playing?: boolean;
  selectedCount: number;
  onPlay?: () => void;
  onCommand: (c: Command) => void;
  onComplexCommand: ComplexCommandHandler;
  onPlaybackRateChange?: (rate: number) => void;
}> = (props) => {
  const buttonClass = 'rounded-lg p-2 text-zinc-100 hover:bg-zinc-800';

  const nothingSelected = () => props.selectedCount === 0;

  const createOnClick = (c: Command) => () => props.onCommand(c);

  return (
    <div class="flex flex-row items-center gap-2">
      <button
        class={`rounded-full bg-emerald-500 p-2 text-emerald-950 hover:bg-emerald-400`}
        onClick={createOnClick('playtoggle')}
      >
        <Icon path={props.playing ? pause : play} class="h-6 w-6" />
      </button>
      <select
        class="h-9 rounded-lg bg-zinc-700 px-2 text-zinc-100 hover:bg-zinc-600"
        onChange={(e) =>
          props.onPlaybackRateChange?.(parseFloat(e.target.value))
        }
      >
        <option value="0.5">0.5x</option>
        <option value="0.75">0.75x</option>
        <option selected value="1">
          1x
        </option>
        <option value="1.25">1.25x</option>
        <option value="1.5">1.5x</option>
      </select>
      <VolumeSlider onChange={(n) => props.onComplexCommand('setVolume', n)} />
      <Bar />
      <ToolbarButtonGroup>
        <ToolbarButton
          onClick={createOnClick('undo')}
          grouped
          tooltip="Undo"
          path={arrowUturnLeft}
        />
        <ToolbarButton
          onClick={createOnClick('redo')}
          grouped
          tooltip="Redo"
          path={arrowUturnRight}
        />
      </ToolbarButtonGroup>
      <Bar />
      <ToolbarButton
        onClick={createOnClick('grab')}
        disabled={nothingSelected()}
        tooltip="Invert"
        path={handRaised}
      />
      <ToolbarButton
        onClick={createOnClick('invert')}
        disabled={nothingSelected()}
        tooltip="Invert"
        path={lightBulb}
      />
      <ToolbarButton
        onClick={createOnClick('equallySpace')}
        disabled={nothingSelected()}
        tooltip="Equally space"
        path={bars_3}
        class="rotate-90"
      />
      <ToolbarButtonGroup>
        <ToolbarButton
          onClick={createOnClick('shiftUp')}
          disabled={nothingSelected()}
          grouped
          tooltip="Shift up"
          path={chevronDoubleUp}
        />
        <ToolbarButton
          onClick={createOnClick('shiftDown')}
          disabled={nothingSelected()}
          grouped
          tooltip="Shift down"
          path={chevronDoubleDown}
        />
      </ToolbarButtonGroup>
      <ToolbarButton
        onClick={createOnClick('delete')}
        disabled={nothingSelected()}
        tooltip="Delete keyframes"
        path={trash}
      />
      <Bar />
      <ToolbarButton
        tooltip="Change music"
        path={musicalNote}
        onClick={createOnClick('pickAudioFile')}
      />
      <ToolbarButton
        tooltip="Download show"
        path={arrowDownTray}
        onClick={createOnClick('downloadLegacy')}
      />
      {/* <OpenFile /> */}
    </div>
  );
};

export default Toolbar;

const OpenFile: Component = () => {
  let inputRef: HTMLInputElement;

  return (
    <>
      <ToolbarButton
        tooltip="Change music"
        path={musicalNote}
        onClick={() => inputRef.click()}
      />
      <input
        style={{ display: 'none' }}
        type="file"
        ref={inputRef!}
        onChange={(e) => {
          console.log('File changed', e);

          const len = e.target.files?.length || 0;
          if (len !== 1) {
            console.error('Please select exactly one file');
            return;
          }

          const file = e.target.files?.[0];
          if (!file) {
            console.error('No file?');
            return;
          }

          console.log('Selected', file.name);
        }}
      />
    </>
  );
};
