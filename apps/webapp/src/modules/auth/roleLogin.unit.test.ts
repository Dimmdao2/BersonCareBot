import { describe, expect, it } from 'vitest';
import { isRoleLoginPath, isSafeRolePortalNext } from './roleLogin';

describe('isRoleLoginPath', () => {
  it('accepts each portal its one login door', () => {
    expect(isRoleLoginPath('/app/doctor/login')).toBe(true);
    expect(isRoleLoginPath('/app/patient/login')).toBe(true);
    expect(isRoleLoginPath('/app/admin/login')).toBe(true);
  });

  // Owner, 12.09: "две разные страницы" — /app/doctor/register is its own public door, not a
  // doctor-only page requiring a session (proxy.ts's require-auth gate reads this function).
  it("accepts the doctor portal's register door alongside its login door", () => {
    expect(isRoleLoginPath('/app/doctor/register')).toBe(true);
  });

  it('does not extend the register exemption to other portals or other doctor pages', () => {
    expect(isRoleLoginPath('/app/patient/register')).toBe(false);
    expect(isRoleLoginPath('/app/admin/register')).toBe(false);
    expect(isRoleLoginPath('/app/doctor/patients')).toBe(false);
    expect(isRoleLoginPath('/app/doctor')).toBe(false);
  });
});

describe('isSafeRolePortalNext', () => {
  it('rejects both public doors as a post-login continuation for the doctor portal', () => {
    expect(isSafeRolePortalNext('/app/doctor/login', 'doctor')).toBe(false);
    expect(isSafeRolePortalNext('/app/doctor/register', 'doctor')).toBe(false);
  });

  it('still accepts an ordinary doctor-portal deep link', () => {
    expect(isSafeRolePortalNext('/app/doctor/patients', 'doctor')).toBe(true);
  });

  it('rejects a next path outside the requesting portal', () => {
    expect(isSafeRolePortalNext('/app/patient/register', 'doctor')).toBe(false);
  });
});
