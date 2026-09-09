package ru.therapygo.app;

/** Centralized flavor configuration; never infer an origin from a loaded page. */
public final class ShellVariant {
    private ShellVariant() {}

    public static String origin() {
        if ("test".equals(BuildConfig.SHELL_ENVIRONMENT)) {
            return BuildConfig.SHELL_PRODUCTION_ORIGIN.replace("https://", "https://test.");
        }
        return BuildConfig.SHELL_PRODUCTION_ORIGIN;
    }

    public static String startUrl() {
        return origin() + BuildConfig.SHELL_START_PATH;
    }

    /** These values are build facts, never values supplied by the WebView. */
    public static String jitsiEndpoint() {
        return "test".equals(BuildConfig.SHELL_ENVIRONMENT)
            ? "https://meet.test.therapysto.ru"
            : "https://meet.therapysto.ru";
    }

    /** Exact upload hosts for the build environment; no wildcard DNS matching. */
    public static boolean isAllowedUploadHost(String host) {
        if (host == null) return false;
        if ("test".equals(BuildConfig.SHELL_ENVIRONMENT)) {
            return "fs.bersonservices.ru".equalsIgnoreCase(host);
        }
        return "s3.ru-7.storage.selcloud.ru".equalsIgnoreCase(host)
            || "storage.yandexcloud.net".equalsIgnoreCase(host);
    }
}
