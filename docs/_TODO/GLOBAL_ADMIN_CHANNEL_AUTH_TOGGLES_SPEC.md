# Global-admin channel & auth-method toggles + mini-app removal (spec capture)

> **Owner requirement, 2026-07-24** — prod-prep feature. Captured verbatim-structured; current-state recon in
> progress (grounds the plan). Related: `SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` (login config,
> U-contracts), tariff/entitlements/mechanics-flags (`SAAS_FOUNDATION/SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md`),
> capability-guard. NOT started — awaiting recon + owner acceptance of the plan.

## Requirement (owner, plain)
Global-admin settings must expose **checkboxes to enable/disable each available channel & auth method**, and the
login/registration UI must reflect those toggles **dynamically**.

### R1 — toggleable methods (each independently on/off)
- **Telegram** (auth/registration channel)
- **MAX** (auth/registration channel)
- **SMS** (registration/auth via phone code)
- **2FA** (two-factor authentication)
- **Email** — with **per-provider** control:
  - **Google / Gmail OAuth** — independent toggle
  - **Yandex OAuth** — independent toggle
  - **Apple — NOT included** (owner 2026-07-24; even though implemented, no Apple toggle / not offered).
- **2FA / TOTP** — owner 2026-07-24: required for **global admin AND specialists** (staff). The toggle governs
  whether TOTP 2FA is in effect for those roles.

### R2 — dynamic UI gating
- Turning a method **OFF** in global-admin → it **disappears** from the login/registration surface, **regardless of
  whether credentials/keys are configured** for it. (Example: disable Gmail → Gmail login option vanishes even if a
  Google OAuth key is still set.)
- Turning a method **ON** → it **appears to the client ONLY if its required config exists** (integration key /
  needed keys+addresses in settings). **Owner ruling 2026-07-24:** if a method is ON but its keys/config are
  missing → **NOT shown to the client**, AND the admin sees a **warning next to that toggle** ("parameters not
  configured"). So visible-to-client = `enabled AND fully-configured`; admin always sees the toggle + a
  not-configured warning when applicable.
- Must apply to: patient login, staff/specialist login, registration flows — everywhere the method is offered.

### R3 — remove Telegram & MAX mini-apps
- The Telegram mini-app and MAX mini-app must be **removed** — they duplicate the main web app's capabilities. Keep the
  bots for **auth codes / notifications only** (aligns with RU-privacy `NTF-01`: push/messenger for auth codes only, no
  product fallback in Telegram/MAX). Scope of "remove": the mini-app entry points / launch buttons / webapp-in-bot
  surfaces — NOT the bot's auth/notification messaging.

## Open questions for owner (collect into decision sheet)
- Method ON but unconfigured (no key/creds): hide it, or show + admin-warning?
- Is the toggle **global** (platform-wide, single-tenant owner) or **per-clinic** (tenant-scoped)? (Current owner model
  is single-owner; but SaaS direction may want per-clinic. Default assumption: **global**, matching "global-admin
  settings".)
- 2FA toggle semantics: disabling 2FA entirely vs making it optional-per-user?
- Confirm which email/OAuth providers are in scope (Google, Yandex, + others?).

## Current state — RECON (verified 2026-07-24, `scratchpad/channel-auth-toggles-recon.md`)
- **Login resolver:** `apps/webapp/src/modules/auth/authChannelPolicy.ts` + `loginAlternativesConfig.ts` →
  `/api/auth/login/alternatives-config`, `/api/auth/telegram-login/config`, `/api/auth/oauth/providers` →
  `AuthFlowV2.tsx`/`AuthBootstrap.tsx`. **Fail-closed by default**, and ~30 API routes ALSO server-enforce the channel
  flag (not just UI hiding — good). So the dynamic-gating machinery already exists; we extend its inputs.
- **Per-method gating today:**
  - **email / sms / telegram / max** — ALREADY have individual `system_settings` booleans (`auth_email_enabled` etc.,
    `registry.ts:102-105`), wired end-to-end. **DONE — reuse.**
  - **Google / Yandex / Apple OAuth** — currently DERIVED FROM CREDENTIAL PRESENCE via DB trigger (migrations
    0193/0209/0210), NOT an independent toggle. **GAP vs R2** ("disable Gmail regardless of configured key").
  - **2FA** (staff TOTP, `modules/staff-security/`) — NO global gate, per-user opt-in only. **GAP.**
- **Admin write path:** `/api/platform/settings` (`app/api/platform/settings/route.ts`) — the existing global-admin
  settings API; already carries the 4 boolean auth-channel keys (`PLATFORM_GLOBAL_SETTINGS_API_KEYS`, generic boolean
  normalization). **Reuse point** — new toggles = new registry keys + add to that array. **No admin UI page found** → build.
- **OAuth inventory:** Google, Yandex, **Apple** all implemented (Apple not in owner's list → open question).
- **Mini-apps:** single chokepoint — any bot button carrying `web_app:{url}` (MAX converts `web_app`→`open_app` in
  `deliveryAdapter.ts`). Removal targets: `reminderInlineKeyboard.ts`, `reminderMessengerWebAppUrls.ts`,
  `executeAction.ts:362-382` (no_channel_binding fallback), `helpers.ts:373-459` (`webAppUrlFact`). Bot `sendMessage` /
  Telegram Login Widget / MAX auth codes are SEPARATE → keep untouched. (Not yet located: menu-button mini-app vector,
  staff-login separateness — confirm before removal.)

## Plan (grounded — awaiting owner acceptance; NOT started)
1. **Extend the settings registry** with independent boolean toggles: `auth_oauth_google_enabled`,
   `auth_oauth_yandex_enabled`, (`auth_oauth_apple_enabled`?), `auth_2fa_enabled` — add to `registry.ts` +
   `PLATFORM_GLOBAL_SETTINGS_API_KEYS`. OAuth toggle becomes `enabled AND creds-present` (decouple from creds-only).
2. **Login resolver:** feed the new toggles into `authChannelPolicy`/`oauth/providers` + the ~30 server-enforcing routes
   so a disabled method vanishes from UI AND is rejected server-side (fail-closed).
3. **2FA:** add the global gate honoring `auth_2fa_enabled` (define disable semantics — owner Q).
4. **Admin UI:** build the global-admin settings page (checkbox grid) consuming `/api/platform/settings` (backing API
   exists). 
5. **Mini-app removal:** strip the `web_app` button chokepoint (the 4 targets above), keep bot auth/notification
   messaging. Aligns `NTF-01`.
6. Tests + live TEST verification (toggle off → method gone from login UI + server rejects; mini-app buttons gone).

## Owner decisions
- ✅ **RESOLVED 2026-07-24** — Method ON but unconfigured → **hidden from client + admin-side warning** next to the
  toggle. visible-to-client = `enabled AND configured`.
- ✅ **RESOLVED 2026-07-24** — **Apple NOT included** (no toggle).
- ✅ **RESOLVED 2026-07-24** — 2FA/TOTP toggle applies to **global admin AND specialists (staff)**.
- ✅ **RESOLVED 2026-07-24** — Toggle scope: **GLOBAL / platform-wide**, configured by the **global admin only**;
  specialists do NOT access these settings. (Not per-clinic.)

**All owner decisions on this feature are now resolved.** Ready to plan/build when prioritized (build gaps:
OAuth per-provider toggles, 2FA global gate for admin+staff, admin checkbox UI, per-method configured-check for
client visibility, mini-app removal).
