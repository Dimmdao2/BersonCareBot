import { describe, it, expect, vi } from "vitest";
import { createPatientComorbiditiesService } from "./service";
import type { PatientComorbiditiesPort } from "./ports";

const PATIENT = "11111111-1111-1111-1111-111111111111";
const DOCTOR = "22222222-2222-2222-2222-222222222222";

const MOCK_COMORBIDITY = {
  id: "co1",
  text: "Диабет 2 типа",
  since: "с 2017",
  status: "active" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  removedAt: null,
};

/** Port stub with all methods mocked; override per test as needed. */
function makePort(overrides: Partial<PatientComorbiditiesPort> = {}): PatientComorbiditiesPort {
  return {
    listByPatient: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue(MOCK_COMORBIDITY),
    editText: vi.fn().mockResolvedValue(true),
    markRemoved: vi.fn().mockResolvedValue(true),
    restore: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe("patient-comorbidities service", () => {
  describe("listActive / listRemoved", () => {
    it("listActive delegates with status=active", async () => {
      const port = makePort();
      const svc = createPatientComorbiditiesService({ patientComorbiditiesPort: port });
      await svc.listActive(PATIENT);
      expect(port.listByPatient).toHaveBeenCalledWith(PATIENT, "active");
    });

    it("listRemoved delegates with status=removed", async () => {
      const port = makePort();
      const svc = createPatientComorbiditiesService({ patientComorbiditiesPort: port });
      await svc.listRemoved(PATIENT);
      expect(port.listByPatient).toHaveBeenCalledWith(PATIENT, "removed");
    });
  });

  describe("add", () => {
    it("trims text and passes to port", async () => {
      const port = makePort();
      const svc = createPatientComorbiditiesService({ patientComorbiditiesPort: port });
      await svc.add({
        patientUserId: PATIENT,
        text: "  Диабет 2 типа  ",
        since: "  с 2017  ",
        createdBy: DOCTOR,
      });
      expect(port.add).toHaveBeenCalledWith(
        expect.objectContaining({ text: "Диабет 2 типа", since: "с 2017" }),
      );
    });

    it("rejects blank text", async () => {
      const port = makePort();
      const svc = createPatientComorbiditiesService({ patientComorbiditiesPort: port });
      await expect(
        svc.add({ patientUserId: PATIENT, text: "   ", createdBy: DOCTOR }),
      ).rejects.toThrow(/comorbidity_text_required/);
      expect(port.add).not.toHaveBeenCalled();
    });

    it("normalizes blank since to null", async () => {
      const port = makePort();
      const svc = createPatientComorbiditiesService({ patientComorbiditiesPort: port });
      await svc.add({
        patientUserId: PATIENT,
        text: "Диабет",
        since: "   ",
        createdBy: DOCTOR,
      });
      expect(port.add).toHaveBeenCalledWith(
        expect.objectContaining({ since: null }),
      );
    });

    it("passes null since when not provided", async () => {
      const port = makePort();
      const svc = createPatientComorbiditiesService({ patientComorbiditiesPort: port });
      await svc.add({ patientUserId: PATIENT, text: "Диабет", createdBy: DOCTOR });
      expect(port.add).toHaveBeenCalledWith(
        expect.objectContaining({ since: null }),
      );
    });
  });

  describe("editText", () => {
    it("trims text and forwards to port", async () => {
      const port = makePort();
      const svc = createPatientComorbiditiesService({ patientComorbiditiesPort: port });
      await svc.editText({
        patientUserId: PATIENT,
        comorbidityId: "co1",
        text: "  Диабет 2 типа  ",
      });
      expect(port.editText).toHaveBeenCalledWith(
        expect.objectContaining({ text: "Диабет 2 типа" }),
      );
    });

    it("rejects blank text", async () => {
      const port = makePort();
      const svc = createPatientComorbiditiesService({ patientComorbiditiesPort: port });
      await expect(
        svc.editText({ patientUserId: PATIENT, comorbidityId: "co1", text: "   " }),
      ).rejects.toThrow(/comorbidity_text_required/);
      expect(port.editText).not.toHaveBeenCalled();
    });

    it("rejects when neither text nor since is provided", async () => {
      const port = makePort();
      const svc = createPatientComorbiditiesService({ patientComorbiditiesPort: port });
      await expect(
        svc.editText({ patientUserId: PATIENT, comorbidityId: "co1" }),
      ).rejects.toThrow(/nothing_to_update/);
      expect(port.editText).not.toHaveBeenCalled();
    });

    it("allows updating only since (no text provided)", async () => {
      const port = makePort();
      const svc = createPatientComorbiditiesService({ patientComorbiditiesPort: port });
      await svc.editText({ patientUserId: PATIENT, comorbidityId: "co1", since: "с 2020" });
      const arg = (port.editText as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(arg.since).toBe("с 2020");
      expect("text" in arg).toBe(false);
    });

    it("normalizes blank since to null", async () => {
      const port = makePort();
      const svc = createPatientComorbiditiesService({ patientComorbiditiesPort: port });
      await svc.editText({ patientUserId: PATIENT, comorbidityId: "co1", since: "   " });
      const arg = (port.editText as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(arg.since).toBeNull();
    });

    it("propagates port false (not found)", async () => {
      const port = makePort({ editText: vi.fn().mockResolvedValue(false) });
      const svc = createPatientComorbiditiesService({ patientComorbiditiesPort: port });
      const ok = await svc.editText({ patientUserId: PATIENT, comorbidityId: "missing", text: "X" });
      expect(ok).toBe(false);
    });
  });

  describe("markRemoved", () => {
    it("delegates to port and returns result", async () => {
      const port = makePort();
      const svc = createPatientComorbiditiesService({ patientComorbiditiesPort: port });
      const ok = await svc.markRemoved(PATIENT, "co1");
      expect(ok).toBe(true);
      expect(port.markRemoved).toHaveBeenCalledWith(PATIENT, "co1");
    });

    it("propagates port false (not found)", async () => {
      const port = makePort({ markRemoved: vi.fn().mockResolvedValue(false) });
      const svc = createPatientComorbiditiesService({ patientComorbiditiesPort: port });
      const ok = await svc.markRemoved(PATIENT, "missing");
      expect(ok).toBe(false);
    });
  });

  describe("restore", () => {
    it("delegates to port and returns result", async () => {
      const port = makePort();
      const svc = createPatientComorbiditiesService({ patientComorbiditiesPort: port });
      const ok = await svc.restore(PATIENT, "co1");
      expect(ok).toBe(true);
      expect(port.restore).toHaveBeenCalledWith(PATIENT, "co1");
    });

    it("propagates port false (not found / already active)", async () => {
      const port = makePort({ restore: vi.fn().mockResolvedValue(false) });
      const svc = createPatientComorbiditiesService({ patientComorbiditiesPort: port });
      const ok = await svc.restore(PATIENT, "already-active");
      expect(ok).toBe(false);
    });
  });
});
