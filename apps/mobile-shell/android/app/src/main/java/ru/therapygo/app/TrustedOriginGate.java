package ru.therapygo.app;

import android.net.Uri;
import android.os.Looper;
import android.webkit.WebView;

/** The sole bridge/plugin authorization boundary for this shell. */
public final class TrustedOriginGate {
    private static volatile String committedMainFrameUrl;

    private TrustedOriginGate() {}

    /**
     * Called only by MainActivity's main-frame lifecycle callbacks. A navigation
     * clears the prior value before its replacement has become visible, so a
     * plugin can never authorize a new page using a stale trusted origin.
     */
    public static void clearCommittedMainFrameUrl() {
        committedMainFrameUrl = null;
    }

    /** Records a committed main-frame URL only from Android's UI thread. */
    public static void recordCommittedMainFrameUrl(String url) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            committedMainFrameUrl = null;
            return;
        }
        committedMainFrameUrl = isTrusted(url) ? url : null;
    }

    public static boolean isTrusted(WebView webView) {
        // Capacitor invokes plugin methods on CapacitorPlugins. WebView APIs are
        // main-thread only, so background calls consume the lifecycle cache and
        // fail closed until a trusted main frame has committed.
        if (Looper.myLooper() == Looper.getMainLooper()) {
            recordCommittedMainFrameUrl(webView == null ? null : webView.getUrl());
        }
        return isTrusted(committedMainFrameUrl);
    }

    public static boolean isTrusted(String url) {
        if (url == null || url.isBlank()) return false;
        Uri candidate;
        Uri expected;
        try {
            candidate = Uri.parse(url);
            expected = Uri.parse(ShellVariant.origin());
        } catch (RuntimeException ignored) {
            return false;
        }
        if (candidate.getUserInfo() != null || candidate.getFragment() != null && candidate.getScheme() == null) return false;
        return "https".equals(candidate.getScheme())
            && "https".equals(expected.getScheme())
            && expected.getHost().equalsIgnoreCase(candidate.getHost())
            && normalizedPort(expected) == normalizedPort(candidate);
    }

    private static int normalizedPort(Uri uri) {
        return uri.getPort() == -1 ? 443 : uri.getPort();
    }
}
