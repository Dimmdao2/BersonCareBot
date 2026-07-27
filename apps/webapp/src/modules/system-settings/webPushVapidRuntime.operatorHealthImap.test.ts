import { describe, expect, it } from 'vitest';
import { redactAdminSettingsForClient } from './webPushVapidRuntime';

describe('operator_health_imap client serialization', () => {
  it('exposes configuration presence but never the stored password', () => {
    const serverOnlyValue = String.fromCodePoint(0x1f512);
    const [row] = redactAdminSettingsForClient([
      {
        key: 'operator_health_imap',
        scope: 'admin',
        organizationId: null,
        valueJson: {
          value: {
            address: 'monitor@example.test',
            host: 'imap.example.test',
            port: 993,
            login: 'monitor',
            password: serverOnlyValue,
            folder: 'INBOX',
          },
        },
        updatedAt: '2026-07-27T00:00:00.000Z',
        updatedBy: 'admin',
      },
    ]);
    expect(row?.valueJson).toEqual({
      value: {
        address: 'monitor@example.test',
        host: 'imap.example.test',
        port: 993,
        login: 'monitor',
        folder: 'INBOX',
        hasStoredPassword: true,
      },
    });
    expect(JSON.stringify(row?.valueJson)).not.toContain(serverOnlyValue);
  });
});
