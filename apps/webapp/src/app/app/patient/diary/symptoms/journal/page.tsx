import Link from "next/link";
import { redirect } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { DiarySectionGuestAccess } from "@/shared/ui/patient/guestAccess";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { AppShell } from "@/shared/ui/AppShell";
import {
  parseOffset,
  parseStatsPeriod,
  resolveJournalMonthYm,
  utcMonthRangeIso,
} from "@/modules/diaries/journal/resolveJournalMonthYm";
import { SymptomsJournalClient } from "./SymptomsJournalClient";

export default async function SymptomsJournalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const session = await getOptionalPatientSession();
  const dataGate = await patientRscPersonalDataGate(session, routePaths.diarySymptomsJournal);
  if (dataGate === "guest") {
    return (
      <AppShell
        title="Журнал симптомов"
        user={session?.user ?? null}
        backHref={routePaths.diary}
        backLabel="Дневник"
        variant="patient"
      >
        <DiarySectionGuestAccess
          session={session}
          returnTo={routePaths.diarySymptomsJournal}
          title="Журнал симптомов"
        />
      </AppShell>
    );
  }

  const s = session!;
  const monthRaw = typeof sp.month === "string" ? sp.month : undefined;
  const trackingIdRaw = typeof sp.trackingId === "string" ? sp.trackingId.trim() : "";
  const period = parseStatsPeriod(typeof sp.period === "string" ? sp.period : undefined);
  const offset = parseOffset(typeof sp.offset === "string" ? sp.offset : undefined);

  const deps = buildAppDeps();
  const userId = s.user.userId;

  const trackings = await deps.diaries.listSymptomTrackings(userId);
  const tid =
    trackingIdRaw && trackings.some((t) => t.id === trackingIdRaw) ? trackingIdRaw : trackings[0]?.id ?? "";

  if (trackingIdRaw && trackings.length > 0 && !trackings.some((t) => t.id === trackingIdRaw)) {
    const fallback = trackings[0]!.id;
    const earliestBad =
      period === "all"
        ? await deps.diaries.minRecordedAtForSymptomTracking({ userId, trackingId: fallback })
        : null;
    const ym = resolveJournalMonthYm({ monthParam: monthRaw, period, offset, earliestIso: earliestBad });
    redirect(
      `${routePaths.diarySymptomsJournal}?trackingId=${encodeURIComponent(fallback)}&month=${encodeURIComponent(ym)}&period=${period}&offset=${offset}`
    );
  }

  if (trackings.length === 0) {
    return (
      <AppShell
        title="Журнал симптомов"
        user={s.user}
        backHref={routePaths.diary}
        backLabel="Дневник"
        variant="patient"
      >
        <p className="text-muted-foreground text-sm">Добавьте симптом, чтобы вести журнал.</p>
        <Link
          href={`${routePaths.diary}?tab=symptoms`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4 inline-flex")}
        >
          К дневнику
        </Link>
      </AppShell>
    );
  }

  const earliest =
    period === "all"
      ? await deps.diaries.minRecordedAtForSymptomTracking({ userId, trackingId: tid })
      : null;

  const monthYm = resolveJournalMonthYm({ monthParam: monthRaw, period, offset, earliestIso: earliest });
  const { fromIso, toExclusiveIso } = utcMonthRangeIso(monthYm);

  const entries = await deps.diaries.listSymptomEntriesForUserInRange({
    userId,
    trackingId: tid,
    fromRecordedAt: fromIso,
    toRecordedAtExclusive: toExclusiveIso,
    limit: 500,
  });

  return (
    <AppShell
      title="Журнал симптомов"
      user={s.user}
      backHref={`${routePaths.diary}?tab=symptoms`}
      backLabel="Дневник"
      variant="patient"
    >
      <SymptomsJournalClient
        entries={entries}
        trackings={trackings.map((t) => ({ id: t.id, symptomTitle: t.symptomTitle ?? "—" }))}
        activeTrackingId={tid}
        monthYm={monthYm}
        period={period}
        offset={offset}
      />
    </AppShell>
  );
}
