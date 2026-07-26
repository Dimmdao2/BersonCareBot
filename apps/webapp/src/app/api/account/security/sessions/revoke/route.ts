import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireStaffSecurityApiSession } from "@/app-layer/guards/requireRole";
import { setSessionFromUser } from "@/modules/auth/service";

export async function POST() {
  const gate = await requireStaffSecurityApiSession();
  if (!gate.ok) return gate.response;
  if (gate.session.staffSecurity?.assurance !== "factor_verified") {
    return NextResponse.json({ ok: false, error: "verified_security_required" }, { status: 403 });
  }
  const deps = buildAppDeps();
  // D5 (C-1, 2026-07-26). This is the user-facing "sign out everywhere". It used to call ONLY
  // `staffSecurity.revokeSessions()`, i.e. the staff-profile counter, which raises
  // `staff_security_profile_missing` for anyone without an MFA enrollment row and in any case is no
  // longer the value the session chokepoint compares. It now goes through THE one mechanism —
  // `platform_users.session_epoch` — exactly like logout and password reset.
  //
  // `revokeSessions()` is kept, and kept FIRST, as MFA bookkeeping: it still bumps
  // `staff_security_profiles.session_version`, and migration 0243's trigger folds that bump into the
  // same epoch. Both calls therefore land on one counter; the explicit call below is what makes the
  // outcome independent of whether a staff-security row exists at all.
  await deps.staffSecurity.revokeSessions();
  await deps.userByPhone.invalidateSessionsForSelf();
  // Re-read AFTER both increments so the replacement cookie carries the new epoch — otherwise this
  // endpoint would sign the caller out of the very session they used to call it.
  const user = await deps.userByPhone.findByUserId(gate.session.user.userId);
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  await setSessionFromUser(user, {
    staffSecurity: { assurance: "factor_verified", verifiedAt: Math.floor(Date.now() / 1000) },
  });
  return NextResponse.json({ ok: true });
}
