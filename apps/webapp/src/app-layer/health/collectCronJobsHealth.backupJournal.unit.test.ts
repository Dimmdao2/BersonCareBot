import { describe, expect, it } from 'vitest';
import { collectCronJobsHealth } from '@/app-layer/health/collectCronJobsHealth';

/**
 * Владелец просил видеть в здоровье системы не только «когда сделан последний бэкап», но и сам
 * список файлов. Список живёт на диске хоста, вебапп его не видит, поэтому едет в панель через
 * `meta_json` строки бэкапа.
 *
 * Ключевое здесь — различие «поля нет» и «список пуст». Схлопнуть их значит показать оператору
 * «бэкапов нет» там, где мы просто не знаем: скрипт на хосте может быть ещё старой версии.
 */
const artifacts = [
  { name: 'unified_therapysto_prod_20260914_024310.dump.age', bytes: 10208570, at: '2026-09-14T02:43:10Z' },
];

async function backupJob(slice: Record<string, unknown>) {
  const payload = await collectCronJobsHealth({
    jobRows: [],
    environmentId: 'prod',
    backupJobs: {
      'backup.hourly': {
        lastStatus: 'success',
        lastStartedAt: null,
        lastFinishedAt: '2026-09-14T02:43:14Z',
        lastSuccessAt: '2026-09-14T02:43:14Z',
        lastFailureAt: null,
        lastDurationMs: 4000,
        lastError: null,
        ...slice,
      },
    },
  });
  return payload.jobs.find((job) => job.jobKey === 'backup.hourly');
}

describe('журнал бэкапов доезжает до панели здоровья', () => {
  it('несёт список файлов, когда скрипт его записал', async () => {
    const job = await backupJob({ artifacts });
    expect(job?.lastTick?.metaJson).toEqual({ artifacts });
  });

  it('пустой список остаётся пустым списком, а не пропадает', async () => {
    const job = await backupJob({ artifacts: [] });
    expect(job?.lastTick?.metaJson).toEqual({ artifacts: [] });
  });

  it('отсутствие журнала НЕ выдаётся за пустой каталог', async () => {
    const job = await backupJob({});
    expect(job?.lastTick?.metaJson).toEqual({});
    expect(job?.lastTick?.metaJson).not.toHaveProperty('artifacts');
  });
});
