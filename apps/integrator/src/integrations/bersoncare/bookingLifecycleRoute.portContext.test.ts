import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { DispatchPort, IdempotencyPort } from '../../kernel/contracts/index.js';

const { getAppDisplayTimezone, runWithOrganizationPrincipal } = vi.hoisted(() => ({
  getAppDisplayTimezone: vi.fn(async () => 'UTC'),
  runWithOrganizationPrincipal: vi.fn(
    async <T>(_organizationId: string, fn: () => Promise<T>): Promise<T> => fn(),
  ),
}));

vi.mock('../../config/appTimezone.js', () => ({ getAppDisplayTimezone }));
vi.mock('../../infra/principal/organizationPrincipal.js', () => ({
  runWithOrganizationPrincipal,
}));
vi.mock('../google-calendar/sync.js', () => ({
  syncCanonicalAppointmentToCalendar: vi.fn(async () => undefined),
}));

import {
  handleBookingEventRequest,
  handleBookingLifecycleEvent,
} from './bookingLifecycleRoute.js';

const ORGANIZATION_ID = '10000000-0000-4000-8000-000000000001';

function deletedEvent(organizationId: string = ORGANIZATION_ID) {
  return {
    eventType: 'booking.deleted' as const,
    idempotencyKey: 'booking-port-context-test',
    payload: {
      organizationId,
      bookingId: '11111111-1111-4111-8111-111111111111',
      userId: 'test-user',
      bookingType: 'in_person' as const,
      category: 'general' as const,
      slotStart: '2027-01-02T12:00:00.000Z',
      slotEnd: '2027-01-02T12:30:00.000Z',
      contactName: 'Test patient',
      contactPhone: '0',
    },
  };
}

function idempotencyPort(): IdempotencyPort {
  return {
    tryAcquire: vi.fn(async () => true),
    release: vi.fn(async () => undefined),
  };
}

function dispatchPort(): DispatchPort {
  return { dispatchOutgoing: vi.fn(async () => ({})) } as unknown as DispatchPort;
}

describe('booking lifecycle port-context routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not read display timezone for an event that does not use it', async () => {
    await handleBookingLifecycleEvent(deletedEvent(), dispatchPort(), {
      idempotencyPort: idempotencyPort(),
    });

    expect(getAppDisplayTimezone).not.toHaveBeenCalled();
  });

  it('installs the signed payload organization before handling tenant-scoped events', async () => {
    const send = vi.fn();
    const code = vi.fn(() => ({ send }));
    const request = { body: deletedEvent(ORGANIZATION_ID) } as unknown as FastifyRequest;
    const reply = { code } as unknown as FastifyReply;

    await handleBookingEventRequest(
      request,
      reply,
      'booking lifecycle-event',
      () => ({ ok: true, rawBody: '{}' }),
      dispatchPort(),
      { idempotencyPort: idempotencyPort() },
    );

    expect(runWithOrganizationPrincipal).toHaveBeenCalledTimes(1);
    expect(runWithOrganizationPrincipal.mock.calls[0]?.[0]).toBe(ORGANIZATION_ID);
    expect(code).toHaveBeenCalledWith(200);
    expect(send).toHaveBeenCalledWith({ ok: true });
  });
});
