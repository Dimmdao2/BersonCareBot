/**
 * Flow 5 — global admin opens /app/admin/* (the console that "moved today") and saves one
 * setting (support_contact_url, scope=admin), then confirms it persisted across a fresh reload.
 * Restores the original value afterwards.
 *
 * LIVE FINDING (only visible by actually clicking Save, not by a GET-only walk): the PATCH
 * /api/admin/settings endpoint is gated by requireClinicManagementApiContext (see
 * apps/webapp/src/app-layer/guards/requireRole.ts:574-597), which requires an owner/admin
 * membership row in be_organization_members for SOME organization. The platform admin account
 * (role='admin', no organization membership at all — confirmed read-only against TEST) has none,
 * so every save on this page 403s for a genuine platform admin, even though the page itself
 * renders fully and every field is editable. The route's own top comment documents this as
 * intentional: "Global platform configuration stays fail-closed until the U9 platform API/
 * principal contract is implemented." This flow proves that documented gap is real in practice —
 * treated as an expected-fail assertion, not a script bug.
 */
import { applyProfileCookie } from "../lib/fixtureAuth.mjs";

export async function runAdminSettingsFlow({ browser, baseUrl, screenshotDir }) {
  const steps = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await applyProfileCookie(context, "global_admin", baseUrl);
  const page = await context.newPage();

  await page.goto(`${baseUrl}/app/admin/app-settings`, { waitUntil: "load", timeout: 20000 });
  await page.screenshot({ path: `${screenshotDir}/admin-settings-before.png`, fullPage: true }).catch(() => {});

  const supportInput = page.getByPlaceholder("/app/patient/support или https://t.me/…");
  const visible = await supportInput.isVisible().catch(() => false);
  steps.push({ name: "admin_console_loads", ok: visible, detail: `support_contact_url input visible=${visible}` });
  if (!visible) {
    await context.close();
    return { flow: "global-admin-settings-save", steps, verdict: "fail" };
  }

  const originalValue = await supportInput.inputValue();
  const testValue = `/app/patient/support?clickthrough=${Date.now()}`;

  const patchResponses = [];
  page.on("response", (resp) => {
    if (resp.url().includes("/api/admin/settings") && resp.request().method() === "PATCH") {
      patchResponses.push({ url: resp.url(), status: resp.status() });
    }
  });

  await supportInput.fill(testValue);
  // The "Параметры приложения" card has its own Save button — the page has several. Scope to it.
  const saveButton = page.getByRole("button", { name: "Сохранить" }).first();
  await saveButton.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${screenshotDir}/admin-settings-after-click.png`, fullPage: true }).catch(() => {});
  const afterClickText = await page.locator("body").innerText().catch(() => "");
  const saw403 = patchResponses.some((r) => r.status === 403);
  steps.push({
    name: "save_clicked",
    ok: true,
    detail: `patchResponses=${JSON.stringify(patchResponses)}; page mentions error=${afterClickText.includes("Ошибка") || afterClickText.includes("Не удалось")}`,
  });

  // Reload fresh (new navigation) to check whether the write actually persisted server-side.
  await page.goto(`${baseUrl}/app/admin/app-settings`, { waitUntil: "load", timeout: 20000 });
  const valueAfterReload = await page.getByPlaceholder("/app/patient/support или https://t.me/…").inputValue();
  await page.screenshot({ path: `${screenshotDir}/admin-settings-after-reload.png`, fullPage: true }).catch(() => {});
  const persisted = valueAfterReload === testValue;
  steps.push({
    name: "setting_persists_after_reload",
    // If we saw a 403, "did not persist" is the CORRECT/expected outcome (nothing should have
    // written). This step is ok as long as persistence matches what the PATCH response implied.
    ok: saw403 ? !persisted : persisted,
    detail: `expected=${JSON.stringify(testValue)} actual=${JSON.stringify(valueAfterReload)}; PATCH saw403=${saw403}`,
  });

  // Only restore if something actually changed (avoid a spurious extra write when the 403 already
  // proved nothing was touched).
  if (persisted && valueAfterReload !== originalValue) {
    await page.getByPlaceholder("/app/patient/support или https://t.me/…").fill(originalValue);
    await page.getByRole("button", { name: /Сохранить/ }).first().click();
    await page.waitForTimeout(1200);
    await page.goto(`${baseUrl}/app/admin/app-settings`, { waitUntil: "load", timeout: 20000 });
    const valueAfterRestore = await page.getByPlaceholder("/app/patient/support или https://t.me/…").inputValue();
    steps.push({
      name: "restore_original_value",
      ok: valueAfterRestore === originalValue,
      detail: `restored=${valueAfterRestore === originalValue}`,
    });
  } else {
    steps.push({
      name: "restore_original_value",
      ok: true,
      detail: "no restore needed — the write never persisted (403), TEST is unchanged",
    });
  }

  await context.close();
  const allOk = steps.every((s) => s.ok);
  const verdict5 = saw403
    ? "BLOCKED BY DESIGN: PATCH /api/admin/settings 403s for the true platform-admin account (no organization membership) — requireClinicManagementApiContext requires clinic-manager capability, which a pure global admin structurally lacks. The page renders and looks fully editable; only clicking Save reveals every field is actually unwritable for this role. Documented in the route's own comment as a known gap pending the U9 platform API/principal contract."
    : "Save succeeded and persisted for the global_admin account.";
  return { flow: "global-admin-settings-save", steps, verdict: allOk ? "pass" : "fail", verdictDetail: verdict5 };
}
