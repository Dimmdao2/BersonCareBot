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

    it("creates nutrition request with valid description", async () => {
      const result = await service.submitNutrition({
        ...base,
        description: "Хочу составить рацион при непереносимости лактозы и снизить вес безопасно",
      });
      expect(result.type).toBe("nutrition");
      expect(result.status).toBe("new");
    });

    it("throws on description too short", async () => {
      await expect(service.submitNutrition({ ...base, description: "short" })).rejects.toMatchObject({
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
      const result = await svc.submitNutrition({
        userId: "user-notify-2",
        patientName: "Мария",
        patientPhone: "+79001234568",
        description: "Нужна консультация по рациону при диабете 2 типа и активном образе жизни",
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

  describe("submitLfk attachments", () => {
    const mediaId = "a0000000-0000-4000-8000-000000000001";
    const base = {
      userId: "user-att-1",
      patientName: "Пациент",
      patientPhone: "+79001230001",
      description: "Подробное описание симптомов для теста вложений ЛФК и смешанного типа",
    };

    it("persists mixed URL + file attachments with correct order (urls then files)", async () => {
      const mediaFilesById = new Map([
        [
          mediaId,
          {
            userId: "user-att-1",
            s3Key: "media/a0000000-0000-4000-8000-000000000001/scan.png",
            mimeType: "image/png",
            sizeBytes: 1024,
            originalName: "scan.png",
          },
        ],
      ]);
      const svc = createOnlineIntakeService({
        intakePort: createInMemoryOnlineIntake({ mediaFilesById }),
        notificationPort: null,
      });
      const created = await svc.submitLfk({
        ...base,
        attachmentUrls: ["https://example.com/ref1", "https://example.com/ref2"],
        attachmentFileIds: [mediaId],
      });
      const full = await svc.getRequestForDoctor(created.id);
      expect(full?.attachments).toHaveLength(3);
      expect(full?.attachments[0].attachmentType).toBe("url");
      expect(full?.attachments[0].url).toBe("https://example.com/ref1");
      expect(full?.attachments[1].attachmentType).toBe("url");
      expect(full?.attachments[2].attachmentType).toBe("file");
      expect(full?.attachments[2].s3Key).toContain("scan");
    });

    it("deduplicates repeated URLs and file ids", async () => {
      const mediaFilesById = new Map([
        [
          mediaId,
          {
            userId: "user-att-1",
            s3Key: "media/x/f.png",
            mimeType: "image/png",
            sizeBytes: 100,
            originalName: "f.png",
          },
        ],
      ]);
      const svc = createOnlineIntakeService({
        intakePort: createInMemoryOnlineIntake({ mediaFilesById }),
        notificationPort: null,
      });
      const created = await svc.submitLfk({
        ...base,
        attachmentUrls: ["https://example.com/same", "https://example.com/same"],
        attachmentFileIds: [mediaId, mediaId],
      });
      const full = await svc.getRequestForDoctor(created.id);
      expect(full?.attachments).toHaveLength(2);
    });

    it("rejects file id when media map has different owner", async () => {
      const mediaFilesById = new Map([
        [
          mediaId,
          {
            userId: "other-user",
            s3Key: "media/x/f.png",
            mimeType: "image/png",
            sizeBytes: 100,
            originalName: "f.png",
          },
        ],
      ]);
      const svc = createOnlineIntakeService({
        intakePort: createInMemoryOnlineIntake({ mediaFilesById }),
        notificationPort: null,
      });
      await expect(
        svc.submitLfk({
          ...base,
          attachmentFileIds: [mediaId],
        }),
      ).rejects.toMatchObject({ code: "ATTACHMENT_FILE_FORBIDDEN" });
    });

    it("rejects unknown file id without in-memory mock", async () => {
      const svc = createOnlineIntakeService({
        intakePort: createInMemoryOnlineIntake(),
        notificationPort: null,
      });
      await expect(
        svc.submitLfk({
          ...base,
          attachmentFileIds: [mediaId],
        }),
      ).rejects.toMatchObject({ code: "ATTACHMENT_FILE_INVALID" });
    });
  });

  describe("doctor patient identity (list/details)", () => {
    const longDesc =
      "Описание проблемы с суставами для проверки patientName и patientPhone в doctor API списке и деталях";

    it("listForDoctor and getRequestForDoctor include identity from userProfiles", async () => {
      const userProfiles = new Map([
        ["user-doc-id-1", { displayName: "Пётр Иванов", phone: "+79001234567" }],
      ]);
      const svc = createOnlineIntakeService({
        intakePort: createInMemoryOnlineIntake({ userProfiles }),
        notificationPort: null,
      });
      await svc.submitLfk({
        userId: "user-doc-id-1",
        patientName: "ignored-for-doctor-view",
        patientPhone: "+7999",
        description: longDesc,
      });
      const list = await svc.listForDoctor({});
      expect(list.items).toHaveLength(1);
      expect(list.items[0].patientName).toBe("Пётр Иванов");
      expect(list.items[0].patientPhone).toBe("+79001234567");
      const full = await svc.getRequestForDoctor(list.items[0].id);
      expect(full?.patientName).toBe("Пётр Иванов");
      expect(full?.patientPhone).toBe("+79001234567");
      expect(full?.answers.length).toBeGreaterThan(0);
    });

    it("uses empty strings when profile fields are missing", async () => {
      const svc = createOnlineIntakeService({
        intakePort: createInMemoryOnlineIntake(),
        notificationPort: null,
      });
      await svc.submitLfk({
        userId: "user-no-profile",
        patientName: "X",
        patientPhone: "+7900",
        description: longDesc,
      });
      const list = await svc.listForDoctor({});
      expect(list.items[0].patientName).toBe("");
      expect(list.items[0].patientPhone).toBe("");
    });
  });
});
