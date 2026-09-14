import { describe, expect, it } from 'vitest';
import {
  classifyBackupJobHealth,
  classifyCriticalHealthSignals,
  type CriticalHealthSignalsInput,
} from './criticalHealthSignals';

/**
 * Почему этот набор существует.
 *
 * До 14.09.2026 тревога о бэкапе смотрела ровно на одно поле — `lastStatus === 'failure'`. То есть
 * будила только тогда, когда бэкап ЗАПУСТИЛСЯ И УПАЛ. Бэкапа, который не запускался никогда, в
 * журнале нет вовсе, поэтому «бэкапов нет совсем» и «всё хорошо» выглядели для неё одинаково —
 * молчанием. Ровно так и вышло: у боевой базы нового прода не было НИ ОДНОГО бэкапа, а панель
 * здоровья показывала зелёные строки, приехавшие внутри восстановленного дампа.
 *
 * Набор закрепляет обратное: отсутствие бэкапа — такая же авария, как его отказ.
 */

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2026-09-14T12:00:00Z');

function input(overrides: Partial<CriticalHealthSignalsInput>): CriticalHealthSignalsInput {
  return {
    webappDb: 'up',
    integratorApi: 'ok',
    outgoingDelivery: { deadTotal: 0, dueBacklog: 0, deadRecent: 0, lastOperatorDeadAt: null },
    backupJobs: {},
    probeConsecutiveFailRuns: 0,
    probeIncidentsOpenCount: 0,
    videoTranscodeStatus: 'ok',
    ...overrides,
  };
}

function backupTopics(signals: CriticalHealthSignalsInput): string[] {
  return classifyCriticalHealthSignals(signals, NOW)
    .filter((candidate) => candidate.topic === 'backup')
    .map((candidate) => candidate.dedupKey);
}

describe('бэкап, которого нет, — это авария', () => {
  it('строка без единого успешного прогона будит', () => {
    expect(
      backupTopics(
        input({
          backupJobs: {
            'backup.hourly': { lastStatus: 'missing', lastSuccessAt: null, staleAfterSec: 3 * 3600 },
          },
        }),
      ),
    ).toEqual(['critical:backup:backup.hourly:never']);
  });

  it('успешный, но протухший бэкап будит — это встали бэкапы, а не «пока не дошло»', () => {
    expect(
      backupTopics(
        input({
          backupJobs: {
            'backup.hourly': {
              lastStatus: 'success',
              lastSuccessAt: new Date(NOW - 5 * HOUR).toISOString(),
              staleAfterSec: 3 * 3600,
            },
          },
        }),
      ),
    ).toEqual(['critical:backup:backup.hourly:stale']);
  });

  it('свежий успешный бэкап не будит', () => {
    expect(
      backupTopics(
        input({
          backupJobs: {
            'backup.hourly': {
              lastStatus: 'success',
              lastSuccessAt: new Date(NOW - 30 * 60 * 1000).toISOString(),
              staleAfterSec: 3 * 3600,
            },
          },
        }),
      ),
    ).toEqual([]);
  });

  it('отказ остаётся отказом и называется отказом, а не протуханием', () => {
    expect(
      backupTopics(
        input({
          backupJobs: {
            'backup.hourly': {
              lastStatus: 'failure',
              lastSuccessAt: new Date(NOW - 99 * HOUR).toISOString(),
              staleAfterSec: 3 * 3600,
            },
          },
        }),
      ),
    ).toEqual(['critical:backup:backup.hourly:failure']);
  });

  it('каждая пропавшая строка будит отдельно — иначе одна закроет собой остальные', () => {
    expect(
      backupTopics(
        input({
          backupJobs: {
            'backup.hourly': { lastStatus: 'missing', lastSuccessAt: null, staleAfterSec: 3 * 3600 },
            'backup.daily': { lastStatus: 'missing', lastSuccessAt: null, staleAfterSec: 28 * 3600 },
          },
        }),
      ),
    ).toEqual(['critical:backup:backup.hourly:never', 'critical:backup:backup.daily:never']);
  });
});

describe('classifyBackupJobHealth', () => {
  it('без порога устаревание не судится: срок принадлежит манифесту, а не этой функции', () => {
    expect(
      classifyBackupJobHealth(
        { lastStatus: 'success', lastSuccessAt: new Date(NOW - 999 * HOUR).toISOString() },
        NOW,
      ),
    ).toBe('ok');
  });

  /**
   * Настоящий скрипт пишет отметку успеха всегда. Строка без неё — старая или синтетическая, и
   * поднимать по ней тревогу значило бы будить человека из-за формы записи, а не из-за бэкапа.
   */
  it('успех без отметки времени — не «никогда»', () => {
    expect(classifyBackupJobHealth({ lastStatus: 'success' }, NOW)).toBe('ok');
  });

  it('нечитаемая отметка времени читается как отсутствие успеха', () => {
    expect(classifyBackupJobHealth({ lastStatus: 'unknown', lastSuccessAt: 'вчера' }, NOW)).toBe(
      'never',
    );
  });

  it('ровно на границе срока ещё не протух, за ней — уже', () => {
    const staleAfterSec = 3 * 3600;
    const atBoundary = new Date(NOW - staleAfterSec * 1000).toISOString();
    const pastBoundary = new Date(NOW - staleAfterSec * 1000 - 1000).toISOString();

    expect(
      classifyBackupJobHealth({ lastStatus: 'success', lastSuccessAt: atBoundary, staleAfterSec }, NOW),
    ).toBe('ok');
    expect(
      classifyBackupJobHealth(
        { lastStatus: 'success', lastSuccessAt: pastBoundary, staleAfterSec },
        NOW,
      ),
    ).toBe('stale');
  });
});
