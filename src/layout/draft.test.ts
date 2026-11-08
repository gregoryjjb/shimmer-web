import { expect, test } from 'vitest';
import { createLayoutDraft, draftTracks, saveLayoutDraft } from './draft';
import { LayoutDocument } from './document';

const first = { x: 0.2, y: 0.3, width: 0.1, height: 0.1, color: '#ff8800' };
const second = { ...first, color: '#ffffff' };
const layout: LayoutDocument = {
  tree: [
    {
      type: 'group',
      id: 'House',
      children: [
        { type: 'track', id: 'Roof' },
        { type: 'track', id: 'Door' },
      ],
    },
  ],
  visuals: { trackObjects: { Roof: [first], Door: [second] } },
};

test('reparenting and swapping names preserve object ownership without mutating the saved layout', () => {
  let id = 0;
  const draft = createLayoutDraft(layout, () => String(id++));
  const [roof, door] = draftTracks(draft);
  roof.id = 'Door';
  door.id = 'Roof';
  if (draft[0].type !== 'group') throw new Error('Expected group');
  draft[0].children.splice(0, 1);
  draft.push(roof);
  const saved = saveLayoutDraft(draft, '');
  expect(saved.tree).toEqual([
    { type: 'group', id: 'House', children: [{ type: 'track', id: 'Roof' }] },
    { type: 'track', id: 'Door' },
  ]);
  expect(saved.visuals.trackObjects).toEqual({ Door: [first], Roof: [second] });
  roof.objects[0].color = '#abcdef';
  expect(layout.visuals.trackObjects.Roof[0].color).toBe('#ff8800');
});

test('duplicate names are rejected at save without discarding either set of objects', () => {
  let id = 0;
  const draft = createLayoutDraft(layout, () => String(id++));
  const [roof, door] = draftTracks(draft);
  roof.id = door.id;
  expect(() => saveLayoutDraft(draft, '')).toThrow('Duplicate name');
  roof.id = 'New roof';
  expect(saveLayoutDraft(draft, '').visuals.trackObjects).toEqual({
    'New roof': [first],
    Door: [second],
  });
});
