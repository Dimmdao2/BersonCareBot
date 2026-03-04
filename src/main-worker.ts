import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';

if (process.env.NODE_ENV === 'production') {
  dotenv.config({ path: '/opt/tgcarebot/.env' });
} else {
  dotenv.config();
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function startWorker() {
  const { buildDeps } = await import('./app/di.js');
  const { runWorkerTask } = await import('./infra/runtime/worker.js');
  const { logger } = await import('./infra/observability/logger.js');

  const deps = buildDeps();
  logger.info('Worker started');

  while (true) {
    try {
      await runWorkerTask(deps.eventGateway, {
        id: randomUUID(),
        kind: 'schedule.tick',
        payload: {},
      });
    } catch (err) {
      logger.error({ err }, 'Worker tick failed');
    }
    await sleep(5000);
  }
}

startWorker().catch((err) => {
  console.error(err);
  process.exit(1);
});
