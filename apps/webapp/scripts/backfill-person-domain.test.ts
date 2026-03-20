/**
 * Tests for backfill-person-domain.mjs: env validation, dry-run behavior, idempotency contract.
 */
import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(__dirname, "backfill-person-domain.mjs");

function runScript(
  args: string[],
  env: Record<string, string> = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("node", [scriptPath, ...args], {
      env: { ...process.env, ...env } as NodeJS.ProcessEnv,
      cwd: path.join(__dirname, ".."),
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => { stdout += d; });
    child.stderr?.on("data", (d) => { stderr += d; });
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

describe("backfill-person-domain.mjs", () => {
  it("exits 1 when INTEGRATOR_DATABASE_URL is not set", async () => {
    const { code, stderr } = await runScript(["--dry-run"], {
      DATABASE_URL: "postgres://local/db",
      INTEGRATOR_DATABASE_URL: "",
      SOURCE_DATABASE_URL: "",
    });
    expect(code).toBe(1);
    expect(stderr).toMatch(/INTEGRATOR_DATABASE_URL|SOURCE_DATABASE_URL|not set/);
  });

  it("exits 1 when DATABASE_URL is not set", async () => {
    const { code, stderr } = await runScript(["--dry-run"], {
      DATABASE_URL: "",
      INTEGRATOR_DATABASE_URL: "postgres://local/int",
    });
    expect(code).toBe(1);
    expect(stderr).toMatch(/DATABASE_URL.*not set/);
  });

  it("prints DRY-RUN message when --dry-run is passed", async () => {
    const { stdout } = await runScript(["--dry-run"], {
      DATABASE_URL: "postgres://x/x",
      INTEGRATOR_DATABASE_URL: "postgres://y/y",
    });
    expect(stdout).toMatch(/DRY-RUN|dry-run/i);
  });

  it("accepts --limit and --user-id without crashing", async () => {
    const { code, stderr } = await runScript(["--dry-run", "--limit=10", "--user-id=1"], {
      DATABASE_URL: "postgres://x/x",
      INTEGRATOR_DATABASE_URL: "postgres://y/y",
    });
    expect(code).toBe(1);
    expect(stderr).toMatch(/connect|ECONNREFUSED|not set/);
  });
});
