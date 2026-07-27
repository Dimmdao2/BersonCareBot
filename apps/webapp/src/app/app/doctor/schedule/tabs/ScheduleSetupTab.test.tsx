/** @vitest-environment jsdom */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks — stub тяжёлые секции, не грузим реальный UI
// ---------------------------------------------------------------------------

// All Booking*Section and related client components — stub them
vi.mock("@/app/app/settings/BookingSoloLocationsSection", () => ({
  BookingSoloLocationsSection: () => <div data-testid="section-locations-solo" />,
}));
vi.mock("@/app/app/settings/BookingSoloAvailabilitySection", () => ({
  BookingSoloAvailabilitySection: () => <div data-testid="section-availability" />,
}));
vi.mock("@/app/app/settings/BookingSoloServicesSection", () => ({
  BookingSoloServicesSection: () => <div data-testid="section-services-solo" />,
}));
vi.mock("@/app/app/settings/BookingSoloSpecialistsSection", () => ({
  BookingSoloSpecialistsSection: () => <div data-testid="section-specialists-solo" />,
}));
vi.mock("@/app/app/settings/BookingSoloFormFieldsSection", () => ({
  BookingSoloFormFieldsSection: () => <div data-testid="section-form-fields" />,
}));
vi.mock("@/app/app/settings/BookingPublicWidgetSection", () => ({
  BookingPublicWidgetSection: () => <div data-testid="section-public-widget" />,
}));
vi.mock("@/app/app/settings/BookingPublicAttributionSection", () => ({
  BookingPublicAttributionSection: () => <div data-testid="section-attribution" />,
}));
vi.mock("@/app/app/settings/BookingPaymentsSection", () => ({
  BookingPaymentsSection: ({ paymentEnabled }: { paymentEnabled: boolean }) => (
    <div data-testid="section-payments" data-enabled={String(paymentEnabled)} />
  ),
}));
vi.mock("@/app/app/settings/BookingPrepaymentSection", () => ({
  BookingPrepaymentSection: () => <div data-testid="section-prepayment" />,
}));
vi.mock("@/app/app/settings/BookingEngineSection", () => ({
  BookingEngineSection: () => <div data-testid="section-booking-engine" />,
}));
vi.mock("@/app/app/doctor/admin/booking/BookingRulesPageClient", () => ({
  BookingRulesPageClient: ({ allowPastUnlinkPastPackageSessions }: { allowPastUnlinkPastPackageSessions?: boolean }) => (
    <div data-testid="section-rules" data-allow-unlink={String(allowPastUnlinkPastPackageSessions)} />
  ),
}));
vi.mock("@/modules/payments/bookingPaymentSettings", () => ({
  parseBookingPaymentSettingsValue: () => ({
    enabled: false,
    defaultProviderId: "mock",
    providers: [{ id: "mock", label: "Тестовый", enabled: true }],
  }),
}));

