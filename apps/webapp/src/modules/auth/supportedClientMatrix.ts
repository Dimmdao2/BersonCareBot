export type ClientOsFamily = "ios" | "android" | "windows" | "macos" | "linux" | "unknown";
export type ClientBrowserFamily =
  | "safari"
  | "chrome"
  | "firefox"
  | "samsung_internet"
  | "edge"
  | "other"
  | "unknown";
export type ClientSupportBucket = "below_matrix" | "within_matrix" | "unknown";

export type ParsedClientEnvironment = Readonly<{
  osFamily: ClientOsFamily;
  osName: string | null;
  osVersion: string | null;
  osMajor: number | null;
  browserFamily: ClientBrowserFamily;
  browserName: string | null;
  browserVersion: string | null;
  browserMajor: number | null;
  deviceName: string | null;
  isInAppWebView: boolean;
  confidence: "high" | "medium" | "low";
  supportBucket: ClientSupportBucket;
}>;

export type ClientEnvironmentTelemetry = Readonly<{
  osFamily: ClientOsFamily;
  osMajor: number | null;
  browserFamily: ClientBrowserFamily;
  browserMajor: number | null;
  supportBucket: ClientSupportBucket;
  isInAppWebView: boolean;
}>;

const MIN_BROWSER_MAJOR = {
  safari: 15,
  chrome: 100,
  firefox: 100,
  samsung_internet: 20,
} as const;

function major(version: string | null): number | null {
  if (!version) return null;
  const value = Number.parseInt(version.split(".")[0] ?? "", 10);
  return Number.isFinite(value) ? value : null;
}

function normalizedVersion(match: RegExpMatchArray | null): string | null {
  if (!match?.[1]) return null;
  return match[1].replace(/_/g, ".");
}

function parseAndroidDevice(userAgent: string): string | null {
  const match = userAgent.match(/Android\s[^;)]*;\s*([^;)]+?)(?:\s+Build\/[^;)]+)?[;)]/i);
  const value = match?.[1]?.trim() ?? "";
  if (!value || /^(wv|[a-z]{2}(?:-[a-z]{2})?)$/i.test(value)) return null;
  return value.slice(0, 48);
}

function supportBucketFor(input: {
  osFamily: ClientOsFamily;
  osMajor: number | null;
  browserFamily: ClientBrowserFamily;
  browserMajor: number | null;
}): ClientSupportBucket {
  if (input.osFamily === "ios" && input.osMajor !== null && input.osMajor < 15) {
    return "below_matrix";
  }
  if (input.browserFamily in MIN_BROWSER_MAJOR && input.browserMajor !== null) {
    const minimum = MIN_BROWSER_MAJOR[input.browserFamily as keyof typeof MIN_BROWSER_MAJOR];
    return input.browserMajor < minimum ? "below_matrix" : "within_matrix";
  }
  if (input.osFamily === "ios" && input.osMajor !== null) return "within_matrix";
  return "unknown";
}

/** Classification/presentation only. It must never be used as an access gate or bundle-baseline switch. */
export function parseSupportedClientEnvironment(userAgent: string): ParsedClientEnvironment {
  const ua = userAgent.slice(0, 1024);
  const iosVersion = normalizedVersion(ua.match(/(?:CPU (?:iPhone )?OS|iPhone OS)\s([0-9_]+)/i));
  const androidVersion = normalizedVersion(ua.match(/Android\s([0-9.]+)/i));
  const windowsVersion = normalizedVersion(ua.match(/Windows NT\s([0-9.]+)/i));
  const macVersion = normalizedVersion(ua.match(/Mac OS X\s([0-9_]+)/i));

  let osFamily: ClientOsFamily = "unknown";
  let osName: string | null = null;
  let osVersion: string | null = null;
  let deviceName: string | null = null;
  if (iosVersion || /iPhone|iPad|iPod/i.test(ua)) {
    osFamily = "ios";
    osName = "iOS";
    osVersion = iosVersion;
    deviceName = /iPad/i.test(ua) ? "iPad" : /iPod/i.test(ua) ? "iPod" : "iPhone";
  } else if (androidVersion || /Android/i.test(ua)) {
    osFamily = "android";
    osName = "Android";
    osVersion = androidVersion;
    deviceName = parseAndroidDevice(ua) ?? "Android-устройство";
  } else if (windowsVersion) {
    osFamily = "windows";
    osName = "Windows";
    osVersion = windowsVersion;
  } else if (macVersion) {
    osFamily = "macos";
    osName = "macOS";
    osVersion = macVersion;
  } else if (/Linux/i.test(ua)) {
    osFamily = "linux";
    osName = "Linux";
  }

  const samsungVersion = normalizedVersion(ua.match(/SamsungBrowser\/([0-9.]+)/i));
  const edgeVersion = normalizedVersion(ua.match(/(?:EdgA|EdgiOS|Edg)\/([0-9.]+)/i));
  const firefoxVersion = normalizedVersion(ua.match(/(?:FxiOS|Firefox)\/([0-9.]+)/i));
  const chromeVersion = normalizedVersion(ua.match(/(?:CriOS|Chrome)\/([0-9.]+)/i));
  const safariVersion = /Safari/i.test(ua)
    ? normalizedVersion(ua.match(/Version\/([0-9.]+)/i))
    : null;

  let browserFamily: ClientBrowserFamily = "unknown";
  let browserName: string | null = null;
  let browserVersion: string | null = null;
  if (samsungVersion) {
    browserFamily = "samsung_internet";
    browserName = "Samsung Internet";
    browserVersion = samsungVersion;
  } else if (edgeVersion) {
    browserFamily = "edge";
    browserName = "Microsoft Edge";
    browserVersion = edgeVersion;
  } else if (firefoxVersion) {
    browserFamily = "firefox";
    browserName = "Firefox";
    browserVersion = firefoxVersion;
  } else if (chromeVersion) {
    browserFamily = "chrome";
    browserName = "Chrome";
    browserVersion = chromeVersion;
  } else if (safariVersion || (/Safari/i.test(ua) && osFamily === "ios")) {
    browserFamily = "safari";
    browserName = "Safari";
    browserVersion = safariVersion;
  } else if (ua.trim()) {
    browserFamily = "other";
    browserName = "Встроенный браузер";
  }

  const osMajor = major(osVersion);
  const browserMajor = major(browserVersion);
  const isInAppWebView = /;\s*wv\)|\bWebView\b|Telegram|\bMAX\b/i.test(ua);
  const confidence = osName && browserName ? "high" : osName || browserName ? "medium" : "low";

  return {
    osFamily,
    osName,
    osVersion,
    osMajor,
    browserFamily,
    browserName,
    browserVersion,
    browserMajor,
    deviceName,
    isInAppWebView,
    confidence,
    supportBucket: supportBucketFor({ osFamily, osMajor, browserFamily, browserMajor }),
  };
}

export function toClientEnvironmentTelemetry(input: ParsedClientEnvironment): ClientEnvironmentTelemetry {
  return {
    osFamily: input.osFamily,
    osMajor: input.osMajor,
    browserFamily: input.browserFamily,
    browserMajor: input.browserMajor,
    supportBucket: input.supportBucket,
    isInAppWebView: input.isInAppWebView,
  };
}

export function formatClientEnvironmentFact(input: ParsedClientEnvironment): string | null {
  if (input.confidence !== "high") return null;
  const parts = [input.deviceName, input.osName && input.osVersion ? `${input.osName} ${input.osVersion}` : input.osName, input.browserName]
    .filter((part): part is string => Boolean(part));
  return parts.length >= 2 ? `Ваше устройство: ${parts.join(", ")}` : null;
}
