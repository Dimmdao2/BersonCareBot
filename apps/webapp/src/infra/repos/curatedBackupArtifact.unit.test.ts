import { describe, expect, it } from 'vitest';
import { backupArtifactSchema } from '@/infra/repos/pgCuratedSystemHealthDiagnostics';

/**
 * Журнал бэкапов — единственное место, где имя файла с ДИСКА ХОСТА доезжает до панели глобального
 * админа. Форму проверяют трижды: скрипт перед склейкой в SQL, курируемая функция при выдаче и эта
 * схема при разборе. Здесь проверяется третий заслон: он обязан держать сам по себе, даже если
 * первые два когда-нибудь обойдут.
 */
describe('журнал бэкапов — форма записи', () => {
  const good = { name: 'unified_therapysto_prod_20260914_024310.dump.age', bytes: 10208570, at: '2026-09-14T02:43:10Z' };

  it('пропускает наше сгенерированное имя', () => {
    expect(backupArtifactSchema.parse(good)).toEqual(good);
  });

  it.each([
    ["evil'; DROP TABLE public.operator_job_status; --.dump.age", 'кавычка и SQL'],
    ['../../etc/passwd.dump.age', 'выход из каталога'],
    ['unified prod.dump.age', 'пробел'],
    ['unified_prod.dump', 'не наш суффикс'],
    ['unified_prod.dump.age.sh', 'исполняемый хвост'],
  ])('отбивает имя «%s» (%s)', (name) => {
    expect(backupArtifactSchema.safeParse({ ...good, name }).success).toBe(false);
  });

  it('отбивает отрицательный размер', () => {
    expect(backupArtifactSchema.safeParse({ ...good, bytes: -1 }).success).toBe(false);
  });

  it.each(['2026-09-14 02:43:10', '2026-09-14T02:43:10+03:00', 'вчера'])(
    'отбивает время «%s» — ждём только UTC заданного вида',
    (at) => {
      expect(backupArtifactSchema.safeParse({ ...good, at }).success).toBe(false);
    },
  );

  it('не пропускает лишние поля мимо аллоу-листа', () => {
    expect(backupArtifactSchema.safeParse({ ...good, path: '/opt/backups' }).success).toBe(false);
  });
});
