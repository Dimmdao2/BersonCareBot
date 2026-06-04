/** @vitest-environment jsdom */
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { DoctorSupportUnreadProvider, useDoctorSupportUnreadCount } from "./DoctorSupportUnreadProvider";

vi.mock("@/modules/messaging/hooks/useSupportUnreadPolling", () => ({
  useDoctorSupportUnreadCountPolling: () => 7,
}));

function wrapper({ children }: { children: ReactNode }) {
  return <DoctorSupportUnreadProvider>{children}</DoctorSupportUnreadProvider>;
}

describe("DoctorSupportUnreadProvider", () => {
  it("exposes polling value to consumers", () => {
    const { result } = renderHook(() => useDoctorSupportUnreadCount(), { wrapper });
    expect(result.current).toBe(7);
  });

  it("throws when hook is used outside provider", () => {
    expect(() => renderHook(() => useDoctorSupportUnreadCount())).toThrow(
      /useDoctorSupportUnreadCount must be used within DoctorSupportUnreadProvider/,
    );
  });
});
