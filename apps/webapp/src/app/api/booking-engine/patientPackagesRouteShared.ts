import { NextResponse } from "next/server";
import { isPlatformUserUuid } from "@/shared/platform-user/isPlatformUserUuid";

export function resolveAssignedByPlatformUserId(userId: string): string | null {
  return isPlatformUserUuid(userId) ? userId : null;
}

const ERROR_STATUS: Record<string, number> = {
  catalog_not_found: 404,
  package_not_found: 404,
  appointment_not_found: 404,
  platform_user_id_required: 400,
  invalid_body: 400,
  past_detach_confirmation_required: 400,
  appointment_not_linked_to_package: 400,
  appointment_has_consumed_package_session: 400,
  past_unlink_not_allowed: 403,
  late_detach_choice_required: 409,
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
