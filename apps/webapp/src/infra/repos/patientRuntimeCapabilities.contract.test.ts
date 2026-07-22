import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function text(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

describe("locked patient runtime capabilities", () => {
  it("routes patient booking, plan-opened and analytics through signed current-patient capabilities", () => {
    const bookings = text("./pgPatientBookings.ts");
    const programs = text("./pgTreatmentProgramInstance.ts");
    const analytics = text("./pgProductAnalytics.ts");
    const operationFamilies = text("../db/saasIsolationOperationContext.ts");

    expect(bookings).toContain("app.read_current_patient_booking_rows('upcoming'");
    expect(bookings).toContain("app.read_current_patient_booking_rows('history'");
    expect(bookings).not.toContain("${kind}");
    expect(programs).toContain("app.touch_current_patient_plan_last_opened");
    expect(analytics).toContain("app.record_current_patient_analytics_event");
    expect(analytics).toContain("app.record_current_patient_push_open");
    expect(analytics).toContain('runWithWebappDbOperationFamily("patient_product_analytics"');
    expect(operationFamilies).toContain('"patient_product_analytics"');
  });

  it("keeps the E1 ACLs capability-only and does not grant patient aggregate-table updates", () => {
    const e1 = text("../../../../../deploy/postgres/e1-webapp-runtime-config.sql");
    const analyticsMigration = text("../../../db/drizzle-migrations/0200_current_patient_product_analytics.sql");

    expect(e1).toContain("GRANT EXECUTE ON FUNCTION app.record_current_patient_analytics_event");
    expect(e1).not.toMatch(/GRANT\s+(?:INSERT|UPDATE)[^;]*product_analytics_(?:hourly|user_hourly)[^;]*TO app_patient/is);
    expect(e1).toContain("REVOKE ALL ON TABLE public.product_analytics_events_recent, public.product_push_notifications FROM app_patient");
    expect(analyticsMigration).toContain("SECURITY DEFINER");
    expect(analyticsMigration).toContain("app.current_patient_user_id()");
    expect(analyticsMigration).toContain("app.current_org_id()");
    expect(analyticsMigration).toContain("organization_id, occurred_at");
    expect(analyticsMigration).toContain("product_analytics_hourly_org_unique");
    expect(analyticsMigration).toContain("GREATEST(public.product_analytics_user_hourly.last_seen_at");
    expect(analyticsMigration).toContain("p_event_type NOT IN ('app_open', 'page_view', 'heartbeat')");
    expect(analyticsMigration).toContain("app.record_current_patient_push_open");
    expect(analyticsMigration).toContain("push.organization_id = v_org");
    expect(analyticsMigration).toContain("push.user_id = v_patient");
  });

  it("keeps patient UI settings and calendar writes behind signed bounded capabilities", () => {
    const migration = text("../../../db/drizzle-migrations/0202_current_patient_ui_capabilities.sql");
    const overlay = text("../../../../../deploy/postgres/e1-webapp-runtime-config.sql");
    const settings = text("./pgSystemSettings.ts");
    const timezone = text("./pgPatientCalendarTimezone.ts");

    expect(migration).toContain("app.read_current_patient_ui_setting");
    expect(migration).toContain("app.set_current_patient_calendar_timezone");
    expect(migration).toContain("v_patient_user_id uuid := app.current_patient_user_id()");
    expect(migration).toContain("v_organization_id uuid := app.current_org_id()");
    expect(migration).toContain("enrollment.status = 'active'");
    expect(migration).toContain("platform_user.id = v_patient_user_id");
    expect(migration).toContain("NOT p_only_if_empty OR platform_user.calendar_timezone IS NULL");
    expect(migration).toContain("pg_catalog.pg_timezone_names");
    expect(migration).not.toContain("p_patient_user_id");
    expect(migration).not.toContain("p_organization_id");
    expect(overlay).toContain("NOT has_table_privilege('app_patient','public.system_settings','SELECT')");
    expect(overlay).toContain("NOT has_table_privilege('app_patient','public.platform_users','UPDATE')");
    expect(settings).toContain('runWithWebappDbOperationFamily("patient_ui_config"');
    expect(timezone).toContain('runWithWebappDbOperationFamily("patient_calendar_timezone"');
  });
});
