export type SimpleCommand =
  | 'play'
  | 'pause'
  | 'playtoggle'
  | 'undo'
  | 'redo'
  | 'invert'
  | 'shiftUp'
  | 'shiftDown'
  | 'grab'
  | 'scale'
  | 'align'
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
  g: 'grab',
  s: 'scale',
  ctrl_d: 'duplicate',
  delete: 'delete',
  w: 'dedup',
  escape: 'cancel',
  ctrl_a: 'selectAll',
  a: 'align',
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
