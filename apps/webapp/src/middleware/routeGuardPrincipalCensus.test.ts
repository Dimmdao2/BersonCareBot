/** @vitest-environment node */
/**
 * AST ratchet for OWNER_PUNCHLIST_2026-07-28 §15.1.
 *
 * This is deliberately separate from csrfOrigin.test.ts: that frozen census continues to detect
 * route-file/method inventory changes, while this gate classifies behavior per exported handler.
 * A route passes honestly only when it calls an approved app-layer access guard and, before its
 * first DB boundary, both the guard and a DB principal establisher have run. Public, pre-auth,
 * signed-ingress, and legacy gaps stay visible in ROUTE_EXCEPTIONS until later remediation.
 *
 * The analysis is lexical and handler-scoped. Imports and comments do not count; an async guard
 * must be directly awaited; sibling HTTP handlers do not cover one another; local helper calls and
 * callbacks are expanded in execution order. It does not claim whole-program control-flow proof.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const WEBAPP_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const REPO_ROOT = path.resolve(WEBAPP_ROOT, "../..");
const SRC_ROOT = path.join(WEBAPP_ROOT, "src");
const API_ROOT = path.join(SRC_ROOT, "app/api");
const GUARDS_ROOT = path.join(SRC_ROOT, "app-layer/guards");
const PRINCIPAL_ROOT = path.join(SRC_ROOT, "app-layer/principal");
const DB_PRINCIPAL_SOURCE = path.join(REPO_ROOT, "packages/db-principal/src/index.ts");

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];
const HTTP_METHOD_SET = new Set<string>(HTTP_METHODS);

/**
 * Identity/access gates actually exported from app-layer/guards and used by Route Handlers.
 * Entitlement guards are intentionally absent: they consume an already-authorized organization
 * and do not authenticate the caller. withDoctorWorkspacePrincipal is a principal wrapper, not an
 * access decision. The source-export audit below prevents invented names from entering this list.
 */
const APPROVED_ROUTE_GUARDS = new Set([
  "requireAdminWorkspaceApiContext",
  "requireAuthenticatedApiSession",
  "requireAuthenticatedIdentitySelfApiSession",
  "requireClinicManagementApiContext",
  "requireDoctorApiSession",
  "requireDoctorWorkspaceApiContext",
  "requirePatientApiBusinessAccess",
  "requirePatientApiSession",
  "requirePatientApiSessionWithPhone",
  "requirePatientBookingTrustedPhoneAccess",
  "requirePlatformOperationsApiContext",
  "requireStaffSecurityApiSession",
  "requireStaffWebPushSelfApiSession",
]);

/**
 * Every approved route guard above establishes the current DB principal itself (some through
 * getCurrentSession -> stampDbPrincipalFromSession, then a narrower staff/patient/platform stamp).
 * Keeping this a separate set makes the guard/principal requirements independently testable.
 */
const PRINCIPAL_ESTABLISHING_GUARDS = new Set(APPROVED_ROUTE_GUARDS);

/** Principal calls found in app-layer/principal or @bersoncare/db-principal. */
const STATEMENT_PRINCIPAL_ESTABLISHERS = new Set([
  "enterStaffSecuritySelfPrincipal",
  "enterVerifiedIntegratorOrganizationPrincipal",
  "enterWithDbBootstrapPrincipal",
  "enterWithDbInfraPrincipal",
  "enterWithDbIntegratorPrincipal",
  "enterWithDbOrganizationPrincipal",
  "enterWithDbPatientPrincipal",
  "enterWithDbPlatformPrincipal",
  "enterWithDbPrincipal",
  "enterWithDbStaffPrincipal",
  "stampBootstrapPrincipal",
  "stampDbPrincipalFromSession",
]);

/** Principal calls whose callback, rather than subsequent statements, owns the installed context. */
const WRAPPER_PRINCIPAL_ESTABLISHERS = new Set([
  "runWithDbBootstrapPrincipal",
  "runWithDbInfraPrincipal",
  "runWithDbIntegratorPrincipal",
  "runWithDbOrganizationPrincipal",
  "runWithDbPatientPrincipal",
  "runWithDbPlatformPrincipal",
  "runWithDbPrincipal",
  "runWithDbStaffPrincipal",
  "runWithStaffSecuritySelfPrincipal",
  "withDoctorWorkspacePrincipal",
  "withExplicitOrganizationPrincipal",
  "withPatientOrganizationPrincipal",
]);

/**
 * First DB boundaries confirmed in the repository:
 * - webapp composition root and SQL/Drizzle clients;
 * - createDbPort is currently integrator-only, but is named in §15.1 and must not become an
 *   invisible webapp route escape hatch later.
 */
