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
  // See: docs/archive/2026-05-initiatives/TREATMENT_PROGRAM_INITIATIVE/LEGACY_CLEANUP_BACKLOG.md
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
      "src/modules/auth/oauthWebSession.ts",
      "src/modules/auth/yandexOAuthCallbackHandler.ts",
      "src/modules/auth/service.ts",
      "src/modules/content-catalog/service.ts",
      "src/modules/doctor-clients/clientArchiveChange.ts",
      "src/modules/emergency/service.ts",
      "src/modules/integrator/events.ts",
      "src/modules/lessons/service.ts",
      "src/modules/menu/service.ts",
      "src/modules/messaging/doctorSupportMessagingService.ts",
      "src/modules/messaging/integratorSupportBridge.ts",
      "src/modules/messaging/integratorSupportBridge.test.ts",
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

  // ─── Patient / doctor UI isolation (PATIENT_DOCTOR_UI_SPLIT_INITIATIVE) ───
  {
    files: [
      "src/app/app/patient/**/*.tsx",
      "src/app/app/patient/**/*.ts",
      "src/app/app/AppEntryRsc.tsx",
      "src/app/app/AppEntryLoginContent.tsx",
      "src/app/app/contact-support/**/*.tsx",
      "src/app/app/contact-support/**/*.ts",
      "src/app/app/auth/**/*.tsx",
      "src/app/app/auth/**/*.ts",
      "src/app/book/**/*.tsx",
      "src/app/book/**/*.ts",
      "src/modules/reminders/**/*.tsx",
      "src/modules/reminders/**/*.ts",
      "src/modules/patient-diary/**/*.tsx",
      "src/modules/patient-diary/**/*.ts",
      "src/modules/diaries/components/PatientWarmupWeekImpactBanner.tsx",
      "src/modules/diaries/components/DiaryStatsPeriodBar.tsx",
      "src/modules/diaries/components/SymptomChart.tsx",
      "src/modules/diaries/components/LfkStatsTable.tsx",
      "src/modules/messaging/components/ChatView.tsx",
    ],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["@/shared/ui/doctor/**"],
            message: "Patient zone must not import doctor shared UI. Use @/shared/ui/patient/** instead.",
          },
          {
            group: ["@/components/ui/**"],
            message: "Patient zone must use @/shared/ui/patient/primitives/** instead of @/components/ui/**.",
          },
        ],
      }],
    },
  },

  {
    files: [
      "src/app/app/doctor/**/*.tsx",
      "src/app/app/doctor/**/*.ts",
      "src/app/app/settings/**/*.tsx",
      "src/app/app/settings/**/*.ts",
      "src/modules/messaging/components/DoctorChatPanel.tsx",
    ],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["@/shared/ui/patient/**"],
            message: "Doctor zone must not import patient shared UI. Use @/shared/ui/doctor/** instead.",
          },
          {
            group: ["@/components/ui/**"],
            message: "Doctor zone must use @/shared/ui/doctor/primitives/** instead of @/components/ui/**.",
          },
        ],
      }],
    },
  },

  {
    files: ["src/shared/ui/patient/**/*.tsx", "src/shared/ui/patient/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["@/shared/ui/doctor/**"],
            message: "Patient shared UI must not import doctor shared UI.",
          },
          {
            group: ["@/components/ui/**"],
            message: "Patient shared UI must use @/shared/ui/patient/primitives/**.",
          },
        ],
      }],
    },
  },

  {
    files: ["src/shared/ui/doctor/**/*.tsx", "src/shared/ui/doctor/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["@/shared/ui/patient/**"],
            message: "Doctor shared UI must not import patient shared UI.",
          },
          {
            group: ["@/components/ui/**"],
            message: "Doctor shared UI must use @/shared/ui/doctor/primitives/**.",
          },
        ],
      }],
    },
  },
];
