export type SimpleCommand =
  | 'play'
  | 'pause'
  | 'playtoggle'
  | 'undo'
  | 'redo'
  | 'invert'
  | 'shiftUp'
  | 'shiftDown'
  | 'flipVertically'
  | 'grab'
  | 'scale'
  | 'align'
  | 'snapToCursor'
  | 'equallySpace'
  | 'duplicate'
  | 'delete'
  | 'dedup'
  | 'cancel'
  | 'pickAudioFile'
  | 'selectAll'
  | 'downloadLegacy';

export const keybinds: Record<string, SimpleCommand> = {
  ' ': 'playtoggle',
  ctrl_z: 'undo',
  ctrl_shift_z: 'redo',
  i: 'invert',
  arrowup: 'shiftUp',
  arrowdown: 'shiftDown',
  f: 'flipVertically',
  g: 'grab',
  s: 'scale',
  d: 'duplicate',
  delete: 'delete',
  backspace: 'delete',
  w: 'dedup',
  escape: 'cancel',
  ctrl_a: 'selectAll',
  a: 'align',
  shift_s: 'snapToCursor',
  e: 'equallySpace',
};

const capitalize = (s: string): string => {
  return s.charAt(0).toUpperCase() + s.slice(1);
};

let _apple: boolean | undefined;
/**
 * @returns true if running on a Mac
 */
export const apple = (): boolean => {
  if (_apple !== undefined) return _apple;

  _apple = window.navigator.userAgent.indexOf('Mac') != -1;
  return _apple;
};

const formattedKeybinds: Partial<Record<SimpleCommand, string>> = {};
Object.entries(keybinds).forEach(([keybind, command]) => {
  formattedKeybinds[command] = keybind
    .split('_')
    .map((part) => {
      if (part === 'ctrl') return apple() ? '⌘' : 'Ctrl';
      if (part === 'shift') return '⇧';
      if (part === 'alt') return apple() ? '⌥' : 'Alt';

      if (part === 'arrowup') return '↑';
      if (part === 'arrowdown') return '↓';
      if (part === 'arrowleft') return '←';
      if (part === 'arrowright') return '→';

      if (part === ' ') return 'Spacebar';

      return capitalize(part);
    })
    .join(' ');
});
export const keybindFor = (command: SimpleCommand): string =>
  formattedKeybinds[command] || '';

const commandNames: Record<SimpleCommand, string> = {
  play: 'Play',
  pause: 'Pause',
  playtoggle: 'Play/pause',
  undo: 'Undo',
  redo: 'Redo',
  invert: 'Invert values',
  shiftUp: 'Shift one channel up',
  shiftDown: 'Shift one channel down',
  flipVertically: 'Flip vertically',
  grab: 'Grab',
  scale: 'Scale',
  align: 'Align',
  snapToCursor: 'Snap to cursor',
  equallySpace: 'Space evenly',
  duplicate: 'Duplicate',
  delete: 'Delete',
  dedup: 'Deduplicate',
  cancel: 'Cancel',
  pickAudioFile: 'Pick audio file',
  selectAll: 'Select all',
  downloadLegacy: 'Download legacy',
};
export const nameFor = (command: SimpleCommand) => commandNames[command];

export type CommandsWithArgs = {
  setVolume: number;
  setPlaybackSpeed: number;
  rename: string;
};

export type ComplexCommand = keyof CommandsWithArgs;
export type ArgOf<T extends ComplexCommand> = CommandsWithArgs[T];

export type Command = SimpleCommand;
export type CommandArg<T extends Command> = [T] extends [ComplexCommand]
  ? CommandsWithArgs[T]
  : never;

export type ComplexCommandHandler = <T extends ComplexCommand>(
  command: T,
  arg: ArgOf<T>,
) => void;
