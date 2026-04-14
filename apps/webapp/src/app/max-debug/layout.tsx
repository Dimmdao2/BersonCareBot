import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

function readBooleanValueJson(valueJson: unknown): boolean {
  if (valueJson === null || typeof valueJson !== "object") return false;
  const v = (valueJson as Record<string, unknown>).value;
  return v === true || v === "true";
}

/**
 * Диагностика MAX Mini App включается только через админку (`max_debug_page_enabled` в `system_settings`), не через ENV.
 */
export default async function MaxDebugLayout({ children }: { children: ReactNode }) {
  const deps = buildAppDeps();
  const row = await deps.systemSettings.getSetting("max_debug_page_enabled", "admin");
  if (!row || !readBooleanValueJson(row.valueJson)) notFound();
  return children;
}
