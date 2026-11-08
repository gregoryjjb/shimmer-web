import { DeepReadonly, LayoutNode } from '../timeline/types';
import { VisualizerObject } from '../visualizer/types';
import { LayoutDocument, parseLayoutDocument } from './document';

export type DraftTrack = { type: 'track'; id: string; key: string; objects: VisualizerObject[] };
export type DraftNode =
  | DraftTrack
  | { type: 'group'; id: string; key: string; children: DraftNode[] };

export function createLayoutDraft(
  document: DeepReadonly<LayoutDocument>,
  createKey: () => string,
): DraftNode[] {
  const layout = parseLayoutDocument(document);
  const visit = (nodes: LayoutNode[]): DraftNode[] =>
    nodes.map((node) =>
      node.type === 'group'
        ? { ...node, key: createKey(), children: visit(node.children) }
        : { ...node, key: createKey(), objects: layout.visuals.trackObjects[node.id] ?? [] },
    );
  return visit(layout.tree);
}

export function draftTracks(nodes: DraftNode[]): DraftTrack[] {
  return nodes.flatMap((node) => (node.type === 'group' ? draftTracks(node.children) : [node]));
}

export function saveLayoutDraft(tree: DraftNode[], backgroundImage: string): LayoutDocument {
  return parseLayoutDocument({
    tree,
    visuals: {
      ...(backgroundImage ? { backgroundImage } : {}),
      trackObjects: Object.fromEntries(
        draftTracks(tree)
          .filter((track) => track.objects.length)
          .map((track) => [track.id, track.objects]),
      ),
    },
  });
}