const DB_ENTRYPOINTS = new Set([
  "buildAppDeps",
  "createDbPort",
  "getDrizzle",
  "getDrizzleOrMutationTx",
  "getPool",
  "getWebappSqlDb",
  "runPgPoolPgText",
  "runWebappPgText",
  "runWebappSql",
  "runWebappTransaction",
]);

const GUARD_MODULE_PREFIX = "@/app-layer/guards/";
const PRINCIPAL_MODULE_PREFIX = "@/app-layer/principal/";
const DB_PRINCIPAL_MODULE = "@bersoncare/db-principal";

/**
 * One line per route file. Prefix before ":" is the report grouping key.
 *
 * This manifest is populated from the current tree below; reasons distinguish intentional
 * alternate protection from a legacy gap instead of pretending every exception is safe by design.
 */
const ROUTE_EXCEPTIONS: Readonly<Record<string, string>> = {
  "admin/audit-log/route.ts": "legacy gap: DB client is acquired before the branch-specific approved guard",
  "admin/booking-engine/appointments/[id]/delete/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/appointments/[id]/lifecycle/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/appointments/[id]/manual-cancel/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/appointments/[id]/manual-no-show/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/appointments/[id]/manual-reschedule/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/appointments/[id]/package/detach/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/appointments/[id]/package/refund/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/appointments/[id]/package/unlink/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/appointments/[id]/payment/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/appointments/manual/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/availability/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/branches/[id]/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/branches/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/calendar/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/form-fields/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/merge-candidates/[id]/dismiss/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/merge-candidates/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/online-location/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/organizations/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/overview/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/packages/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/patient-packages/[id]/consume/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/patient-packages/[id]/recalc/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/patient-packages/[id]/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/patient-packages/[id]/sessions/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/patient-packages/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/patient-products/[id]/consume/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/patient-products/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/policies/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/prepayment-policies/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/products/[id]/pay-link/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/products/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/public-appointments/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/rooms/[id]/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/rooms/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/schedule-blocks/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/scheduling-settings/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/services/[id]/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/services/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/slots-probe/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/specialist-rooms/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/specialists/[id]/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/specialists/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/working-days/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/working-hours/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/booking-engine/working-schedule-templates/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "admin/doctor-analytics-appointments/route.ts": "legacy gap: no approved app-layer guard is proven before DB access",
  "admin/doctor-analytics-metric-accounts/route.ts": "legacy gap: no approved app-layer guard is proven before DB access",
  "admin/google-calendar/calendars/route.ts": "legacy gap: authorization lives outside the approved app-layer guard set",
  "admin/google-calendar/callback/route.ts": "legacy gap: authorization lives outside the approved app-layer guard set",
  "admin/google-calendar/start/route.ts": "legacy gap: authorization lives outside the approved app-layer guard set",
  "admin/mode/route.ts": "legacy gap: authorization lives outside the approved app-layer guard set",
  "admin/platform-user-registration-stats/route.ts": "legacy gap: no approved app-layer guard is proven before DB access",
  "admin/platform-user-subscriber-stats/route.ts": "legacy gap: no approved app-layer guard is proven before DB access",
  "admin/product-analytics/route.ts": "legacy gap: authorization lives outside the approved app-layer guard set",
  "admin/reminder-stats/route.ts": "legacy gap: authorization lives outside the approved app-layer guard set",
  "admin/smtp-test/route.ts": "legacy gap: authorization lives outside the approved app-layer guard set",
  "admin/system-health/route.ts": "legacy gap: authorization lives outside the approved app-layer guard set",
  "auth/channel-link/start/route.ts": "pre-auth: channel proof is established before a session exists",
  "auth/check-phone/route.ts": "pre-auth: authentication flow runs before a session exists",
  "auth/dev-bypass/route.ts": "pre-auth: development-only session bootstrap",
  "auth/dev-public/route.ts": "pre-auth: development-only public-session reset",
  "auth/email-otp/confirm/route.ts": "pre-auth: OTP proof is established before a session exists",
  "auth/email-otp/register/route.ts": "pre-auth: OTP registration runs before a session exists",
  "auth/email-otp/start/route.ts": "pre-auth: OTP challenge starts before a session exists",
  "auth/email-password/forgot/route.ts": "pre-auth: password recovery starts before a session exists",
  "auth/email-password/login/factor/route.ts": "pre-auth: login factor proof creates the session",
  "auth/email-password/login/route.ts": "pre-auth: credential proof creates the session",
  "auth/email-password/lookup/route.ts": "pre-auth: login lookup runs before a session exists",
  "auth/email-password/register/confirm/route.ts": "pre-auth: registration proof creates the session",
  "auth/email-password/register/route.ts": "pre-auth: registration starts before a session exists",
  "auth/email-password/reset/route.ts": "pre-auth: password reset uses a recovery proof",
  "auth/email-password/setup-access/route.ts": "pre-auth: account setup uses a one-time proof",
  "auth/email-password/setup-code/complete/route.ts": "pre-auth: account setup uses a one-time proof",
  "auth/email-setup/complete/route.ts": "pre-auth: email setup uses a one-time proof",
  "auth/email-setup/resend/route.ts": "pre-auth: email setup uses a one-time proof",
  "auth/email-setup/validate/route.ts": "pre-auth: email setup uses a one-time proof",
  "auth/email/confirm/route.ts": "pre-auth: email proof is established before a session exists",
  "auth/email/start/route.ts": "pre-auth: email challenge starts before a session exists",
  "auth/exchange/route.ts": "pre-auth: signed integrator token is exchanged for a session",
  "auth/login/alternatives-config/route.ts": "pre-auth: public login configuration",
  "auth/logout/route.ts": "pre-auth: logout remains callable with an absent or expired session",
  "auth/max-init/route.ts": "pre-auth: MAX proof is established before a session exists",
  "auth/messenger/poll/route.ts": "pre-auth: messenger login polling creates the session",
  "auth/messenger/start/route.ts": "pre-auth: messenger login starts before a session exists",
  "auth/oauth/callback/apple/route.ts": "pre-auth: OAuth callback verifies provider state before creating a session",
  "auth/oauth/callback/google/route.ts": "pre-auth: OAuth callback verifies provider state before creating a session",
  "auth/oauth/callback/route.ts": "pre-auth: OAuth callback verifies provider state before creating a session",
  "auth/oauth/callback/yandex/route.ts": "pre-auth: OAuth callback verifies provider state before creating a session",
  "auth/oauth/providers/route.ts": "pre-auth: public OAuth provider configuration",
  "auth/oauth/start/route.ts": "pre-auth: OAuth flow starts before a session exists",
  "auth/phone/confirm/route.ts": "pre-auth: phone proof is established before a session exists",
  "auth/phone/messenger-bind/finish/route.ts": "pre-auth: messenger binding uses a one-time setup proof",
  "auth/phone/messenger-bind/start/route.ts": "pre-auth: messenger binding starts from a setup proof",
  "auth/phone/messenger-bind/status/route.ts": "pre-auth: messenger binding status uses a setup proof",
  "auth/phone/start/route.ts": "pre-auth: phone challenge starts before a session exists",
  "auth/pin/login/route.ts": "pre-auth: PIN proof creates the session",
  "auth/specialist-signup/confirm/route.ts": "pre-auth: specialist registration proof creates the session",
  "auth/specialist-signup/retry/route.ts": "pre-auth: specialist registration retry precedes the session",
  "auth/specialist-signup/slug/route.ts": "pre-auth: public registration availability check",
  "auth/specialist-signup/start/route.ts": "pre-auth: specialist registration starts before a session exists",
  "auth/telegram-init/route.ts": "pre-auth: Telegram proof is established before a session exists",
  "auth/telegram-login/config/route.ts": "pre-auth: public Telegram login configuration",
  "auth/telegram-login/route.ts": "pre-auth: Telegram proof creates the session",
  "booking/public/catalog/cities/route.ts": "pre-auth: public booking catalog",
  "booking/public/catalog/services/route.ts": "pre-auth: public booking catalog",
  "booking/public/create/confirm/route.ts": "pre-auth: public booking uses a one-time confirmation proof",
  "booking/public/create/route.ts": "pre-auth: public booking starts a one-time confirmation flow",
  "booking/public/form-fields/route.ts": "pre-auth: public booking form configuration",
  "booking/public/payment-status/route.ts": "pre-auth: public payment status uses booking proof",
  "booking/public/payments/mock-complete/route.ts": "pre-auth: development payment callback uses booking proof",
  "booking/public/products/link/route.ts": "pre-auth: public product link uses booking proof",
  "booking/public/products/payment-status/route.ts": "pre-auth: public product payment status uses booking proof",
  "booking/public/products/payments/mock-complete/route.ts": "pre-auth: development payment callback uses booking proof",
  "booking/public/products/purchase/route.ts": "pre-auth: public product purchase uses booking proof",
  "booking/public/slots/route.ts": "pre-auth: public booking availability",
  "clinic/invites/accept/confirm/route.ts": "pre-auth: invite acceptance uses an email proof",
  "clinic/invites/accept/lookup/route.ts": "pre-auth: invite lookup uses a bearer proof",
  "clinic/invites/accept/start/route.ts": "pre-auth: invite acceptance starts before a session exists",
  "doctor/booking-engine/appointments/[id]/delete/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "doctor/booking-engine/appointments/[id]/lifecycle/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "doctor/booking-engine/appointments/[id]/manual-cancel/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "doctor/booking-engine/appointments/[id]/manual-no-show/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "doctor/booking-engine/appointments/[id]/manual-reschedule/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "doctor/booking-engine/appointments/[id]/package/detach/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "doctor/booking-engine/appointments/[id]/package/refund/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "doctor/booking-engine/appointments/[id]/package/unlink/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "doctor/booking-engine/appointments/[id]/payment/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "doctor/booking-engine/appointments/manual-patient-visit/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "doctor/booking-engine/appointments/manual/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "doctor/booking-engine/calendar/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "doctor/booking-engine/overview/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "doctor/booking-engine/packages/[id]/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "doctor/booking-engine/packages/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "doctor/booking-engine/patient-packages/[id]/consume/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "doctor/booking-engine/patient-packages/[id]/recalc/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "doctor/booking-engine/patient-packages/[id]/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "doctor/booking-engine/patient-packages/[id]/sessions/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "doctor/booking-engine/patient-packages/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "doctor/booking-engine/patient-products/[id]/consume/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "doctor/booking-engine/patient-products/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "doctor/booking-engine/products/[id]/pay-link/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "doctor/booking-engine/products/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "doctor/booking-engine/services/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "doctor/booking-engine/working-days/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "doctor/booking-engine/working-hours/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "doctor/booking-engine/working-schedule-templates/route.ts": "delegated guard: local booking wrapper is outside app-layer/guards",
  "doctor/clients/merge-preview/route.ts": "disabled stub: returns not_available and performs no DB access",
  "doctor/clients/merge-user-search/route.ts": "disabled stub: returns not_available and performs no DB access",
  "doctor/clients/merge/route.ts": "disabled stub: returns not_available and performs no DB access",
  "health/projection/route.ts": "public: health probe is intentionally callable without a user session",
  "health/route.ts": "public: health probe uses an explicit infra principal without a user session",
  "integrator/appointments/active-by-user/route.ts": "signed ingress: integrator GET HMAC verifier is outside app-layer/guards",
  "integrator/appointments/record/route.ts": "signed ingress: integrator GET HMAC verifier is outside app-layer/guards",
  "integrator/channel-link/complete/route.ts": "signed ingress: integrator HMAC verifier is outside app-layer/guards",
  "integrator/communication/conversations/[id]/route.ts": "signed ingress: integrator GET HMAC verifier is outside app-layer/guards",
  "integrator/communication/conversations/route.ts": "signed ingress: integrator GET HMAC verifier is outside app-layer/guards",
  "integrator/communication/questions/by-conversation/[conversationId]/route.ts": "signed ingress: integrator GET HMAC verifier is outside app-layer/guards",
  "integrator/communication/questions/route.ts": "signed ingress: integrator GET HMAC verifier is outside app-layer/guards",
  "integrator/delivery-targets/route.ts": "signed ingress: integrator GET HMAC verifier is outside app-layer/guards",
  "integrator/diary/lfk-complexes/route.ts": "signed ingress: integrator GET HMAC verifier is outside app-layer/guards",
  "integrator/diary/symptom-trackings/route.ts": "signed ingress: integrator GET HMAC verifier is outside app-layer/guards",
  "integrator/events/route.ts": "signed ingress: integrator HMAC verifier is outside app-layer/guards",
  "integrator/messenger-phone/bind/route.ts": "signed ingress: integrator HMAC verifier is outside app-layer/guards",
  "integrator/patient-notifications/web-push/route.ts": "signed ingress: integrator HMAC verifier is outside app-layer/guards",
  "integrator/patient-reminders/notify-channels/route.ts": "signed ingress: integrator HMAC verifier is outside app-layer/guards",
  "integrator/phone-messenger-bind/complete/route.ts": "signed ingress: integrator HMAC verifier is outside app-layer/guards",
  "integrator/program-note/reply-begin/route.ts": "signed ingress: integrator HMAC verifier is outside app-layer/guards",
  "integrator/reminders/dispatch/route.ts": "signed ingress: integrator HMAC verifier is outside app-layer/guards",
  "integrator/reminders/history/route.ts": "signed ingress: integrator GET HMAC verifier is outside app-layer/guards",
  "integrator/reminders/messenger-topic/disable/route.ts": "signed ingress: integrator HMAC verifier is outside app-layer/guards",
  "integrator/reminders/mute/route.ts": "signed ingress: integrator HMAC verifier is outside app-layer/guards",
  "integrator/reminders/notification-settings/route.ts": "signed ingress: integrator HMAC verifier is outside app-layer/guards",
  "integrator/reminders/notification-settings/toggle/route.ts": "signed ingress: integrator HMAC verifier is outside app-layer/guards",
  "integrator/reminders/occurrences/done/route.ts": "signed ingress: integrator HMAC verifier is outside app-layer/guards",
  "integrator/reminders/occurrences/skip/route.ts": "signed ingress: integrator HMAC verifier is outside app-layer/guards",
  "integrator/reminders/occurrences/snooze/route.ts": "signed ingress: integrator HMAC verifier is outside app-layer/guards",
  "integrator/reminders/rules/by-category/route.ts": "signed ingress: integrator GET HMAC verifier is outside app-layer/guards",
  "integrator/reminders/rules/route.ts": "signed ingress: integrator GET HMAC verifier is outside app-layer/guards",
  "integrator/subscriptions/for-user/route.ts": "signed ingress: integrator GET HMAC verifier is outside app-layer/guards",
  "integrator/subscriptions/topics/route.ts": "signed ingress: integrator GET HMAC verifier is outside app-layer/guards",
  "integrator/support/admin-reply/route.ts": "signed ingress: integrator HMAC verifier is outside app-layer/guards",
  "integrator/support/sync-user-message/route.ts": "signed ingress: integrator HMAC verifier is outside app-layer/guards",
  "integrator/web-push/subscriptions/delete/route.ts": "signed ingress: integrator HMAC verifier is outside app-layer/guards",
  "integrator/web-push/subscriptions/route.ts": "signed ingress: integrator GET HMAC verifier is outside app-layer/guards",
  "integrator/web-push/vapid/route.ts": "signed ingress: integrator GET HMAC verifier is outside app-layer/guards",
  "internal/heartbeat/digest/route.ts": "internal job: constant-time INTERNAL_JOB_SECRET bearer verification",
  "internal/heartbeat/pipeline_delivery/route.ts": "internal job: constant-time INTERNAL_JOB_SECRET bearer verification",
  "internal/media-hls-proxy-errors/retention/route.ts": "internal job: constant-time INTERNAL_JOB_SECRET bearer verification",
  "internal/media-multipart/cleanup/route.ts": "internal job: constant-time INTERNAL_JOB_SECRET bearer verification",
  "internal/media-pending-delete/purge/route.ts": "internal job: constant-time INTERNAL_JOB_SECRET bearer verification",
  "internal/media-playback-stats/retention/route.ts": "internal job: constant-time INTERNAL_JOB_SECRET bearer verification",
  "internal/media-preview/process/route.ts": "internal job: constant-time INTERNAL_JOB_SECRET bearer verification",
  "internal/media-transcode/enqueue/route.ts": "internal job: constant-time INTERNAL_JOB_SECRET bearer verification",
  "internal/media-transcode/reconcile/route.ts": "internal job: constant-time INTERNAL_JOB_SECRET bearer verification",
  "internal/operator-health-critical/tick/route.ts": "internal job: constant-time INTERNAL_JOB_SECRET bearer verification",
  "internal/operator-health-digest/tick/route.ts": "internal job: constant-time INTERNAL_JOB_SECRET bearer verification",
  "internal/product-analytics/retention/route.ts": "internal job: constant-time INTERNAL_JOB_SECRET bearer verification",
  "internal/reminders/web-push-only/tick/route.ts": "internal job: constant-time INTERNAL_JOB_SECRET bearer verification",
  "internal/specialist-task-reminders/tick/route.ts": "internal job: constant-time INTERNAL_JOB_SECRET bearer verification",
  "internal/system-health-guard/tick/route.ts": "internal job: constant-time INTERNAL_JOB_SECRET bearer verification",
  "join/email/confirm/route.ts": "pre-auth: invitation acceptance uses an email proof",
  "join/email/start/route.ts": "pre-auth: invitation acceptance starts before a session exists",
  "join/exchange/route.ts": "pre-auth: invitation bearer is exchanged for a session",
  "media/s3-status/route.ts": "public: S3 capability flag is anonymous and DB-free",
  "patient-app/client-boot-report/route.ts": "public: bounded telemetry uses bootstrap principal and rate limiting",
  "patient/analytics/push-open/route.ts": "public telemetry: service-worker/PWA push clicks are intentionally accepted without a session",
  "patient/material-ratings/route.ts": "mixed access: GET intentionally retains optional patient/guest semantics while PUT uses the patient business guard",
  "patient/organization-context/route.ts": "legacy gap: raw session access is outside the approved app-layer guard set",
  "patient/support/route.ts": "legacy gap: authorization lives outside the approved app-layer guard set",
  "payments/patient-acquiring-webhook/[provider]/route.ts": "provider webhook: provider signature is verified before processing",
  "payments/webhook/[provider]/route.ts": "provider webhook: provider signature is verified before processing",
  "public/support-contact-url/route.ts": "public: anonymous support configuration uses a bootstrap principal",
  "public/support/route.ts": "public: anonymous support submission uses bootstrap plus rate limiting",
  "references/[categoryCode]/route.ts": "public: read-only baseline uses an explicit bootstrap principal",
  "version/route.ts": "public: version capability is anonymous and DB-free",
};

