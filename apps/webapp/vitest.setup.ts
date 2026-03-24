// Load .env (или .env.dev, если .env нет). Use dev DB only when USE_REAL_DATABASE=1.
import "@testing-library/jest-dom/vitest";
import path from "node:path";
import { config } from "dotenv";
config();
if (!process.env.DATABASE_URL) {
  config({ path: path.resolve(process.cwd(), ".env.dev") });
}
if (process.env.USE_REAL_DATABASE !== "1") {
  process.env.DATABASE_URL = "";
}
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "";
process.env.SESSION_COOKIE_SECRET = process.env.SESSION_COOKIE_SECRET ?? "test-session-secret-min-16-chars";
process.env.INTEGRATOR_SHARED_SECRET = process.env.INTEGRATOR_SHARED_SECRET ?? "test-integrator-secret-min-16";
process.env.ALLOW_DEV_AUTH_BYPASS = "true";
