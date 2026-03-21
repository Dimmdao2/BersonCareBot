/**
 * Spawn with wall-clock timeout (default 120s). Used by stage*-gate and preflight scripts.
 * Env: STAGE_GATE_TIMEOUT_MS (milliseconds), default 120000.
 */
import { spawn } from "node:child_process";

function parseTimeoutMs() {
  const raw = process.env.STAGE_GATE_TIMEOUT_MS;
  if (raw == null || raw === "") return 120_000;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : 120_000;
}

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ cwd: string; name: string; timeoutMs?: number; shell?: boolean }} opts
 * @returns {Promise<string | null>} null on success, step name on failure/timeout
 */
export function runWithTimeout(cmd, args, opts) {
  const { cwd, name } = opts;
  const timeoutMs = opts.timeoutMs ?? parseTimeoutMs();
  const shell = opts.shell !== false;

  return new Promise((resolve) => {
    let timedOut = false;
    const child = spawn(cmd, args, {
      cwd,
      stdio: "inherit",
      shell,
    });
    const timer = setTimeout(() => {
      timedOut = true;
      console.error(`[${name}] TIMEOUT after ${timeoutMs}ms — sending SIGTERM`);
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        console.error(`[${name}] failed: timed out after ${timeoutMs}ms`);
        resolve(name);
        return;
      }
      resolve(code !== 0 ? name : null);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      console.error(`[${name}] spawn error:`, err.message);
      resolve(name);
    });
  });
}
