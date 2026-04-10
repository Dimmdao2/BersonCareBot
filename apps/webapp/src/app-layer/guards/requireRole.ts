import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor, canAccessPatient } from "@/modules/roles/service";
import { routePaths } from "@/app-layer/routes/paths";
import type { AppSession } from "@/shared/types/session";

export async function requireSession(returnPath?: string): Promise<AppSession> {
  const session = await getCurrentSession();
  if (!session) {
    const query = returnPath ? `?next=${encodeURIComponent(returnPath)}` : "";
    redirect(`${routePaths.root}${query}`);
  }
  return session;
}

/** Сессия для разделов «только для авторизованного» (записи, дневники, покупки). Редирект на /app с ?next= при отсутствии сессии. */
export async function requirePatientAccess(returnPath?: string): Promise<AppSession> {
  const session = await requireSession(returnPath);
  if (!canAccessPatient(session.user.role)) redirect(routePaths.doctor);
  return session;
}

/** Как requirePatientAccess, плюс обязательный привязанный телефон (редирект на bind-phone). */
export async function requirePatientAccessWithPhone(returnPath?: string): Promise<AppSession> {
  const session = await requirePatientAccess(returnPath);
  requirePatientPhone(session, returnPath ?? routePaths.patient);
  return session;
}

/** Опциональная сессия пациента: для главного меню, уроков, скорой, контента — можно без входа (гость). Возвращает null, если нет сессии; редирект только если роль не пациент. */
export async function getOptionalPatientSession(): Promise<AppSession | null> {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!canAccessPatient(session.user.role)) redirect(routePaths.doctor);
  return session;
}

export async function requireDoctorAccess(): Promise<AppSession> {
  const session = await requireSession();
  if (!canAccessDoctor(session.user.role)) redirect(routePaths.patient);
  return session;
}

/** Есть ли привязка хотя бы одного мессенджера (альтернатива телефону для части сценариев). */
export function hasMessengerBinding(session: AppSession): boolean {
  const b = session.user.bindings;
  return Boolean(b.telegramId?.trim() || b.maxId?.trim() || b.vkId?.trim());
}

/**
 * Если у пациента нет привязанного телефона — редирект на страницу привязки с next=returnTo.
 * Только нормализованный телефон в webapp (мессенджер без телефона недостаточен).
 */
export function requirePatientPhone(session: AppSession, returnTo: string): void {
  if (!session.user.phone?.trim()) {
    const next = encodeURIComponent(returnTo);
    redirect(`${routePaths.bindPhone}?next=${next}`);
  }
}

/**
 * Для Route Handlers: пациент с телефоном или JSON 401/403 (без redirect — не ломать fetch).
 */
export async function requirePatientApiSessionWithPhone(options?: {
  /** Для redirectTo в теле 403 (по умолчанию главное меню пациента). */
  returnPath?: string;
}): Promise<{ ok: true; session: AppSession } | { ok: false; response: NextResponse }> {
  const session = await getCurrentSession();
  if (!session || !canAccessPatient(session.user.role)) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  }
  if (!session.user.phone?.trim()) {
    const path = options?.returnPath ?? routePaths.patient;
    const next = encodeURIComponent(path);
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: "phone_required",
          message: "Нужна привязка номера телефона",
          redirectTo: `${routePaths.bindPhone}?next=${next}`,
        },
        { status: 403 },
      ),
    };
  }
  return { ok: true, session };
}
