/**
 * Страница привязки номера телефона для доступа к разделам с личными данными (записи, дневники, покупки).
 * Показывается при переходе в эти разделы без привязанного номера. После успешной привязки — редирект по ?next=.
 * В Mini App при привязке к боту — «контакт в боте». В браузере — deep link `link_*` (TG/Max) и запрос контакта; SMS на этой странице не используется (`PatientBindPhoneClient`).
 */

import { redirect } from "next/navigation";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { env } from "@/config/env";
import { getPool } from "@/infra/db/client";
import { patientSessionSnapshotHasPhone, resolvePlatformAccessContext } from "@/modules/platform-access";
import { AppShell } from "@/shared/ui/AppShell";
import { getSupportContactUrl } from "@/modules/system-settings/supportContactUrl";
import { PatientBindPhoneClient } from "./PatientBindPhoneClient";

type Props = { searchParams: Promise<{ next?: string; reason?: string }> };

export default async function BindPhonePage({ searchParams }: Props) {
  const session = await requirePatientAccess();

  /** SPEC §11 / `patientClientBusinessGate`: при БД — tier **patient** (доверенный телефон), не snapshot в cookie. */
  let skipBindSurface = false;
  if (env.DATABASE_URL?.trim()) {
    try {
      const ctx = await resolvePlatformAccessContext(getPool(), {
        sessionUserId: session.user.userId,
        sessionRoleHint: session.user.role,
      });
      skipBindSurface = ctx.tier === "patient";
    } catch {
      skipBindSurface = patientSessionSnapshotHasPhone(session);
    }
  } else {
    skipBindSurface = patientSessionSnapshotHasPhone(session);
  }

  if (skipBindSurface) {
    const { next } = await searchParams;
    const target = next?.trim();
    redirect(target && target.startsWith("/app/patient") ? target : routePaths.patient);
  }

  const { reason } = await searchParams;
  const supportContactHref = await getSupportContactUrl();
  const telegramId = session.user.bindings.telegramId ?? "";
  const maxId = session.user.bindings.maxId ?? "";

  const hint =
    reason === "oauth_phone_required"
      ? "Телефон гарантирует, что при любом способе авторизации вы не потеряете свои избранные уроки, дневники и покупки."
      : undefined;

  return (
    <AppShell title="Привязка телефона" user={session.user} backHref={routePaths.patient} backLabel="Меню" variant="patient">
      <div id="patient-bind-phone-section" className="flex flex-col gap-4">
        <PatientBindPhoneClient
          telegramId={telegramId}
          maxId={maxId}
          supportContactHref={supportContactHref}
          hint={hint}
        />
      </div>
    </AppShell>
  );
}
