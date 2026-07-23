import { describe, expect, it, vi } from 'vitest';
import type { DbPort, DbQueryResult } from '../../kernel/contracts/index.js';
import { readSmtpOutboundSettingValueJson } from './publicRestrictedSettings.js';

function makeDb(query: DbPort['query']): DbPort {
  return { query, tx: vi.fn() as unknown as DbPort['tx'] };
}

describe('publicRestrictedSettings', () => {
  it('reads SMTP through the argumentless restricted capability', async () => {
    const valueJson = {
      value: {
        host: 'smtp.example.test',
        user: 'mailer',
        password: 'secret',
        from: 'mail@example.test',
      },
    };
    const query = vi.fn().mockResolvedValue({
      rows: [{ value_json: valueJson }],
      rowCount: 1,
    } as DbQueryResult<{ value_json: unknown }>);

    await expect(readSmtpOutboundSettingValueJson(makeDb(query))).resolves.toEqual(valueJson);
    expect(query).toHaveBeenCalledWith(
      'SELECT app.read_integrator_smtp_outbound_setting() AS value_json',
    );
  });

  it('returns null when the restricted setting is absent', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });

    await expect(readSmtpOutboundSettingValueJson(makeDb(query))).resolves.toBeNull();
  });
});
