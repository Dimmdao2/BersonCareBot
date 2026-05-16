import { randomUUID } from "node:crypto";
import type { OnlineIntakePort, ListIntakeQuery } from "@/modules/online-intake/ports";
import type {
  ChangeIntakeStatusInput,
  CreateLfkIntakeInput,
  CreateNutritionIntakeInput,
  IntakeAnswer,
  IntakeAttachment,
  IntakeRequest,
  IntakeRequestFull,
  IntakeRequestFullWithPatientIdentity,
  IntakeRequestWithPatientIdentity,
  IntakeStatus,
  IntakeStatusHistoryEntry,
  IntakeType,
} from "@/modules/online-intake/types";

export function createInMemoryOnlineIntake(deps?: {
  mediaFilesById?: Map<
    string,
    { userId: string; s3Key: string; mimeType: string; sizeBytes: number; originalName: string }
  >;
  /** Maps `platform_users.id` → profile fields for doctor list/details (tests). */
  userProfiles?: Map<string, { displayName: string; phone: string }>;
}): OnlineIntakePort {
  const requests = new Map<string, IntakeRequest>();
  const answers = new Map<string, IntakeAnswer[]>();
  const attachments = new Map<string, IntakeAttachment[]>();
  const statusHistory = new Map<string, IntakeStatusHistoryEntry[]>();

  function now(): string {
    return new Date().toISOString();
  }

  function patientIdentityForUser(userId: string): { patientName: string; patientPhone: string } {
    const p = deps?.userProfiles?.get(userId);
    return {
      patientName: p?.displayName ?? "",
      patientPhone: p?.phone ?? "",
    };
  }

  return {
    async createLfkRequest(input: CreateLfkIntakeInput): Promise<IntakeRequest> {
      const id = randomUUID();
      const ts = now();
      const summary = input.description.slice(0, 200);
      const req: IntakeRequest = {
        id,
        userId: input.userId,
        type: "lfk",
        status: "new",
        summary,
        createdAt: ts,
        updatedAt: ts,
      };
      requests.set(id, req);

      const ans: IntakeAnswer[] = [
        {
          id: randomUUID(),
          requestId: id,
          questionId: "lfk_description",
          ordinal: 1,
          value: input.description,
          createdAt: ts,
        },
      ];
      answers.set(id, ans);

      const atts: IntakeAttachment[] = [];
      for (const url of input.attachmentUrls ?? []) {
        atts.push({
          id: randomUUID(),
          requestId: id,
          attachmentType: "url",
          s3Key: null,
          url,
          mimeType: null,
          sizeBytes: null,
          originalName: null,
          createdAt: ts,
        });
      }
      for (const fileId of input.attachmentFileIds ?? []) {
        const meta = deps?.mediaFilesById?.get(fileId);
        if (!meta) {
          throw Object.assign(new Error("attachment_file_not_found"), { code: "ATTACHMENT_FILE_INVALID" });
        }
        if (meta.userId !== input.userId) {
          throw Object.assign(new Error("attachment_file_forbidden"), { code: "ATTACHMENT_FILE_FORBIDDEN" });
        }
        atts.push({
          id: randomUUID(),
          requestId: id,
          attachmentType: "file",
          s3Key: meta.s3Key,
          url: null,
          mimeType: meta.mimeType,
          sizeBytes: meta.sizeBytes,
          originalName: meta.originalName,
          createdAt: ts,
        });
      }
      attachments.set(id, atts);

      const hist: IntakeStatusHistoryEntry[] = [
        {
          id: randomUUID(),
          requestId: id,
          fromStatus: null,
          toStatus: "new",
          changedBy: null,
          note: null,
          changedAt: ts,
        },
      ];
      statusHistory.set(id, hist);

      return req;
    },

    async createNutritionRequest(input: CreateNutritionIntakeInput): Promise<IntakeRequest> {
      const id = randomUUID();
      const ts = now();
      const summary = input.description.slice(0, 200);
      const req: IntakeRequest = {
        id,
        userId: input.userId,
        type: "nutrition",
        status: "new",
        summary,
        createdAt: ts,
        updatedAt: ts,
      };
      requests.set(id, req);

      const ans: IntakeAnswer[] = [
        {
          id: randomUUID(),
          requestId: id,
          questionId: "nutrition_description",
          ordinal: 1,
          value: input.description,
          createdAt: ts,
        },
      ];
      answers.set(id, ans);
      attachments.set(id, []);

      const hist: IntakeStatusHistoryEntry[] = [
        {
          id: randomUUID(),
          requestId: id,
          fromStatus: null,
          toStatus: "new",
          changedBy: null,
          note: null,
          changedAt: ts,
        },
      ];
      statusHistory.set(id, hist);

      return req;
    },

    async getById(id: string): Promise<IntakeRequestFull | null> {
      const req = requests.get(id);
      if (!req) return null;
      return {
        ...req,
        answers: answers.get(id) ?? [],
        attachments: attachments.get(id) ?? [],
        statusHistory: statusHistory.get(id) ?? [],
      };
    },

    async getByIdForDoctor(id: string): Promise<IntakeRequestFullWithPatientIdentity | null> {
      const req = requests.get(id);
      if (!req) return null;
      const idn = patientIdentityForUser(req.userId);
      return {
        ...req,
        ...idn,
        answers: answers.get(id) ?? [],
        attachments: attachments.get(id) ?? [],
        statusHistory: statusHistory.get(id) ?? [],
      };
    },

    async listRequests(query: ListIntakeQuery): Promise<{ items: IntakeRequest[]; total: number }> {
      let items = [...requests.values()];
      if (query.userId) items = items.filter((r) => r.userId === query.userId);
      if (query.type) items = items.filter((r) => r.type === query.type);
      if (query.status) items = items.filter((r) => r.status === query.status);
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const total = items.length;
      const offset = query.offset ?? 0;
      const limit = query.limit ?? 20;
      return { items: items.slice(offset, offset + limit), total };
    },

    async listRequestsForDoctor(
      query: ListIntakeQuery,
    ): Promise<{ items: IntakeRequestWithPatientIdentity[]; total: number }> {
      let items = [...requests.values()];
      if (query.userId) items = items.filter((r) => r.userId === query.userId);
      if (query.type) items = items.filter((r) => r.type === query.type);
      if (query.status) items = items.filter((r) => r.status === query.status);
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const total = items.length;
      const offset = query.offset ?? 0;
      const limit = query.limit ?? 20;
      const slice = items.slice(offset, offset + limit);
      return {
        items: slice.map((r) => ({
          ...r,
          ...patientIdentityForUser(r.userId),
        })),
        total,
      };
    },

    async countActiveByUser(userId: string, type: IntakeType): Promise<number> {
      const active: IntakeStatus[] = ["new", "in_review", "contacted"];
      return [...requests.values()].filter(
        (r) => r.userId === userId && r.type === type && active.includes(r.status),
      ).length;
    },

    async changeStatus(input: ChangeIntakeStatusInput): Promise<IntakeRequest> {
      const req = requests.get(input.requestId);
      if (!req) throw new Error("not_found");
      const ts = now();
      const hist = statusHistory.get(input.requestId) ?? [];
      hist.push({
        id: randomUUID(),
        requestId: input.requestId,
        fromStatus: req.status,
        toStatus: input.toStatus,
        changedBy: input.changedBy,
        note: input.note ?? null,
        changedAt: ts,
      });
      statusHistory.set(input.requestId, hist);
      const updated: IntakeRequest = { ...req, status: input.toStatus, updatedAt: ts };
      requests.set(input.requestId, updated);
      return updated;
    },
  };
}
