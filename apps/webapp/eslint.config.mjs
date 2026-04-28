import nextConfig from "eslint-config-next/core-web-vitals";

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "next-env.d.ts",
      "*.config.js",
      "*.config.mjs",
      "*.config.ts",
    ],
  },
  ...(Array.isArray(nextConfig) ? nextConfig : [nextConfig]),

  // ─── Clean architecture: modules must not reach into infra directly ───
  // Legacy violations are allowlisted below; new code MUST go through ports/DI.
  // See: docs/TREATMENT_PROGRAM_INITIATIVE/LEGACY_CLEANUP_BACKLOG.md
  {
    files: ["src/modules/**/*.ts", "src/modules/**/*.tsx"],
    ignores: ["src/modules/**/*.test.ts", "src/modules/**/*.test.tsx"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["@/infra/db/*", "@/infra/db/client"],
            message: "modules must not import infra/db directly. Use a port injected via DI.",
          },
          {
            group: ["@/infra/repos/*"],
            message: "modules must not import infra/repos directly. Define port in modules/*/ports.ts, implement in infra/repos, inject via buildAppDeps.",
          },
        ],
      }],
    },
  },

  // ─── API routes: same infra boundaries as modules (MASTER_PLAN phase 0) ───
  {
    files: ["src/app/api/**/route.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["@/infra/db/*", "@/infra/db/client"],
            message: "Route handlers must not import infra/db directly. Use @/app-layer/db/client, buildAppDeps(), or another app-layer facade.",
          },
          {
            group: ["@/infra/repos/*"],
            message: "Route handlers must not import infra/repos directly. Use services via buildAppDeps() or app-layer facades.",
          },
        ],
      }],
    },
  },

  // ─── Allowlisted legacy files in modules/* (tracked in LEGACY_CLEANUP_BACKLOG.md) ───
  {
    files: [
      "src/modules/auth/channelLink.ts",
      "src/modules/auth/channelLinkStartRateLimit.ts",
      "src/modules/auth/checkPhoneRateLimit.ts",
      "src/modules/auth/emailAuth.ts",
      "src/modules/auth/messengerStartRateLimit.ts",
      "src/modules/auth/oauthStartRateLimit.ts",
      "src/modules/auth/oauthWebLoginResolve.ts",
      "src/modules/auth/oauthWebSession.ts",
      "src/modules/auth/oauthYandexResolve.ts",
      "src/modules/auth/phoneOtpLimits.ts",
      "src/modules/auth/yandexOAuthCallbackHandler.ts",
      "src/modules/auth/service.ts",
      "src/modules/content-catalog/service.ts",
      "src/modules/doctor-clients/clientArchiveChange.ts",
      "src/modules/emergency/service.ts",
      "src/modules/integrator/events.ts",
      "src/modules/lessons/service.ts",
      "src/modules/menu/service.ts",
      "src/modules/messaging/doctorSupportMessagingService.ts",
      "src/modules/messaging/patientMessagingService.ts",
      "src/modules/messaging/serializeSupportMessage.ts",
      "src/modules/platform-access/patientClientBusinessGate.ts",
      "src/modules/platform-access/resolvePatientCanViewAuthOnlyContent.ts",
      "src/modules/platform-access/resolvePlatformAccessContext.ts",
      "src/modules/reminders/notifyIntegrator.ts",
      "src/modules/system-settings/configAdapter.ts",
      "src/modules/system-settings/syncToIntegrator.ts",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
];
