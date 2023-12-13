import { Component, JSX, ParentComponent } from 'solid-js';
import { Icon } from 'solid-heroicons';
import { speakerWave } from 'solid-heroicons/solid-mini';

import './VolumeSlider2.css';
import { createStoredSignal } from '../hooks/createStorageSignal';

const VolumeSlider: Component<{
  onChange?: (n: number) => void;
}> = (props) => {

  const [volume, setVolume] = createStoredSignal('volume', 0.5);

  return (
    <div class="flex items-center p-2 bg-zinc-700 rounded-lg">
      <Icon path={speakerWave} class="w-5 h-5 mr-2 text-zinc-100" />
      <input
        type="range"
        min="0"
        max="1"
        step="any"
        value={volume()}
        class="volume-slider w-28"
        onInput={(e) => {
          setVolume(parseFloat(e.target.value))
          props.onChange?.(parseFloat(e.target.value));
        }}
      />
    </div>
  );
};

export default VolumeSlider;
