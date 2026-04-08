/**
 * Страница привязки номера телефона для доступа к разделам с личными данными (записи, дневники, покупки).
 * Показывается при переходе в эти разделы без привязанного номера. После успешной привязки — редирект по ?next=.
 */

import { redirect } from "next/navigation";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { BindPhoneBlock } from "@/shared/ui/auth/BindPhoneBlock";
import { getSupportContactUrl } from "@/modules/system-settings/supportContactUrl";

type Props = { searchParams: Promise<{ next?: string; reason?: string }> };

export default async function BindPhonePage({ searchParams }: Props) {
  const session = await requirePatientAccess();
  if (session.user.phone?.trim()) {
    const { next } = await searchParams;
    const target = next?.trim();
    redirect(target && target.startsWith("/app/patient") ? target : routePaths.patient);
  }

  const { reason } = await searchParams;
  const channel = session.user.bindings.telegramId ? "telegram" : "web";
  const chatId = session.user.bindings.telegramId ?? "";
  const supportContactHref = await getSupportContactUrl();

  const hint =
    reason === "oauth_phone_required"
      ? "Телефон гарантирует, что при любом способе авторизации вы не потеряете свои избранные уроки, дневники и покупки."
      : undefined;

  return (
    <AppShell title="Привязка телефона" user={session.user} backHref={routePaths.patient} backLabel="Меню" variant="patient">
      <section id="patient-bind-phone-section" className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
        <BindPhoneBlock channel={channel} chatId={chatId} supportContactHref={supportContactHref} hint={hint} />
      </section>
    </AppShell>
  );
}
