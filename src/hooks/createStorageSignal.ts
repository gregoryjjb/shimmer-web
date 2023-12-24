import { Signal, createSignal } from 'solid-js';

export const createStoredSignal = <T>(
  key: string,
  defaultValue: T,
): Signal<T> => {
  const raw = localStorage.getItem(key);
  const initialValue = raw ? (JSON.parse(raw) as T) : defaultValue;

  const [value, setValue] = createSignal<T>(initialValue);

  const setValueAndStore = ((arg) => {
    // @ts-ignore
    const v = setValue(arg);
    localStorage.setItem(key, JSON.stringify(v));
    return v;
  }) as typeof setValue;

  return [value, setValueAndStore];
};
