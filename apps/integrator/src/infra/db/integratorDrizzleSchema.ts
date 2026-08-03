import { operatorIncidents, operatorJobStatus } from '@bersoncare/operator-db-schema';
import {
  bookingCalendarMap,
  deliveryAttemptLogs,
  orgEnrollments,
  reminderRules,
} from './schema/integratorPublicProduct.js';
import {
  contentAccessGrants,
  userReminderDeliveryLogs,
  userReminderOccurrences,
} from './schema/integratorDomainRepos.js';
import { messageRetryJobs, projectionOutbox } from './schema/integratorQueues.js';
import { specialistTasks } from './schema/specialistTasks.js';

export const integratorDrizzleSchema = {
  operatorIncidents,
  operatorJobStatus,
  bookingCalendarMap,
  deliveryAttemptLogs,
  orgEnrollments,
  reminderRules,
  projectionOutbox,
  messageRetryJobs,
  userReminderOccurrences,
  userReminderDeliveryLogs,
  contentAccessGrants,
  specialistTasks,
} as const;
