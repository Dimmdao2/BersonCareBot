import { operatorIncidents, operatorJobStatus } from '@bersoncare/operator-db-schema';
import {
  bookingCalendarMap,
  deliveryAttemptLogs,
  mailingLogs,
  mailingTopics,
  userSubscriptions,
} from './schema/integratorPublicProduct.js';
import { projectionOutbox, rubitimeCreateRetryJobs } from './schema/integratorQueues.js';

export const integratorDrizzleSchema = {
  operatorIncidents,
  operatorJobStatus,
  mailingTopics,
  userSubscriptions,
  bookingCalendarMap,
  mailingLogs,
  deliveryAttemptLogs,
  projectionOutbox,
  rubitimeCreateRetryJobs,
} as const;