// Ratchet: may only decrease. Set to the initial reviewed manifest size once populated.
const MAX_ROUTE_EXCEPTIONS = 217;

function walkRouteFiles(directory: string, result: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walkRouteFiles(fullPath, result);
    else if (entry.name === "route.ts") result.push(fullPath);
  }
  return result;
}

function parse(file: string, source = readFileSync(file, "utf8")): ts.SourceFile {
  return ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return Boolean(ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((item) => item.kind === kind));
}

type ImportBinding = Readonly<{ module: string; imported: string }>;

function importBindings(sourceFile: ts.SourceFile): Map<string, ImportBinding> {
  const bindings = new Map<string, ImportBinding>();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !statement.importClause ||
      statement.importClause.isTypeOnly ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      continue;
    }
    const moduleSpecifier = statement.moduleSpecifier.text;
    const named = statement.importClause.namedBindings;
    if (named && ts.isNamedImports(named)) {
      for (const element of named.elements) {
        if (!element.isTypeOnly) {
          bindings.set(element.name.text, {
            module: moduleSpecifier,
            imported: (element.propertyName ?? element.name).text,
          });
        }
      }
    } else if (named && ts.isNamespaceImport(named)) {
      bindings.set(named.name.text, { module: moduleSpecifier, imported: "*" });
    }
  }
  return bindings;
}

