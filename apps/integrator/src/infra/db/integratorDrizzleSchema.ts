import { operatorIncidents, operatorJobStatus } from '@bersoncare/operator-db-schema';
import {
  bookingCalendarMap,
  orgEnrollments,
  platformUsers,
  reminderRules,
  userChannelBindings,
} from './schema/integratorPublicProduct.js';
import {
  contentAccessGrants,
  userReminderOccurrences,
} from './schema/integratorDomainRepos.js';

export const integratorDrizzleSchema = {
  operatorIncidents,
  operatorJobStatus,
  bookingCalendarMap,
  orgEnrollments,
  platformUsers,
  userChannelBindings,
  reminderRules,
  userReminderOccurrences,
  contentAccessGrants,
} as const;
