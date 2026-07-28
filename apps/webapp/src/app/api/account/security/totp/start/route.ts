import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireStaffSecurityApiSession } from '@/app-layer/guards/requireRole';
import { logger } from '@/app-layer/logging/logger';

export async function POST() {
  const gate = await requireStaffSecurityApiSession();
  if (!gate.ok) return gate.response;
  // `staffSecurity` undefined = this session's login never set it (e.g. a global admin's
  // email-OTP login never has an existing `staff_security_profiles` row to derive an assurance
  // from) — that is the bootstrap case, equivalent to "never enrolled," and must be allowed to
  // start enrollment here (audited 2026-07-25). `startTotpEnrollment` itself calls `ensureProfile()`
  // and independently refuses when already fully enrolled, so this stays fail-closed.
  const assurance = gate.session.staffSecurity?.assurance;
  if (
    assurance !== undefined &&
    assurance !== 'pending_enrollment' &&
    assurance !== 'recovery' &&
    assurance !== 'factor_verified'
  ) {
    return NextResponse.json({ ok: false, error: 'security_session_required' }, { status: 403 });
  }
  const deps = buildAppDeps();
  try {
    const email = await deps.userByPhone.getVerifiedEmailForUser(gate.session.user.userId);
    if (!email)
      return NextResponse.json({ ok: false, error: 'verified_email_required' }, { status: 409 });
    const result = await deps.staffSecurity.startTotpEnrollment({ email });
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorCode =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code)
        : undefined;
    logger.error(
      { err, errorMessage, errorCode },
      '[account/security/totp/start] enrollment start failed',
    );
    // Keep the response JSON-shaped even when infrastructure fails. The UI must not turn the
    // original server error into a second, misleading response.json() SyntaxError.
    return NextResponse.json({ ok: false, error: 'totp_enrollment_start_failed' }, { status: 500 });
  }
}