function localFunctions(sourceFile: ts.SourceFile): Map<string, ts.FunctionLikeDeclaration> {
  const functions = new Map<string, ts.FunctionLikeDeclaration>();
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      functions.set(node.name.text, node);
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      functions.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return functions;
}

function isExecutableFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    ts.isArrowFunction(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

function returnedFunctions(factory: ts.FunctionLikeDeclaration): ts.FunctionLikeDeclaration[] {
  const functions: ts.FunctionLikeDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isReturnStatement(node) &&
      node.expression &&
      (ts.isArrowFunction(node.expression) || ts.isFunctionExpression(node.expression))
    ) {
      functions.push(node.expression);
      return;
    }
    if (node !== factory && isExecutableFunctionLike(node)) return;
    ts.forEachChild(node, visit);
  };
  visit(factory);
  return functions;
}

type Handler = Readonly<{ method: HttpMethod; roots: readonly ts.Node[] }>;

function exportedHandlers(sourceFile: ts.SourceFile): Handler[] {
  const locals = localFunctions(sourceFile);
  const handlers: Handler[] = [];

  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      HTTP_METHOD_SET.has(statement.name.text) &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword)
    ) {
      handlers.push({ method: statement.name.text as HttpMethod, roots: [statement] });
      continue;
    }
    if (!ts.isVariableStatement(statement) || !hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !HTTP_METHOD_SET.has(declaration.name.text)) continue;
      const initializer = declaration.initializer;
      let roots: readonly ts.Node[] = initializer ? [initializer] : [declaration];
      if (
        initializer &&
        ts.isCallExpression(initializer) &&
        ts.isIdentifier(initializer.expression)
      ) {
        const factory = locals.get(initializer.expression.text);
        const returned = factory ? returnedFunctions(factory) : [];
        if (returned.length > 0) roots = returned;
      }
      handlers.push({ method: declaration.name.text as HttpMethod, roots });
    }
  }
  return handlers.sort((left, right) => left.method.localeCompare(right.method));
}

