package ru.therapygo.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.robolectric.Shadows.shadowOf;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.Bridge;
import com.getcapacitor.Plugin;
import java.lang.reflect.Field;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowActivity;

/**
 * Client-boundary test: drives the real {@link NavigationPolicyPlugin#shouldOverrideLoad} and
 * observes both its return value and any system {@code ACTION_VIEW} intent it actually dispatched
 * through a real (Robolectric-shadowed) {@code Context#startActivity}. Runs once per flavor.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = { 33 })
public class NavigationPolicyPluginTest {

    private NavigationPolicyPlugin plugin;
    private ShadowActivity shadowActivity;

    @Before
    public void setUp() throws Exception {
        Activity activity = Robolectric.buildActivity(Activity.class).create().get();
        shadowActivity = shadowOf(activity);

        Bridge bridge = mock(Bridge.class);
        when(bridge.getContext()).thenReturn(activity);

        plugin = new NavigationPolicyPlugin();
        Field bridgeField = Plugin.class.getDeclaredField("bridge");
        bridgeField.setAccessible(true);
        bridgeField.set(plugin, bridge);
    }

    // Kill: trusted first-party origin is blocked from continuing to load in the WebView.
    @Test
    public void trustedOriginContinuesInWebViewWithNoIntent() {
        Boolean overridden = plugin.shouldOverrideLoad(Uri.parse(ShellVariant.startUrl()));
        assertFalse("trusted origin must not be overridden", overridden);
        assertNull("trusted origin must not launch a system intent", shadowActivity.getNextStartedActivity());
    }

    // Kill: an ordinary untrusted https(s) link fails to leave the app (stays silently blocked or loads in WebView).
    @Test
    public void untrustedHttpsDispatchesExactlyOneSystemViewIntentAndBlocksWebView() {
        Uri url = Uri.parse("https://example.com/somewhere");
        Boolean overridden = plugin.shouldOverrideLoad(url);
        assertTrue("untrusted https must not load in the WebView", overridden);

        Intent started = shadowActivity.getNextStartedActivity();
        assertEqualsIntent(url, started);
        assertNull("exactly one intent must be dispatched", shadowActivity.getNextStartedActivity());
    }

    // Kill: cleartext http external link is dropped instead of dispatched.
    @Test
    public void untrustedHttpDispatchesSystemViewIntent() {
        Uri url = Uri.parse("http://example.com/somewhere");
        Boolean overridden = plugin.shouldOverrideLoad(url);
        assertTrue(overridden);
        assertEqualsIntent(url, shadowActivity.getNextStartedActivity());
    }

    // Kill: mailto is blocked instead of dispatched externally.
    @Test
    public void mailtoDispatchesSystemViewIntent() {
        Uri url = Uri.parse("mailto:care@therapysto.ru");
        Boolean overridden = plugin.shouldOverrideLoad(url);
        assertTrue(overridden);
        assertEqualsIntent(url, shadowActivity.getNextStartedActivity());
    }

    // Kill: tel is blocked instead of dispatched externally.
    @Test
    public void telDispatchesSystemViewIntent() {
        Uri url = Uri.parse("tel:+70000000000");
        Boolean overridden = plugin.shouldOverrideLoad(url);
        assertTrue(overridden);
        assertEqualsIntent(url, shadowActivity.getNextStartedActivity());
    }

    // Kill: javascript: reaches the WebView or an external intent instead of being dropped silently.
    @Test
    public void javascriptSchemeIsRejectedWithNeitherLoadNorIntent() {
        Boolean overridden = plugin.shouldOverrideLoad(Uri.parse("javascript:alert(document.cookie)"));
        assertTrue("javascript: must never be allowed to load in the WebView", overridden);
        assertNull("javascript: must not be handed to any app", shadowActivity.getNextStartedActivity());
    }

    // Kill: intent: is rejected only from the WebView but escapes to a system intent anyway.
    @Test
    public void intentSchemeIsRejectedWithNeitherLoadNorIntent() {
        Uri url = Uri.parse("intent://scan/#Intent;scheme=zxing;package=com.evil;end");
        Boolean overridden = plugin.shouldOverrideLoad(url);
        assertTrue(overridden);
        assertNull(shadowActivity.getNextStartedActivity());
    }

    // Kill: file: reaches WebView load or an external intent.
    @Test
    public void fileSchemeIsRejectedWithNeitherLoadNorIntent() {
        Boolean overridden = plugin.shouldOverrideLoad(Uri.parse("file:///etc/hosts"));
        assertTrue(overridden);
        assertNull(shadowActivity.getNextStartedActivity());
    }

    // Kill: content: reaches WebView load or an external intent.
    @Test
    public void contentSchemeIsRejectedWithNeitherLoadNorIntent() {
        Boolean overridden = plugin.shouldOverrideLoad(Uri.parse("content://com.evil.provider/secret"));
        assertTrue(overridden);
        assertNull(shadowActivity.getNextStartedActivity());
    }

    // Kill: data: reaches WebView load or an external intent.
    @Test
    public void dataSchemeIsRejectedWithNeitherLoadNorIntent() {
        Boolean overridden = plugin.shouldOverrideLoad(Uri.parse("data:text/html,<script>alert(1)</script>"));
        assertTrue(overridden);
        assertNull(shadowActivity.getNextStartedActivity());
    }

    // Kill: null URL crashes, or is treated as trusted/dispatched instead of failing closed.
    @Test
    public void nullUrlIsRejectedWithoutThrowingOrDispatching() {
        Boolean overridden = plugin.shouldOverrideLoad(null);
        assertTrue(overridden);
        assertNull(shadowActivity.getNextStartedActivity());
    }

    // Kill: "https://trusted-host@evil" (userinfo trick) is treated as trusted or dispatched externally.
    @Test
    public void userInfoTrickIsRejectedWithNeitherLoadNorIntent() {
        String host = Uri.parse(ShellVariant.origin()).getHost();
        Boolean overridden = plugin.shouldOverrideLoad(Uri.parse("https://" + host + "@evil.example/steal"));
        assertTrue("userinfo trick must not be allowed to load in the WebView", overridden);
        assertNull("userinfo trick must not be dispatched externally either", shadowActivity.getNextStartedActivity());
    }

    // Kill: an unknown custom scheme (not http/https/mailto/tel) is dispatched externally instead of dropped.
    @Test
    public void unknownCustomSchemeIsRejectedWithNeitherLoadNorIntent() {
        Boolean overridden = plugin.shouldOverrideLoad(Uri.parse("myapp://open?x=1"));
        assertTrue(overridden);
        assertNull(shadowActivity.getNextStartedActivity());
    }

    private static void assertEqualsIntent(Uri expectedUrl, Intent started) {
        assertTrue("expected a system intent to be started", started != null);
        assertEquals(Intent.ACTION_VIEW, started.getAction());
        assertEquals(expectedUrl, started.getData());
    }
}
