package android.print;

import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;

import java.io.File;

/**
 * Writes a WebView print adapter straight to a PDF file (no print dialog).
 * Lives in android.print because the result-callback constructors are not public in the SDK stubs.
 */
public final class NikaraPdfWriter {
    public interface Callback {
        void onSuccess(File file);
        void onFailure(String error);
    }

    private NikaraPdfWriter() {}

    public static void write(final PrintDocumentAdapter adapter, final PrintAttributes attributes, final File out, final Callback callback) {
        try {
            adapter.onStart();
            adapter.onLayout(null, attributes, new CancellationSignal(), new PrintDocumentAdapter.LayoutResultCallback() {
                @Override
                public void onLayoutFinished(PrintDocumentInfo info, boolean changed) {
                    final ParcelFileDescriptor pfd;
                    try {
                        pfd = ParcelFileDescriptor.open(out, ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_TRUNCATE | ParcelFileDescriptor.MODE_READ_WRITE);
                    } catch (Exception e) {
                        finish(adapter);
                        callback.onFailure("open: " + e);
                        return;
                    }
                    adapter.onWrite(new PageRange[]{PageRange.ALL_PAGES}, pfd, new CancellationSignal(), new PrintDocumentAdapter.WriteResultCallback() {
                        @Override
                        public void onWriteFinished(PageRange[] pages) {
                            close(pfd);
                            finish(adapter);
                            callback.onSuccess(out);
                        }

                        @Override
                        public void onWriteFailed(CharSequence error) {
                            close(pfd);
                            finish(adapter);
                            callback.onFailure("write: " + error);
                        }

                        @Override
                        public void onWriteCancelled() {
                            close(pfd);
                            finish(adapter);
                            callback.onFailure("write cancelled");
                        }
                    });
                }

                @Override
                public void onLayoutFailed(CharSequence error) {
                    finish(adapter);
                    callback.onFailure("layout: " + error);
                }

                @Override
                public void onLayoutCancelled() {
                    finish(adapter);
                    callback.onFailure("layout cancelled");
                }
            }, null);
        } catch (Throwable t) {
            callback.onFailure("pdf: " + t);
        }
    }

    private static void close(ParcelFileDescriptor pfd) {
        try { pfd.close(); } catch (Exception ignored) {}
    }

    private static void finish(PrintDocumentAdapter adapter) {
        try { adapter.onFinish(); } catch (Exception ignored) {}
    }
}
