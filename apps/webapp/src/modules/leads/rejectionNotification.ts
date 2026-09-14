import { notificationText, notificationTextFactory } from '@/shared/notifications/notificationText';

export function leadRejectionNotification(comment: string | null): {
  text: string;
  subject: string;
} {
  return {
    text: comment
      ? notificationTextFactory.leadRejectedWithComment(comment)
      : notificationText.leadRejectedWithoutComment,
    subject: notificationText.leadRejectedSubject,
  };
}
