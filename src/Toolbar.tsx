import { Component, ParentComponent, createEffect, createSignal, onCleanup } from 'solid-js';

import { Icon } from 'solid-heroicons';
import {
  arrowDownTray,
  arrowUturnLeft,
  arrowUturnRight,
  bars_3,
  chevronDoubleDown,
  chevronDoubleUp,
  chevronUpDown,
  handRaised,
  lightBulb,
  musicalNote,
  pause,
  play,
  trash,
} from 'solid-heroicons/solid-mini';
import VolumeSlider from './VolumeSlider/VolumeSlider';
import {
  Command,
  ComplexCommandHandler,
  SimpleCommand,
  keybindFor,
  nameFor,
} from './timeline/commands';
import { clamp } from './timeline/utils';
import { useTimeline } from './TimelineContext';
import GradientButton from './components/GradientButton';

const tooltip = (command: SimpleCommand) => {
  const name = nameFor(command);
  const key = keybindFor(command);

  if (!key) return name;

  return `${name} (${key})`;
};

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
      class={'p-2 ' + props.class}
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

const playbackRates = ['0.5', '0.75', '1', '1.25', '1.5'];

const Toolbar: Component<{
  onPlaybackRateChange?: (rate: number) => void;
}> = (props) => {
  const ctx = useTimeline();

  const buttonClass = 'rounded-lg p-2 text-zinc-100 hover:bg-zinc-800';

  const nothingSelected = () => ctx.selectedCount() === 0;

  const createOnClick = (c: Command) => () => ctx.timeline.execute(c);

  const [playbackRate, setPlaybackRate] = createSignal('1');

  // Hacky: this should be with the other keyboard handlers, but in order to do
  // that we need to get the keyboard handler out of the Timeline and into the
  // rest of the app so the dropdown can react accordingly
  const handlePlaybackRateHotkey = (e: KeyboardEvent) => {
    if (!e.shiftKey) return;
    if (!(e.key === '>' || e.key === '<')) return;

    const currentIndex = playbackRates.indexOf(playbackRate());
    const direction = e.key === '>' ? 1 : -1;

    const newIndex = clamp(currentIndex + direction, 0, playbackRates.length - 1);
    const newRate = playbackRates[newIndex];

    setPlaybackRate(newRate);
  };
  window.addEventListener('keydown', handlePlaybackRateHotkey);
  onCleanup(() => window.removeEventListener('keydown', handlePlaybackRateHotkey));

  createEffect(() => {
    ctx.timeline.setPlaybackRate(parseFloat(playbackRate()));
  });

  return (
    <div class="flex flex-row flex-wrap items-center gap-2">
      <GradientButton
        component="button"
        title={tooltip('playtoggle')}
        class={`rounded-full p-2 text-black`}
        onClick={createOnClick('playtoggle')}
      >
        <Icon path={ctx.playing() ? pause : play} class="h-6 w-6" />
      </GradientButton>
      <select
        title="Playback speed"
        class="h-9 rounded-lg bg-zinc-700 px-2 text-zinc-100 hover:bg-zinc-600"
        value={playbackRate()}
        onChange={(e) => setPlaybackRate(e.target.value)}
      >
        <option value="0.5">0.5x</option>
        <option value="0.75">0.75x</option>
        <option value="1">1x</option>
        <option value="1.25">1.25x</option>
        <option value="1.5">1.5x</option>
      </select>
      <VolumeSlider value={ctx.volume()} onChange={(n) => ctx.setVolume(n)} />
      <Bar />
      <ToolbarButtonGroup>
        <ToolbarButton
          onClick={createOnClick('undo')}
          grouped
          tooltip={tooltip('undo')}
          path={arrowUturnLeft}
        />
        <ToolbarButton
          onClick={createOnClick('redo')}
          grouped
          tooltip={tooltip('redo')}
          path={arrowUturnRight}
        />
      </ToolbarButtonGroup>
      <Bar />
      <ToolbarButton
        onClick={createOnClick('grab')}
        disabled={nothingSelected()}
        tooltip={tooltip('grab')}
        path={handRaised}
      />
      <ToolbarButton
        onClick={createOnClick('invert')}
        disabled={nothingSelected()}
        tooltip={tooltip('invert')}
        path={lightBulb}
      />
      <ToolbarButton
        onClick={createOnClick('equallySpace')}
        disabled={nothingSelected()}
        tooltip={tooltip('equallySpace')}
        path={bars_3}
        class="rotate-90"
      />
      <ToolbarButtonGroup>
        <ToolbarButton
          onClick={createOnClick('shiftUp')}
          disabled={nothingSelected()}
          grouped
          tooltip={tooltip('shiftUp')}
          path={chevronDoubleUp}
        />
        <ToolbarButton
          onClick={createOnClick('shiftDown')}
          disabled={nothingSelected()}
          grouped
          tooltip={tooltip('shiftDown')}
          path={chevronDoubleDown}
        />
        <ToolbarButton
          onClick={createOnClick('flipVertically')}
          disabled={nothingSelected()}
          grouped
          tooltip={tooltip('flipVertically')}
          path={chevronUpDown}
        />
      </ToolbarButtonGroup>
      <ToolbarButton
        onClick={createOnClick('delete')}
        disabled={nothingSelected()}
        tooltip={tooltip('delete')}
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
      <ToolbarButton tooltip="Change music" path={musicalNote} onClick={() => inputRef.click()} />
      <input
        style={{ display: 'none' }}
        type="file"
        ref={inputRef!}
        onChange={(e) => {
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
        }}
      />
    </>
  );
};
