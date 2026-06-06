/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import toast from "react-hot-toast";
import { AppAccessDeniedToastEffect } from "./AppAccessDeniedToastEffect";
import {
  APP_ACCESS_DENIED_QUERY_KEY,
  APP_ACCESS_DENIED_QUERY_VALUE,
  APP_ACCESS_DENIED_TOAST_MESSAGE,
} from "@/shared/lib/appAccessDeniedToast";

const replaceMock = vi.fn();
const pathnameRef = vi.hoisted(() => ({ value: "/app/patient" }));
const searchParamsRef = vi.hoisted(() => ({
  value: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.value,
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => searchParamsRef.value,
}));

vi.mock("react-hot-toast", () => ({
  default: vi.fn(),
}));

describe("AppAccessDeniedToastEffect", () => {
  beforeEach(() => {
    replaceMock.mockClear();
    vi.mocked(toast).mockClear();
    pathnameRef.value = "/app/patient";
    searchParamsRef.value = new URLSearchParams();
  });

  it("shows toast and strips access-denied query", async () => {
    searchParamsRef.value = new URLSearchParams({
      [APP_ACCESS_DENIED_QUERY_KEY]: APP_ACCESS_DENIED_QUERY_VALUE,
    });

    render(<AppAccessDeniedToastEffect />);

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(APP_ACCESS_DENIED_TOAST_MESSAGE);
      expect(replaceMock).toHaveBeenCalledWith("/app/patient");
    });
  });

  it("does nothing without access-denied flag", async () => {
    searchParamsRef.value = new URLSearchParams({ tab: "symptoms" });

    render(<AppAccessDeniedToastEffect />);

    await waitFor(() => {
      expect(toast).not.toHaveBeenCalled();
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });

  it("shows toast and strips access-denied flag nested in next param (install landing)", async () => {
    pathnameRef.value = "/";
    const next = `/app/patient?${APP_ACCESS_DENIED_QUERY_KEY}=${APP_ACCESS_DENIED_QUERY_VALUE}`;
    searchParamsRef.value = new URLSearchParams({ next });

    render(<AppAccessDeniedToastEffect />);

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(APP_ACCESS_DENIED_TOAST_MESSAGE);
      expect(replaceMock).toHaveBeenCalledWith("/?next=%2Fapp%2Fpatient");
    });
  });

  it("preserves other query params when stripping flag", async () => {
    searchParamsRef.value = new URLSearchParams({
      [APP_ACCESS_DENIED_QUERY_KEY]: APP_ACCESS_DENIED_QUERY_VALUE,
      tab: "symptoms",
    });

    render(<AppAccessDeniedToastEffect />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/app/patient?tab=symptoms");
    });
  });
});
