// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import JSZip from 'jszip';
import { parseProjectData, projectFromBlob, projectToBlob } from './export';
import { ProjectData } from './types';
import { OpenedProject, Persistor } from './persist';

const show: ProjectData = {
  version: '3',
  tracks: { 'Roof 1': { locked: false, keyframes: [{ ts: 1, value: 1 }] } },
};

describe('flat show format', () => {
  test('parses objects and JSON without introducing layout or unused channels', () => {
    expect(parseProjectData(show)).toEqual(show);
    expect(parseProjectData(JSON.stringify(show))).toEqual(show);
    expect(parseProjectData({ ...show, layout: ['ignored'] })).toEqual(show);
    expect(parseProjectData({ version: '3', tracks: {} })).toEqual({ version: '3', tracks: {} });
  });

  test('defaults locks, preserves selection, and sorts keyframes', () => {
    const result = parseProjectData({
      version: '3',
      tracks: {
        Custom: {
          keyframes: [
            { ts: 2, value: 0 },
            { ts: 1, value: 1, selected: true },
          ],
        },
      },
    });
    expect(result.tracks.Custom).toEqual({
      locked: false,
      keyframes: [
        { ts: 1, value: 1, selected: true },
        { ts: 2, value: 0 },
      ],
    });
  });

  test.each([
    null,
    12,
    [],
    { version: '99', tracks: [] },
    { tracks: {} },
    { version: '3', tracks: [] },
    { version: '3', tracks: { X: {} } },
    { version: '3', tracks: { X: { keyframes: [{ ts: NaN, value: 1 }] } } },
    { version: '3', tracks: { X: { keyframes: [], locked: 'yes' } } },
    { version: '3', tracks: { Root: { keyframes: [] } } },
  ])('rejects invalid or unsupported data: %j', (input) => {
    expect(() => parseProjectData(input)).toThrow();
  });

  test('round trips a show and audio with no layout in the archive', async () => {
    const audio = new Blob(['test audio'], { type: 'audio/mpeg' });
    const archive = await projectToBlob({ name: 'Test show', data: show, audio });
    const zip = await JSZip.loadAsync(archive);
    expect(Object.keys(zip.files).sort()).toEqual(['audio.mp3', 'data.json']);
    expect(JSON.parse(await zip.file('data.json')!.async('string'))).toEqual(show);
    const restored = await projectFromBlob('Test show', archive);
    expect(restored.name).toBe('Test show');
    expect(restored.data).toEqual(show);
    expect(restored.audio.size).toBe(audio.size);
    expect(await zip.file('audio.mp3')!.async('string')).toBe('test audio');
  });
});

const treeShow = {
  version: '2',
  tracks: [
    {
      type: 'group',
      id: 'Root',
      children: [
        {
          type: 'group',
          id: 'Old roof layout',
          children: [{ type: 'track', id: 'Roof 1', ...show.tracks['Roof 1'] }],
        },
        { type: 'group', id: 'Empty group', children: [] },
      ],
    },
  ],
};

describe('older show imports', () => {
  test('flattens version 2 trees without retaining layout or mutating the source', () => {
    const original = JSON.stringify(treeShow);
    expect(parseProjectData(treeShow)).toEqual(show);
    expect(parseProjectData(original)).toEqual(show);
    expect(JSON.stringify(treeShow)).toBe(original);
  });

  test('preserves version 2 locks and selections while sorting keyframes', () => {
    expect(
      parseProjectData({
        version: '2',
        tracks: [
          {
            type: 'track',
            id: 'Custom',
            locked: true,
            keyframes: [
              { ts: 2, value: 0 },
              { ts: 1, value: 0.5, selected: true },
            ],
          },
        ],
      }).tracks.Custom,
    ).toEqual({
      locked: true,
      keyframes: [
        { ts: 1, value: 0.5, selected: true },
        { ts: 2, value: 0 },
      ],
    });
  });

  test('converts unversioned names, timestamp aliases, and states', () => {
    expect(
      parseProjectData({
        tracks: [
          {
            name: 'Roof 1',
            id: 'ignored',
            locked: true,
            keyframes: [
              { timestamp: 2, state: false },
              { time: 1, state: '0.5', selected: true },
              { ts: 0, timestamp: 99, value: 0, state: 1 },
            ],
          },
          { id: 'Custom', keyframes: [] },
          { keyframes: [] },
        ],
      }),
    ).toEqual({
      version: '3',
      tracks: {
        'Roof 1': {
          locked: true,
          keyframes: [
            { ts: 0, value: 0 },
            { ts: 1, value: 0.5, selected: true },
            { ts: 2, value: 0 },
          ],
        },
        Custom: { locked: false, keyframes: [] },
        'Track 2': { locked: false, keyframes: [] },
      },
    });
  });

  test.each([undefined, '2'])('accepts empty older shows (version %s)', (version) => {
    expect(parseProjectData({ version, tracks: [] })).toEqual({ version: '3', tracks: {} });
  });

  test.each([
    {
      tracks: [
        { name: 'X', keyframes: [] },
        { id: 'X', keyframes: [] },
      ],
    },
    {
      version: '2',
      tracks: [
        { type: 'track', id: 'X', keyframes: [] },
        { type: 'group', children: [{ type: 'track', id: 'X', keyframes: [] }] },
      ],
    },
  ])('rejects duplicate names instead of silently losing tracks: %j', (input) => {
    expect(() => parseProjectData(input)).toThrow('Duplicate track name: X');
  });

  test.each([
    { tracks: [null] },
    { tracks: [{ keyframes: [{ timestamp: 0 }] }] },
    { tracks: [{ keyframes: [{ timestamp: '0', state: true }] }] },
    { tracks: [{ keyframes: [{ timestamp: 0, state: 'invalid' }] }] },
    { version: '2', tracks: [{ type: 'group' }] },
    { version: '2', tracks: [{ type: 'unknown' }] },
    { version: '2', tracks: [{ type: 'track', id: 'X', keyframes: [], locked: 'yes' }] },
  ])('rejects malformed older data: %j', (input) => {
    expect(() => parseProjectData(input)).toThrow();
  });

  test.each([
    treeShow,
    { tracks: [{ name: 'Roof 1', keyframes: [{ timestamp: 1, state: true }] }] },
  ])('opens an old archive as version 3 and saves only the new format', async (data) => {
    const zip = new JSZip();
    zip.file('data.json', JSON.stringify(data));
    zip.file('audio.mp3', 'original audio');
    const opened = await projectFromBlob('Old show', await zip.generateAsync({ type: 'blob' }));
    expect(opened.data).toEqual(show);
    expect(opened.name).toBe('Old show');
    const saved = await JSZip.loadAsync(await projectToBlob(opened));
    expect(JSON.parse(await saved.file('data.json')!.async('string'))).toEqual(show);
    expect(await saved.file('audio.mp3')!.async('string')).toBe('original audio');
  });

  test('converts persisted data before exposing it to the editor or saving it', async () => {
    let saved: ProjectData | undefined;
    const persistor: Persistor = {
      loadName: async () => 'Old show',
      loadData: async () => treeShow,
      loadAudio: async () => new Blob(['audio']),
      saveName: async () => {},
      saveData: async (value) => {
        saved = value;
      },
      saveAudio: async () => {},
    };
    const opened = await OpenedProject.open(persistor);
    expect(opened.data).toEqual(show);
    await opened.persist();
    expect(saved).toEqual(show);
  });
});
