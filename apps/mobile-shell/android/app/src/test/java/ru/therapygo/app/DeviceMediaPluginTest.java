package ru.therapygo.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import java.io.File;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/**
 * Exercises {@link DeviceMediaPlugin}'s origin gate (kill-set #1), the upload URL/header
 * allowlists (kill-set #7/#8) and the document MIME contract (kill-set #6) through reflection
 * plus a fully mocked {@link Context}/{@link ContentResolver}, since these are the cheapest public
 * seams that see the named faults — no CameraX/picker Activity is started by any test here.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = { 33 })
public class DeviceMediaPluginTest {

    private DeviceMediaPlugin plugin;
    private WebView webView;

    @Before
    public void setUp() throws Exception {
        webView = mock(WebView.class);
        Bridge bridge = mock(Bridge.class);
        when(bridge.getWebView()).thenReturn(webView);

        plugin = new DeviceMediaPlugin();
        Field bridgeField = Plugin.class.getDeclaredField("bridge");
        bridgeField.setAccessible(true);
        bridgeField.set(plugin, bridge);
    }

    private void untrustedOrigin() {
        when(webView.getUrl()).thenReturn("https://evil.example/");
    }

    // Kill: any of the 6 public methods reaches a picker/file read/network call from an untrusted page.
    @Test
    public void captureMediaRejectsWhenOriginUntrusted() {
        untrustedOrigin();
        PluginCall call = mock(PluginCall.class);
        plugin.captureMedia(call);
        verify(call).reject(anyString());
        verify(call, never()).resolve(any(JSObject.class));
    }

    @Test
    public void pickMediaRejectsWhenOriginUntrusted() {
        untrustedOrigin();
        PluginCall call = mock(PluginCall.class);
        plugin.pickMedia(call);
        verify(call).reject(anyString());
    }

    @Test
    public void pickDocumentRejectsWhenOriginUntrusted() {
        untrustedOrigin();
        PluginCall call = mock(PluginCall.class);
        plugin.pickDocument(call);
        verify(call).reject(anyString());
    }

    @Test
    public void uploadRejectsWhenOriginUntrusted() {
        untrustedOrigin();
        PluginCall call = mock(PluginCall.class);
        plugin.upload(call);
        verify(call).reject(anyString());
    }

    @Test
    public void cancelUploadRejectsWhenOriginUntrusted() {
        untrustedOrigin();
        PluginCall call = mock(PluginCall.class);
        plugin.cancelUpload(call);
        verify(call).reject(anyString());
        verify(call, never()).resolve(any(JSObject.class));
    }

    @Test
    public void releaseRejectsWhenOriginUntrusted() {
        untrustedOrigin();
        PluginCall call = mock(PluginCall.class);
        plugin.release(call);
        verify(call).reject(anyString());
        verify(call, never()).resolve(any(JSObject.class));
    }

    // --- documentMimeTypes (request-side allowlist) ---------------------------------------------

    private String[] invokeDocumentMimeTypes(PluginCall call) throws Exception {
        Method method = DeviceMediaPlugin.class.getDeclaredMethod("documentMimeTypes", PluginCall.class);
        method.setAccessible(true);
        return (String[]) method.invoke(plugin, call);
    }

    private static JSArray jsArrayOf(String... values) {
        JSArray array = new JSArray();
        for (String value : values) array.put(value);
        return array;
    }

    @Test
    public void documentMimeTypesAcceptsTheDocumentedNarrowSet() throws Exception {
        PluginCall call = mock(PluginCall.class);
        when(call.getArray(eq("mimeTypes"), isNull())).thenReturn(jsArrayOf("application/pdf"));
        assertNotNull(invokeDocumentMimeTypes(call));
    }

    // Kill: an arbitrary/unsafe MIME (e.g. an installable package) is accepted into the picker's request filter.
    @Test
    public void documentMimeTypesRejectsMimeOutsideTheNarrowAllowlist() throws Exception {
        PluginCall call = mock(PluginCall.class);
        when(call.getArray(eq("mimeTypes"), isNull())).thenReturn(jsArrayOf("application/vnd.android.package-archive"));
        assertNull(invokeDocumentMimeTypes(call));
    }

    @Test
    public void documentMimeTypesRejectsEmptyOrOversizedAllowlist() throws Exception {
        PluginCall emptyCall = mock(PluginCall.class);
        when(emptyCall.getArray(eq("mimeTypes"), isNull())).thenReturn(jsArrayOf());
        assertNull(invokeDocumentMimeTypes(emptyCall));

        String[] tooMany = new String[13];
        for (int index = 0; index < tooMany.length; index++) tooMany[index] = "application/pdf";
        PluginCall oversizedCall = mock(PluginCall.class);
        when(oversizedCall.getArray(eq("mimeTypes"), isNull())).thenReturn(jsArrayOf(tooMany));
        assertNull(invokeDocumentMimeTypes(oversizedCall));
    }

    // --- allowedUploadUrl / allowedHeaders (kill-set #7/#8) -------------------------------------

    private boolean invokeAllowedUploadUrl(String url) throws Exception {
        Method method = DeviceMediaPlugin.class.getDeclaredMethod("allowedUploadUrl", String.class);
        method.setAccessible(true);
        return (Boolean) method.invoke(plugin, url);
    }

    private static boolean invokeAllowedHeaders(JSObject headers) throws Exception {
        Method method = DeviceMediaPlugin.class.getDeclaredMethod("allowedHeaders", JSObject.class);
        method.setAccessible(true);
        return (Boolean) method.invoke(null, headers);
    }

    private static String allowedHostForThisEnvironment() {
        return "test".equals(BuildConfig.SHELL_ENVIRONMENT) ? "fs.bersonservices.ru" : "s3.ru-7.storage.selcloud.ru";
    }

    @Test
    public void allowedUploadUrlAcceptsTheCompiledStorageHost() throws Exception {
        assertTrue(invokeAllowedUploadUrl("https://" + allowedHostForThisEnvironment() + "/bucket/key?X-Amz-Signature=abc"));
    }

    @Test
    public void allowedUploadUrlRejectsCleartext() throws Exception {
        assertFalse(invokeAllowedUploadUrl("http://" + allowedHostForThisEnvironment() + "/bucket/key"));
    }

    @Test
    public void allowedUploadUrlRejectsNonDefaultPort() throws Exception {
        assertFalse(invokeAllowedUploadUrl("https://" + allowedHostForThisEnvironment() + ":8443/bucket/key"));
    }

    @Test
    public void allowedUploadUrlRejectsUserInfo() throws Exception {
        assertFalse(invokeAllowedUploadUrl("https://attacker:pw@" + allowedHostForThisEnvironment() + "/bucket/key"));
    }

    @Test
    public void allowedUploadUrlRejectsNonAllowlistedHost() throws Exception {
        assertFalse(invokeAllowedUploadUrl("https://evil.example/bucket/key"));
    }

    @Test
    public void allowedUploadUrlRejectsMalformedUrl() throws Exception {
        assertFalse(invokeAllowedUploadUrl("not a url"));
    }

    @Test
    public void allowedHeadersAcceptsTheSignedSet() throws Exception {
        JSObject headers = new JSObject();
        headers.put("Content-Type", "image/jpeg");
        headers.put("x-amz-date", "20260909T000000Z");
        assertTrue(invokeAllowedHeaders(headers));
    }

    // Kill: an arbitrary/unsigned header (e.g. Cookie, X-Forwarded-For) is forwarded to the storage host.
    @Test
    public void allowedHeadersRejectsUnknownHeaderKey() throws Exception {
        JSObject headers = new JSObject();
        headers.put("Cookie", "session=abc");
        assertFalse(invokeAllowedHeaders(headers));

        JSObject spoofedForward = new JSObject();
        spoofedForward.put("X-Forwarded-For", "127.0.0.1");
        assertFalse(invokeAllowedHeaders(spoofedForward));
    }

    // --- prepare(): document MIME re-validation on the result side (kill-set #6) ----------------

    private static Cursor cursorWithNameAndSize(String name, long size) {
        Cursor cursor = mock(Cursor.class);
        when(cursor.moveToFirst()).thenReturn(true);
        when(cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)).thenReturn(0);
        when(cursor.getColumnIndex(OpenableColumns.SIZE)).thenReturn(1);
        when(cursor.isNull(0)).thenReturn(false);
        when(cursor.isNull(1)).thenReturn(false);
        when(cursor.getString(0)).thenReturn(name);
        when(cursor.getLong(1)).thenReturn(size);
        return cursor;
    }

    // Kill (MUST FIX-3, present in the candidate — not injected): a rogue/spoofed DocumentsProvider
    // reports a MIME type outside the narrow allowlist `documentMimeTypes()` enforces on the request
    // side (e.g. an installable package). `prepare()` only rejects a literal `null` MIME for the
    // "document" request kind, so anything else — including a MIME the JS caller never allowlisted —
    // is packaged into a "selected" descriptor instead of failing safely.
    @Test
    public void prepareRejectsADocumentMimeOutsideTheNarrowAllowlistEvenWhenTheProviderReportsOne() throws Exception {
        Uri uri = Uri.parse("content://spoofed.documents/document/1");
        Context context = mock(Context.class);
        ContentResolver resolver = mock(ContentResolver.class);
        when(context.getContentResolver()).thenReturn(resolver);
        Bridge bridge = mock(Bridge.class);
        when(bridge.getContext()).thenReturn(context);
        Field bridgeField = Plugin.class.getDeclaredField("bridge");
        bridgeField.setAccessible(true);
        bridgeField.set(plugin, bridge);

        // A rogue provider claims this is an installable Android package, not one of the six
        // narrow document MIME types the JS caller allowlisted when it opened the picker.
        when(resolver.getType(uri)).thenReturn("application/vnd.android.package-archive");
        Cursor cursor = cursorWithNameAndSize("totally-a-report.pdf", 2048L);
        when(resolver.query(eq(uri), any(String[].class), isNull(), isNull(), isNull())).thenReturn(cursor);
        ParcelFileDescriptor descriptor = mock(ParcelFileDescriptor.class);
        when(descriptor.getStatSize()).thenReturn(2048L);
        when(resolver.openFileDescriptor(uri, "r")).thenReturn(descriptor);

        Method prepare = DeviceMediaPlugin.class.getDeclaredMethod("prepare", Uri.class, String.class, String.class, boolean.class);
        prepare.setAccessible(true);
        try {
            Object handle = prepare.invoke(plugin, uri, "document", "document", false);
            fail(
                "prepare() must reject a document whose actual MIME (" + "application/vnd.android.package-archive"
                    + ") is outside the narrow allowlist instead of returning a handle: " + handle
            );
        } catch (InvocationTargetException expectedWrapper) {
            assertTrue(
                "expected an IOException (or subclass) for an out-of-allowlist document MIME, got: " + expectedWrapper.getCause(),
                expectedWrapper.getCause() instanceof java.io.IOException
            );
        }
    }

    // --- upload(): single-flight guard (kill-set brief item 5, concurrency) ---------------------
    //
    // The HTTP status/ETag classification in streamRange() (2xx-only, non-empty-ETag-required,
    // redirects not followed) is confirmed by inspection, not a live-network test: this sandbox's
    // JVM has Robolectric's Conscrypt security provider registered ahead of the JDK's own SunJSSE
    // (`Security.getProviders()[0] == "Conscrypt"`), and both are independently broken for a real
    // local TLS handshake here — Conscrypt's socket implementation throws
    // `InaccessibleObjectException` reflecting into `java.net.InetAddress` internals the module
    // system closes off on a plain (non-Android) JVM, and forcing SunJSSE explicitly instead hits
    // `sun.security.ssl.NamedGroup`'s static initializer, which unconditionally resolves
    // `AlgorithmParameters.getInstance("EC")` without a provider qualifier and gets routed back into
    // the same broken Conscrypt EC engine by provider-priority lookup. Reaching for a JVM-wide
    // `Security.removeProvider`/`URL.setURLStreamHandlerFactory` workaround to force a clean TLS
    // stack would mutate process-global state for the rest of this test run to cover three lines of
    // linear boolean logic (`status<200||status>=300||etag==null||etag.length()>256`) that is easy
    // to read directly — the same proportionality call the shell-foundation and native-capabilities
    // audits already made for CameraX/Jitsi permission-grant simulation. See the final report for
    // the one residual gap this inspection found (empty, non-null ETag).

    private Object fakeMediaHandle(File materialized, long sizeBytes) throws Exception {
        Class<?> handleClass = Class.forName("ru.therapygo.app.DeviceMediaPlugin$MediaHandle");
        Constructor<?> constructor = handleClass.getDeclaredConstructor(
            DeviceMediaPlugin.class, String.class, Uri.class, File.class, String.class, String.class,
            long.class, Long.class, String.class, String.class
        );
        constructor.setAccessible(true);
        return constructor.newInstance(
            plugin, "handle-1", Uri.parse("content://selected/1"), materialized, "image/jpeg",
            "photo.jpg", sizeBytes, null, "gallery", "photo"
        );
    }

    private AtomicBoolean uploadingFlag() throws Exception {
        Field field = DeviceMediaPlugin.class.getDeclaredField("uploading");
        field.setAccessible(true);
        return (AtomicBoolean) field.get(plugin);
    }

    // Kill: a second upload() call while one is already in flight replaces/races the shared
    // activeUpload connection instead of being rejected outright.
    @Test
    public void uploadRejectsASecondCallWhileOneIsAlreadyInProgress() throws Exception {
        uploadingFlag().set(true); // simulate a first upload already streaming on its own thread
        PluginCall call = mock(PluginCall.class);
        when(call.getString(eq("handle"), anyString())).thenReturn("handle-1");
        when(call.getLong(eq("offset"), org.mockito.ArgumentMatchers.anyLong())).thenReturn(0L);
        when(call.getLong(eq("length"), org.mockito.ArgumentMatchers.anyLong())).thenReturn(10L);
        when(call.getString(eq("presignedUrl"), anyString()))
            .thenReturn("https://" + allowedHostForThisEnvironment() + "/bucket/key?X-Amz-Signature=abc");
        when(call.getObject(eq("headers"), any(JSObject.class))).thenReturn(new JSObject());
        untrustedOriginIsFalse();

        // A handle must exist for the request to reach the concurrency guard at all.
        Field handlesField = DeviceMediaPlugin.class.getDeclaredField("handles");
        handlesField.setAccessible(true);
        java.util.Map<String, Object> handles = (java.util.Map<String, Object>) handlesField.get(plugin);
        File source = File.createTempFile("upload-src", ".bin");
        Files.write(source.toPath(), new byte[10]);
        handles.put("handle-1", fakeMediaHandle(source, 10L));

        plugin.upload(call);

        verify(call).reject("An upload is already in progress");
    }

    private void untrustedOriginIsFalse() {
        when(webView.getUrl()).thenReturn(ShellVariant.startUrl());
    }
}
