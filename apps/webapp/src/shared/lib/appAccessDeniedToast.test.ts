import { describe, expect, it, vi } from "vitest";
import toast from "react-hot-toast";
import {
  APP_ACCESS_DENIED_QUERY_KEY,
  APP_ACCESS_DENIED_QUERY_VALUE,
  APP_ACCESS_DENIED_TOAST_MESSAGE,
  buildOwnHubUrlWithAccessDeniedToast,
  getOwnHubPathForRole,
  parseReturnToPath,
  searchParamsHasAccessDeniedToast,
  searchParamsHasAccessDeniedToastInNext,
  showAppAccessDeniedToastIfFlagged,
  stripAccessDeniedToastFromNextParam,
  stripAccessDeniedToastFromUrl,
} from "./appAccessDeniedToast";

vi.mock("react-hot-toast", () => ({
  default: vi.fn(),
}));

describe("appAccessDeniedToast", () => {
  it("getOwnHubPathForRole maps roles to hubs", () => {
    expect(getOwnHubPathForRole("client")).toBe("/app/patient");
    expect(getOwnHubPathForRole("doctor")).toBe("/app/doctor");
    expect(getOwnHubPathForRole("admin")).toBe("/app/doctor");
  });

  it("buildOwnHubUrlWithAccessDeniedToast appends query flag", () => {
    expect(buildOwnHubUrlWithAccessDeniedToast("client")).toBe(
      `/app/patient?${APP_ACCESS_DENIED_QUERY_KEY}=${APP_ACCESS_DENIED_QUERY_VALUE}`,
    );
    expect(buildOwnHubUrlWithAccessDeniedToast("doctor")).toBe(
      `/app/doctor?${APP_ACCESS_DENIED_QUERY_KEY}=${APP_ACCESS_DENIED_QUERY_VALUE}`,
    );
  });

  it("searchParamsHasAccessDeniedToast detects flag", () => {
    expect(searchParamsHasAccessDeniedToast("")).toBe(false);
    expect(searchParamsHasAccessDeniedToast("?foo=1")).toBe(false);
    expect(
      searchParamsHasAccessDeniedToast(`?${APP_ACCESS_DENIED_QUERY_KEY}=${APP_ACCESS_DENIED_QUERY_VALUE}`),
    ).toBe(true);
    expect(
      searchParamsHasAccessDeniedToast(
        new URLSearchParams({ [APP_ACCESS_DENIED_QUERY_KEY]: APP_ACCESS_DENIED_QUERY_VALUE, tab: "x" }),
      ),
    ).toBe(true);
  });

  it("stripAccessDeniedToastFromUrl removes only access flag", () => {
    expect(
      stripAccessDeniedToastFromUrl(
        "/app/patient",
        `?${APP_ACCESS_DENIED_QUERY_KEY}=${APP_ACCESS_DENIED_QUERY_VALUE}&tab=symptoms`,
      ),
    ).toEqual({ pathname: "/app/patient", search: "?tab=symptoms" });
    expect(
      stripAccessDeniedToastFromUrl(
        "/app/doctor",
        `?${APP_ACCESS_DENIED_QUERY_KEY}=${APP_ACCESS_DENIED_QUERY_VALUE}`,
      ),
    ).toEqual({ pathname: "/app/doctor", search: "" });
  });

  it("parseReturnToPath splits pathname and search", () => {
    expect(parseReturnToPath("/app/patient?tab=symptoms")).toEqual({
      pathname: "/app/patient",
      search: "?tab=symptoms",
    });
    expect(parseReturnToPath("/app/patient")).toEqual({
      pathname: "/app/patient",
      search: "",
    });
  });

  it("searchParamsHasAccessDeniedToastInNext detects flag inside next", () => {
    const next = `/app/patient?${APP_ACCESS_DENIED_QUERY_KEY}=${APP_ACCESS_DENIED_QUERY_VALUE}`;
    expect(searchParamsHasAccessDeniedToastInNext(next)).toBe(true);
    expect(searchParamsHasAccessDeniedToastInNext("/app/patient")).toBe(false);
  });

  it("stripAccessDeniedToastFromNextParam removes flag from next value", () => {
    const next = `/app/patient?${APP_ACCESS_DENIED_QUERY_KEY}=${APP_ACCESS_DENIED_QUERY_VALUE}&tab=symptoms`;
    expect(stripAccessDeniedToastFromNextParam(next)).toBe("/app/patient?tab=symptoms");
  });

  it("showAppAccessDeniedToastIfFlagged shows toast once when flagged", () => {
    vi.mocked(toast).mockClear();
    expect(showAppAccessDeniedToastIfFlagged("?foo=1")).toBe(false);
    expect(toast).not.toHaveBeenCalled();

    expect(
      showAppAccessDeniedToastIfFlagged(`?${APP_ACCESS_DENIED_QUERY_KEY}=${APP_ACCESS_DENIED_QUERY_VALUE}`),
    ).toBe(true);
    expect(toast).toHaveBeenCalledWith(APP_ACCESS_DENIED_TOAST_MESSAGE);
  });
});
