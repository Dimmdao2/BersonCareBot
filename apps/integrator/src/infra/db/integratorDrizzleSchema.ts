import { operatorIncidents, operatorJobStatus } from '@bersoncare/operator-db-schema';
import {
  bookingCalendarMap,
  deliveryAttemptLogs,
  mailingLogs,
  mailingTopics,
  orgEnrollments,
  userSubscriptions,
} from './schema/integratorPublicProduct.js';
import {
  contentAccessGrants,
  userReminderDeliveryLogs,
  userReminderOccurrences,
  userReminderRules,
} from './schema/integratorDomainRepos.js';
import { messageRetryJobs, projectionOutbox } from './schema/integratorQueues.js';

export const integratorDrizzleSchema = {
  operatorIncidents,
  operatorJobStatus,
  mailingTopics,
  userSubscriptions,
  bookingCalendarMap,
  mailingLogs,
  deliveryAttemptLogs,
  orgEnrollments,
  projectionOutbox,
  messageRetryJobs,
  userReminderRules,
  userReminderOccurrences,
  userReminderDeliveryLogs,
  contentAccessGrants,
} as const;
