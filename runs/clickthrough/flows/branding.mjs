/**
 * Flow 4 — save a clinic branding value (name) as clinic_admin, then confirm it renders in the
 * doctor shell (a different session/profile, proving the effect is really persisted server-side,
 * not just local component state).
 */
import { applyProfileCookie } from "../lib/fixtureAuth.mjs";

export async function runBrandingFlow({ browser, baseUrl, screenshotDir }) {
  const steps = [];
  const testName = `Точка Здоровья — clickthrough ${new Date().toISOString().slice(11, 19)}`;

  // --- Step 1: read the CURRENT published name first, so we can restore it afterwards. ---
  const adminContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await applyProfileCookie(adminContext, "clinic_admin", baseUrl);
  const adminPage = await adminContext.newPage();
  await adminPage.goto(`${baseUrl}/app/settings`, { waitUntil: "load", timeout: 20000 });
  await adminPage.screenshot({ path: `${screenshotDir}/branding-settings-before.png`, fullPage: true }).catch(() => {});

  const nameInput = adminPage.locator("#org-brand-name");
  const inputVisible = await nameInput.isVisible().catch(() => false);
  steps.push({ name: "org_brand_name_input_visible", ok: inputVisible, detail: `visible=${inputVisible}` });
  if (!inputVisible) {
    await adminContext.close();
    return { flow: "clinic-branding-save", steps, verdict: "fail" };
  }

  const originalName = await nameInput.inputValue();
  steps.push({ name: "read_original_name", ok: true, detail: `originalName length=${originalName.length}` });

  // Scope to the "Бренд клиники" section — the page has several independent "Сохранить" buttons.
  const brandSection = adminPage.locator("section", { hasText: "Бренд клиники" }).first();
  const saveButton = brandSection.getByRole("button", { name: "Сохранить" });

  // --- Step 2: change the name, save, assert the UI reflects "saved". ---
  await nameInput.fill(testName);
  await saveButton.click();
  // handleSave is a server-action round trip + router.refresh(); wait for the button to leave its
  // "Сохранение…" pending state rather than a fixed sleep.
  await brandSection.getByRole("button", { name: "Сохранить" }).waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
  await adminPage.waitForTimeout(800);
  const savedText = await adminPage.locator("body").innerText().catch(() => "");
  const sawSavedConfirmation = savedText.includes("Сохранено.");
  await adminPage.screenshot({ path: `${screenshotDir}/branding-settings-after-save.png`, fullPage: true }).catch(() => {});
  // NOT gating on this: OrgBrandingSection is given `key={...publishedBrand?.displayName...}` in
  // page.tsx, so once router.refresh() lands fresh server data with the NEW name, React remounts
  // the component (key changed) and its local `justSaved` state resets to false in the same tick
  // — the "Сохранено." toast is real but not reliably observable this way. Persistence itself is
  // proven below via a full page reload + a separate doctor-shell render, which is the assertion
  // that actually matters.
  steps.push({
    name: "save_click_shows_confirmation_note",
    ok: true,
    detail: `sawSavedConfirmation=${sawSavedConfirmation} (informational only — see code comment; component remounts via its \`key\` prop on refresh, resetting the toast before we can observe it)`,
  });

  // --- Step 3: reload the settings page fresh (new navigation, not client state) to confirm the
  // saved name persisted server-side. ---
  await adminPage.goto(`${baseUrl}/app/settings`, { waitUntil: "load", timeout: 20000 });
  const nameAfterReload = await adminPage.locator("#org-brand-name").inputValue().catch(() => "");
  steps.push({
    name: "name_persists_after_reload",
    ok: nameAfterReload === testName,
    detail: `expected=${JSON.stringify(testName)} actual=${JSON.stringify(nameAfterReload)}`,
  });

  // --- Step 4: open the DOCTOR shell in a SEPARATE session/context and confirm the sidebar brand
  // mark shows the new name — this is the actual product surface, not the settings form itself. ---
  const doctorContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await applyProfileCookie(doctorContext, "doctor", baseUrl);
  const doctorPage = await doctorContext.newPage();
  await doctorPage.goto(`${baseUrl}/app/doctor`, { waitUntil: "load", timeout: 20000 });
  await doctorPage.waitForTimeout(300);
  const sidebarBrandText = await doctorPage
    .locator("#doctor-sidebar-brand")
    .innerText()
    .catch(() => "");
  await doctorPage.screenshot({ path: `${screenshotDir}/branding-doctor-shell-after.png`, fullPage: true }).catch(() => {});
  const shellShowsNewName = sidebarBrandText.includes(testName);
  steps.push({
    name: "doctor_shell_renders_new_brand_name",
    ok: shellShowsNewName,
    detail: `sidebar text=${JSON.stringify(sidebarBrandText)}; expected to contain=${JSON.stringify(testName)}`,
  });
  await doctorContext.close();

  // --- Step 5: restore the original name (leave TEST as we found it). ---
  await adminPage.goto(`${baseUrl}/app/settings`, { waitUntil: "load", timeout: 20000 });
  await adminPage.locator("#org-brand-name").fill(originalName);
  await adminPage.locator("section", { hasText: "Бренд клиники" }).first().getByRole("button", { name: "Сохранить" }).click();
  await adminPage.waitForTimeout(1000);
  await adminPage.goto(`${baseUrl}/app/settings`, { waitUntil: "load", timeout: 20000 });
  const nameAfterRestore = await adminPage.locator("#org-brand-name").inputValue().catch(() => "");
  steps.push({
    name: "restore_original_name",
    ok: nameAfterRestore === originalName,
    detail: `restored=${nameAfterRestore === originalName}`,
  });

  await adminContext.close();

  const allOk = steps.every((s) => s.ok);
  return { flow: "clinic-branding-save", steps, verdict: allOk ? "pass" : "fail" };
}
