import { operatorIncidents, operatorJobStatus } from '@bersoncare/operator-db-schema';
import { bookingCalendarMap, deliveryAttemptLogs } from './schema/integratorPublicProduct.js';
import {
  appointmentRecords,
  contentAccessGrants,
  userReminderDeliveryLogs,
  userReminderOccurrences,
  userReminderRules,
} from './schema/integratorDomainRepos.js';
import { messageRetryJobs, projectionOutbox } from './schema/integratorQueues.js';

export const integratorDrizzleSchema = {
  operatorIncidents,
  operatorJobStatus,
  bookingCalendarMap,
  deliveryAttemptLogs,
  projectionOutbox,
  messageRetryJobs,
  userReminderRules,
  userReminderOccurrences,
  userReminderDeliveryLogs,
  contentAccessGrants,
  appointmentRecords,
} as const;
