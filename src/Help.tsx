import { Component, ParentComponent } from 'solid-js';

const Key: ParentComponent = (props) => {
  return (
    <p class="rounded border border-zinc-500 px-1 py-0.5 text-xs">
      {props.children}
    </p>
  );
};

const Keybind: Component<{
  action: string;
  key: string;
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
}> = (props) => {
  return (
    <div class="rounded bg-zinc-800 p-2">
      <p class="mb-1 text-sm font-semibold">{props.action}</p>
      <div class="flex flex-row gap-1">
        {props.shift && <Key>SHIFT</Key>}
        {props.ctrl && <Key>CTRL</Key>}
        {props.alt && <Key>ALT</Key>}
        <Key>{props.key}</Key>
      </div>
    </div>
  );
};

const Help: Component<{
  onClose?: () => void;
}> = (props) => {
  return (
    <div class="flex flex-col px-3 py-2">
      <div class="mb-3 flex">
        <p class="mr-4 text-xl font-semibold">Help</p>
        <button
          class="rounded bg-yellow-700 px-2 py-1 text-sm font-semibold text-yellow-100"
          onClick={() => props.onClose?.()}
        >
          Hide
        </button>
      </div>
      <div class="flex flex-row flex-wrap gap-3">
        <Keybind action="Play/pause" key="Space" />
        <Keybind action="Insert keyframes" key="RMB" />
        <Keybind action="Insert full row" ctrl key="RMB" />
        <Keybind action="Select keyframes" key="LMB" />
        <Keybind action="Multi-select" shift key="LMB" />
        <Keybind action="Invert keyframe values" key="I" />
        <Keybind action="Move up/down" key="Up/down arrows" />
        <Keybind action="Grab & move" key="G" />
        <Keybind action="Scale" key="S" />
        <Keybind action="Duplicate" ctrl key="D" />
        <Keybind action="Delete" key="DEL" />
        <Keybind action="Remove duplicates" key="W" />
        <Keybind action="Align/squish" key="A" />
        <Keybind action="Equally space" key="E" />
      </div>
    </div>
  );
};

export default Help;
