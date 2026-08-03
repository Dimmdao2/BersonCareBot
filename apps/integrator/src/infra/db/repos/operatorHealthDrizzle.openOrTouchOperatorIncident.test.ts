import { describe, expect, it, vi } from 'vitest';

const query = vi.fn();

vi.mock('../client.js', () => ({
  createDbPort: () => ({ query, tx: vi.fn() }),
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
