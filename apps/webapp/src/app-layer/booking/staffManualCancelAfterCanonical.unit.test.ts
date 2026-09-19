/**
 * F6 oracle: after canonical cancellation, a provider failure must create durable reconciliation
 * work. Without it the appointment is terminal, a later retry is impossible, and the patient can
 * silently lose a refund. There was no public route oracle for this post-commit branch; the queue
 * enqueue is its irreversible, observable boundary.
 */
import { describe, expect, it, vi } from 'vitest';
import type { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { runStaffManualCancelAfterCanonical } from './staffManualCancelAfterCanonical';

describe('staff cancellation payment continuation', () => {
  it('persists refund reconciliation work when the committed cancellation refund is transiently unavailable', async () => {
    const applyCancelPaymentOutcome = vi.fn(async () => {
      throw new Error('provider unavailable');
    });
    const enqueueCancelledAppointmentPaymentReconciliation = vi.fn(async () => undefined);
    const deps = {
      payments: { applyCancelPaymentOutcome, enqueueCancelledAppointmentPaymentReconciliation },
      memberships: null,
      patientBooking: null,
    } as unknown as ReturnType<typeof buildAppDeps>;

    await expect(
      runStaffManualCancelAfterCanonical({
        deps,
        organizationId: '18f00cc5-c393-4d4b-8aad-cf199a1c60e2',
        appointmentId: 'ed75f46c-cea9-4af4-b21c-f358215798f5',
        actorId: 'b2f0df68-aa7a-420e-b9b9-48c361ca05cd',
        decisionType: 'refund_prepayment',
      }),
    ).resolves.toEqual({ paymentOutcomeFailed: true });

    expect(enqueueCancelledAppointmentPaymentReconciliation).toHaveBeenCalledWith({
      appointmentId: 'ed75f46c-cea9-4af4-b21c-f358215798f5',
    });
  });
});
