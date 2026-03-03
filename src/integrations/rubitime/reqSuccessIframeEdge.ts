import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { findByPhone } from '../../infra/db/repos/telegramUsers.js';
import { getRecordByRubitimeId } from '../../infra/db/repos/rubitimeRecords.js';
import { registerRubitimeReqSuccessIframeRoute } from './reqSuccessIframe.js';

/**
 * Registers Rubitime reqSuccess iframe endpoint via integrations layer wiring.
 * Flow remains unchanged, but dependency assembly is centralized here.
 */
export function registerRubitimeIframeEdgeRoute(app: FastifyInstance): void {
  registerRubitimeReqSuccessIframeRoute(app, {
    getRecordByRubitimeId,
    findTelegramUserByPhone: findByPhone,
    windowMinutes: env.RUBITIME_REQSUCCESS_WINDOW_MINUTES,
    delayMinMs: env.RUBITIME_REQSUCCESS_DELAY_MIN_MS,
    delayMaxMs: env.RUBITIME_REQSUCCESS_DELAY_MAX_MS,
    ipLimitPerMin: env.RUBITIME_REQSUCCESS_IP_LIMIT_PER_MIN,
    globalLimitPerMin: env.RUBITIME_REQSUCCESS_GLOBAL_LIMIT_PER_MIN,
  });
}
