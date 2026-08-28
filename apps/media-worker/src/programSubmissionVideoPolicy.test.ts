import { describe, expect, it } from 'vitest';
import { isProgramSubmissionVideoDurationAllowed } from './programSubmissionVideoPolicy.js';

describe('program submission video duration policy', () => {
  it('rejects videos below 10 seconds and accepts the boundary and normal videos', () => {
    expect(isProgramSubmissionVideoDurationAllowed(9.999)).toBe(false);
    expect(isProgramSubmissionVideoDurationAllowed(10)).toBe(true);
    expect(isProgramSubmissionVideoDurationAllowed(60)).toBe(true);
  });
});
