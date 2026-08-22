/**
 * D17 шаг 2b — третий путь: `operatorHealthDrizzle` больше не пишет `public.operator_incidents` и
 * `public.operator_job_status` отношением ни при каком принципале.
 *
 * Здесь корень зовётся не через внедряемый `DbPort`, а через `createDbPort()` внутри самого
 * репозитория, поэтому заглушка стоит на той же границе, но ставится подменой модуля — ровно как в
 * соседнем `operatorHealthDrizzle.openOrTouchOperatorIncident.test.ts`.
 *
 * Второй арбитр — подменённый `getIntegratorDrizzle`, который БРОСАЕТ. Реляционный путь по этим
 * двум таблицам шёл только через него, и он же — единственный способ вернуть его назад: если
 * запасная ветка появится снова, тест станет красным на брошенной ошибке, а не на тексте оператора.
 */
import { describe, expect, it, vi } from 'vitest';
import { runWithInfraPrincipal } from '../../principal/organizationPrincipal.js';

const query = vi.fn();
const technicalRuntimeRole = vi.fn<() => string | undefined>(() => 'app_operational_scheduler');

vi.mock('../client.js', () => ({
  createDbPort: () => ({ query, tx: vi.fn() }),
}));
vi.mock('../withClient.js', () => ({
  getCurrentIntegratorTechnicalRuntimeRole: () => technicalRuntimeRole(),
}));
vi.mock('../drizzle.js', () => ({
  getIntegratorDrizzle: () => {
    throw new Error('relational writer on operator health tables came back');
  },
}));

type Executed = [string, unknown[]];

function executed(): Executed[] {
  return query.mock.calls as Executed[];
}

function expectNoRelationWrite(relation: string): void {
  for (const [text] of executed()) {
    expect(text).not.toMatch(new RegExp(`INSERT\\s+INTO\\s+public\\.${relation}`, 'i'));
    expect(text).not.toMatch(new RegExp(`UPDATE\\s+public\\.${relation}`, 'i'));
  }
}

describe('D17 шаг 2b — результат синтетических проб', () => {
  it('и чтение прежнего состояния, и запись итога идут узкими дверями планировщика', async () => {
    query.mockReset();
    query
      .mockResolvedValueOnce({ rows: [{ meta_json: { consecutiveFailures: { max: 1 } } }] })
      .mockResolvedValueOnce({ rows: [] });
    const { recordOperatorOutboundProbeRun } = await import('./operatorHealthDrizzle.js');

    const streak = await runWithInfraPrincipal({ source: 'scheduler:handle-tick-event' }, () =>
      recordOperatorOutboundProbeRun({
        max: 'fail',
        telegram: 'ok',
        google_calendar: 'ok',
        probed: ['max', 'telegram', 'google_calendar'],
      }),
    );

    expect(streak.consecutiveFailures.max).toBe(2);
    expect(streak.consecutiveFailures.telegram).toBe(0);
    expect(executed()).toHaveLength(2);
    expect(executed()[0]![0]).toContain('app.read_operator_outbound_probe_meta');
    expect(executed()[1]![0]).toContain('app.record_operator_outbound_probe_run');
    // `job_key` пинится телом двери, а не вызывающим: в аргументах его нет и подставить нельзя.
    expect(JSON.stringify(executed()[1]![1])).not.toContain('health.outbound_probe.run');
    expectNoRelationWrite('operator_job_status');
  });

  it('роль не планировщика запасного реляционного пути больше не находит — дверь одна', async () => {
    query.mockReset();
    technicalRuntimeRole.mockReturnValue(undefined);
    query
      .mockResolvedValueOnce({ rows: [{ meta_json: {} }] })
      .mockResolvedValueOnce({ rows: [] });
    const { recordOperatorOutboundProbeRun } = await import('./operatorHealthDrizzle.js');

    await runWithInfraPrincipal({ source: 'worker:outgoing-delivery-tick' }, () =>
      recordOperatorOutboundProbeRun({ max: 'ok', telegram: 'ok', google_calendar: 'ok' }),
    );

    expect(executed()[1]![0]).toContain('app.record_operator_outbound_probe_run');
    expectNoRelationWrite('operator_job_status');
    technicalRuntimeRole.mockReturnValue('app_operational_scheduler');
  });
});

describe('D17 шаг 2b — закрытие инцидентов выздоровевшей пробы', () => {
  it('оба пространства ключей закрываются одной узкой дверью, без UPDATE по таблице инцидентов', async () => {
    query.mockReset();
    query
      .mockResolvedValueOnce({ rows: [{ resolved: 2 }] })
      .mockResolvedValueOnce({ rows: [{ resolved: 1 }] });
    const { resolveOpenOperatorOutboundProbeIncidents } = await import('./operatorHealthDrizzle.js');

    const resolved = await runWithInfraPrincipal({ source: 'scheduler:handle-tick-event' }, () =>
      resolveOpenOperatorOutboundProbeIncidents('telegram'),
    );

    expect(resolved).toBe(3);
    expect(executed()).toHaveLength(2);
    for (const [text] of executed()) expect(text).toContain('app.resolve_operator_probe_incidents');
    // Префикс — единственный аргумент: отбор классов «пейджить с первого раза» во втором
    // пространстве делает тело двери, а не вызывающий, поэтому подсунуть чужой класс нечем.
    expect(executed().map(([, params]) => params)).toEqual([
      ['outbound:telegram:'],
      ['outbound_delivery_provider:telegram:'],
    ]);
    expectNoRelationWrite('operator_incidents');
  });
});
