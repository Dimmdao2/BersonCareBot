import { relayOutbound } from '@/modules/messaging/relayOutbound';
import type { LeadRejectionNotifier } from '@/modules/leads/ports';
import { notificationText, notificationTextFactory } from '@/shared/notifications/notificationText';

export const notifyLeadRejected: LeadRejectionNotifier = async (input) => {
  const result = await relayOutbound({
    organizationId: input.organizationId,
    messageId: `lead-rejected:${input.leadId}`,
    channel: 'email',
    recipient: input.recipientEmail,
    userId: input.platformUserId,
    text: input.comment
      ? notificationTextFactory.leadRejectedWithComment(input.comment)
      : notificationText.leadRejectedWithoutComment,
    metadata: { subject: notificationText.leadRejectedSubject },
    senderScope: 'clinic_required',
    audience: 'patient',
  });
  return result.ok;
};
