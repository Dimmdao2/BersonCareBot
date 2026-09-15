import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireEntitlementForRead } from '@/app-layer/guards/requireEntitlement';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { buildPaymentTimeline, summarizePatientPayments } from '@/app-layer/payments/paymentTimeline';
import type { PaymentHistoryEventRecord } from '@/modules/payments/types';

/**
 * Read-only organization payment history. The workspace gate fixes the tenant before either
 * ledger is read; the request accepts no organization identifier from the browser.
 */
export async function GET() {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const entitlement = await requireEntitlementForRead(
    { organizationId: gate.ctx.organizationId },
    'payments',
  );
  if (!entitlement.ok) return entitlement.response;

  const deps = buildAppDeps();
  const [patientPayments, historyEvents] = await withDoctorWorkspacePrincipal(
    gate.ctx,
    'api/doctor/payments/history:GET',
    () =>
      Promise.all([
        deps.patientPayments.listOrganizationPayments(),
        deps.payments
          ? deps.payments.listPaymentHistoryForOrganization(gate.ctx.organizationId)
          : Promise.resolve([] as PaymentHistoryEventRecord[]),
      ]),
  );

  return NextResponse.json({
    ok: true,
    timeline: buildPaymentTimeline(patientPayments, historyEvents),
    ...summarizePatientPayments(patientPayments),
  });
}
