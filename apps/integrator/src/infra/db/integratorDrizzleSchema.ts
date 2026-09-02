import { operatorIncidents, operatorJobStatus } from '@bersoncare/operator-db-schema';
import {
  beOrganizations,
  bookingCalendarMap,
  orgEnrollments,
  platformUsers,
  reminderOccurrenceHistory,
  reminderRules,
  userChannelBindings,
} from './schema/integratorPublicProduct.js';
import {
  contentAccessGrants,
} from './schema/integratorDomainRepos.js';

export const integratorDrizzleSchema = {
  operatorIncidents,
  operatorJobStatus,
  beOrganizations,
  bookingCalendarMap,
  orgEnrollments,
  platformUsers,
  userChannelBindings,
  reminderRules,
  reminderOccurrenceHistory,
  contentAccessGrants,
} as const;
