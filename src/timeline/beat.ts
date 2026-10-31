import { Track } from './types';

export const BEAT_TRACK_ID = 'Beat';
export const BEAT_FLASH_DURATION_SECONDS = 0.1;

export const createBeatTrack = (): Track => ({ keyframes: [], locked: true });
