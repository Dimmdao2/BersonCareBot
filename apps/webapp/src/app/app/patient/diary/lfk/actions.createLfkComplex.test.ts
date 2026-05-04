import { beforeEach, describe, expect, it, vi } from "vitest";

const createLfkComplexDiaryMock = vi.fn();

vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientAccessWithPhone: vi.fn().mockResolvedValue({
    user: { userId: "patient-diary-test", role: "client", displayName: "T", bindings: {} },
    issuedAt: 0,
    expiresAt: 9_999_999_999,
  }),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    diaries: {
      createLfkComplex: createLfkComplexDiaryMock,
    },
  }),
}));

import { requirePatientAccessWithPhone } from "@/app-layer/guards/requireRole";
import { createLfkComplex } from "./actions";

describe("createLfkComplex server action", () => {
  beforeEach(() => {
    createLfkComplexDiaryMock.mockReset();
  });

  it("does not call diaries.createLfkComplex (patient path disabled)", async () => {
    const fd = new FormData();
    fd.set("complexTitle", "My complex");
    await createLfkComplex(fd);
    expect(createLfkComplexDiaryMock).not.toHaveBeenCalled();
    expect(vi.mocked(requirePatientAccessWithPhone)).toHaveBeenCalled();
  });
});
