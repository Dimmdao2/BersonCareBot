import { describe, expect, it } from 'vitest';
import {
  parsePositiveVideoDurationSeconds,
  roundVideoDurationSecondsForStorage,
} from './probeVideoDurationSeconds.js';

describe('video duration precision', () => {
  it('keeps the precise measurement for policy while preserving whole-second storage', () => {
    const measured = parsePositiveVideoDurationSeconds('9.600000');

    expect(measured).toBe(9.6);
    expect(roundVideoDurationSecondsForStorage(measured)).toBe(10);
    expect(roundVideoDurationSecondsForStorage(12)).toBe(12);
  });
});
