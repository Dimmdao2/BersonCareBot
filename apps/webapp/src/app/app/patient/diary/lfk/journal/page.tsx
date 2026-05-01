import Link from "next/link";
import { redirect } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { DiarySectionGuestAccess } from "@/shared/ui/patient/guestAccess";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { AppShell } from "@/shared/ui/AppShell";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";
import {
  parseOffset,
  parseStatsPeriod,
  resolveJournalMonthYm,
  utcMonthRangeIso,
} from "@/modules/diaries/journal/resolveJournalMonthYm";
import { LfkJournalClient } from "./LfkJournalClient";

export default async function LfkJournalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const session = await getOptionalPatientSession();
  const dataGate = await patientRscPersonalDataGate(session, routePaths.diaryLfkJournal);
  if (dataGate === "guest") {
    return (
      <AppShell
        title="Журнал ЛФК"
        user={session?.user ?? null}
        backHref={routePaths.diary}
        backLabel="Дневник"
        variant="patient"
      >
        <DiarySectionGuestAccess
          session={session}
          returnTo={routePaths.diaryLfkJournal}
          title="Журнал ЛФК"
        />
      </AppShell>
    );
  }

  const s = session!;
  const monthRaw = typeof sp.month === "string" ? sp.month : undefined;
  const complexIdRaw = typeof sp.complexId === "string" ? sp.complexId.trim() : "";
  const period = parseStatsPeriod(typeof sp.period === "string" ? sp.period : undefined);
  const offset = parseOffset(typeof sp.offset === "string" ? sp.offset : undefined);

  const deps = buildAppDeps();
  const userId = s.user.userId;

  const complexes = await deps.diaries.listLfkComplexes(userId);
  const cid =
    complexIdRaw && complexes.some((c) => c.id === complexIdRaw) ? complexIdRaw : complexes[0]?.id ?? "";

  if (complexIdRaw && complexes.length > 0 && !complexes.some((c) => c.id === complexIdRaw)) {
    const fallback = complexes[0]!.id;
    const earliestBad = period === "all" ? await deps.diaries.minCompletedAtForLfkUser(userId) : null;
    const ym = resolveJournalMonthYm({ monthParam: monthRaw, period, offset, earliestIso: earliestBad });
    redirect(
      `${routePaths.diaryLfkJournal}?complexId=${encodeURIComponent(fallback)}&month=${encodeURIComponent(ym)}&period=${period}&offset=${offset}`
    );
  }

  if (complexes.length === 0) {
    return (
      <AppShell
        title="Журнал ЛФК"
        user={s.user}
        backHref={routePaths.diary}
        backLabel="Дневник"
        variant="patient"
      >
        <p className={patientMutedTextClass}>Создайте комплекс, чтобы вести журнал занятий.</p>
        <Link
          href={`${routePaths.diary}?tab=lfk`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4 inline-flex")}
        >
          К дневнику
        </Link>
      </AppShell>
    );
  }

  const earliest = period === "all" ? await deps.diaries.minCompletedAtForLfkUser(userId) : null;

  const monthYm = resolveJournalMonthYm({ monthParam: monthRaw, period, offset, earliestIso: earliest });
  const { fromIso, toExclusiveIso } = utcMonthRangeIso(monthYm);

  const sessions = await deps.diaries.listLfkSessionsInRange({
    userId,
    fromCompletedAt: fromIso,
    toCompletedAtExclusive: toExclusiveIso,
    complexId: cid,
    limit: 500,
  });

  return (
    <AppShell
      title="Журнал ЛФК"
      user={s.user}
      backHref={`${routePaths.diary}?tab=lfk`}
      backLabel="Дневник"
      variant="patient"
    >
      <LfkJournalClient
        sessions={sessions}
        complexes={complexes.map((c) => ({ id: c.id, title: c.title ?? "—" }))}
        activeComplexId={cid}
        monthYm={monthYm}
        period={period}
        offset={offset}
      />
    </AppShell>
  );
}
