import { describe, expect, it } from 'vitest';
import { formatBytesAsMb } from '@/shared/lib/formatStorageMb';

describe('formatBytesAsMb', () => {
  it('shows megabytes below one gigabyte', () => {
    expect(formatBytesAsMb(8 * 1024 * 1024)).toBe('8 МБ');
    expect(formatBytesAsMb(500_000)).toBe('0,5 МБ');
  });

  it('adds gigabytes in parentheses for large values', () => {
    expect(formatBytesAsMb(12_651_045_821)).toMatch(/МБ \(11,8 ГБ\)$/);
    expect(formatBytesAsMb(2_501_617_866)).toMatch(/МБ \(2,3 ГБ\)$/);
  });
});
