import { beforeEach, describe, expect, it, vi } from 'vitest';

const upsertMock = vi.hoisted(() => vi.fn());
const insertEventMock = vi.hoisted(() => vi.fn());
const reportFailureMock = vi.hoisted(() => vi.fn());

vi.mock('../db/repos/integrationWebhookStatusDrizzle.js', () => ({
  upsertIntegrationWebhookLastStatus: upsertMock,
  insertIntegrationWebhookErrorEvent: insertEventMock,
}));
vi.mock('./reportOperatorFailure.js', () => ({
  reportOperatorFailure: reportFailureMock,
}));

import { recordIntegrationWebhookOutcome } from './recordIntegrationWebhookOutcome.js';

describe('recordIntegrationWebhookOutcome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertMock.mockResolvedValue(undefined);
    insertEventMock.mockResolvedValue(undefined);
    reportFailureMock.mockResolvedValue(undefined);
  });

  it('records success without error event or reportFailure', async () => {
    await recordIntegrationWebhookOutcome({
      source: 'max',
      processedOk: true,
      httpStatusReturned: 200,
    });
    expect(upsertMock).toHaveBeenCalled();
    expect(insertEventMock).not.toHaveBeenCalled();
    expect(reportFailureMock).not.toHaveBeenCalled();
  });

  it('on failure upserts last-status, inserts burst event, opens incident', async () => {
    await recordIntegrationWebhookOutcome({
      source: 'telegram',
      processedOk: false,
      httpStatusReturned: 200,
      errorClass: 'webhook_auth_failed',
      detail: 'secret mismatch',
    });
    expect(insertEventMock).toHaveBeenCalledWith({
      source: 'telegram',
      errorClass: 'webhook_auth_failed',
    });
    expect(reportFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'inbound_webhook',
        integration: 'telegram',
        errorClass: 'webhook_auth_failed',
      }),
    );
    expect(reportFailureMock.mock.calls[0]![0]).not.toHaveProperty('dispatchPort');
  });
});
