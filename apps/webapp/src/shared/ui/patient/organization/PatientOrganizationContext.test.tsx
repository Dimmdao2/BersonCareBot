/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const searchParamsMock = vi.hoisted(() => vi.fn(() => new URLSearchParams()));

vi.mock("next/navigation", () => ({
  useSearchParams: searchParamsMock,
}));

import {
  PatientOrganizationContextBar,
  PatientOrganizationContextProvider,
  usePatientOrganizationContext,
} from "./PatientOrganizationContext";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const organizations = [
  { organizationId: ORG_A, title: "Клиника А" },
  { organizationId: ORG_B, title: "Клиника Б" },
];

function SwitchProbe() {
  const context = usePatientOrganizationContext();
  return (
    <button
      type="button"
      onClick={() => {
        void context?.switchOrganization(ORG_B);
        void context?.switchOrganization(ORG_B);
      }}
    >
      switch
    </button>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  searchParamsMock.mockReturnValue(new URLSearchParams());
});

describe("PatientOrganizationContextProvider", () => {
  it("remembers a server-selected sole organization through the verified POST API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PatientOrganizationContextProvider
        organization={organizations[0]}
        organizations={[organizations[0]]}
        rememberOrganizationOnMount
      >
        <div>content</div>
      </PatientOrganizationContextProvider>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/patient/organization-context",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ organizationId: ORG_A }),
      }),
    );
  });

  it("hides stale organization content and replaces an object URL with the safe patient destination", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const navigate = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PatientOrganizationContextProvider
        organization={organizations[0]}
        organizations={organizations}
        navigate={navigate}
      >
        <div>organization A object</div>
        <SwitchProbe />
      </PatientOrganizationContextProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "switch" }));
    expect(screen.queryByText("organization A object")).toBeNull();
    expect(screen.getByText("Переключаем организацию…")).toBeTruthy();
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/app/patient?organizationChanged=1");
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("recovers to the chooser when the target becomes unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    const navigate = vi.fn();
    render(
      <PatientOrganizationContextProvider
        organization={organizations[0]}
        organizations={organizations}
        navigate={navigate}
      >
        <SwitchProbe />
      </PatientOrganizationContextProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "switch" }));
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/app/patient/organizations?unavailable=1");
    });
  });

  it("shows a visible exact-context notice with a safe chooser link", () => {
    searchParamsMock.mockReturnValue(new URLSearchParams("organizationChanged=1"));
    render(
      <PatientOrganizationContextProvider organization={organizations[1]} organizations={[organizations[1]]}>
        <PatientOrganizationContextBar />
      </PatientOrganizationContextProvider>,
    );
    expect(screen.getByRole("status").textContent).toContain("Клиника Б");
    expect(screen.getByRole("link", { name: "Выбрать другую" }).getAttribute("href")).toBe(
      "/app/patient/organizations",
    );
  });
});
