import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

/**
 * Публичный каталог опубликованных курсов (метаданные). Запись — `POST .../enroll` с tier patient.
 */
export async function GET() {
  const deps = buildAppDeps();
  const items = await deps.courses.listPublishedCatalog();
  return NextResponse.json({ ok: true, items });
}