function bindingForCall(
  call: ts.CallExpression,
  imports: ReadonlyMap<string, ImportBinding>,
): ImportBinding | null {
  if (ts.isIdentifier(call.expression)) {
    return imports.get(call.expression.text) ?? { module: "<local>", imported: call.expression.text };
  }
  if (ts.isPropertyAccessExpression(call.expression)) {
    const owner = call.expression.expression;
    if (ts.isIdentifier(owner)) {
      const namespace = imports.get(owner.text);
      if (namespace?.imported === "*") {
        return { module: namespace.module, imported: call.expression.name.text };
      }
    }
    return { module: "<property>", imported: call.expression.name.text };
  }
  return null;
}

function isApprovedGuardBinding(binding: ImportBinding | null): boolean {
  return Boolean(
    binding &&
    binding.module.startsWith(GUARD_MODULE_PREFIX) &&
    APPROVED_ROUTE_GUARDS.has(binding.imported),
  );
}

function isPrincipalBinding(binding: ImportBinding | null, names: ReadonlySet<string>): boolean {
  return Boolean(
    binding &&
    names.has(binding.imported) &&
    (
      binding.module === DB_PRINCIPAL_MODULE ||
      binding.module.startsWith(PRINCIPAL_MODULE_PREFIX) ||
      binding.module === "@/app-layer/guards/doctorWorkspacePrincipal"
    ),
  );
}

