// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import JSZip from 'jszip';
import { parseProjectData, projectFromBlob, projectToBlob } from './export';
import { ProjectData } from './types';

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
    { version: '2', tracks: [] },
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
