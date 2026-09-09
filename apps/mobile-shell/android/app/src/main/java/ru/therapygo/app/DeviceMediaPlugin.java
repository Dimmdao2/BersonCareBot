package ru.therapygo.app;

import android.Manifest;
import android.content.Intent;
import android.database.Cursor;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FilterInputStream;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONException;

/** Opaque native media handles; JavaScript never receives a URI, path, or file bytes. */
@CapacitorPlugin(
    name = "DeviceMedia",
    permissions = {
        @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }),
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
    }
)
public final class DeviceMediaPlugin extends Plugin {
    private static final int MAX_MIME_TYPES = 12;
    private static final String DOCUMENT_MIME_PATTERN =
        "application/(pdf|msword|vnd\\.openxmlformats-officedocument\\.wordprocessingml\\.document|vnd\\.ms-excel|vnd\\.openxmlformats-officedocument\\.spreadsheetml\\.sheet)|text/plain";
    private final Map<String, MediaHandle> handles = Collections.synchronizedMap(new LinkedHashMap<>());
    private volatile HttpsURLConnection activeUpload;
    private final java.util.concurrent.atomic.AtomicBoolean uploading = new java.util.concurrent.atomic.AtomicBoolean(false);

    @PluginMethod
    public void captureMedia(PluginCall call) {
        if (!trusted(call)) return;
        String kind = call.getString("kind", "");
        if (!"photo".equals(kind) && !"video".equals(kind)) {
            call.reject("Invalid capture kind");
            return;
        }
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "onCapturePermissions");
            return;
        }
        if ("video".equals(kind) && getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "onCapturePermissions");
            return;
        }
        Intent intent = new Intent(getContext(), CameraCaptureActivity.class);
        intent.putExtra(CameraCaptureActivity.EXTRA_INITIAL_KIND, kind);
        startActivityForResult(call, intent, "onCaptureResult");
    }

    @PermissionCallback
    private void onCapturePermissions(PluginCall call) {
        if (!trusted(call)) return;
        String kind = call.getString("kind", "");
        boolean cameraGranted = getPermissionState("camera") == PermissionState.GRANTED;
        boolean microphoneGranted = !"video".equals(kind) || getPermissionState("microphone") == PermissionState.GRANTED;
        if (!cameraGranted || !microphoneGranted) {
            call.resolve(cancelled("permission_denied"));
            return;
        }
        captureMedia(call);
    }

    @ActivityCallback
    private void onCaptureResult(PluginCall call, ActivityResult result) {
        if (call == null || !trusted(call)) return;
        if (result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null) {
            call.resolve(cancelled("cancelled"));
            return;
        }
        Intent data = result.getData();
        Uri uri = data.getData();
        String kind = data.getStringExtra(CameraCaptureActivity.EXTRA_RESULT_KIND);
        resolveHandle(call, uri, "camera", kind == null ? "photo" : kind, false);
    }

    @PluginMethod
    public void pickMedia(PluginCall call) {
        if (!trusted(call)) return;
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent = new Intent(MediaStore.ACTION_PICK_IMAGES);
            intent.setType("*/*");
            intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "image/*", "video/*" });
        } else {
            intent = openDocumentIntent(new String[] { "image/*", "video/*" });
        }
        startActivityForResult(call, intent, "onMediaPicked");
    }

    @ActivityCallback
    private void onMediaPicked(PluginCall call, ActivityResult result) {
        if (call == null || !trusted(call)) return;
        if (result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null) {
            call.resolve(cancelled("cancelled"));
            return;
        }
        Uri uri = result.getData().getData();
        resolveHandle(call, uri, "gallery", "media", call.getBoolean("requiresDuration", false));
    }

    @PluginMethod
    public void pickDocument(PluginCall call) {
        if (!trusted(call)) return;
        String[] mimeTypes = documentMimeTypes(call);
        if (mimeTypes == null) {
            call.reject("Invalid document MIME allowlist");
            return;
        }
        startActivityForResult(call, openDocumentIntent(mimeTypes), "onDocumentPicked");
    }

    @ActivityCallback
    private void onDocumentPicked(PluginCall call, ActivityResult result) {
        if (call == null || !trusted(call)) return;
        if (result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null) {
            call.resolve(cancelled("cancelled"));
            return;
        }
        resolveHandle(call, result.getData().getData(), "document", "document", false);
    }

    @PluginMethod
    public void upload(PluginCall call) {
        if (!trusted(call)) return;
        String handle = call.getString("handle", "");
        long offset = call.getLong("offset", -1L);
        long length = call.getLong("length", -1L);
        String presignedUrl = call.getString("presignedUrl", "");
        MediaHandle media = handles.get(handle);
        if (media == null || offset < 0 || length < 0 || offset + length > media.sizeBytes || !allowedUploadUrl(presignedUrl)) {
            call.reject("Invalid upload request");
            return;
        }
        JSObject headers = call.getObject("headers", new JSObject());
        if (!allowedHeaders(headers)) {
            call.reject("Invalid signed upload headers");
            return;
        }
        // One upload at a time: a second call while one is in flight must never replace the shared
        // `activeUpload` connection out from under `cancelUpload()`, nor race its own `finally` clear.
        if (!uploading.compareAndSet(false, true)) {
            call.reject("An upload is already in progress");
            return;
        }
        new Thread(() -> streamRange(call, media, offset, length, presignedUrl, headers), "device-media-upload").start();
    }

    @PluginMethod
    public void cancelUpload(PluginCall call) {
        if (!trusted(call)) return;
        HttpsURLConnection connection = activeUpload;
        if (connection != null) connection.disconnect();
        call.resolve(outcome("cancelled"));
    }

    @PluginMethod
    public void release(PluginCall call) {
        if (!trusted(call)) return;
        MediaHandle media = handles.remove(call.getString("handle", ""));
        if (media != null) media.delete();
        call.resolve(outcome("released"));
    }

    private void streamRange(PluginCall call, MediaHandle media, long offset, long length, String rawUrl, JSObject headers) {
        HttpsURLConnection connection = null;
        try {
            connection = (HttpsURLConnection) new URL(rawUrl).openConnection();
            activeUpload = connection;
            connection.setInstanceFollowRedirects(false);
            connection.setRequestMethod("PUT");
            connection.setDoOutput(true);
            connection.setFixedLengthStreamingMode(length);
            applyHeaders(connection, headers);
            try (InputStream source = media.openAt(offset); java.io.OutputStream target = connection.getOutputStream()) {
                byte[] buffer = new byte[64 * 1024];
                long remaining = length;
                while (remaining > 0) {
                    int read = source.read(buffer, 0, (int) Math.min(buffer.length, remaining));
                    if (read < 0) throw new IOException("Unexpected end of selected media");
                    target.write(buffer, 0, read);
                    remaining -= read;
                }
            }
            int status = connection.getResponseCode();
            String etag = connection.getHeaderField("ETag");
            // Only an HTTP 2xx with the ETag this range's future complete/finalize call requires counts
            // as uploaded; a followed-through redirect, 401/403/404/409/429, 5xx, or a 2xx missing its
            // required multipart ETag must never be handed to the caller as a successful part.
            if (status < 200 || status >= 300 || etag == null || etag.length() > 256) {
                call.resolve(uploadFailed(status));
            } else {
                JSObject result = outcome("uploaded");
                result.put("status", status);
                result.put("etag", etag);
                call.resolve(result);
            }
        } catch (IOException ignored) {
            call.resolve(outcome("upload_failed"));
        } finally {
            if (connection != null) connection.disconnect();
            activeUpload = null;
            uploading.set(false);
        }
    }

    private void resolveHandle(PluginCall call, Uri uri, String source, String requestedKind, boolean requiresDuration) {
        if (uri == null) {
            call.resolve(cancelled("cancelled"));
            return;
        }
        try {
            MediaHandle media = prepare(uri, source, requestedKind, requiresDuration);
            handles.put(media.handle, media);
            call.resolve(media.descriptor());
        } catch (IOException ignored) {
            call.resolve(outcome("metadata_failed"));
        }
    }

    private MediaHandle prepare(Uri uri, String source, String requestedKind, boolean requiresDuration) throws IOException {
        String mime = getContext().getContentResolver().getType(uri);
        boolean allowedDocument = "document".equals(requestedKind) && isAllowedDocumentMime(mime);
        if (mime == null || !(mime.startsWith("image/") || mime.startsWith("video/") || allowedDocument)) {
            throw new IOException("Unsupported selected type");
        }
        Metadata metadata = metadata(uri);
        File materialized = null;
        boolean seekable = canSeek(uri);
        long size = metadata.sizeBytes;
        if (size < 0 || !seekable) {
            materialized = copyToPrivateFile(uri);
            size = materialized.length();
        }
        Long duration = null;
        if (mime.startsWith("video/")) duration = durationSeconds(materialized == null ? uri : Uri.fromFile(materialized));
        if (requiresDuration && duration == null) throw new IOException("Video duration unavailable");
        String kind = mime.startsWith("video/") ? "video" : mime.startsWith("image/") ? "photo" : "document";
        return new MediaHandle(UUID.randomUUID().toString(), uri, materialized, mime, metadata.displayName, size, duration, source, kind);
    }

    private Metadata metadata(Uri uri) {
        String name = "selected-file";
        long size = -1L;
        try (Cursor cursor = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (nameIndex >= 0 && !cursor.isNull(nameIndex)) name = cursor.getString(nameIndex);
                if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex);
            }
        }
        return new Metadata(name, size);
    }

    private boolean canSeek(Uri uri) {
        try (android.os.ParcelFileDescriptor descriptor = getContext().getContentResolver().openFileDescriptor(uri, "r")) {
            return descriptor != null && descriptor.getStatSize() >= 0;
        } catch (IOException ignored) {
            return false;
        }
    }

    private File copyToPrivateFile(Uri uri) throws IOException {
        File output = File.createTempFile("selected-", ".bin", getContext().getCacheDir());
        try (InputStream input = getContext().getContentResolver().openInputStream(uri); FileOutputStream target = new FileOutputStream(output)) {
            if (input == null) throw new IOException("No selected stream");
            byte[] buffer = new byte[64 * 1024];
            for (int read; (read = input.read(buffer)) >= 0;) target.write(buffer, 0, read);
        }
        return output;
    }

    private Long durationSeconds(Uri uri) {
        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        try {
            retriever.setDataSource(getContext(), uri);
            String milliseconds = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            return milliseconds == null ? null : Math.max(1L, Long.parseLong(milliseconds) / 1000L);
        } catch (RuntimeException ignored) {
            return null;
        } finally {
            try {
                retriever.release();
            } catch (IOException ignored) {
                // Metadata remains unavailable; the caller receives the typed outcome.
            }
        }
    }

    private static Intent openDocumentIntent(String[] mimeTypes) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeTypes.length == 1 ? mimeTypes[0] : "*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes);
        return intent;
    }

    private String[] documentMimeTypes(PluginCall call) {
        JSArray values = call.getArray("mimeTypes", null);
        if (values == null || values.length() == 0 || values.length() > MAX_MIME_TYPES) return null;
        List<String> result = new ArrayList<>();
        for (int index = 0; index < values.length(); index++) {
            try {
                String mime = values.getString(index);
                if (!isAllowedDocumentMime(mime)) return null;
                result.add(mime);
            } catch (JSONException ignored) {
                return null;
            }
        }
        return result.toArray(new String[0]);
    }

    /**
     * The one narrow document-MIME allowlist, shared by the *request* filter ({@link #pickDocument})
     * and the *result* re-check ({@link #prepare}, MUST FIX-3): narrowing only the picker's request
     * filter never bound what a rogue/spoofed {@code DocumentsProvider} may hand back for the actual
     * pick, so both sides must agree on the same closed set.
     */
    private static boolean isAllowedDocumentMime(String mime) {
        return mime != null && mime.matches(DOCUMENT_MIME_PATTERN);
    }

    private boolean allowedUploadUrl(String rawUrl) {
        try {
            URL url = new URL(rawUrl);
            return "https".equals(url.getProtocol())
                && url.getUserInfo() == null
                && url.getPort() == -1
                && ShellVariant.isAllowedUploadHost(url.getHost());
        } catch (Exception ignored) {
            return false;
        }
    }

    private static boolean allowedHeaders(JSObject headers) {
        java.util.Iterator<String> keys = headers.keys();
        while (keys.hasNext()) {
            String key = keys.next().toLowerCase(java.util.Locale.ROOT);
            if (!(key.equals("content-type") || key.equals("content-length") || key.equals("content-md5")
                || key.equals("authorization") || key.startsWith("x-amz-") || key.startsWith("x-goog-"))) return false;
        }
        return true;
    }

    private static void applyHeaders(HttpsURLConnection connection, JSObject headers) {
        java.util.Iterator<String> keys = headers.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            String value = headers.optString(key, "");
            if (value.length() <= 4096) connection.setRequestProperty(key, value);
        }
    }

    private boolean trusted(PluginCall call) {
        if (TrustedOriginGate.isTrusted(getBridge().getWebView())) return true;
        call.reject("Unavailable from this page");
        return false;
    }

    private static JSObject cancelled(String reason) {
        JSObject result = outcome("cancelled");
        result.put("reason", reason);
        return result;
    }

    private static JSObject uploadFailed(int status) {
        JSObject result = outcome("upload_failed");
        result.put("status", status);
        return result;
    }

    private static JSObject outcome(String outcome) {
        JSObject result = new JSObject();
        result.put("outcome", outcome);
        return result;
    }

    private final class MediaHandle {
        final String handle;
        final Uri uri;
        final File materialized;
        final String mimeType;
        final String displayName;
        final long sizeBytes;
        final Long durationSeconds;
        final String source;
        final String kind;

        MediaHandle(String handle, Uri uri, File materialized, String mimeType, String displayName, long sizeBytes, Long durationSeconds, String source, String kind) {
            this.handle = handle;
            this.uri = uri;
            this.materialized = materialized;
            this.mimeType = mimeType;
            this.displayName = displayName;
            this.sizeBytes = sizeBytes;
            this.durationSeconds = durationSeconds;
            this.source = source;
            this.kind = kind;
        }

        InputStream openAt(long offset) throws IOException {
            if (materialized != null) {
                FileInputStream input = new FileInputStream(materialized);
                input.getChannel().position(offset);
                return input;
            }
            android.os.ParcelFileDescriptor descriptor = getContext().getContentResolver().openFileDescriptor(uri, "r");
            if (descriptor == null) throw new IOException("Unavailable selected media");
            FileInputStream input = new FileInputStream(descriptor.getFileDescriptor());
            input.getChannel().position(offset);
            return new FilterInputStream(input) {
                @Override public void close() throws IOException {
                    try {
                        super.close();
                    } finally {
                        descriptor.close();
                    }
                }
            };
        }

        JSObject descriptor() {
            JSObject result = outcome("selected");
            result.put("handle", handle);
            result.put("mimeType", mimeType);
            result.put("displayName", displayName);
            result.put("sizeBytes", sizeBytes);
            if (durationSeconds != null) result.put("durationSeconds", durationSeconds);
            result.put("source", source);
            result.put("kind", kind);
            return result;
        }

        void delete() {
            if (materialized != null) {
                materialized.delete();
            } else if ("camera".equals(source)) {
                // CameraCaptureActivity writes only to this app's cache through our FileProvider.
                // Ask that provider to remove the backing file when the opaque handle is released.
                getContext().getContentResolver().delete(uri, null, null);
            }
        }
    }

    private static final class Metadata {
        final String displayName;
        final long sizeBytes;
        Metadata(String displayName, long sizeBytes) {
            this.displayName = displayName;
            this.sizeBytes = sizeBytes;
        }
    }
}
