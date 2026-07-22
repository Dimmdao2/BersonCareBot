import { createServer, type Server } from 'node:http';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeErrorTracking,
  flushErrorTracking,
  initErrorTracking,
  type ErrorTrackingProcessRole,
} from '@bersoncare/error-tracking';

import {
  captureIntegratorStartupFatal,
  captureSchedulerLoopError,
  captureSchedulerStartupFatal,
  captureUnexpectedIntegratorHttpError,
  captureWorkerLoopError,
  captureWorkerStartupFatal,
} from './errorTracking.js';

let server: Server;
let dsn: string;
let bodies: string[] = [];

beforeAll(async () => {
  server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => { body += chunk; });
    request.on('end', () => {
      bodies.push(body);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('loopback_listen_failed');
  dsn = `http://public@127.0.0.1:${address.port}/1`;
});

afterAll(async () => {
  await closeErrorTracking(1_000);
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function verifyHook(input: Readonly<{
  role: Extract<ErrorTrackingProcessRole, 'api' | 'worker' | 'scheduler'>;
  capturePoint: string;
  invoke(error: Error): void;
  beforeError?: (error: Error) => void;
}>): Promise<void> {
  const marker = ["PII", "MARKER", "123456789"].join("_");
  bodies = [];
  await closeErrorTracking(1_000);
  await initErrorTracking({
    enabled: true,
    dsn,
    service: 'integrator',
    processRole: input.role,
    buildId: 'process-hook-test',
  });
  const error = new Error(marker);
  input.beforeError?.(error);
  await flushErrorTracking(1_000);
  expect(bodies).toHaveLength(0);
  input.invoke(error);
  await flushErrorTracking(1_000);
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).not.toContain(marker);
  expect(bodies[0]).toContain(input.capturePoint);
  expect(bodies[0]).toContain(`"process_role":"${input.role}"`);
}

describe('integrator process error hooks', () => {
  it('captures zero successful/4xx requests and one sanitized 5xx', async () => {
    await verifyHook({
      role: 'api',
      capturePoint: 'integrator_http_error',
      beforeError(error) {
        captureUnexpectedIntegratorHttpError(error, 200);
        captureUnexpectedIntegratorHttpError(error, 404);
      },
      invoke(error) {
        captureUnexpectedIntegratorHttpError(error, 500);
      },
    });
  });

  it.each([
    ['api', 'integrator_startup_fatal', captureIntegratorStartupFatal],
    ['worker', 'worker_loop_error', captureWorkerLoopError],
    ['worker', 'worker_startup_fatal', captureWorkerStartupFatal],
    ['scheduler', 'scheduler_loop_error', captureSchedulerLoopError],
    ['scheduler', 'scheduler_startup_fatal', captureSchedulerStartupFatal],
  ] as const)('captures one sanitized %s/%s event', async (role, capturePoint, invoke) => {
    await verifyHook({ role, capturePoint, invoke });
  });
});
