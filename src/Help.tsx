import { Component } from 'solid-js';

const Keybind: Component<{
  action: string;
  key: string;
}> = (props) => {
  return (
    <p>
      <span>{props.action}</span>: {props.key}
    </p>
  );
};

const Help: Component<{
  onClose?: () => void;
}> = (props) => {
  return (
    <div class="px-3 py-2">
      <p class="text-xl font-semibold">Help</p>
      <button onClick={() => props.onClose?.()}>Close</button>
      <Keybind action="Play/pause" key="Spacebar" />
      <Keybind action="Insert keyframes" key="Right click" />
      <Keybind action="Insert full row" key="Shift right click" />
      <Keybind action="Select keyframes" key="Left click" />
      <Keybind action="Multi-select" key="Shift left click" />
      <Keybind action="Invert" key="i" />
      <Keybind action="Move up/down" key="Up/down arrows" />
      <Keybind action="Grab & move" key="g" />
      <Keybind action="Scale" key="s" />
      <Keybind action="Duplicate" key="ctrl-d" />
      <Keybind action="Delete" key="ctrl-d" />
      <Keybind action="Remove duplicates" key="w" />
      <Keybind action="Align/squish" key="a" />
    </div>
  );
};

export default Help;