// ---------------------------------------------------------------------------
// Прогрев чанков в beforeAll (webapp-tests-lean)
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await import("./ScheduleSetupTab");
}, 10_000);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function renderSetupTab(deepLinkParams: Record<string, string> = {}) {
  const { ScheduleSetupTab } = await import("./ScheduleSetupTab");
  const onDeepLinkChange = vi.fn();
  render(<ScheduleSetupTab deepLinkParams={deepLinkParams} onDeepLinkChange={onDeepLinkChange} />);
  return { onDeepLinkChange };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ScheduleSetupTab", () => {
  it("renders the sub-nav with all 9 canonical sections", async () => {
    await renderSetupTab();
    expect(screen.getByTestId("setup-subnav")).toBeInTheDocument();
    expect(screen.getByTestId("setup-nav-calendar")).toBeInTheDocument();
    expect(screen.getByTestId("setup-nav-locations")).toBeInTheDocument();
    expect(screen.getByTestId("setup-nav-services")).toBeInTheDocument();
    expect(screen.getByTestId("setup-nav-specialists")).toBeInTheDocument();
    expect(screen.getByTestId("setup-nav-form")).toBeInTheDocument();
    expect(screen.getByTestId("setup-nav-payments")).toBeInTheDocument();
    expect(screen.getByTestId("setup-nav-rules")).toBeInTheDocument();
    expect(screen.getByTestId("setup-nav-notifications")).toBeInTheDocument();
    expect(screen.getByTestId("setup-nav-packages")).toBeInTheDocument();
    expect(screen.queryByTestId("setup-nav-integrations")).not.toBeInTheDocument();
  });

  it("deep-link section=services shows the canonical booking services section (create/edit/deactivate)", async () => {
    await renderSetupTab({ section: "services" });
    expect(screen.getByTestId("setup-section-services")).toBeInTheDocument();
    expect(screen.getByTestId("section-services-solo")).toBeInTheDocument();
  });

  it("deep-link section=specialists shows a distinct calendar-specialist management surface", async () => {
    await renderSetupTab({ section: "specialists" });
    expect(screen.getByTestId("setup-section-specialists")).toBeInTheDocument();
    expect(screen.getByTestId("section-specialists-solo")).toBeInTheDocument();
  });

  it("default section is calendar (no deepLinkParams)", async () => {
    // Stub fetch responses used by ScheduleCalendarDefaultsSection
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () => {
          if (String(url).includes("/api/doctor/settings")) {
            return {
              ok: true,
              settings: [
                { key: "booking_calendar_default_window", valueJson: { value: { startMinute: 540, endMinute: 1140 } } },
                { key: "booking_calendar_default_branch_id", valueJson: null },
                { key: "booking_calendar_default_service_id", valueJson: null },
              ],
            };
          }
          if (String(url).includes("/api/doctor/booking-engine/calendar")) {
            return {
              ok: true,
              filters: { branches: [], services: [] },
            };
          }
          return {};
        },
      } as unknown as Response),
    );
    vi.stubGlobal("fetch", fetchMock);

    await renderSetupTab();
    expect(screen.getByTestId("setup-section-calendar")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("setup-section-calendar")).toHaveTextContent("Календарь");
    });

    vi.unstubAllGlobals();
  });

  it("deep-link section=locations shows locations section", async () => {
    await renderSetupTab({ section: "locations" });
    expect(screen.getByTestId("setup-section-locations")).toBeInTheDocument();
    expect(screen.getByTestId("section-locations-solo")).toBeInTheDocument();
    expect(screen.getByTestId("section-availability")).toBeInTheDocument();
  });

  it("switching to form section renders form components", async () => {
    const { onDeepLinkChange } = await renderSetupTab();
    fireEvent.click(screen.getByTestId("setup-nav-form"));
    await waitFor(() => {
      expect(screen.getByTestId("setup-section-form")).toBeInTheDocument();
      expect(screen.getByTestId("section-form-fields")).toBeInTheDocument();
    });
    expect(onDeepLinkChange).toHaveBeenCalledWith("section", "form");
  });

  it("ignores the retired integrations deep link", async () => {
    await renderSetupTab({ section: "integrations" });
    expect(screen.getByTestId("setup-section-calendar")).toBeInTheDocument();
  });

  it("switching back to default section (calendar) calls onDeepLinkChange with null", async () => {
    const { onDeepLinkChange } = await renderSetupTab({ section: "locations" });
    fireEvent.click(screen.getByTestId("setup-nav-calendar"));
    await waitFor(() => {
      expect(screen.getByTestId("setup-section-calendar")).toBeInTheDocument();
    });
    expect(onDeepLinkChange).toHaveBeenCalledWith("section", null);
  });

  it("payments section mounts BookingPaymentsSectionLoader (triggers fetch)", async () => {
    // Stub global fetch for admin settings
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        settings: [
          { key: "booking_payment_enabled", valueJson: { value: true } },
          { key: "booking_payment_providers", valueJson: null },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await renderSetupTab({ section: "payments" });

    await waitFor(() => {
      expect(screen.getByTestId("section-payments")).toBeInTheDocument();
    });

    vi.unstubAllGlobals();
  });

  it("rules section mounts BookingRulesLoader (triggers fetch)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        settings: [
          {
            key: "booking_allow_doctor_unlink_past_package_sessions",
            valueJson: { value: false },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await renderSetupTab({ section: "rules" });

    await waitFor(() => {
      expect(screen.getByTestId("section-rules")).toBeInTheDocument();
    });

    vi.unstubAllGlobals();
  });

  it("notifications section mounts and loads doctor notification templates", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        templates: [
          { event: "booking_confirmed", audience: "patient", text: "Запись подтверждена", isDefault: true },
        ],
        variables: ["date", "time"],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await renderSetupTab({ section: "notifications" });

    await waitFor(() => {
      expect(screen.getByTestId("setup-section-notifications")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/doctor/notification-templates");

    vi.unstubAllGlobals();
  });
});
