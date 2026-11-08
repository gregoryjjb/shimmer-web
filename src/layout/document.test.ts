import { expect, test } from 'vitest';
import { parseLayoutDocument } from './document';

const rectangle = { x: 0.2, y: 0.3, width: 0.1, height: 0.05, color: '#ff8800' };
const document = parseLayoutDocument({
  tree: [{ type: 'group', id: 'House', children: [{ type: 'track', id: 'Roof' }] }],
  visuals: {
    backgroundImage: 'data:image/png;base64,cGhvdG8=',
    trackObjects: { Roof: [rectangle] },
  },
});

test('round trips the whole document while excluding show and workspace state', () => {
  expect(parseLayoutDocument(JSON.stringify(document))).toEqual(document);
  expect(
    parseLayoutDocument({
      ...document,
      tracks: {},
      collapsedGroups: ['House'],
      position: { x: 3 },
    }),
  ).toEqual(document);
  expect(parseLayoutDocument({ tree: [] })).toEqual({ tree: [], visuals: { trackObjects: {} } });
});

test('rejects invalid trees, objects, missing tracks and nonportable image references', () => {
  for (const invalid of [
    [],
    {
      tree: [
        { type: 'track', id: 'Same' },
        { type: 'track', id: 'Same' },
      ],
    },
    { ...document, visuals: { backgroundImage: 'blob:local-only', trackObjects: {} } },
    { ...document, visuals: { trackObjects: { Missing: [rectangle] } } },
    { ...document, visuals: { trackObjects: { House: [rectangle] } } },
    { ...document, visuals: { trackObjects: { Roof: [{ ...rectangle, width: -1 }] } } },
  ])
    expect(() => parseLayoutDocument(invalid)).toThrow();
});

test('prototype-like track names remain ordinary mapping keys', () => {
  const parsed = parseLayoutDocument({
    tree: [{ type: 'track', id: '__proto__' }],
    visuals: { trackObjects: { ['__proto__']: [rectangle] } },
  });
  expect(parsed.visuals.trackObjects['__proto__']).toEqual([rectangle]);
  expect(parsed.visuals.trackObjects['constructor']).toBeUndefined();
});
