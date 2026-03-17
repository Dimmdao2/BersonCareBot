/**
 * Страница привязки номера телефона для доступа к разделам с личными данными (записи, дневники, покупки).
 * Показывается при переходе в эти разделы без привязанного номера. После успешной привязки — редирект по ?next=.
 */

import { redirect } from "next/navigation";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { BindPhoneBlock } from "@/shared/ui/auth/BindPhoneBlock";

type Props = { searchParams: Promise<{ next?: string }> };

export default async function BindPhonePage({ searchParams }: Props) {
  const session = await requirePatientAccess();
  if (session.user.phone?.trim()) {
    const { next } = await searchParams;
    const target = next?.trim();
    redirect(target && target.startsWith("/app/patient") ? target : routePaths.patient);
  }

  const channel = session.user.bindings.telegramId ? "telegram" : "web";
  const chatId = session.user.bindings.telegramId ?? "";

  return (
    <AppShell title="Привязка телефона" user={session.user} backHref={routePaths.patient} backLabel="Меню" variant="patient">
      <BindPhoneBlock channel={channel} chatId={chatId} />
    </AppShell>
  );
}
