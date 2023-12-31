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
  e: 'equallySpace',
};

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
