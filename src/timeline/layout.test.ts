import { expect, test } from 'vitest';
import { HOUSE_LAYOUT, materializeLayout, parseLayout } from './layout';
import TimelineData from './timeline-data';
import { TimelineEmitter } from './events';
import { parseProjectData } from './export';

test('layout JSON round trips only the tree', () => {
  const layout = [
    {
      type: 'group',
      id: 'Garden',
      collapsed: true,
      children: [{ type: 'track', id: 'Lamp', keyframes: [{ ts: 1, value: 1 }] }],
    },
  ];
  const parsed = parseLayout(JSON.stringify(layout));
  expect(parsed).toEqual([
    { type: 'group', id: 'Garden', children: [{ type: 'track', id: 'Lamp' }] },
  ]);
  expect(parseLayout(JSON.stringify(parsed))).toEqual(parsed);
  expect(parseLayout(HOUSE_LAYOUT)).toEqual(HOUSE_LAYOUT);
});

test.each([
  null,
  {},
  [{ type: 'group', id: 'X' }],
  [{ type: 'track', id: '' }],
  [{ type: 'group', id: 'X', children: [{ type: 'track', id: 'X' }] }],
  [{ type: 'group', id: 'Beat', children: [] }],
])('rejects malformed or ambiguous layout: %j', (input) => {
  expect(() => parseLayout(input)).toThrow();
});

test('joins shows to a custom layout by name and retains unmatched channels', () => {
  const layout = parseLayout([
    { type: 'group', id: 'Garden', children: [{ type: 'track', id: 'Lamp' }] },
  ]);
  const tracks = { Beat: { locked: true, keyframes: [] }, Extra: { locked: false, keyframes: [] } };
  expect(materializeLayout(tracks, layout)).toEqual([
    { type: 'track', id: 'Beat' },
    ...layout,
    { type: 'track', id: 'Extra' },
  ]);
  expect(materializeLayout(tracks, [{ type: 'track', id: 'Beat' }])).toHaveLength(2);
});

test('changing layouts preserves show data and undo, and filters obsolete collapsed groups', () => {
  const data = new TimelineData(new TimelineEmitter());
  data.replaceAll({
    version: '3',
    tracks: { Lamp: { locked: false, keyframes: [{ ts: 1, value: 1, selected: true }] } },
  });
  data.moveSelected(1);
  data.undo();
  data.setGroupCollapsed('Roof', true);
  const show = structuredClone(data.data);
  data.setLayout([{ type: 'group', id: 'Garden', children: [{ type: 'track', id: 'Lamp' }] }]);
  expect(data.data).toEqual(show);
  expect(data.collapsedGroupIDs).toEqual([]);
  expect(data.visibleRows.map((row) => row.id)).toEqual(['Garden', 'Lamp']);
  data.redo();
  expect(data.data.tracks.Lamp.keyframes[0].ts).toBe(2);
  expect(data.baseLayout[0].id).toBe('Garden');
});

test('group name collisions are validated against the chosen layout, not the default', () => {
  const data = new TimelineData(new TimelineEmitter());
  const show = parseProjectData({ version: '3', tracks: { Root: { keyframes: [] } } });
  expect(() => data.replaceAll(show)).toThrow('Group name conflicts');
  data.setLayout([]);
  data.replaceAll(show);
  expect(() => data.setLayout(HOUSE_LAYOUT)).toThrow('Group name conflicts');
  expect(data.baseLayout).toEqual([]);
});
