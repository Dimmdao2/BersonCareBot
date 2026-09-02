import type {
  IntegratorSupportOwnershipPort,
  IntegratorSupportQuestionOwnershipPort,
} from '@/modules/messaging/ports';
import type { IntegratorSupportQuestionWriteBody } from '@/modules/messaging/integratorSupportHttp';
import {
  parseWebappConversationId,
  webappOrganizationConversationId,
  webappPlatformConversationId,
} from '@/modules/messaging/supportConversationIds';

export type IntegratorSupportStatusInput = {
  integratorConversationId: string;
  status: 'open' | 'closed';
  lastMessageAt?: string | null;
  closedAt?: string | null;
  closeReason?: string | null;
};

export type IntegratorSupportCanonicalWrite = {
  conversationId: string;
  organizationId: string;
};

export type IntegratorSupportQuestionCanonicalWrite = {
  questionId: string;
  questionMessageId?: string;
  organizationId: string;
};

export function createIntegratorSupportBridge(deps: {
  port: IntegratorSupportOwnershipPort;
  questionPort: IntegratorSupportQuestionOwnershipPort;
  resolvePatientOrganization: (
    platformUserId: string,
    verifiedOrganizationId?: string,
  ) => Promise<{ ok: true; organizationId: string } | { ok: false; error: string }>;
  withOrganizationPrincipal: <T>(organizationId: string, fn: () => Promise<T>) => Promise<T>;
}) {
  return {
    async setStatus(
      input: IntegratorSupportStatusInput,
    ): Promise<
      { ok: true; canonicalWrite: IntegratorSupportCanonicalWrite } | { ok: false; error: string }
    > {
      const parsedConversation = parseWebappConversationId(input.integratorConversationId);
      if (!parsedConversation) return { ok: false, error: 'not_webapp_conversation' };
      const organization = await deps.resolvePatientOrganization(
        parsedConversation.platformUserId,
        parsedConversation.scope === 'organization' ? parsedConversation.organizationId : undefined,
      );
      if (!organization.ok) return organization;
      await deps.withOrganizationPrincipal(organization.organizationId, () =>
        deps.port.setConversationStatusFromProjection({
          integratorConversationId: webappOrganizationConversationId(
            organization.organizationId,
            parsedConversation.platformUserId,
          ),
          status: input.status,
          lastMessageAt: input.lastMessageAt,
          closedAt: input.closedAt,
          closeReason: input.closeReason,
        }),
      );
      return {
        ok: true,
        canonicalWrite: {
          conversationId: webappPlatformConversationId(parsedConversation.platformUserId),
          organizationId: organization.organizationId,
        },
      };
    },

    async syncQuestionWrite(
      input: IntegratorSupportQuestionWriteBody,
    ): Promise<
      | { ok: true; canonicalWrite: IntegratorSupportQuestionCanonicalWrite }
      | { ok: false; error: string }
    > {
      const parsedConversation = parseWebappConversationId(input.integratorConversationId);
      if (!parsedConversation) return { ok: false, error: 'not_webapp_conversation' };
      if (
        parsedConversation.scope === 'organization' &&
        input.organizationId &&
        parsedConversation.organizationId !== input.organizationId
      ) {
        return { ok: false, error: 'organization_mismatch' };
      }
      const organization = await deps.resolvePatientOrganization(
        parsedConversation.platformUserId,
        parsedConversation.scope === 'organization'
          ? parsedConversation.organizationId
          : input.organizationId,
      );
      if (!organization.ok) return organization;
      if (input.organizationId && input.organizationId !== organization.organizationId) {
        return { ok: false, error: 'organization_mismatch' };
      }

      const result = await deps.withOrganizationPrincipal(organization.organizationId, async () => {
        const conversation = await deps.port.ensureWebappConversationForUser(
          parsedConversation.platformUserId,
        );
        if (input.operation === 'create') {
          await deps.questionPort.createQuestion({
            integratorQuestionId: input.integratorQuestionId,
            conversationId: conversation.id,
            organizationId: organization.organizationId,
            status: input.status,
            createdAt: input.createdAt,
          });
          return { questionMessageId: undefined };
        }
        if (input.operation === 'message') {
          await deps.questionPort.appendQuestionMessage({
            integratorQuestionMessageId: input.integratorQuestionMessageId,
            integratorQuestionId: input.integratorQuestionId,
            organizationId: organization.organizationId,
            senderRole: input.senderRole,
            text: input.text,
            createdAt: input.createdAt,
          });
          return { questionMessageId: input.integratorQuestionMessageId };
        }
        await deps.questionPort.markQuestionAnswered({
          integratorQuestionId: input.integratorQuestionId,
          organizationId: organization.organizationId,
          answeredAt: input.answeredAt,
        });
        return { questionMessageId: undefined };
      });

      return {
        ok: true,
        canonicalWrite: {
          questionId: input.integratorQuestionId,
          ...(result.questionMessageId ? { questionMessageId: result.questionMessageId } : {}),
          organizationId: organization.organizationId,
        },
      };
    },
  };
}
