import type { StaffNotificationProfile } from '@/modules/doctor-notifications/staffNotificationProfile';

/**
 * Delivery profiles of the clinic administrators who must hear about a new lead.
 *
 * Лид создаёт только публичная дверь, и держит она принципал ОРГАНИЗАЦИИ. Этот класс до
 * предпочтений, привязок и подписок персонала не дотягивается и дотягиваться не должен, поэтому
 * весь набор приходит одним объявленным корнем: получатели и способ доставки сразу, одним чтением.
 */
export type ClinicLeadNotificationProfilesPort = {
  listForLeadOrganization(input: {
    organizationId: string;
    topicCode: string;
  }): Promise<StaffNotificationProfile[]>;
};
