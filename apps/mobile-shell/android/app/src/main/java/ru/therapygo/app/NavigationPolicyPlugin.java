package ru.therapygo.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.Plugin;
import java.util.Locale;

/** Runs inside Capacitor's normal BridgeWebViewClient before its fallback intent logic. */
public final class NavigationPolicyPlugin extends Plugin {
    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        if (url == null) return true;
        if (url.getUserInfo() != null) return true;
        if (TrustedOriginGate.isTrusted(url.toString())) return false;
        String rawScheme = url.getScheme();
        String scheme = rawScheme == null ? "" : rawScheme.toLowerCase(Locale.ROOT);
        if ("https".equals(scheme) || "http".equals(scheme) || "mailto".equals(scheme) || "tel".equals(scheme)) {
            try {
                getContext().startActivity(new Intent(Intent.ACTION_VIEW, url));
            } catch (ActivityNotFoundException ignored) {
                // Fail closed: no handler must not move an untrusted URL into the WebView.
            }
        }
        // intent, file, content, javascript, userinfo and every other scheme stay blocked.
        return true;
    }
}
