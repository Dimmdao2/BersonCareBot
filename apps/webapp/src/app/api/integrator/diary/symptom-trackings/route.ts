/**
 * API для интегратора бота: список отслеживаемых симптомов пользователя.
 * Вызывается ботом при необходимости показать список симптомов или найти только что созданный.
 * Доступ по подписи запроса (общий секрет с ботом). Параметр userId обязателен.
 * Трекинг **`general_wellbeing`** (чек-ин самочувствия на главной) из ответа **исключается**.
 */

import { NextResponse } from "next/server";
import { assertIntegratorGetRequest } from "@/app-layer/integrator/assertIntegratorGetRequest";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { isGeneralWellbeingTracking } from "@/modules/patient-mood/wellbeingConstants";

/** Возвращает список активных отслеживаний симптомов для указанного пользователя после проверки подписи. */
export async function GET(request: Request) {
  const authError = assertIntegratorGetRequest(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  if (!userId || userId.trim() === "") {
    return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const trackings = (await deps.diaries.listSymptomTrackings(userId.trim(), true)).filter(
    (t) => !isGeneralWellbeingTracking(t.symptomKey),
  );
  return NextResponse.json({ ok: true, trackings });
}
