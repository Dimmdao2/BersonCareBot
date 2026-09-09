package ru.therapygo.app;

import android.net.Uri;
import android.webkit.WebView;

/** The sole bridge/plugin authorization boundary for this shell. */
public final class TrustedOriginGate {
    private TrustedOriginGate() {}

    public static boolean isTrusted(WebView webView) {
        return webView != null && isTrusted(webView.getUrl());
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
