import { describe, expect, test } from 'vitest';
import { parseProjectData } from './export';

describe('parseProjectData', () => {
  test('accepts old', () => {
    const result = parseProjectData(oldDataJson);
    expect(result).toStrictEqual(newDataJson);
  });

  test('accepts new', () => {
    const result = parseProjectData(newDataJson);
    expect(result).toStrictEqual(newDataJson);
  });
});

const oldDataJson = {
  projectData: { name: 'carol_of_the_bells', id: 'carol_of_the_bells' },
  tracks: [
    {
      id: 0,
      keyframes: [
        {
          channel: 0,
          time: 1.2696969696969698,
          oldTime: 1.2696969696969698,
          state: 1,
          selected: false,
        },
        {
          channel: 0,
          time: 1.6318181818181818,
          oldTime: 1.6318181818181818,
          state: 0,
          selected: false,
        },
        {
          channel: 0,
          time: 3.6469696969696974,
          oldTime: 3.6469696969696974,
          state: 1,
          selected: true,
        },
      ],
    },
  ],
};

const newDataJson = {
  tracks: [
    {
      name: '0',
      keyframes: [
        {
          timestamp: 1.2696969696969698,
          value: 1,
          selected: false,
        },
        {
          timestamp: 1.6318181818181818,
          value: 0,
          selected: false,
        },
        {
          timestamp: 3.6469696969696974,
          value: 1,
          selected: true,
        },
      ],
    },
  ],
};
