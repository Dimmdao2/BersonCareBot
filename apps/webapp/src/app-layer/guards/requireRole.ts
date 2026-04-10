import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/modules/auth/service";
import { patientClientBusinessGate } from "@/modules/platform-access";
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

/** Как requirePatientAccess, плюс бизнес-доступ пациента: tier **patient** из БД (фаза C), без БД — fallback на телефон в сессии. */
export async function requirePatientAccessWithPhone(returnPath?: string): Promise<AppSession> {
  const session = await requirePatientAccess(returnPath);
  await requirePatientBusinessTierOrRedirect(session, returnPath ?? routePaths.patient);
  return session;
}

/** Опциональная сессия пациента: для главного меню, уроков, скорой, контента — можно без входа (гость). Возвращает null, если нет сессии; редирект только если роль не пациент. */
export async function getOptionalPatientSession(): Promise<AppSession | null> {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!canAccessPatient(session.user.role)) redirect(routePaths.doctor);
  return session;
}

export type PatientRscPersonalDataGate = "guest" | "allow";

/**
 * RSC: можно ли грузить персональные данные из БД по `userId` — тот же критерий, что {@link patientClientBusinessGate} / API.
 * Без сессии — `guest` (заглушки). `need_activation` — `guest`. `stale_session` — редирект на `/app?next=`.
 */
export async function patientRscPersonalDataGate(
  session: AppSession | null,
  returnTo: string,
): Promise<PatientRscPersonalDataGate> {
  if (!session) return "guest";
  const g = await patientClientBusinessGate(session);
  if (g === "stale_session") {
    const next = encodeURIComponent(returnTo);
    redirect(`${routePaths.root}?next=${next}`);
  }
  if (g !== "allow") return "guest";
  return "allow";
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

async function requirePatientBusinessTierOrRedirect(session: AppSession, returnTo: string): Promise<void> {
  const g = await patientClientBusinessGate(session);
  if (g === "allow") return;
  const next = encodeURIComponent(returnTo);
  if (g === "stale_session") {
    redirect(`${routePaths.root}?next=${next}`);
  }
  redirect(`${routePaths.bindPhone}?next=${next}`);
}

function patientActivationRequiredJson(returnPath: string) {
  const next = encodeURIComponent(returnPath);
  return NextResponse.json(
    {
      ok: false,
      error: "patient_activation_required",
      message: "Требуется подтверждённый профиль пациента",
      redirectTo: `${routePaths.bindPhone}?next=${next}`,
    },
    { status: 403 },
  );
}

/**
 * Для Route Handlers под `/api/patient/*` и `/api/booking/*`: тот же критерий, что `requirePatientAccessWithPhone`
 * (`patientClientBusinessGate`). Перечень patient-business API — `patientApiPathIsPatientBusinessSurface` в `patientRouteApiPolicy`.
 */
export async function requirePatientApiBusinessAccess(options?: {
  /** Для redirectTo в теле 403 (по умолчанию главное меню пациента). */
  returnPath?: string;
}): Promise<{ ok: true; session: AppSession } | { ok: false; response: NextResponse }> {
  const session = await getCurrentSession();
  if (!session || !canAccessPatient(session.user.role)) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  }

  const returnPath = options?.returnPath ?? routePaths.patient;
  const gate = await patientClientBusinessGate(session);
  if (gate === "stale_session") {
    return { ok: false, response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  }
  if (gate === "need_activation") {
    return { ok: false, response: patientActivationRequiredJson(returnPath) };
  }

  return { ok: true, session };
}

/** @deprecated Используйте {@link requirePatientApiBusinessAccess}; алиас сохранён для совместимости. */
export const requirePatientApiSessionWithPhone = requirePatientApiBusinessAccess;