function isDirectlyAwaited(call: ts.CallExpression): boolean {
  let current: ts.Node = call;
  while (
    current.parent &&
    (
      ts.isParenthesizedExpression(current.parent) ||
      ts.isAsExpression(current.parent) ||
      ts.isNonNullExpression(current.parent)
    )
  ) {
    current = current.parent;
  }
  return Boolean(current.parent && ts.isAwaitExpression(current.parent));
}

type EventKind = "guard" | "principal" | "db";
type HandlerEvent = Readonly<{ kind: EventKind; name: string; line: number }>;

function collectHandlerEvents(sourceFile: ts.SourceFile, roots: readonly ts.Node[]): HandlerEvent[] {
  const imports = importBindings(sourceFile);
  const locals = localFunctions(sourceFile);
  const events: HandlerEvent[] = [];
  const activeHelpers = new Set<ts.FunctionLikeDeclaration>();
  const lineOf = (node: ts.Node) =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

  const executeFunction = (fn: ts.FunctionLikeDeclaration): void => {
    if (activeHelpers.has(fn)) return;
    activeHelpers.add(fn);
    if (fn.body) visit(fn.body, true);
    activeHelpers.delete(fn);
  };

  const visit = (node: ts.Node, executeFunctionBody = false): void => {
    if (isExecutableFunctionLike(node) && !executeFunctionBody) return;

    if (ts.isCallExpression(node)) {
      // Evaluate the callee object and all non-callback arguments before invoking the call.
      if (!ts.isIdentifier(node.expression)) visit(node.expression);
      for (const argument of node.arguments) {
        if (!ts.isArrowFunction(argument) && !ts.isFunctionExpression(argument)) visit(argument);
      }

      const binding = bindingForCall(node, imports);
      const name = binding?.imported ?? "<unknown>";
      const line = lineOf(node);
      const isGuard = isApprovedGuardBinding(binding);
      const isWrapper = isPrincipalBinding(binding, WRAPPER_PRINCIPAL_ESTABLISHERS);
      const isStatementPrincipal = isPrincipalBinding(binding, STATEMENT_PRINCIPAL_ESTABLISHERS);

      if (isGuard && isDirectlyAwaited(node)) {
        events.push({ kind: "guard", name, line });
        if (PRINCIPAL_ESTABLISHING_GUARDS.has(name)) {
          events.push({ kind: "principal", name, line });
        }
      }
      if (isWrapper || isStatementPrincipal) {
        events.push({ kind: "principal", name, line });
      }
      if (DB_ENTRYPOINTS.has(name)) {
        events.push({ kind: "db", name, line });
      }

      if (binding?.module === "<local>") {
        const helper = locals.get(name);
        if (helper) executeFunction(helper);
      }

      // A principal wrapper installs context before invoking its callback. For other callbacks,
      // expanding after the call is conservative: it exposes DB work reachable from this handler.
      for (const argument of node.arguments) {
        if (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) {
          executeFunction(argument);
        }
      }
      return;
    }

    ts.forEachChild(node, (child) => visit(child));
  };

  for (const root of roots) {
    if (isExecutableFunctionLike(root)) executeFunction(root);
    else visit(root);
  }
  return events;
}

