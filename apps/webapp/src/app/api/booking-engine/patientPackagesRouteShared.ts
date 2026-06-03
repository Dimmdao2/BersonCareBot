import { NextResponse } from "next/server";
import { isPlatformUserUuid } from "@/shared/platform-user/isPlatformUserUuid";

export function resolveAssignedByPlatformUserId(userId: string): string | null {
  return isPlatformUserUuid(userId) ? userId : null;
}

const ERROR_STATUS: Record<string, number> = {
  catalog_not_found: 404,
  package_not_found: 404,
  platform_user_id_required: 400,
  invalid_body: 400,
  payments_disabled: 422,
  payment_provider_unavailable: 422,
  payments_unavailable: 503,
  memberships_unavailable: 503,
};

export function membershipErrorResponse(err: unknown): NextResponse {
  const code = err instanceof Error ? err.message : "failed";
  const status = ERROR_STATUS[code] ?? 500;
  return NextResponse.json({ ok: false, error: code }, { status });
}
