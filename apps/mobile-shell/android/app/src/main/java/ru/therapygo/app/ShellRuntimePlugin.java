package ru.therapygo.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Runtime facts only; this is never an authorization, role, or organization claim. */
@CapacitorPlugin(name = "ShellRuntime")
public final class ShellRuntimePlugin extends Plugin {
    @PluginMethod
    public void getRuntimeInfo(PluginCall call) {
        if (!TrustedOriginGate.isTrusted(getBridge().getWebView())) {
            call.reject("Unavailable from this page");
            return;
        }
        JSObject capabilities = new JSObject();
        capabilities.put("jitsi", false);
        capabilities.put("media", false);
        capabilities.put("push", false);
        JSObject result = new JSObject();
        result.put("kind", "capacitor-android");
        result.put("version", BuildConfig.VERSION_NAME);
        result.put("brand", BuildConfig.SHELL_BRAND);
        result.put("capabilities", capabilities);
        call.resolve(result);
    }
}
