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
}
