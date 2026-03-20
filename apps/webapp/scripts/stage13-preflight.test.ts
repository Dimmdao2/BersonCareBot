/**
 * Tests for scripts/stage13-preflight.mjs: env required, exit codes.
 */
import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..", "..");
const preflightPath = path.join(rootDir, "scripts", "stage13-preflight.mjs");

function runPreflight(env: Record<string, string> = {}): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("node", [preflightPath], {
      env: { ...process.env, ...env } as NodeJS.ProcessEnv,
      cwd: rootDir,
    });
    let stderr = "";
    child.stderr?.on("data", (d) => { stderr += d; });
    child.on("close", (code) => resolve({ code: code ?? -1, stderr }));
  });
}

describe("stage13-preflight.mjs", () => {
  it("exits 1 when DATABASE_URL is not set", async () => {
    const { code, stderr } = await runPreflight({
      DATABASE_URL: "",
      INTEGRATOR_DATABASE_URL: "postgres://x/x",
      SOURCE_DATABASE_URL: "",
    });
    expect(code).toBe(1);
    expect(stderr).toMatch(/DATABASE_URL.*not set/);
  });

  it("exits 1 when INTEGRATOR_DATABASE_URL and SOURCE_DATABASE_URL are not set", async () => {
    const { code, stderr } = await runPreflight({
      DATABASE_URL: "postgres://x/x",
      INTEGRATOR_DATABASE_URL: "",
      SOURCE_DATABASE_URL: "",
    });
    expect(code).toBe(1);
    expect(stderr).toMatch(/INTEGRATOR_DATABASE_URL|SOURCE_DATABASE_URL|not set/);
  });
});
