/**
 * A state-based linear undo history manager.
 */
export class UndoHistory<T> {
  private buffer: (T | undefined)[];
  private position = 0;

  private redoStack: T[] = [];

  /**
   * @param size Maximum number of undo history items to store
   * @param initialState Base state, cannot be undone
   */
  constructor(size: number, initialState: T) {
    if (size <= 0) {
      throw new Error('Undo history size must be greater than 0');
    }

    this.buffer = Array(size).fill(undefined);
    this.buffer[0] = initialState;
  }

  private nextPosition = () => {
    let n = this.position + 1;
    if (n >= this.buffer.length) {
      n = 0;
    }
    return n;
  };

  private prevPosition = () => {
    let n = this.position - 1;
    if (n < 0) {
      n = this.buffer.length - 1;
    }
    return n;
  };

  private _push = (state: T) => {
    this.position = this.nextPosition();
    this.buffer[this.position] = state;
  };

  /**
   * Push a new state to the history
   */
  push = (state: T) => {
    this._push(state);
    this.redoStack = [];
  };

  /**
   * Revert the most recently pushed state
   * @returns The state that was undone, or undefined if nothing could be
   * undone. This is not the new current state; call head() for that.
   */
  undo = (): T | undefined => {
    const oldHead = this.buffer[this.position];
    const newHead = this.buffer[this.prevPosition()];

    if (!newHead || !oldHead) {
      // Nothing to undo
      return;
    }

    this.buffer[this.position] = undefined;
    this.position = this.prevPosition();
    this.redoStack.push(oldHead);

    return oldHead;
  };

  /**
   * @returns The current state
   */
  head = (): T | undefined => {
    return this.buffer[this.position];
  };

  /**
   * Reapply the most recently undone state
   * @returns The reapplied state, or undefined if there was nothing to redo
   */
  redo = (): T | undefined => {
    const snapshot = this.redoStack.pop();

    if (snapshot) {
      this._push(snapshot);
    }

    return snapshot;
  };

  debug = () => {
    return this.buffer;
  }
}
