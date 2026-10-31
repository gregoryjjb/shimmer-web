import { HOUSE_LAYOUT, iterateLeaves, iterateNodes, parseLayout } from '../timeline/layout';
import { DeepReadonly, LayoutNode } from '../timeline/types';
import { parseConfig, VisualizerConfig } from '../visualizer/types';

export type LayoutVisuals = {
  backgroundImage?: string;
  trackObjects: VisualizerConfig;
};

export type LayoutDocument = {
  tree: LayoutNode[];
  visuals: LayoutVisuals;
};

export const defaultLayout = (): LayoutDocument => ({
  tree: structuredClone(HOUSE_LAYOUT),
  visuals: { trackObjects: Object.create(null) },
});

export function parseLayoutDocument(input: unknown): LayoutDocument {
  const raw = typeof input === 'string' ? JSON.parse(input) : input;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Expected a layout document with a tree and visuals');
  const tree = parseLayout(raw.tree);
  const visuals = raw.visuals ?? { trackObjects: {} };
  if (!visuals || typeof visuals !== 'object' || Array.isArray(visuals))
    throw new Error('Invalid layout visuals');
  const backgroundImage = visuals.backgroundImage;
  if (
    backgroundImage !== undefined &&
    (typeof backgroundImage !== 'string' ||
      !/^data:image\/[\w.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/.test(backgroundImage))
  )
    throw new Error('Background image must be an embedded image');
  const trackObjects = parseConfig(JSON.stringify(visuals.trackObjects ?? {}));
  const tracks = new Set([...iterateLeaves(...tree)].map((node) => node.id));
  for (const name of Object.keys(trackObjects)) {
    if (!tracks.has(name)) throw new Error('Visualizer track is missing from the tree: ' + name);
  }
  return {
    tree,
    visuals: { ...(backgroundImage === undefined ? {} : { backgroundImage }), trackObjects },
  };
}

/** Add show-only tracks when visualizer objects make them part of the saved layout. */
export function withVisuals(
  document: DeepReadonly<LayoutDocument>,
  visuals: LayoutVisuals,
): LayoutDocument {
  const tree = parseLayout(document.tree);
  const names = new Set([...iterateNodes(...tree)].map((node) => node.id));
  for (const [id, objects] of Object.entries(visuals.trackObjects)) {
    if (objects.length && !names.has(id)) tree.push({ type: 'track', id });
  }
  const tracks = new Set([...iterateLeaves(...tree)].map((node) => node.id));
  return parseLayoutDocument({
    tree,
    visuals: {
      ...visuals,
      trackObjects: Object.fromEntries(
        Object.entries(visuals.trackObjects).filter(
          ([id, objects]) => tracks.has(id) || objects.length,
        ),
      ),
    },
  });
}

/** Origins map each surviving track's new name to its name when editing began. */
export function withTree(
  document: DeepReadonly<LayoutDocument>,
  tree: LayoutNode[],
  origins: Record<string, string>,
): LayoutDocument {
  const trackObjects = Object.fromEntries(
    [...iterateLeaves(...tree)].flatMap((node) => {
      const original = Object.prototype.hasOwnProperty.call(origins, node.id)
        ? origins[node.id]
        : node.id;
      const objects = document.visuals.trackObjects[original];
      return objects ? [[node.id, objects]] : [];
    }),
  );
  return parseLayoutDocument({ tree, visuals: { ...document.visuals, trackObjects } });
}
