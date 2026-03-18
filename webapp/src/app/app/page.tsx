/**
 * Страница входа в приложение («/app»).
 * Если пользователь уже авторизован — перенаправляет: врач/админ в /app/doctor, пациент в /app/patient.
 * Если нет — показывает заголовок «Вход в платформу», текст «Скоро здесь будет много полезного» и блок
 * авторизации (AuthBootstrap). В dev при ALLOW_DEV_AUTH_BYPASS=true показываются кнопки «Войти как пациент» и «Войти как врач/админ» для входа в браузере без Telegram.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { env } from "@/config/env";
import { AppShell } from "@/shared/ui/AppShell";
import { AuthBootstrap } from "@/shared/ui/AuthBootstrap";

const COMING_SOON_MESSAGE = "Скоро здесь будет много полезного";

const SAFE_NEXT_PREFIX = "/app/patient";
const SAFE_NEXT_EXCLUDE = "/app/patient/bind-phone";

function isSafeNext(next: string | null): next is string {
  if (!next || typeof next !== "string") return false;
  const path = next.startsWith("/") ? next : new URL(next, "http://localhost").pathname;
  return path.startsWith(SAFE_NEXT_PREFIX) && !path.startsWith(SAFE_NEXT_EXCLUDE);
}

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
    const target = isSafeNext(nextParam ?? null) ? (nextParam ?? null) : null;
    if (target) redirect(target);
    const role = session.user.role;
    redirect(role === "admin" || role === "doctor" ? "/app/doctor" : "/app/patient");
  }

  const allowDevBypass = env.ALLOW_DEV_AUTH_BYPASS === true && env.NODE_ENV !== "production";

  return (
    <AppShell title="Вход в платформу" user={null}>
      <section className="hero-card stack">
        <p className="empty-state">{COMING_SOON_MESSAGE}</p>
        {allowDevBypass && (
          <div className="stack" style={{ marginTop: "1rem" }}>
            <p className="eyebrow">Режим разработки</p>
            <p className="empty-state" style={{ fontSize: "0.9rem" }}>
              Войти в интерфейс без Telegram (только при ALLOW_DEV_AUTH_BYPASS=true):
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
              <Link href="/app?t=dev:client" className="button">
                Как пациент
              </Link>
              <Link href="/app?t=dev:admin" className="button">
                Как врач / админ
              </Link>
            </div>
          </div>
        )}
      </section>
      <Suspense fallback={<p className="empty-state">Загрузка...</p>}>
        <AuthBootstrap />
      </Suspense>
    </AppShell>
  );
}
