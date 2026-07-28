import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dispatchOperatorAlertMock, persistMock } = vi.hoisted(() => ({
  dispatchOperatorAlertMock: vi.fn(),
  persistMock: vi.fn(async () => true),
}));

vi.mock('@/modules/operator-alerts/dispatchOperatorAlert', () => ({
  dispatchOperatorAlert: dispatchOperatorAlertMock,
}));

vi.mock('./persistUndeliveredSupportSubmission', () => ({
  persistUndeliveredSupportSubmission: persistMock,
}));

import { relaySupportSubmission } from './relaySupportSubmission';

const input = {
  kind: 'patient' as const,
  messageId: 'support:patient:u1:12345',
  lines: ['Поддержка (webapp)', 'Email: a@b.co', '', 'Сообщение:', 'help'],
  email: 'a@b.co',
  message: 'help',
  userId: 'u1',
  fromPath: '/app/patient/support',
};

describe('relaySupportSubmission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to dispatchOperatorAlert on the support block with a unique dedupKey', async () => {
    dispatchOperatorAlertMock.mockResolvedValue({ dispatched: true });
    const result = await relaySupportSubmission(input);
    expect(result).toEqual({ delivered: true, persisted: false });
    expect(dispatchOperatorAlertMock).toHaveBeenCalledTimes(1);
    const [call] = dispatchOperatorAlertMock.mock.calls[0] as [
      { block: string; dedupKey: string; lines: string[]; topic: string },
    ];
    expect(call.block).toBe('support');
    expect(call.dedupKey).toBe(input.messageId);
    expect(call.lines).toBe(input.lines);
    expect(call.topic).toContain('patient');
    expect(persistMock).not.toHaveBeenCalled();
  });

  it('persists the raw content when no channel confirms delivery (no_recipients)', async () => {
    dispatchOperatorAlertMock.mockResolvedValue({ dispatched: false, reason: 'no_recipients' });
    const result = await relaySupportSubmission(input);
    expect(result).toEqual({ delivered: false, persisted: true });
    expect(persistMock).toHaveBeenCalledTimes(1);
    const [saved] = persistMock.mock.calls[0] as unknown as [
      { kind: string; email: string; message: string; userId?: string },
    ];
    expect(saved.kind).toBe('patient');
    expect(saved.email).toBe('a@b.co');
    expect(saved.message).toBe('help');
    expect(saved.userId).toBe('u1');
  });

  it('persists when the support topic block is disabled (reason: disabled) too — never a silent drop', async () => {
    dispatchOperatorAlertMock.mockResolvedValue({ dispatched: false, reason: 'disabled' });
    const result = await relaySupportSubmission(input);
    expect(result.delivered).toBe(false);
    expect(persistMock).toHaveBeenCalledTimes(1);
  });

  it('persists even if dispatchOperatorAlert throws — the relay never propagates an exception', async () => {
    dispatchOperatorAlertMock.mockRejectedValue(new Error('integrator down'));
    const result = await relaySupportSubmission(input);
    expect(result.delivered).toBe(false);
    expect(persistMock).toHaveBeenCalledTimes(1);
  });

  it('reports persisted:false when even the fallback persistence fails', async () => {
    dispatchOperatorAlertMock.mockResolvedValue({ dispatched: false, reason: 'no_recipients' });
    persistMock.mockResolvedValueOnce(false);
    const result = await relaySupportSubmission(input);
    expect(result).toEqual({ delivered: false, persisted: false });
  });
});
