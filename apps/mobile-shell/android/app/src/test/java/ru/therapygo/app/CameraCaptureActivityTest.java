package ru.therapygo.app;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import android.content.Intent;
import android.net.Uri;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/**
 * Documents the exact platform contract that makes {@link CameraCaptureActivity#complete} (kill-set
 * #5/#6, MASTER_PLAN M5-02) a defect, at the cheapest layer that sees it.
 *
 * <p>Reconstructing {@code complete()}'s own Robolectric harness would need a shadowed CameraX
 * provider (this project pins no CameraX Robolectric testing artifact) just to reach a two-line
 * method that touches no CameraX API at all — disproportionate machinery for what {@code Intent}'s
 * own contract already proves directly (§10a cost rule). The failing assertion below is the actual
 * platform behavior; the inspection note ties it to the exact production lines.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = { 33 })
public class CameraCaptureActivityTest {

    // Kill (MUST FIX-4, present in the candidate — not injected, proven by platform contract plus
    // inspection): android.content.Intent#setType(String) unconditionally clears any Uri previously
    // set via #setData(Uri) (and vice versa) — both setters are mutually exclusive by design; only
    // #setDataAndType(Uri, String) keeps both. `CameraCaptureActivity.complete(File, String)` (this
    // package, `CameraCaptureActivity.java:187-190`) does exactly the broken sequence:
    //   Intent data = new Intent();
    //   data.setData(uri);
    //   data.setType("video".equals(kind) ? "video/mp4" : "image/jpeg");
    // so the result Intent's `getData()` is always null by the time `setResult(RESULT_OK, data)` runs.
    // `DeviceMediaPlugin.onCaptureResult` (`DeviceMediaPlugin.java:94`) reads exactly that field —
    // `Uri uri = data.getData();` — and `resolveHandle` treats a null Uri as `cancelled("cancelled")`
    // (`DeviceMediaPlugin.java:216-219`). The two files agree on the wire shape; the wire shape itself
    // never carries the captured file. Every successful photo/video capture is reported to JS
    // identically to the user backing out — camera capture (M5-02) does not work at all.
    @Test
    public void intentSetTypeClearsAnyUriPreviouslySetViaSetData() {
        Uri uri = Uri.parse("content://ru.therapygo.app.test.fileprovider/my_cache_images/camera-1.jpg");
        Intent intent = new Intent();

        intent.setData(uri);
        assertNotNull("sanity: setData alone must set the Uri", intent.getData());

        intent.setType("image/jpeg");

        assertNull(
            "Intent#setType clears any Uri set via #setData — this is exactly why "
                + "CameraCaptureActivity.complete()'s setData(uri) followed by setType(mime) always "
                + "discards the captured file's Uri; use setDataAndType(uri, mime) instead",
            intent.getData()
        );
    }

    // Sanity/oracle for the fix direction named above: setDataAndType is the platform's own way to
    // carry both a Uri and a MIME type on the same Intent without one clearing the other.
    @Test
    public void setDataAndTypeCarriesBothUriAndMimeType() {
        Uri uri = Uri.parse("content://ru.therapygo.app.test.fileprovider/my_cache_images/camera-1.jpg");
        Intent intent = new Intent();

        intent.setDataAndType(uri, "image/jpeg");

        assertNotNull(intent.getData());
        assertNotNull(intent.getType());
    }
}
