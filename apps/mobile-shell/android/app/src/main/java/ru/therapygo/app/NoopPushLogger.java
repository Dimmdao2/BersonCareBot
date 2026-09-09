package ru.therapygo.app;

import ru.rustore.sdk.pushclient.common.logger.Logger;

/**
 * The SDK's own {@code DefaultLogger} writes every message it is given straight to
 * {@code android.util.Log} (verbose/debug/info/warn/error, all with the raw message string). Since
 * the RuStore Universal Push SDK's internal log lines are not documented to exclude token/payload/
 * project content, this discards every call instead: no token, payload, or project id detail ever
 * reaches logcat through the push client.
 */
final class NoopPushLogger implements Logger {
    static final NoopPushLogger INSTANCE = new NoopPushLogger();

    private NoopPushLogger() {}

    @Override public void verbose(String message, Throwable throwable) {}
    @Override public void debug(String message, Throwable throwable) {}
    @Override public void info(String message, Throwable throwable) {}
    @Override public void warn(String message, Throwable throwable) {}
    @Override public void error(String message, Throwable throwable) {}

    @Override public Logger createLogger(String tag) { return this; }
    @Override public Logger createLogger(Object tag) { return this; }
}