type HandlerFailure = Readonly<{
  route: string;
  method: HttpMethod | "<none>";
  issues: readonly string[];
}>;

function analyzeRoute(file: string, source?: string): HandlerFailure[] {
  const sourceFile = parse(file, source);
  const route = path.relative(API_ROOT, file);
  const handlers = exportedHandlers(sourceFile);
  if (handlers.length === 0) {
    return [{ route, method: "<none>", issues: ["no supported exported HTTP method"] }];
  }

  const failures: HandlerFailure[] = [];
  for (const handler of handlers) {
    const events = collectHandlerEvents(sourceFile, handler.roots);
    const firstGuard = events.findIndex((event) => event.kind === "guard");
    const firstPrincipal = events.findIndex((event) => event.kind === "principal");
    const firstDb = events.findIndex((event) => event.kind === "db");
    const issues: string[] = [];

    if (firstGuard < 0) issues.push("approved guard is not directly awaited");
    if (firstDb >= 0) {
      const db = events[firstDb]!;
      if (firstGuard < 0 || firstGuard > firstDb) {
        issues.push(`guard is not before ${db.name} at line ${db.line}`);
      }
      if (firstPrincipal < 0 || firstPrincipal > firstDb) {
        issues.push(`principal is not established before ${db.name} at line ${db.line}`);
      }
    }
    if (issues.length > 0) failures.push({ route, method: handler.method, issues });
  }
  return failures;
}

function exportedValueNames(file: string): Set<string> {
  const sourceFile = parse(file);
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword)
    ) {
      names.add(statement.name.text);
    } else if (ts.isVariableStatement(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
      }
    }
  }
  return names;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && !entry.name.includes(".test."))
    .map((entry) => path.join(directory, entry.name));
}

