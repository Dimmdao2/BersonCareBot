import type { IntegratorSupportQuestionOwnershipPort } from '@/modules/messaging/ports';

const questionIds = new Map<string, string>();
const questionMessageIds = new Map<string, string>();
const deliveryAttemptIds = new Map<string, string>();

export const inMemoryIntegratorSupportQuestionOwnershipPort: IntegratorSupportQuestionOwnershipPort =
  {
    async createQuestion(params) {
      const id = questionIds.get(params.integratorQuestionId) ?? crypto.randomUUID();
      questionIds.set(params.integratorQuestionId, id);
      return { id };
    },

    async appendQuestionMessage(params) {
      if (!questionIds.has(params.integratorQuestionId)) {
        throw new Error('support_question_not_found');
      }
      const existing = questionMessageIds.get(params.integratorQuestionMessageId);
      if (existing) return { id: existing, created: false };
      const id = crypto.randomUUID();
      questionMessageIds.set(params.integratorQuestionMessageId, id);
      return { id, created: true };
    },

    async markQuestionAnswered(params) {
      if (!questionIds.has(params.integratorQuestionId)) {
        throw new Error('support_question_not_found');
      }
    },

    async recordDeliveryAttempt(params) {
      const key = params.integratorIntentEventId;
      if (key) {
        const existing = deliveryAttemptIds.get(key);
        if (existing) return { id: existing, created: false };
      }
      const id = crypto.randomUUID();
      if (key) deliveryAttemptIds.set(key, id);
      return { id, created: true };
    },
  };
