/**
 * Drain webapp `integrator_push_outbox` (retries after failed signed POST to integrator).
 * Run from cron/systemd timer with DATABASE_URL (same as webapp).
 */
import { runIntegratorPushWorkerTick } from "../src/infra/integrator-push/runIntegratorPushWorkerTick";

async function main(): Promise<void> {
  const completed = await runIntegratorPushWorkerTick(25);
  console.log(`integrator_push_outbox: completed ${completed} job(s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
