package com.aicrm.offline;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.print.NikaraPdfWriter;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Invoice / proforma output for CRM-NIKARA:
 *  print  -> Android print dialog (printer or "Save as PDF")
 *  pdf    -> silent PDF file, then action: share | save | data
 */
@CapacitorPlugin(name = "NikaraPrint")
public class InvoicePrintPlugin extends Plugin {
    private WebView renderView; // strong reference while Chromium lays out the document
    private File pendingSaveFile;

    private static String safeName(String raw, String fallback) {
        String n = raw == null ? "" : raw.trim();
        if (n.isEmpty()) n = fallback;
        n = n.replaceAll("[\\\\/:*?\"<>|\\r\\n\\s]+", "-");
        if (!n.toLowerCase().endsWith(".pdf")) n = n + ".pdf";
        return n;
    }

    private PrintAttributes attributes(String paper) {
        PrintAttributes.MediaSize size = "A5".equalsIgnoreCase(paper) ? PrintAttributes.MediaSize.ISO_A5 : PrintAttributes.MediaSize.ISO_A4;
        return new PrintAttributes.Builder()
                .setMediaSize(size)
                .setResolution(new PrintAttributes.Resolution("nikara", "nikara", 600, 600))
                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                .build();
    }

    private interface Ready { void run(WebView view); }

    private void renderHtml(final String html, final Ready ready, final PluginCall call) {
        final Activity activity = getActivity();
        if (activity == null) { call.reject("Activity is not available"); return; }
        activity.runOnUiThread(() -> {
            try {
                if (renderView != null) { try { renderView.destroy(); } catch (Exception ignored) {} }
                final WebView view = new WebView(activity);
                renderView = view;
                WebSettings s = view.getSettings();
                s.setJavaScriptEnabled(false);
                s.setAllowFileAccess(false);
                s.setAllowContentAccess(false);
                s.setBlockNetworkLoads(true);
                final boolean[] fired = {false};
                view.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return true; }

                    @Override
                    public void onPageFinished(WebView v, String url) {
                        if (fired[0]) return;
                        fired[0] = true;
                        // Give Chromium one more frame for fonts/images (data URLs) before paginating.
                        new Handler(Looper.getMainLooper()).postDelayed(() -> ready.run(v), 350);
                    }
                });
                view.loadDataWithBaseURL("https://nikara.invoice/", html, "text/html", "utf-8", null);
            } catch (Exception e) {
                call.reject("Cannot render invoice: " + e.getMessage(), e);
            }
        });
    }

    private void release() {
        final WebView v = renderView;
        renderView = null;
        if (v != null) new Handler(Looper.getMainLooper()).postDelayed(() -> { try { v.destroy(); } catch (Exception ignored) {} }, 1500);
    }

    @PluginMethod
    public void print(final PluginCall call) {
        final String html = call.getString("html", "");
        final String jobName = call.getString("jobName", "CRM-NIKARA-Invoice");
        final String paper = call.getString("paper", "A4");
        if (html == null || html.isEmpty()) { call.reject("html is required"); return; }
        renderHtml(html, view -> {
            try {
                PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(jobName);
                pm.print(jobName, adapter, attributes(paper));
                JSObject out = new JSObject();
                out.put("ok", true);
                call.resolve(out);
            } catch (Exception e) {
                call.reject("Print failed: " + e.getMessage(), e);
            }
        }, call);
    }

    @PluginMethod
    public void pdf(final PluginCall call) {
        final String html = call.getString("html", "");
        final String fileName = safeName(call.getString("fileName", ""), "CRM-NIKARA-Invoice");
        final String paper = call.getString("paper", "A4");
        final String action = call.getString("action", "share");
        final String title = call.getString("title", "ارسال فاکتور");
        final String text = call.getString("text", "");
        if (html == null || html.isEmpty()) { call.reject("html is required"); return; }
        renderHtml(html, view -> {
            try {
                File dir = new File(getContext().getCacheDir(), "crm_attachments");
                if (!dir.exists() && !dir.mkdirs()) { release(); call.reject("Cannot create PDF cache"); return; }
                final File out = new File(dir, fileName);
                PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(fileName);
                NikaraPdfWriter.write(adapter, attributes(paper), out, new NikaraPdfWriter.Callback() {
                    @Override
                    public void onSuccess(File file) {
                        release();
                        getActivity().runOnUiThread(() -> afterPdf(call, file, action, title, text));
                    }

                    @Override
                    public void onFailure(String error) {
                        release();
                        call.reject("PDF failed: " + error);
                    }
                });
            } catch (Throwable t) {
                release();
                call.reject("PDF failed: " + t);
            }
        }, call);
    }

    private void afterPdf(PluginCall call, File file, String action, String title, String text) {
        try {
            JSObject out = new JSObject();
            out.put("ok", true);
            out.put("fileName", file.getName());
            out.put("size", file.length());
            if ("data".equals(action) || call.getBoolean("returnData", false)) {
                out.put("dataUrl", "data:application/pdf;base64," + Base64.encodeToString(readAll(file), Base64.NO_WRAP));
            }
            if ("share".equals(action)) {
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("application/pdf");
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.putExtra(Intent.EXTRA_SUBJECT, file.getName().replace(".pdf", ""));
                if (text != null && !text.isEmpty()) send.putExtra(Intent.EXTRA_TEXT, text);
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Intent chooser = Intent.createChooser(send, title);
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getContext().startActivity(chooser);
                call.resolve(out);
                return;
            }
            if ("save".equals(action)) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentResolver resolver = getContext().getContentResolver();
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, file.getName());
                    values.put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/CRM-NIKARA");
                    Uri target = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (target == null) throw new IllegalStateException("Downloads unavailable");
                    copyTo(file, target);
                    out.put("savedTo", "Download/CRM-NIKARA/" + file.getName());
                    call.resolve(out);
                } else {
                    pendingSaveFile = file;
                    Intent create = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    create.addCategory(Intent.CATEGORY_OPENABLE);
                    create.setType("application/pdf");
                    create.putExtra(Intent.EXTRA_TITLE, file.getName());
                    startActivityForResult(call, create, "saveResult");
                }
                return;
            }
            call.resolve(out);
        } catch (Exception e) {
            call.reject("PDF output failed: " + e.getMessage(), e);
        }
    }

    @ActivityCallback
    private void saveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        try {
            if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null || pendingSaveFile == null) {
                call.reject("ذخیره لغو شد");
                return;
            }
            copyTo(pendingSaveFile, result.getData().getData());
            JSObject out = new JSObject();
            out.put("ok", true);
            out.put("fileName", pendingSaveFile.getName());
            out.put("savedTo", pendingSaveFile.getName());
            call.resolve(out);
        } catch (Exception e) {
            call.reject("Save failed: " + e.getMessage(), e);
        } finally {
            pendingSaveFile = null;
        }
    }

    private void copyTo(File file, Uri target) throws Exception {
        try (InputStream in = new FileInputStream(file); OutputStream os = getContext().getContentResolver().openOutputStream(target)) {
            if (os == null) throw new IllegalStateException("Cannot open target");
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
            os.flush();
        }
    }

    private static byte[] readAll(File file) throws Exception {
        try (InputStream in = new FileInputStream(file)) {
            byte[] data = new byte[(int) file.length()];
            int off = 0;
            while (off < data.length) {
                int n = in.read(data, off, data.length - off);
                if (n < 0) break;
                off += n;
            }
            return data;
        }
    }
}
