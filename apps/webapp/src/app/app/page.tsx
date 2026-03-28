/**
 * Страница входа в приложение («/app»).
 * Если пользователь уже авторизован — перенаправляет: врач/админ в /app/doctor, пациент в /app/patient.
 * Если нет — шапка как у пациента (PersonCare), плашечка с призывом и блок авторизации (AuthBootstrap).
 * В dev при ALLOW_DEV_AUTH_BYPASS=true — кнопки входа без Telegram.
 */

import { redirect } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { env } from "@/config/env";
import { getPostAuthRedirectTarget } from "@/modules/auth/redirectPolicy";
import { AppShell } from "@/shared/ui/AppShell";
import { AppEntryLoginContent } from "./AppEntryLoginContent";

type SearchParams = { next?: string };

/** Определяет сессию и либо редиректит по роли (или по ?next=), либо показывает экран входа. */
export default async function AppEntryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const deps = buildAppDeps();
  const session = await deps.auth.getCurrentSession();
  const { next: nextParam } = await searchParams;

  if (session) {
    redirect(getPostAuthRedirectTarget(session.user.role, nextParam ?? null));
  }

  const allowDevBypass = env.ALLOW_DEV_AUTH_BYPASS === true && env.NODE_ENV !== "production";

  return (
    <AppShell title="Вход" user={null} variant="patient">
      <AppEntryLoginContent allowDevBypass={allowDevBypass} />
    </AppShell>
  );
}
