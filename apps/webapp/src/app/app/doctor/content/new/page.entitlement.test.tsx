/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const requireEntitlementForActionMock = vi.hoisted(() => vi.fn());
const listCoursesForDoctorMock = vi.hoisted(() => vi.fn());
const listSectionsMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceContext: vi.fn(async () => ({
    organizationId: "org-a",
    membershipRole: "owner",
    session: { user: { userId: "doctor-a", role: "doctor" } },
  })),
}));
vi.mock("@/app-layer/guards/requireEntitlement", () => ({
  requireEntitlementForAction: requireEntitlementForActionMock,
}));
vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: async (_workspace: unknown, _source: string, fn: () => Promise<unknown>) => fn(),
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    contentSections: { listAll: listSectionsMock },
    courses: { listCoursesForDoctor: listCoursesForDoctorMock },
  }),
}));
vi.mock("@/infra/logging/serverRuntimeLog", () => ({ logServerRuntimeError: vi.fn() }));
vi.mock("@/shared/ui/doctor/DoctorAppShell", () => ({
  DoctorAppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../ContentForm", () => ({
  ContentForm: ({ publishedCourses }: { publishedCourses: Array<{ id: string; title: string }> }) => (
    <div data-testid="course-options">{publishedCourses.map((course) => course.title).join(",")}</div>
  ),
}));

import DoctorContentNewPage from "./page";

describe("DoctorContentNewPage course picker entitlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listSectionsMock.mockResolvedValue([
      { slug: "articles", title: "Articles", kind: "article", systemParentCode: null },
    ]);
    listCoursesForDoctorMock.mockResolvedValue([{ id: "course-a", title: "Course A" }]);
  });

  it("passes no course options and performs no course read when courses are OFF", async () => {
    requireEntitlementForActionMock
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false });
    render(await DoctorContentNewPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByTestId("course-options")).toHaveTextContent("");
    expect(listCoursesForDoctorMock).not.toHaveBeenCalled();
  });

  it("loads published course options when courses are ON", async () => {
    requireEntitlementForActionMock.mockResolvedValue({ ok: true });
    render(await DoctorContentNewPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByTestId("course-options")).toHaveTextContent("Course A");
    expect(listCoursesForDoctorMock).toHaveBeenCalledWith({ status: "published", includeArchived: false });
  });
});
