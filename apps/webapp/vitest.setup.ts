// Load .env (или .env.dev, если .env нет). Use dev DB only when USE_REAL_DATABASE=1.
import "@testing-library/jest-dom/vitest";

/** Base UI `Switch` (and similar) dereference `PointerEvent` in handlers; jsdom has `MouseEvent` but not `PointerEvent`. Skip in pure Node test environments. */
if (
  typeof globalThis.PointerEvent === "undefined" &&
  typeof globalThis.MouseEvent !== "undefined"
) {
  globalThis.PointerEvent = class extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    constructor(type: string, init?: PointerEventInit) {
      super(type, init);
      this.pointerId = init?.pointerId ?? 1;
      this.pointerType = init?.pointerType ?? "mouse";
    }
  } as unknown as typeof PointerEvent;
}
import path from "node:path";
import { config } from "dotenv";
config({ quiet: true });
if (!process.env.DATABASE_URL) {
  config({ path: path.resolve(process.cwd(), ".env.dev"), quiet: true });
}
if (process.env.USE_REAL_DATABASE !== "1") {
  process.env.DATABASE_URL = "";
}
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "";
process.env.SESSION_COOKIE_SECRET = process.env.SESSION_COOKIE_SECRET ?? "test-session-secret-min-16-chars";
process.env.INTEGRATOR_SHARED_SECRET = process.env.INTEGRATOR_SHARED_SECRET ?? "test-integrator-secret-min-16";
process.env.ALLOW_DEV_AUTH_BYPASS = "true";
