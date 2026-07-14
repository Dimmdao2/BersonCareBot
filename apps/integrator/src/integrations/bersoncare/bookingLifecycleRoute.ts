import type { FastifyInstance } from 'fastify';
import {
  registerBookingLifecycleM2mRoute,
  type RubitimeRecordM2mDeps,
} from '../rubitime/recordM2mRoute.js';

export type BersoncareBookingLifecycleRouteDeps = RubitimeRecordM2mDeps;

export async function registerBersoncareBookingLifecycleRoute(
  app: FastifyInstance,
  deps: BersoncareBookingLifecycleRouteDeps,
): Promise<void> {
  await registerBookingLifecycleM2mRoute(app, deps);
}
