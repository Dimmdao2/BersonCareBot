import { describe, expect, it } from 'vitest';
import { formatCommentDateRu } from './doctorTodayFormat';

describe('formatCommentDateRu', () => {
  it('uses relative labels for today and yesterday', () => {
    const now = new Date('2026-09-01T12:00:00.000Z');
    expect(formatCommentDateRu('2026-09-01T04:49:00.000Z', 'Europe/Moscow', now)).toBe(
      'сегодня 07:49',
    );
    expect(formatCommentDateRu('2026-08-31T17:10:00.000Z', 'Europe/Moscow', now)).toBe(
      'вчера 20:10',
    );
  });

  it('uses a short month and includes only a different year', () => {
    const now = new Date('2026-09-01T12:00:00.000Z');
    expect(formatCommentDateRu('2026-08-20T04:49:00.000Z', 'Europe/Moscow', now)).toBe(
      '20 авг 07:49',
    );
    expect(formatCommentDateRu('2025-08-20T04:49:00.000Z', 'Europe/Moscow', now)).toBe(
      '20 авг 2025 07:49',
    );
  });
});
