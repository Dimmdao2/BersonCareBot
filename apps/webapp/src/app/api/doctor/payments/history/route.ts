import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireEntitlementForRead } from '@/app-layer/guards/requireEntitlement';
import { requireClinicManagementApiContext } from '@/app-layer/guards/requireRole';
import { buildPaymentTimeline, summarizePatientPayments } from '@/app-layer/payments/paymentTimeline';
import type { PaymentHistoryEventRecord } from '@/modules/payments/types';

/**
 * Read-only organization payment history. The gate fixes the tenant before either ledger is read;
 * the request accepts no organization identifier from the browser.
 *
 * Дверь стоит на том же праве, что и экран, который её зовёт: журнал платежей организации живёт во
 * вкладке настроек, а она требует `organization.management`. На `clinical.workspace` дверь была
 * открыта не тем: рядовой специалист без права управления читал бы деньги всей клиники прямым
 * запросом, а администратор, у которого есть только управление, получал бы 403 на своём же экране.
 */
export async function GET() {
  const gate = await requireClinicManagementApiContext();
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
