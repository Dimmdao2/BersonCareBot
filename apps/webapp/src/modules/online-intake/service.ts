import type { OnlineIntakePort, OnlineIntakeService, IntakeNotificationPort, ListIntakeQuery } from "./ports";
import type { ChangeIntakeStatusInput, CreateLfkIntakeInput, CreateNutritionIntakeInput } from "./types";
import {
  MAX_ACTIVE_INTAKE_PER_USER,
  NUTRITION_QUESTIONS,
  VALID_Q4_VALUES,
  VALID_STATUS_TRANSITIONS,
} from "./types";

function validateLfkInput(input: CreateLfkIntakeInput): void {
  if (!input.description || input.description.trim().length < 20) {
    throw Object.assign(new Error("description_too_short"), { code: "VALIDATION_ERROR" });
  }
  if (input.description.length > 5000) {
    throw Object.assign(new Error("description_too_long"), { code: "VALIDATION_ERROR" });
  }
  if (input.attachmentUrls && input.attachmentUrls.length > 5) {
    throw Object.assign(new Error("too_many_attachment_urls"), { code: "VALIDATION_ERROR" });
  }
  if (input.attachmentFileIds && input.attachmentFileIds.length > 10) {
    throw Object.assign(new Error("too_many_attachment_files"), { code: "VALIDATION_ERROR" });
  }
}

function validateNutritionInput(input: CreateNutritionIntakeInput): void {
  const answerMap = new Map(input.answers.map((a) => [a.questionId, a.value]));
  for (const q of NUTRITION_QUESTIONS) {
    if (q.required && !answerMap.has(q.id)) {
      throw Object.assign(new Error(`missing_required_answer:${q.id}`), { code: "VALIDATION_ERROR" });
    }
  }
  const q4 = answerMap.get("q4");
  if (q4 && !(VALID_Q4_VALUES as readonly string[]).includes(q4)) {
    throw Object.assign(new Error("invalid_q4_value"), { code: "VALIDATION_ERROR" });
  }
  const q5 = answerMap.get("q5");
  if (q5 !== undefined && q5.trim().length < 10) {
    throw Object.assign(new Error("q5_too_short"), { code: "VALIDATION_ERROR" });
  }
}

export function createOnlineIntakeService(deps: {
  intakePort: OnlineIntakePort;
  notificationPort: IntakeNotificationPort | null;
}): OnlineIntakeService {
  const { intakePort, notificationPort } = deps;

  async function checkRateLimit(userId: string, type: "lfk" | "nutrition"): Promise<void> {
    const count = await intakePort.countActiveByUser(userId, type);
    if (count >= MAX_ACTIVE_INTAKE_PER_USER) {
      throw Object.assign(new Error("rate_limit_exceeded"), { code: "RATE_LIMIT" });
    }
  }

  return {
    async submitLfk(input) {
      validateLfkInput(input);
      await checkRateLimit(input.userId, "lfk");
      const request = await intakePort.createLfkRequest(input);
      if (notificationPort) {
        await notificationPort
          .notifyNewIntakeRequest({
            requestId: request.id,
            type: "lfk",
            patientName: input.patientName,
            patientPhone: input.patientPhone,
            summary: request.summary ?? "",
          })
          .catch(() => {
            // notifications are best-effort
          });
      }
      return request;
    },

    async submitNutrition(input) {
      validateNutritionInput(input);
      await checkRateLimit(input.userId, "nutrition");
      const request = await intakePort.createNutritionRequest(input);
      if (notificationPort) {
        await notificationPort
          .notifyNewIntakeRequest({
            requestId: request.id,
            type: "nutrition",
            patientName: input.patientName,
            patientPhone: input.patientPhone,
            summary: request.summary ?? "",
          })
          .catch(() => {
            // notifications are best-effort
          });
      }
      return request;
    },

    async listMyRequests(query) {
      return intakePort.listRequests(query);
    },

    async getRequestForDoctor(id) {
      return intakePort.getById(id);
    },

    async listForDoctor(query) {
      return intakePort.listRequests(query);
    },

    async changeStatus(input: ChangeIntakeStatusInput) {
      const existing = await intakePort.getById(input.requestId);
      if (!existing) {
        throw Object.assign(new Error("not_found"), { code: "NOT_FOUND" });
      }
      const allowed = VALID_STATUS_TRANSITIONS[existing.status];
      if (!allowed.includes(input.toStatus)) {
        throw Object.assign(new Error("invalid_status_transition"), { code: "INVALID_STATUS_TRANSITION" });
      }
      return intakePort.changeStatus(input);
    },
  };
}
