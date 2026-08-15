import { describe, expect, test } from 'vitest';
import { parseProjectData } from './export';

describe('parseProjectDataVersioned', () => {
  // --- Old format (no version field) ---

  describe('old format upgrade', () => {
    test('upgrades old format with time/state fields', () => {
      const result = parseProjectData({
        tracks: [
          {
            name: 'Track A',
            keyframes: [
              { time: 1.0, state: 1 },
              { time: 2.0, state: 0 },
            ],
          },
        ],
      });

      expect(result).toStrictEqual({
        version: '2',
        tracks: [
          {
            type: 'track',
            id: 'Track A',
            locked: false,
            keyframes: [
              { ts: 1.0, value: 1 },
              { ts: 2.0, value: 0 },
            ],
          },
        ],
      });
    });

    test('upgrades old format with ts/value fields', () => {
      const result = parseProjectData({
        tracks: [
          {
            name: 'T',
            keyframes: [{ ts: 5.0, value: 1 }],
          },
        ],
      });

      expect(result.version).toBe('2');
      expect(result.tracks[0]).toMatchObject({
        type: 'track',
        id: 'T',
        keyframes: [{ ts: 5.0, value: 1 }],
      });
    });

    test('generates sequential IDs from track index when no name', () => {
      const result = parseProjectData({
        tracks: [{ keyframes: [] }, { keyframes: [] }, { keyframes: [] }],
      });

      expect(result.tracks.map((t) => t.id)).toEqual(['Track 0', 'Track 1', 'Track 2']);
    });

    test('preserves selected flag on keyframes', () => {
      const result = parseProjectData({
        tracks: [
          {
            keyframes: [
              { time: 1.0, state: 1, selected: true },
              { time: 2.0, state: 0, selected: false },
            ],
          },
        ],
      });

      const track = result.tracks[0];
      if (track.type !== 'track') throw new Error('expected track');
      expect(track.keyframes[0].selected).toBe(true);
      expect(track.keyframes[1].selected).toBeUndefined();
    });

    test('accepts a JSON string', () => {
      const json = JSON.stringify({
        tracks: [{ keyframes: [{ ts: 0, value: 1 }] }],
      });

      const result = parseProjectData(json);
      expect(result.version).toBe('2');
      expect(result.tracks).toHaveLength(1);
    });

    test('throws on missing tracks', () => {
      expect(() => parseProjectData({})).toThrow('Project data missing tracks array');
    });

    test('throws on invalid keyframe timestamp', () => {
      expect(() =>
        parseProjectData({
          tracks: [{ keyframes: [{ value: 1 }] }],
        }),
      ).toThrow('missing or invalid timestamp');
    });
  });

  // --- Version 2 (strict parsing) ---

  describe('version 2 strict parsing', () => {
    test('parses valid v2 with tracks', () => {
      const input = {
        version: '2',
        tracks: [
          {
            type: 'track',
            id: 'abc',
            locked: false,
            keyframes: [{ ts: 1.5, value: 0 }],
          },
        ],
      };

      const result = parseProjectData(input);
      expect(result).toStrictEqual(input);
    });

    test('parses v2 with groups and nested tracks', () => {
      const input = {
        version: '2',
        tracks: [
          {
            type: 'group',
            id: 'g1',
            children: [
              {
                type: 'track',
                id: 't1',
                locked: false,
                keyframes: [{ ts: 0, value: 1 }],
              },
              {
                type: 'track',
                id: 't2',
                locked: false,
                keyframes: [],
              },
            ],
          },
          {
            type: 'track',
            id: 't3',
            locked: false,
            keyframes: [{ ts: 2.0, value: 0 }],
          },
        ],
      };

      const result = parseProjectData(input);
      expect(result).toStrictEqual(input);
    });

    test('parses deeply nested groups', () => {
      const input = {
        version: '2',
        tracks: [
          {
            type: 'group',
            id: 'outer',
            children: [
              {
                type: 'group',
                id: 'inner',
                children: [
                  {
                    type: 'track',
                    id: 'deep',
                    locked: false,
                    keyframes: [],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = parseProjectData(input);
      expect(result).toStrictEqual(input);
    });

    test('throws on unknown version', () => {
      expect(() => parseProjectData({ version: '99', tracks: [] })).toThrow(
        "Unknown project data version: '99'",
      );
    });

    test('throws on missing type in node', () => {
      expect(() =>
        parseProjectData({
          version: '2',
          tracks: [{ id: 'x', keyframes: [] }],
        }),
      ).toThrow("type must be 'track' or 'group'");
    });

    test('throws on track missing id', () => {
      expect(() =>
        parseProjectData({
          version: '2',
          tracks: [{ type: 'track', keyframes: [] }],
        }),
      ).toThrow('id must be a non-empty string');
    });

    test('throws on track missing keyframes', () => {
      expect(() =>
        parseProjectData({
          version: '2',
          tracks: [{ type: 'track', id: 'x' }],
        }),
      ).toThrow('keyframes must be an array');
    });

    test('throws on group missing children', () => {
      expect(() =>
        parseProjectData({
          version: '2',
          tracks: [{ type: 'group', id: 'g' }],
        }),
      ).toThrow('children must be an array');
    });

    test('throws on invalid keyframe ts', () => {
      expect(() =>
        parseProjectData({
          version: '2',
          tracks: [
            {
              type: 'track',
              id: 'x',
              keyframes: [{ ts: 'not a number', value: 1 }],
            },
          ],
        }),
      ).toThrow('ts must be a number');
    });

    test('throws on non-object input', () => {
      expect(() => parseProjectData(42)).toThrow('Project data must be an object');
    });

    test('throws on null input', () => {
      expect(() => parseProjectData(null)).toThrow('Project data must be an object');
    });
  });

  // --- ID uniqueness validation ---

  describe('duplicate ID validation', () => {
    test('throws on duplicate track IDs in v2', () => {
      expect(() =>
        parseProjectData({
          version: '2',
          tracks: [
            { type: 'track', id: 'dup', keyframes: [] },
            { type: 'track', id: 'dup', keyframes: [] },
          ],
        }),
      ).toThrow("Duplicate node ID: 'dup'");
    });

    test('throws on duplicate IDs across groups and tracks in v2', () => {
      expect(() =>
        parseProjectData({
          version: '2',
          tracks: [
            {
              type: 'group',
              id: 'shared',
              children: [{ type: 'track', id: 't1', keyframes: [] }],
            },
            { type: 'track', id: 'shared', keyframes: [] },
          ],
        }),
      ).toThrow("Duplicate node ID: 'shared'");
    });

    test('throws on duplicate IDs in old format upgrade', () => {
      expect(() =>
        parseProjectData({
          tracks: [
            { name: 'Same Name', keyframes: [] },
            { name: 'Same Name', keyframes: [] },
          ],
        }),
      ).toThrow("Duplicate node ID: 'Same Name'");
    });
  });
});
