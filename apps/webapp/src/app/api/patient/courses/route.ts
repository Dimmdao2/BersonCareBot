import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";

/**
 * Курсы, назначенные ТЕКУЩЕМУ пациенту через его собственную программу (совпадение `template_id`
 * его `treatment_program_instances` с `program_template_id` курса) — НЕ публичный каталог/
 * маркетплейс. Полная витрина — отдельная будущая задача (taskdb #724); здесь только «своё».
 */
export async function GET() {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  const items = await deps.courses.listAssignedForPatient(gate.session.user.userId);
  return NextResponse.json({ ok: true, items });
}
