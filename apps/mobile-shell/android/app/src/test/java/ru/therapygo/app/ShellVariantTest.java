package ru.therapygo.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/**
 * Independent oracle for {@link ShellVariant}: literal expected origins/start URLs taken from the
 * committed flavor matrix in {@code apps/mobile-shell/README.md}, not derived from the class under
 * test. This is what makes {@code TrustedOriginGateTest}/{@code NavigationPolicyPluginTest} (which
 * build their expectations from {@code ShellVariant.origin()}) non-circular: if {@code ShellVariant}
 * itself picked the wrong origin for its own variant, only this test would catch it.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = { 33 })
public class ShellVariantTest {

    // Kill: this build's own flavor/environment combination resolves to the wrong origin or start path.
    @Test
    public void resolvesExactOriginAndStartUrlForThisVariant() {
        String brand = BuildConfig.SHELL_BRAND;
        String environment = BuildConfig.SHELL_ENVIRONMENT;
        boolean isTest = "test".equals(environment);
        String host = "therapygo".equals(brand) ? "therapygo.ru" : "therapysto.ru";
        String path = "therapygo".equals(brand) ? "/app/patient" : "/app/doctor";
        String expectedOrigin = "https://" + (isTest ? "test." : "") + host;

        assertEquals(expectedOrigin, ShellVariant.origin());
        assertEquals(expectedOrigin + path, ShellVariant.startUrl());
    }
}
