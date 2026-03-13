process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://localhost:5432/bcb_webapp_test";
process.env.SESSION_COOKIE_SECRET = process.env.SESSION_COOKIE_SECRET ?? "test-session-secret-min-16-chars";
process.env.INTEGRATOR_SHARED_SECRET = process.env.INTEGRATOR_SHARED_SECRET ?? "test-integrator-secret-min-16";
process.env.ALLOW_DEV_AUTH_BYPASS = "true";
