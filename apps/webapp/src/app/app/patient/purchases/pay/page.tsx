import { redirect } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { PatientProductPayClient } from "./PatientProductPayClient";

export default async function PatientProductPayPage({
  searchParams,
}: {
  searchParams: Promise<{ purchaseId?: string }>;
}) {
  const session = await getOptionalPatientSession();
  if (!session) redirect(routePaths.patient);
  const dataGate = await patientRscPersonalDataGate(session, routePaths.purchases);
  if (dataGate === "guest") redirect(routePaths.purchases);
  const { purchaseId } = await searchParams;
  if (!purchaseId?.trim()) redirect(routePaths.purchases);

  const deps = buildAppDeps();
  if (!deps.products || !deps.bookingEngine) redirect(routePaths.purchases);
  const organizationId = await deps.bookingEngine.organization.getDefaultOrganizationId();
  const detail = await deps.products.getPurchaseDetail(
    purchaseId.trim(),
    organizationId,
    session.user.userId,
  );
  if (!detail?.purchase.paymentIntentId) redirect(routePaths.purchases);

  return (
    <AppShell title="Оплата" user={session.user} backHref={routePaths.purchases} backLabel="Назад" variant="patient">
      <PatientProductPayClient
        purchaseId={detail.purchase.id}
        intentId={detail.purchase.paymentIntentId}
        title={detail.purchase.title}
        amountMinor={detail.purchase.priceMinor}
      />
    </AppShell>
  );
}
