import { describe, expect, it } from "vitest";
import {
  checkInsecureSecretsForStartup,
  env,
  integratorWebappEntrySecret,
  integratorWebhookSecret,
  type EnvParsed,
} from "./env";

describe("env (test mode)", () => {
  it("provides non-empty session and integrator secrets in test", () => {
    expect(env.SESSION_COOKIE_SECRET).toBeDefined();
    expect(env.SESSION_COOKIE_SECRET.length).toBeGreaterThanOrEqual(16);
    expect(integratorWebappEntrySecret()).toBeDefined();
    expect(integratorWebappEntrySecret().length).toBeGreaterThan(0);
    expect(integratorWebhookSecret()).toBeDefined();
    expect(integratorWebhookSecret().length).toBeGreaterThan(0);
  });
});

describe("checkInsecureSecretsForStartup", () => {
  const base: EnvParsed = {
    NODE_ENV: "development",
    HOST: "127.0.0.1",
    PORT: 5200,
    APP_BASE_URL: "http://127.0.0.1:5200",
    DATABASE_URL: "",
    SESSION_COOKIE_SECRET: "some-safe-session-secret-min-16",
    INTEGRATOR_SHARED_SECRET: "some-safe-integrator-secret-16",
    INTEGRATOR_API_URL: "",
    INTEGRATOR_WEBAPP_ENTRY_SECRET: "",
    INTEGRATOR_WEBHOOK_SECRET: "",
    ALLOW_DEV_AUTH_BYPASS: false,
    ALLOWED_TELEGRAM_IDS: "",
    ALLOWED_MAX_IDS: "",
    ADMIN_TELEGRAM_ID: undefined,
    DOCTOR_TELEGRAM_IDS: "",
    ADMIN_MAX_IDS: "",
    DOCTOR_MAX_IDS: "",
    ADMIN_PHONES: "",
    DOCTOR_PHONES: "",
    ALLOWED_PHONES: "",
    TELEGRAM_BOT_TOKEN: undefined,
    MEDIA_TEST_VIDEO_URL: "",
    MEDIA_STORAGE_DIR: "",
    S3_ENDPOINT: "",
    S3_ACCESS_KEY: "",
    S3_SECRET_KEY: "",
    S3_PUBLIC_BUCKET: "",
    S3_PRIVATE_BUCKET: "",
    S3_REGION: "us-east-1",
    S3_FORCE_PATH_STYLE: false,
    TELEGRAM_BOT_USERNAME: "bersoncare_bot",
    MAX_LOGIN_BOT_NICKNAME: "",
    INTERNAL_JOB_SECRET: "",
    LOG_LEVEL: "info",
  };

  it("throws when SESSION_COOKIE_SECRET is blacklisted and isTest is false", () => {
    const parsed: EnvParsed = {
      ...base,
      SESSION_COOKIE_SECRET: "dev-session-secret-change-me-min-16",
    };
    expect(() => checkInsecureSecretsForStartup(parsed, false)).toThrow(
      /Refusing to start: secret matches repo-known insecure value/
    );
  });

  it("throws when INTEGRATOR_SHARED_SECRET is blacklisted and used as entry/webhook fallback and isTest is false", () => {
    // Entry/webhook not set => fallback to INTEGRATOR_SHARED_SECRET; cast needed because EnvParsed after transform is string
    const parsed = {
      ...base,
      SESSION_COOKIE_SECRET: "safe-session-secret-min-16-chars",
      INTEGRATOR_SHARED_SECRET: "dev-integrator-secret-change-me",
      INTEGRATOR_WEBAPP_ENTRY_SECRET: undefined,
      INTEGRATOR_WEBHOOK_SECRET: undefined,
    } as unknown as EnvParsed;
    expect(() => checkInsecureSecretsForStartup(parsed, false)).toThrow(
      /Refusing to start: secret matches repo-known insecure value/
    );
  });

  it("does not throw when isTest is true even with blacklisted secret", () => {
    const parsed: EnvParsed = {
      ...base,
      SESSION_COOKIE_SECRET: "dev-session-secret-change-me-min-16",
    };
    expect(() => checkInsecureSecretsForStartup(parsed, true)).not.toThrow();
  });

  it("does not throw for safe secrets when isTest is false", () => {
    expect(() => checkInsecureSecretsForStartup(base, false)).not.toThrow();
  });
});
