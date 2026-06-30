/**
 * /app/doctor/patients/[userId] — карточка пациента.
 * Pattern: requireDoctorAccess → buildAppDeps → pass promise to PatientCardClient.
 */
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { doctorPageStackClass } from "@/shared/ui/doctor/doctorVisual";
import { routePaths } from "@/app-layer/routes/paths";
import { runWebappPgText } from "@/infra/db/runWebappSql";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { toDoctorSupplementaryContacts } from "@/modules/platform-user-contacts/bookingContactUpsert";
import { loadDoctorPatientProgramActivity } from "../loadDoctorPatientProgramActivity";
import { PatientCardClient } from "./PatientCardClient";
import type { PatientProgramInteractionPolicy } from "@/modules/doctor-clients/supportPolicy";

type PageProps = {
  params: Promise<{ userId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DoctorPatientCardPage({ params, searchParams }: PageProps) {
  const { userId } = await params;
  const sp = await searchParams;

  if (!z.string().uuid().safeParse(userId).success) {
    notFound();
  }

  const session = await requireDoctorAccess();
  const deps = buildAppDeps();

  const displayIana = await getAppDisplayTimeZone();

  const [
    cardHeaderPromise,
    physicalRow,
    clinicalState,
    visits,
    notes,
    tasks,
    signals,
    programActivity,
    appointments,
    programInstances,
    patientFileRecords,
    anamnesis,
    comorbidities,
    paymentsSummary,
    rawContactRows,
  ] = await Promise.all([
    deps.doctorClients.getPatientCardHeader(userId),
    runWebappPgText<{ height_cm: number | null; weight_kg: number | null }>(
      `SELECT height_cm, weight_kg FROM platform_users WHERE id = $1::uuid AND role = 'client'`,
      [userId],
    ),
    deps.patientClinical.getClinicalState(userId),
    deps.patientClinical.listVisits(userId),
    deps.doctorNotes.listForUser(userId),
    deps.specialistTasks.listPatientTasks(session.user.userId, userId, false),
    deps.doctorProactiveInsights.listForPatient({ patientUserId: userId, displayIana }),
    loadDoctorPatientProgramActivity(
      { programItemDiscussion: deps.programItemDiscussion },
      { patientUserId: userId, viewerUserId: session.user.userId },
    ),
    deps.doctorClientsPort.listPatientAppointments(userId),
    deps.treatmentProgramInstance.listForPatientClinicalView(userId),
    deps.patientFiles.listFiles(userId),
    deps.patientClinical.getAnamnesis(userId),
    deps.patientComorbidities.listActive(userId),
    deps.patientPayments.listPaymentsWithSummary(userId),
    deps.platformUserContacts.listForPlatformUser(userId),
  ]);

  // Unpack payments summary — listPaymentsWithSummary returns { payments, totalPaidMinor }.
  const patientPaymentRows = paymentsSummary.payments;

  // Assemble finances timeline (same logic as payment-timeline route).
  const orgId = await deps.bookingEngine?.organization.getDefaultOrganizationId().catch(() => null) ?? null;

  // Parallel-fetch remaining SSR data that depends on orgId or is otherwise independent.
  const [historyEvents, initialPackages, , initialSupportEffectivePolicy] = await Promise.all([
    deps.payments && orgId
      ? deps.payments.listPaymentHistoryForUser(userId, orgId).catch(() => [])
      : Promise.resolve([] as Awaited<ReturnType<NonNullable<typeof deps.payments>["listPaymentHistoryForUser"]>>),
    deps.memberships && orgId
      ? deps.memberships.listPatientPackagesForUser(userId, orgId).catch(() => null)
      : Promise.resolve(null),
    deps.doctorClients.getClientSupport(userId).catch(() => null), // fetched but only effectivePolicy is surfaced to UI
    deps.doctorClients.getPatientProgramInteractionPolicy(userId).catch((): PatientProgramInteractionPolicy | null => null),
  ]);

  type TimelineEntry = {
    id: string; occurredAt: string;
    kind: "cash" | "acquiring" | "booking_prepayment" | "booking_refund";
    status: string; amountMinor: number | null; currency: string;
    description: string | null; provider: string | null; appointmentId: string | null;
  };
  const financesTimeline: TimelineEntry[] = [
    ...patientPaymentRows.map((p) => ({
      id: p.id, occurredAt: p.createdAt,
      kind: p.kind as "cash" | "acquiring",
      status: p.status, amountMinor: p.amountMinor, currency: p.currency,
      description: p.service ?? p.comment ?? null, provider: p.provider ?? null,
      appointmentId: p.visitId ?? null,
    })),
    ...historyEvents.map((e) => ({
      id: e.id, occurredAt: e.occurredAt,
      kind: (e.eventType.toLowerCase().includes("refund") ? "booking_refund" : "booking_prepayment") as "booking_prepayment" | "booking_refund",
      status: e.status ?? e.eventType, amountMinor: e.amountMinor, currency: e.currency ?? "RUB",
      description: e.purpose ?? e.comment ?? null, provider: e.providerId ?? null,
      appointmentId: e.appointmentId ?? null,
    })),
  ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const totalCashMinor = patientPaymentRows
    .filter((p) => p.kind === "cash" && p.status === "paid")
    .reduce((s, p) => s + p.amountMinor, 0);
  const totalAcquiringMinor = patientPaymentRows
    .filter((p) => p.kind === "acquiring" && p.status === "paid")
    .reduce((s, p) => s + p.amountMinor, 0);
  const initialFinancesData = { timeline: financesTimeline, totalCashMinor, totalAcquiringMinor };

  // Shape payments summary for PatientTabRecords (PaymentsPanel).
  const initialPaymentsSummary = {
    payments: patientPaymentRows.map((p) => ({
      id: p.id,
      amountMinor: p.amountMinor,
      currency: p.currency,
      kind: p.kind as "cash" | "acquiring",
      status: p.status,
      comment: p.comment ?? null,
      service: p.service ?? null,
      visitId: p.visitId ?? null,
      createdAt: p.createdAt,
    })),
    totalPaidMinor: paymentsSummary.totalPaidMinor,
  };

  // Shape packages for MembershipPanel (ApiPackage shape: { id, title, status, validUntil, balance.items }).
  const initialPackagesForTabs = initialPackages
    ? initialPackages.map((pkg) => ({
        id: pkg.id,
        title: pkg.title,
        status: pkg.status,
        validUntil: pkg.validUntil ?? null,
        balance: {
          items: pkg.balance.items.map((item) => ({
            quantityInitial: item.quantityInitial,
            remaining: item.remaining,
            serviceTitle: item.serviceTitle ?? null,
          })),
        },
      }))
    : null;

  // Map file records to UI shape (previewUrl omitted — S3 presigning deferred to client).
  const initialFiles = patientFileRecords.map((f) => ({ ...f, previewUrl: null }));

  // Filter supplementary contacts using the header's identity (same logic as the route handler).
  const initialSupplementaryContacts = cardHeaderPromise
    ? toDoctorSupplementaryContacts(rawContactRows, {
        phone: cardHeaderPromise.identity.phone,
        email: cardHeaderPromise.identity.email,
      })
    : rawContactRows.map((r) => ({ id: r.id, contactType: r.contactType, value: r.value, source: r.source }));

  const physicalData = physicalRow.rows[0]
    ? { heightCm: physicalRow.rows[0].height_cm, weightKg: physicalRow.rows[0].weight_kg }
    : { heightCm: null, weightKg: null };

  const initialTab = typeof sp.tab === "string" ? sp.tab : undefined;
  const createVisitFrom = typeof sp.createVisitFrom === "string" ? sp.createVisitFrom : undefined;
  const visitDate = typeof sp.visitDate === "string" ? sp.visitDate : undefined;

  return (
    <DoctorAppShell title="Карточка пациента" user={session.user} backHref={routePaths.doctorPatients}>
      <section className={doctorPageStackClass}>
        <PatientCardClient
          cardHeader={cardHeaderPromise}
          initialTab={initialTab}
          createVisitFrom={createVisitFrom}
          visitDate={visitDate}
          initialPhysicalData={physicalData}
          initialClinicalState={clinicalState}
          initialVisits={visits}
          initialNotes={notes}
          initialTasks={tasks}
          initialSignals={signals}
          initialProgramActivity={programActivity}
          initialAppointments={appointments}
          initialProgramInstances={programInstances}
          initialFiles={initialFiles}
          initialAnamnesis={anamnesis}
          initialComorbidities={comorbidities}
          initialFinancesData={initialFinancesData}
          initialSupplementaryContacts={initialSupplementaryContacts}
          initialPackages={initialPackagesForTabs}
          initialPaymentsSummary={initialPaymentsSummary}
          initialSupportEffectivePolicy={initialSupportEffectivePolicy}
          isAdmin={session.user.role === "admin"}
        />
      </section>
    </DoctorAppShell>
  );
}
