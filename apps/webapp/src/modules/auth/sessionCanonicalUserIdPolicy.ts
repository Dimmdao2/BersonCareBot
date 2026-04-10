/**
 * Phase C — canonical `userId` in session cookie (PLATFORM_IDENTITY_ACCESS / MASTER_PLAN §5 C, SPEC §6, DoD §2).
 *
 * ## Production (PostgreSQL webapp DB)
 *
 * After a **trusted** exchange (integrator webapp-entry token, Telegram initData/widget, OAuth callback,
 * phone OTP confirm), `SessionUser.userId` SHOULD be the **canonical** `platform_users.id` UUID
 * (possibly after merge resolve via `pgUserByPhone.findByUserId` / `findOrCreateByChannelBinding`).
 *
 * ## Legacy / compatibility: non-UUID `userId` (`tg:…`, `max:…`, `telegram:…` in in-memory tests, dev bypass)
 *
 * **Architectural decision:** any `userId` for which {@link isPlatformUserUuid} is **false** is **not** a DB
 * canonical key. Access decisions MUST NOT treat it as proof of a platform row. For `client`, tier policy
 * resolves this as {@link PlatformAccessResolution} `legacy_non_uuid_session` → **onboarding-only**
 * (no patient tier from this transport alone) — see `resolvePlatformAccessContext`.
 *
 * This is a **temporary onboarding-only compatibility mode** for:
 * - Vitest / in-memory repos (`inMemoryIdentityResolutionPort` uses `telegram:` / `max:` prefixes),
 * - dev bypass tokens (`dev:client`, …),
 * - any call path that omits `IdentityResolutionPort` (should be rare outside tests).
 *
 * **Not** a second class of “production patient id”: main login flows with DB inject `pgIdentityResolutionPort`
 * and write UUIDs. Integrator tokens with bare UUID `sub` and no messenger binding load the row via
 * `pgUserByPhonePort.findByUserId` in `exchangeIntegratorToken`.
 *
 * **Server patient business:** Route Handlers под `/api/patient/*`, **`/api/booking/*`** и server actions с
 * `requirePatientAccessWithPhone` требуют `tier === "patient"` через **`patientClientBusinessGate`**
 * (`platform-access/patientClientBusinessGate.ts` → `resolvePlatformAccessContext`) при наличии `DATABASE_URL`.
 * RSC с чтением персональных данных из БД — **`patientRscPersonalDataGate`** в `app-layer/guards/requireRole.ts`.
 */

import type { PlatformAccessResolution } from "@/modules/platform-access/types";

/** Resolution value when cookie `userId` is not a platform UUID — kept in sync with `resolvePlatformAccessContext`. */
export const LEGACY_NON_UUID_SESSION_RESOLUTION = "legacy_non_uuid_session" as const satisfies PlatformAccessResolution;
