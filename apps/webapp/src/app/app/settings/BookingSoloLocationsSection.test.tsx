/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const fetchSoloOverviewMock = vi.hoisted(() => vi.fn());
const setOnlineLocationEnabledMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/app/settings/bookingSoloAdminApi", async () => {
  const actual = await vi.importActual<typeof import("@/app/app/settings/bookingSoloAdminApi")>(
    "@/app/app/settings/bookingSoloAdminApi",
  );
  return {
    ...actual,
    fetchSoloOverview: fetchSoloOverviewMock,
    setOnlineLocationEnabled: setOnlineLocationEnabledMock,
    ensureDefaultSpecialist: vi.fn(),
    apiJson: vi.fn(),
  };
});

import { BookingSoloLocationsSection } from "./BookingSoloLocationsSection";

const OVERVIEW = {
  organizationId: "org-a",
  organization: { id: "org-a", title: "Клиника A" },
  branches: [
    {
      id: "physical-a",
      title: "Москва",
      shortTitle: "Мск",
      color: "#2563eb",
      cityCode: "moscow",
      address: "Адрес",
      timezone: "Europe/Moscow",
      isActive: true,
      sortOrder: 10,
    },
    {
      id: "online-a",
      title: "Онлайн",
      shortTitle: "Онлайн",
      color: "#7c3aed",
      cityCode: "online",
      address: null,
      timezone: "Europe/Moscow",
      isActive: false,
      sortOrder: 20,
    },
  ],
  specialists: [],
  services: [],
  specialistAvailability: [],
  locationAvailability: [],
};

describe("BookingSoloLocationsSection built-in Online location", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchSoloOverviewMock.mockResolvedValue(OVERVIEW);
    setOnlineLocationEnabledMock.mockResolvedValue(undefined);
  });

  it("renders Online as an immutable dedicated toggle, not as an editable physical row", async () => {
    render(<BookingSoloLocationsSection />);

    const toggle = await screen.findByRole("switch", { name: "Онлайн" });
    expect(toggle).not.toBeChecked();
    expect(screen.getByText("Москва")).toBeInTheDocument();
    expect(screen.getAllByText("Онлайн")).toHaveLength(1);
  });

  it("enables Online through the dedicated endpoint and reloads the overview", async () => {
    const user = userEvent.setup();
    render(<BookingSoloLocationsSection />);

    await user.click(await screen.findByRole("switch", { name: "Онлайн" }));
    await waitFor(() => expect(setOnlineLocationEnabledMock).toHaveBeenCalledWith(true));
    await waitFor(() => expect(fetchSoloOverviewMock).toHaveBeenCalledTimes(2));
  });

  it("shows the stored Online color in a react-colorful picker and saves an explicit hex override", async () => {
    const user = userEvent.setup();
    render(<BookingSoloLocationsSection />);

    const trigger = await screen.findByLabelText("Цвет онлайн-локации");
    expect(trigger.tagName).toBe("BUTTON");
    await waitFor(() => expect(trigger).toBeEnabled());

    await user.click(trigger);
    const hexField = await screen.findByLabelText("HEX");
    expect(hexField).toHaveValue("#7c3aed");
    fireEvent.change(hexField, { target: { value: "abcdef" } });

    await waitFor(() => expect(setOnlineLocationEnabledMock).toHaveBeenCalledWith(false, "#abcdef"));
  });
});
