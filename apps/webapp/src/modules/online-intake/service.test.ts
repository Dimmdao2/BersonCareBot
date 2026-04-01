import { describe, it, expect, beforeEach, vi } from "vitest";
import { createOnlineIntakeService } from "./service";
import { createInMemoryOnlineIntake } from "@/infra/repos/inMemoryOnlineIntake";
import type { IntakeNotificationPort, OnlineIntakeService } from "./ports";

describe("onlineIntakeService", () => {
  let service: OnlineIntakeService;

  beforeEach(() => {
    service = createOnlineIntakeService({
      intakePort: createInMemoryOnlineIntake(),
      notificationPort: null,
    });
  });

  describe("submitLfk", () => {
    const base = {
      userId: "user-1",
      patientName: "Иван",
      patientPhone: "+79001234567",
    };

    it("creates lfk request with valid description", async () => {
      const result = await service.submitLfk({
        ...base,
        description: "Болит колено после тренировки, ограниченная подвижность",
      });
      expect(result.type).toBe("lfk");
      expect(result.status).toBe("new");
      expect(result.id).toBeTruthy();
    });

    it("throws on description too short", async () => {
      await expect(
        service.submitLfk({ ...base, description: "short" }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("throws on rate limit exceeded", async () => {
      const desc = "Описание проблемы с коленом, необходима консультация врача ЛФК";
      for (let i = 0; i < 3; i++) {
        await service.submitLfk({ ...base, description: desc });
      }
      await expect(service.submitLfk({ ...base, description: desc })).rejects.toMatchObject({
        code: "RATE_LIMIT",
      });
    });
  });

  describe("submitNutrition", () => {
    const base = {
      userId: "user-1",
      patientName: "Мария",
      patientPhone: "+79001234568",
    };
    const validAnswers = [
      { questionId: "q1", value: "28" },
      { questionId: "q2", value: "65 / 170" },
      { questionId: "q4", value: "healthy_eating" },
      { questionId: "q5", value: "Хочу улучшить питание и самочувствие" },
    ];

    it("creates nutrition request with valid answers", async () => {
      const result = await service.submitNutrition({ ...base, answers: validAnswers });
      expect(result.type).toBe("nutrition");
      expect(result.status).toBe("new");
    });

    it("throws on missing required q4", async () => {
      const answers = validAnswers.filter((a) => a.questionId !== "q4");
      await expect(service.submitNutrition({ ...base, answers })).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
    });

    it("throws on invalid q4 value", async () => {
      const answers = validAnswers.map((a) => (a.questionId === "q4" ? { ...a, value: "invalid" } : a));
      await expect(service.submitNutrition({ ...base, answers })).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
    });
  });

  describe("changeStatus", () => {
    it("transitions new -> in_review", async () => {
      const req = await service.submitLfk({
        userId: "user-1",
        patientName: "Test",
        patientPhone: "+79001111111",
        description: "Описание проблемы для тестирования статусов заявки ЛФК",
      });
      const updated = await service.changeStatus({
        requestId: req.id,
        changedBy: "doctor-1",
        toStatus: "in_review",
      });
      expect(updated.status).toBe("in_review");
    });

    it("rejects invalid transition closed -> in_review", async () => {
      const req = await service.submitLfk({
        userId: "user-1",
        patientName: "Test",
        patientPhone: "+79001111112",
        description: "Описание проблемы для тестирования заблокированного перехода",
      });
      await service.changeStatus({ requestId: req.id, changedBy: "doctor-1", toStatus: "closed" });
      await expect(
        service.changeStatus({ requestId: req.id, changedBy: "doctor-1", toStatus: "in_review" }),
      ).rejects.toMatchObject({ code: "INVALID_STATUS_TRANSITION" });
    });

    it("throws not_found for unknown id", async () => {
      await expect(
        service.changeStatus({ requestId: "non-existent-uuid", changedBy: "doc", toStatus: "in_review" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("notification port", () => {
    it("submitLfk calls notifyNewIntakeRequest", async () => {
      const notifyNewIntakeRequest = vi.fn().mockResolvedValue(undefined);
      const notificationPort: IntakeNotificationPort = { notifyNewIntakeRequest };
      const svc = createOnlineIntakeService({
        intakePort: createInMemoryOnlineIntake(),
        notificationPort,
      });
      const result = await svc.submitLfk({
        userId: "user-notify-1",
        patientName: "Иван",
        patientPhone: "+79001234567",
        description: "Описание проблемы с коленом для проверки уведомления врача ЛФК",
      });
      expect(notifyNewIntakeRequest).toHaveBeenCalledTimes(1);
      expect(notifyNewIntakeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: result.id,
          type: "lfk",
          patientName: "Иван",
          patientPhone: "+79001234567",
        }),
      );
    });

    it("submitNutrition calls notifyNewIntakeRequest", async () => {
      const notifyNewIntakeRequest = vi.fn().mockResolvedValue(undefined);
      const notificationPort: IntakeNotificationPort = { notifyNewIntakeRequest };
      const svc = createOnlineIntakeService({
        intakePort: createInMemoryOnlineIntake(),
        notificationPort,
      });
      const validAnswers = [
        { questionId: "q1", value: "28" },
        { questionId: "q2", value: "65 / 170" },
        { questionId: "q4", value: "healthy_eating" },
        { questionId: "q5", value: "Хочу улучшить питание и самочувствие" },
      ];
      const result = await svc.submitNutrition({
        userId: "user-notify-2",
        patientName: "Мария",
        patientPhone: "+79001234568",
        answers: validAnswers,
      });
      expect(notifyNewIntakeRequest).toHaveBeenCalledTimes(1);
      expect(notifyNewIntakeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: result.id,
          type: "nutrition",
          patientName: "Мария",
        }),
      );
    });

    it("submitLfk does not throw if notifyNewIntakeRequest rejects", async () => {
      const notifyNewIntakeRequest = vi.fn().mockRejectedValue(new Error("notify failed"));
      const notificationPort: IntakeNotificationPort = { notifyNewIntakeRequest };
      const svc = createOnlineIntakeService({
        intakePort: createInMemoryOnlineIntake(),
        notificationPort,
      });
      const result = await svc.submitLfk({
        userId: "user-notify-3",
        patientName: "Пётр",
        patientPhone: "+79001234569",
        description: "Описание проблемы со спиной для теста отказа уведомления ЛФК",
      });
      expect(result.id).toBeTruthy();
      expect(notifyNewIntakeRequest).toHaveBeenCalled();
    });
  });

  describe("listMyRequests", () => {
    it("returns only own requests", async () => {
      await service.submitLfk({
        userId: "user-A",
        patientName: "A",
        patientPhone: "+7900",
        description: "Описание проблемы с суставами для пациента A обращение к ЛФК",
      });
      await service.submitLfk({
        userId: "user-B",
        patientName: "B",
        patientPhone: "+7901",
        description: "Описание проблемы с мышцами для пациента B обращение к ЛФК",
      });
      const result = await service.listMyRequests({ userId: "user-A" });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].userId).toBe("user-A");
    });
  });
});
