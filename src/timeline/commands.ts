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
  w: 'dedup',
  escape: 'cancel',
  ctrl_a: 'selectAll',
  a: 'align',
  shift_s: 'snapToCursor',
  e: 'equallySpace',
};

const formattedKeybinds: Partial<Record<SimpleCommand, string>> = {};
Object.entries(keybinds).forEach(([keybind, command]) => {
  formattedKeybinds[command] = keybind;
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
