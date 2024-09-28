import { createEffect } from 'solid-js';
import { createStoredSignal } from './hooks/createStorageSignal';

// Global state stored in localstorage. It's a singleton
// because localstorage is a singleton.

export const [hideWelcome, setHideWelcome] = createStoredSignal('hideWelcome', false);

export const [volume, setVolume] = createStoredSignal('volume', 0.5);

export const [showHelp, setShowHelp] = createStoredSignal('showHelp', false);

export const [projectName, setProjectName] = createStoredSignal('projectName', 'Untitled project');

createEffect(() => {
  document.querySelector('title')!.innerHTML = `${projectName()} | Shimmer Editor`;
});
