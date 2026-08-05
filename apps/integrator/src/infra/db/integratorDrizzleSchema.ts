import { operatorIncidents, operatorJobStatus } from '@bersoncare/operator-db-schema';
import {
  bookingCalendarMap,
  deliveryAttemptLogs,
  orgEnrollments,
  platformUsers,
  reminderRules,
} from './schema/integratorPublicProduct.js';
import {
  contentAccessGrants,
  userReminderDeliveryLogs,
  userReminderOccurrences,
} from './schema/integratorDomainRepos.js';
import { messageRetryJobs, projectionOutbox } from './schema/integratorQueues.js';

export const integratorDrizzleSchema = {
  operatorIncidents,
  operatorJobStatus,
  bookingCalendarMap,
  deliveryAttemptLogs,
  orgEnrollments,
  platformUsers,
  reminderRules,
  projectionOutbox,
  messageRetryJobs,
  userReminderOccurrences,
  userReminderDeliveryLogs,
  contentAccessGrants,
} as const;
