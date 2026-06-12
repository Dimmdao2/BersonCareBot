/** @vitest-environment jsdom */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks — stub тяжёлые секции, не грузим реальный UI
// ---------------------------------------------------------------------------

// All Booking*Section and related client components — stub them
vi.mock("@/app/app/settings/BookingSoloServicesSection", () => ({
  BookingSoloServicesSection: () => <div data-testid="section-services-solo" />,
}));
vi.mock("@/app/app/settings/BookingCatalogPackagesSection", () => ({
  BookingCatalogPackagesSection: () => <div data-testid="section-packages" />,
}));
vi.mock("@/app/app/settings/BookingSoloLocationsSection", () => ({
  BookingSoloLocationsSection: () => <div data-testid="section-locations-solo" />,
}));
vi.mock("@/app/app/settings/BookingSoloAvailabilitySection", () => ({
  BookingSoloAvailabilitySection: () => <div data-testid="section-availability" />,
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
vi.mock("@/app/app/settings/BookingRubitimeMappingSection", () => ({
  BookingRubitimeMappingSection: () => <div data-testid="section-rubitime-mapping" />,
}));
vi.mock("@/app/app/settings/RubitimeSection", () => ({
  RubitimeSection: () => <div data-testid="section-rubitime" />,
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
  it("renders the sub-nav with all 6 sections", async () => {
    await renderSetupTab();
    expect(screen.getByTestId("setup-subnav")).toBeInTheDocument();
    expect(screen.getByTestId("setup-nav-services")).toBeInTheDocument();
    expect(screen.getByTestId("setup-nav-locations")).toBeInTheDocument();
    expect(screen.getByTestId("setup-nav-form")).toBeInTheDocument();
    expect(screen.getByTestId("setup-nav-payments")).toBeInTheDocument();
    expect(screen.getByTestId("setup-nav-rules")).toBeInTheDocument();
    expect(screen.getByTestId("setup-nav-integrations")).toBeInTheDocument();
  });

  it("default section is services (no deepLinkParams)", async () => {
    await renderSetupTab();
    expect(screen.getByTestId("setup-section-services")).toBeInTheDocument();
    expect(screen.getByTestId("section-services-solo")).toBeInTheDocument();
    expect(screen.getByTestId("section-packages")).toBeInTheDocument();
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

  it("switching to integrations renders rubitime components", async () => {
    await renderSetupTab();
    fireEvent.click(screen.getByTestId("setup-nav-integrations"));
    await waitFor(() => {
      expect(screen.getByTestId("setup-section-integrations")).toBeInTheDocument();
      expect(screen.getByTestId("section-rubitime-mapping")).toBeInTheDocument();
    });
  });

  it("switching back to default section (services) calls onDeepLinkChange with null", async () => {
    const { onDeepLinkChange } = await renderSetupTab({ section: "locations" });
    fireEvent.click(screen.getByTestId("setup-nav-services"));
    await waitFor(() => {
      expect(screen.getByTestId("section-services-solo")).toBeInTheDocument();
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
});
