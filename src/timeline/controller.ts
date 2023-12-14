interface Action<T extends unknown[], U> {
  id: string;
  // fn: (...args: T) => U;
  args: T;
}

// const PLAY: Action = {
//   id: "play",
// };
