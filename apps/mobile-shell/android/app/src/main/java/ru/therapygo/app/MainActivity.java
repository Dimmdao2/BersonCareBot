package ru.therapygo.app;

import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;
import com.getcapacitor.WebViewListener;

/**
 * Uses Capacitor's BridgeActivity and BridgeWebViewClient unchanged. The added
 * navigation plugin is called by Capacitor's normal shouldOverrideLoad hook.
 */
public final class MainActivity extends BridgeActivity {
    private View statusOverlay;
    private String startUrl;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        startUrl = ShellVariant.startUrl();
        config = new CapConfig.Builder(this)
            .setServerUrl(ShellVariant.origin())
            .setStartPath(BuildConfig.SHELL_START_PATH)
            .setAllowNavigation(new String[] { ShellVariant.origin() })
            .setAllowMixedContent(false)
            .setWebContentsDebuggingEnabled(BuildConfig.SHELL_DEBUG)
            .setLoggingEnabled(BuildConfig.SHELL_DEBUG)
            .create();
        registerPlugin(NavigationPolicyPlugin.class);
        registerPlugin(ShellRuntimePlugin.class);
        registerPlugin(NativeJitsiPlugin.class);
        registerPlugin(DeviceMediaPlugin.class);
        registerPlugin(UniversalPushPlugin.class);
        bridgeBuilder.addWebViewListener(new ShellWebViewListener());
        super.onCreate(savedInstanceState);
        bridge.setWebViewClient(new MainFrameAwareWebViewClient());
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (bridge != null && bridge.getWebView().canGoBack()) {
                    bridge.getWebView().goBack();
                } else {
                    finish();
                }
            }
        });
        addStatusOverlay();
    }

    private void addStatusOverlay() {
        FrameLayout root = findViewById(android.R.id.content);
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setPadding(48, 48, 48, 48);
        panel.setBackgroundColor(Color.rgb(11, 36, 88));
        TextView message = new TextView(this);
        message.setId(View.generateViewId());
        message.setTextColor(Color.WHITE);
        message.setTextSize(18);
        message.setText("Connecting securely…");
        panel.addView(message);
        Button retry = new Button(this);
        retry.setText("Retry");
        retry.setVisibility(View.GONE);
        retry.setOnClickListener(view -> retryStartPage());
        panel.addView(retry);
        root.addView(panel, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        statusOverlay = panel;
    }

    private void showUnavailable() {
        if (statusOverlay == null) return;
        TextView message = (TextView) ((ViewGroup) statusOverlay).getChildAt(0);
        Button retry = (Button) ((ViewGroup) statusOverlay).getChildAt(1);
        message.setText("Server unavailable. Your clinical data is not available offline.");
        retry.setVisibility(View.VISIBLE);
        statusOverlay.setVisibility(View.VISIBLE);
    }

    private void retryStartPage() {
        if (bridge != null) bridge.getWebView().loadUrl(startUrl);
    }

    private final class ShellWebViewListener extends WebViewListener {
        @Override
        public void onPageCommitVisible(WebView view, String url) {
            if (TrustedOriginGate.isTrusted(url) && statusOverlay != null) {
                statusOverlay.setVisibility(View.GONE);
            }
        }

    }

    /** Capacitor's listener omits WebResourceRequest, so main-frame filtering belongs at this boundary. */
    private final class MainFrameAwareWebViewClient extends BridgeWebViewClient {
        MainFrameAwareWebViewClient() {
            super(bridge);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            super.onReceivedError(view, request, error);
            if (request.isForMainFrame()) showUnavailable();
        }

        @Override
        public void onReceivedHttpError(
            WebView view,
            WebResourceRequest request,
            WebResourceResponse errorResponse
        ) {
            super.onReceivedHttpError(view, request, errorResponse);
            if (request.isForMainFrame()) showUnavailable();
        }
    }
}
