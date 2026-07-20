/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PatientOrganizationRelationships } from "./PatientOrganizationRelationships";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PatientOrganizationRelationships", () => {
  it("renders a neutral recovery state when no active relationship remains", () => {
    render(
      <PatientOrganizationRelationships
        organizations={[]}
        currentOrganizationId={null}
        invalidRememberedOrganization
      />,
    );
    expect(screen.getByText("Нет активных организаций")).toBeTruthy();
    expect(screen.getByText(/больше недоступна/)).toBeTruthy();
  });

  it("marks the current relationship and switches another through the verified API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const navigate = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <PatientOrganizationRelationships
        organizations={[
          { organizationId: ORG_A, title: "Клиника А" },
          { organizationId: ORG_B, title: "Клиника Б" },
        ]}
        currentOrganizationId={ORG_A}
        navigate={navigate}
      />,
    );

    expect(screen.getByText("Текущая")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Открыть" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/app/patient?organizationChanged=1"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/patient/organization-context",
      expect.objectContaining({ body: JSON.stringify({ organizationId: ORG_B }) }),
    );
  });
});
