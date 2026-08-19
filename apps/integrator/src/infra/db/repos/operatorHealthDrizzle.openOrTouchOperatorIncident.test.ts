import { describe, expect, it, vi } from 'vitest';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import {
  runWithOrganizationPrincipal,
  runWithInfraPrincipal,
} from '../../principal/organizationPrincipal.js';

const query = vi.fn();
const technicalRuntimeRole = vi.fn<() => string | undefined>(() => undefined);

vi.mock('../client.js', () => ({
  createDbPort: () => ({ query, tx: vi.fn() }),
}));
vi.mock('../withClient.js', () => ({
  getCurrentIntegratorTechnicalRuntimeRole: () => technicalRuntimeRole(),
}));

describe('openOrTouchOperatorIncident', () => {
  it('дано: провайдер отказал → тогда инцидент открывается/трогается через capability app.open_or_touch_operator_incident, без прямого INSERT/UPDATE на operator_incidents', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'incident-1', occurrence_count: 2 }] });
    const { openOrTouchOperatorIncident } = await import('./operatorHealthDrizzle.js');

    const result = await openOrTouchOperatorIncident({
      dedupKey: 'outbound_delivery_provider:email:provider_rejected',
      direction: 'outbound_delivery_provider',
      integration: 'email',
      errorClass: 'provider_rejected',
      errorDetail: null,
    });

    expect(result).toEqual({ id: 'incident-1', occurrenceCount: 2 });
    expect(query).toHaveBeenCalledTimes(1);
    const [sqlText] = query.mock.calls[0] as [string, unknown[]];
    expect(sqlText).toContain('app.open_or_touch_operator_incident');
    expect(sqlText).not.toMatch(/INSERT INTO\s+public\.operator_incidents/i);
    expect(sqlText).not.toMatch(/UPDATE\s+public\.operator_incidents/i);
  });

  it('дано: тик проб под операционной ролью планировщика → тогда инцидент открывается через узкую probe-capability, а не через общую (C4 запрещает планировщику app.open_or_touch_operator_incident)', async () => {
    technicalRuntimeRole.mockReturnValue('app_operational_scheduler');
    query.mockResolvedValueOnce({ rows: [{ id: 'incident-2', occurrence_count: 1 }] });
    const { openOrTouchOperatorIncident } = await import('./operatorHealthDrizzle.js');

    const result = await openOrTouchOperatorIncident({
      dedupKey: 'outbound:max:max_probe_failed',
      direction: 'outbound',
      integration: 'max',
      errorClass: 'max_probe_failed',
      errorDetail: 'getMyInfo returned null',
    });

    expect(result).toEqual({ id: 'incident-2', occurrenceCount: 1 });
    const [sqlText, params] = query.mock.calls.at(-1) as [string, unknown[]];
    expect(sqlText).toContain('app.open_or_touch_operator_probe_incident');
    expect(sqlText).not.toContain('app.open_or_touch_operator_incident(');
    // The narrow door takes integration/error_class only — the caller cannot smuggle a dedup_key
    // or a direction for another contour through it.
    expect(params).toEqual(['max', 'max_probe_failed', 'getMyInfo returned null']);
    technicalRuntimeRole.mockReturnValue(undefined);
  });

  // EXECUTE на этом корне держит ТОЛЬКО `app_operational_delivery_worker`. Инцидент при этом
  // открывают все контуры подряд: шаг события записи под арендным принципалом, отказ провайдера на
  // голом HTTP-хендлере вовсе без принципала, фолбэк write-port. До 19.08 каждый такой инцидент
  // терялся на 42501 внутри пустого catch — отказ был назван в журнале и не доходил до оператора.
  it('дано: шаг события записи упал под арендным принципалом → тогда инцидент всё равно уходит в базу под ролью доставки, а не под арендной', async () => {
    const principalsAtQuery: Array<string | undefined> = [];
    query.mockImplementationOnce(async () => {
      principalsAtQuery.push(getCurrentDbPrincipal()?.kind);
      return { rows: [{ id: 'incident-3', occurrence_count: 1 }] };
    });
    const { openOrTouchOperatorIncident } = await import('./operatorHealthDrizzle.js');

    await runWithOrganizationPrincipal('11111111-1111-4111-8111-111111111111', () =>
      openOrTouchOperatorIncident({
        dedupKey: 'booking_lifecycle_step:doctor_message:booking.created_step_failed',
        direction: 'booking_lifecycle_step',
        integration: 'doctor_message',
        errorClass: 'booking.created_step_failed',
        errorDetail: 'no admin notification targets',
      }));

    expect(principalsAtQuery).toEqual(['infra']);
  });

  it('дано: отказ провайдера на хендлере вовсе без принципала → тогда инцидент всё равно получает принципала, а не падает до базы', async () => {
    const principalsAtQuery: Array<string | undefined> = [];
    query.mockImplementationOnce(async () => {
      principalsAtQuery.push(getCurrentDbPrincipal()?.kind);
      return { rows: [{ id: 'incident-4', occurrence_count: 1 }] };
    });
    const { openOrTouchOperatorIncident } = await import('./operatorHealthDrizzle.js');

    await openOrTouchOperatorIncident({
      dedupKey: 'outbound_delivery_provider:smsc:provider_unavailable',
      direction: 'outbound_delivery_provider',
      integration: 'smsc',
      errorClass: 'provider_unavailable',
      errorDetail: null,
    });

    expect(principalsAtQuery).toEqual(['infra']);
  });

  // Проба остаётся у планировщика: узкая дверь `open_or_touch_operator_probe_incident` выдана
  // только ему, и подмена контекста на доставку закрыла бы её.
  it('дано: тик проб под планировщиком → тогда контур инцидента НЕ переключается на роль доставки', async () => {
    technicalRuntimeRole.mockReturnValue('app_operational_scheduler');
    const sources: Array<string | undefined> = [];
    query.mockImplementationOnce(async () => {
      const principal = getCurrentDbPrincipal();
      sources.push(principal?.kind === 'infra' ? principal.source : principal?.kind);
      return { rows: [{ id: 'incident-5', occurrence_count: 1 }] };
    });
    const { openOrTouchOperatorIncident } = await import('./operatorHealthDrizzle.js');

    await runWithInfraPrincipal({ source: 'scheduler:handle-tick-event' }, () =>
      openOrTouchOperatorIncident({
        dedupKey: 'outbound:max:max_probe_failed',
        direction: 'outbound',
        integration: 'max',
        errorClass: 'max_probe_failed',
        errorDetail: null,
      }));

    expect(sources).toEqual(['scheduler:handle-tick-event']);
    technicalRuntimeRole.mockReturnValue(undefined);
  });

  it('дано: capability вернула пустой результат → тогда выброшена ошибка, а не тихий success', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const { openOrTouchOperatorIncident } = await import('./operatorHealthDrizzle.js');

    await expect(
      openOrTouchOperatorIncident({
        dedupKey: 'k',
        direction: 'd',
        integration: 'i',
        errorClass: 'e',
        errorDetail: null,
      }),
    ).rejects.toThrow('openOrTouchOperatorIncident: empty returning');
  });
});
