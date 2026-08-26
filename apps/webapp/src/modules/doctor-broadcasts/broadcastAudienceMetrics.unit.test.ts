import { describe, expect, it } from 'vitest';
import type { ClientListItem } from '@/modules/doctor-clients/ports';
import { resolveBroadcastEffectiveClients } from './broadcastAudienceMetrics';

function client(userId: string, bindings: ClientListItem['bindings']): ClientListItem {
  return {
    userId,
    displayName: userId,
    phone: null,
    bindings,
    nextAppointmentLabel: null,
    activeTreatmentProgram: false,
    activeTreatmentProgramInstanceId: null,
    cancellationsCount: 0,
    reschedulesCount: 0,
  };
}

describe('broadcast TEST audience isolation', () => {
  it('limits each current messenger channel to its matching TEST identifiers', () => {
    const telegramTest = client('telegram-test', { telegramId: 'tg-test' });
    const maxTest = client('max-test', { maxId: 'max-test' });
    const realRecipient = client('real', { telegramId: 'tg-real', maxId: 'max-real' });
    const clients = [telegramTest, maxTest, realRecipient];
    const testAccounts = {
      phones: [],
      emails: [],
      telegramIds: ['tg-test'],
      maxIds: ['max-test'],
    };

    expect(
      resolveBroadcastEffectiveClients(clients, ['telegram'], true, testAccounts).effective.map(
        ({ userId }) => userId,
      ),
    ).toEqual(['telegram-test']);
    expect(
      resolveBroadcastEffectiveClients(clients, ['max'], true, testAccounts).effective.map(
        ({ userId }) => userId,
      ),
    ).toEqual(['max-test']);
    expect(
      resolveBroadcastEffectiveClients(
        clients,
        ['telegram', 'max'],
        true,
        testAccounts,
      ).effective.map(({ userId }) => userId),
    ).toEqual(['telegram-test', 'max-test']);
  });
});