describe("API route guard/principal AST census (§15.1)", () => {
  it("recognizes only executed, awaited guards in the same exported handler", () => {
    const file = path.join(API_ROOT, "__route_guard_census_selftest__/route.ts");
    const analyze = (body: string) =>
      analyzeRoute(file, `
        import { requireDoctorWorkspaceApiContext } from "@/app-layer/guards/requireRole";
        import { runWithDbOrganizationPrincipal } from "@bersoncare/db-principal";
        import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
        ${body}
      `);

    expect(analyze(`
      export async function GET() {
        const gate = await requireDoctorWorkspaceApiContext();
        return buildAppDeps().x;
      }
    `)).toEqual([]);
    expect(analyze(`
      export async function GET() {
        buildAppDeps();
        await requireDoctorWorkspaceApiContext();
      }
    `)[0]?.issues.some((issue) => issue.startsWith("guard is not before buildAppDeps at line "))).toBe(true);
    expect(analyze(`
      export async function GET() {
        requireDoctorWorkspaceApiContext();
        return buildAppDeps().x;
      }
    `)[0]?.issues).toContain("approved guard is not directly awaited");
    expect(analyze(`
      // requireDoctorWorkspaceApiContext() is not execution.
      export async function GET() { return buildAppDeps().x; }
      export async function POST() {
        await requireDoctorWorkspaceApiContext();
      }
    `).map((failure) => failure.method)).toEqual(["GET"]);
    expect(analyze(`
      async function load() { return buildAppDeps().x; }
      export async function GET() {
        await requireDoctorWorkspaceApiContext();
        return load();
      }
    `)).toEqual([]);
    expect(analyze(`
      export async function GET() {
        await requireDoctorWorkspaceApiContext();
        return runWithDbOrganizationPrincipal("org", () => buildAppDeps().x);
      }
    `)).toEqual([]);
  });

  it("binds every configured guard and principal name to a real source export", () => {
    const guardExports = new Set(sourceFiles(GUARDS_ROOT).flatMap((file) => [...exportedValueNames(file)]));
    const principalExports = new Set([
      ...sourceFiles(PRINCIPAL_ROOT).flatMap((file) => [...exportedValueNames(file)]),
      ...exportedValueNames(DB_PRINCIPAL_SOURCE),
      ...guardExports,
    ]);
    expect([...APPROVED_ROUTE_GUARDS].filter((name) => !guardExports.has(name))).toEqual([]);
    expect(
      [...STATEMENT_PRINCIPAL_ESTABLISHERS, ...WRAPPER_PRINCIPAL_ESTABLISHERS]
        .filter((name) => !principalExports.has(name)),
    ).toEqual([]);
    expect(existsSync(DB_PRINCIPAL_SOURCE) && statSync(DB_PRINCIPAL_SOURCE).isFile()).toBe(true);
  });

  it("fails only on an unclassified route and forces the exception manifest to shrink", () => {
    const routeFiles = walkRouteFiles(API_ROOT).sort();
    const failures = routeFiles.flatMap((file) => analyzeRoute(file));
    const failuresByRoute = new Map<string, HandlerFailure[]>();
    for (const failure of failures) {
      const grouped = failuresByRoute.get(failure.route) ?? [];
      grouped.push(failure);
      failuresByRoute.set(failure.route, grouped);
    }

    const exceptionRoutes = Object.keys(ROUTE_EXCEPTIONS).sort();
    const unclassified = [...failuresByRoute]
      .filter(([route]) => !(route in ROUTE_EXCEPTIONS))
      .flatMap(([route, routeFailures]) =>
        routeFailures.map((failure) => `${route}#${failure.method}: ${failure.issues.join("; ")}`),
      );
    const stale = exceptionRoutes.filter((route) => !failuresByRoute.has(route));
    const emptyReasons = exceptionRoutes.filter((route) => !ROUTE_EXCEPTIONS[route]?.trim());

    const honestFiles = routeFiles.length - failuresByRoute.size;
    const groupedReasons = Object.values(ROUTE_EXCEPTIONS).reduce<Record<string, number>>(
      (counts, reason) => {
        const group = reason.split(":", 1)[0] ?? "unknown";
        counts[group] = (counts[group] ?? 0) + 1;
        return counts;
      },
      {},
    );
    console.info(
      `route guard census: ${honestFiles} honest files, ${failuresByRoute.size} exceptions; ` +
      Object.entries(groupedReasons).map(([group, count]) => `${group}=${count}`).join(", "),
    );

    expect(unclassified, "noncompliant route handlers missing from ROUTE_EXCEPTIONS").toEqual([]);
    expect(stale, "compliant/deleted routes must be removed from ROUTE_EXCEPTIONS").toEqual([]);
    expect(emptyReasons, "every route exception needs a one-line reason").toEqual([]);
    expect(exceptionRoutes.length).toBeLessThanOrEqual(MAX_ROUTE_EXCEPTIONS);
  });
});
