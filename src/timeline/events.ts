type EventMap = Record<string, any>;
type EventKey<T extends EventMap> = string & keyof T;
type EventHandler<T> = (payload: T) => void;

export class Emitter<T extends EventMap> {
  listeners: {
    [K in keyof EventMap]?: Array<(p: EventMap[K]) => void>;
  } = {};

  on = <K extends EventKey<T>>(event: K, fn: EventHandler<T[K]>) => {
    this.listeners[event] = (this.listeners[event] || []).concat(fn);
  };

  emit = <K extends EventKey<T>>(event: K, payload: T[K]) => {
    (this.listeners[event] || []).forEach((fn) => fn(payload));
  };
}

export class TimelineEmitter extends Emitter<{
  play: undefined;
  pause: undefined;
  edit: string;
  selected: number;
  render: void;
  loading: boolean;
}> {
  // constructor() {
  //   super();
  //   // this.listeners = {};
  // }
}

// const testElement = document.createElement("button");

// // testElement.addEventListener();

// interface Listener {
//   addEventListener: <T>(
//     key: T,
//     callback: (...args: unknown[]) => void
//   ) => void;
// }

// const applyListeners = (listener: Listener, handlers: Record<)
