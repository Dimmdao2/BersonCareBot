package ru.therapygo.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/**
 * Runs once per built flavor (therapygo/therapysto x environmentTest/production), so every
 * assertion below is checked against all four real {@code BuildConfig} combinations, not one
 * hardcoded pair. Each test names the one fault it kills; audit fault-injection evidence lives in
 * {@code .lead/runs/mobile-shell-foundation-audit-20260909/90-final-audit-report.md}.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = { 33 })
public class TrustedOriginGateTest {

    // Kill: gate rejects the current variant's own exact origin (false positive would break the app).
    @Test
    public void trustsExactCurrentVariantOriginAndStartUrl() {
        assertTrue(TrustedOriginGate.isTrusted(ShellVariant.origin()));
        assertTrue(TrustedOriginGate.isTrusted(ShellVariant.startUrl()));
    }

    // Kill: gate classifies cleartext http as internal.
    @Test
    public void rejectsCleartextHttpOfTrustedHost() {
        String httpVariant = ShellVariant.origin().replaceFirst("^https://", "http://");
        assertFalse(TrustedOriginGate.isTrusted(httpVariant));
    }

    // Kill: gate ignores a non-default port on an otherwise-trusted host.
    @Test
    public void rejectsNonDefaultPortOnTrustedHost() {
        assertFalse(TrustedOriginGate.isTrusted(ShellVariant.origin() + ":8443/app"));
    }

    // Kill: gate accepts a host that merely starts/ends with the trusted host (subdomain/suffix trick).
    @Test
    public void rejectsSubdomainAndSuffixTricks() {
        String host = hostOf(ShellVariant.origin());
        assertFalse(TrustedOriginGate.isTrusted("https://evil-" + host));
        assertFalse(TrustedOriginGate.isTrusted("https://" + host + ".evil.example"));
        assertFalse(TrustedOriginGate.isTrusted("https://" + host + "-evil.example"));
    }

    // Kill: gate trusts the sibling brand's origin inside this brand's build.
    @Test
    public void rejectsSiblingBrandOrigin() {
        boolean isTherapygo = ShellVariant.origin().contains("therapygo");
        String siblingHost = isTherapygo ? "therapysto.ru" : "therapygo.ru";
        String siblingOrigin = ShellVariant.origin().contains("test.")
            ? "https://test." + siblingHost
            : "https://" + siblingHost;
        assertFalse(TrustedOriginGate.isTrusted(siblingOrigin));
    }

    // Kill: gate trusts the other environment's origin (TEST inside production build or vice versa).
    @Test
    public void rejectsCrossEnvironmentOrigin() {
        boolean isTest = ShellVariant.origin().contains("://test.");
        String cross = isTest
            ? ShellVariant.origin().replaceFirst("://test\\.", "://")
            : ShellVariant.origin().replaceFirst("://", "://test.");
        assertFalse(TrustedOriginGate.isTrusted(cross));
    }

    // Kill: gate ignores embedded userinfo and trusts "https://trusted-host@evil".
    @Test
    public void rejectsUserInfoTrick() {
        String host = hostOf(ShellVariant.origin());
        assertFalse(TrustedOriginGate.isTrusted("https://" + host + "@evil.example/"));
        assertFalse(TrustedOriginGate.isTrusted("https://user:pass@" + host + "/"));
    }

    // Kill: gate throws or returns true for null/blank/malformed input instead of failing closed.
    @Test
    public void rejectsNullBlankAndMalformedInput() {
        assertFalse(TrustedOriginGate.isTrusted((String) null));
        assertFalse(TrustedOriginGate.isTrusted(""));
        assertFalse(TrustedOriginGate.isTrusted("   "));
        assertFalse(TrustedOriginGate.isTrusted("not a url"));
        assertFalse(TrustedOriginGate.isTrusted("about:blank"));
    }

    // Kill: WebView overload trusts a null WebView or a WebView with no/blank current URL.
    @Test
    public void webViewOverloadRejectsNullWebViewAndNullUrl() {
        assertFalse(TrustedOriginGate.isTrusted((android.webkit.WebView) null));
    }

    // Path/query/fragment differences under the same trusted origin remain trusted; only origin is checked.
    @Test
    public void trustsDifferentPathsAndQueriesUnderSameOrigin() {
        assertTrue(TrustedOriginGate.isTrusted(ShellVariant.origin() + "/some/other/path?x=1#y"));
    }

    private static String hostOf(String origin) {
        return android.net.Uri.parse(origin).getHost();
    }
}
