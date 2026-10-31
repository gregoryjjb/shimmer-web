import { createSignal } from 'solid-js';
import { DeepReadonly, LayoutNode } from '../timeline/types';
import {
  defaultLayout,
  LayoutDocument,
  LayoutVisuals,
  parseLayoutDocument,
  withTree,
  withVisuals,
} from './document';
import { loadLayout, saveLayout } from './storage';

export function createLayoutState(
  applyTree: (tree: LayoutNode[]) => void,
  validateTree: (tree: LayoutNode[]) => void,
) {
  const [document, setDocument] = createSignal<DeepReadonly<LayoutDocument>>(defaultLayout());
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal('');
  const ready = loadLayout()
    .then((value) => {
      validateTree(value.tree);
      applyTree(value.tree);
      setDocument(value);
    })
    .catch((cause) => setError(String(cause)))
    .finally(() => setLoading(false));
  let pending = Promise.resolve();
  const update = (change: (current: DeepReadonly<LayoutDocument>) => LayoutDocument) => {
    const result = pending.then(async () => {
      await ready;
      const next = parseLayoutDocument(change(document()));
      validateTree(next.tree);
      await saveLayout(next);
      applyTree(next.tree);
      setDocument(next);
      setError('');
    });
    pending = result.catch(() => {});
    return result;
  };
  return {
    document,
    loading,
    error,
    ready,
    replace: (input: unknown) => update(() => parseLayoutDocument(input)),
    updateTree: (tree: LayoutNode[], origins: Record<string, string>) =>
      update((current) => withTree(current, tree, origins)),
    updateVisuals: (visuals: LayoutVisuals) => update((current) => withVisuals(current, visuals)),
  };
}
