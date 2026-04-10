/**
 * Страница привязки номера телефона для доступа к разделам с личными данными (записи, дневники, покупки).
 * Показывается при переходе в эти разделы без привязанного номера. После успешной привязки — редирект по ?next=.
 * В Mini App (Telegram/MAX) при уже привязанном канале бота — сценарий «контакт в боте», без SMS на этой странице; в браузере — Telegram Login / OTP (см. `PatientBindPhoneClient`, `docs/AUTH_RESTRUCTURE/MASTER_PLAN.md`).
 */

import { redirect } from "next/navigation";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { patientSessionSnapshotHasPhone } from "@/modules/platform-access";
import { AppShell } from "@/shared/ui/AppShell";
import { getSupportContactUrl } from "@/modules/system-settings/supportContactUrl";
import { PatientBindPhoneClient } from "./PatientBindPhoneClient";

type Props = { searchParams: Promise<{ next?: string; reason?: string }> };

export default async function BindPhonePage({ searchParams }: Props) {
  const session = await requirePatientAccess();
  if (patientSessionSnapshotHasPhone(session)) {
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
      <section id="patient-bind-phone-section" className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
        <PatientBindPhoneClient
          telegramId={telegramId}
          maxId={maxId}
          supportContactHref={supportContactHref}
          hint={hint}
        />
      </section>
    </AppShell>
  );
}
