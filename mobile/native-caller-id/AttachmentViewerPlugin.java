package com.aicrm.offline;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import android.webkit.MimeTypeMap;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;

@CapacitorPlugin(name = "AttachmentViewer")
public class AttachmentViewerPlugin extends Plugin {
    private String safeFileName(String raw) {
        String name = raw == null || raw.trim().isEmpty() ? "document" : raw.trim();
        return name.replaceAll("[\\\\/:*?\"<>|\\r\\n]+", "_");
    }

    @PluginMethod
    public void open(PluginCall call) {
        String dataUrl = call.getString("dataUrl", "");
        String fileName = safeFileName(call.getString("fileName", "document"));
        String mimeType = call.getString("mimeType", "application/octet-stream");
        if (mimeType == null || mimeType.isEmpty() || "application/octet-stream".equals(mimeType)) {
            String ext = MimeTypeMap.getFileExtensionFromUrl(fileName);
            String inferred = ext == null ? null : MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.toLowerCase());
            if (inferred != null && !inferred.isEmpty()) mimeType = inferred;
        }

        if (dataUrl == null || !dataUrl.startsWith("data:") || !dataUrl.contains(",")) {
            call.reject("Invalid attachment data");
            return;
        }

        try {
            int comma = dataUrl.indexOf(',');
            String payload = dataUrl.substring(comma + 1);
            byte[] bytes = Base64.decode(payload, Base64.DEFAULT);

            File dir = new File(getContext().getCacheDir(), "crm_attachments");
            if (!dir.exists() && !dir.mkdirs()) {
                call.reject("Cannot create attachment cache");
                return;
            }

            File file = new File(dir, System.currentTimeMillis() + "-" + fileName);
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(bytes);
                out.flush();
            }

            Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    file
            );

            Intent view = new Intent(Intent.ACTION_VIEW);
            view.setDataAndType(uri, mimeType == null || mimeType.isEmpty() ? "*/*" : mimeType);
            view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);

            try {
                getContext().startActivity(Intent.createChooser(view, "باز کردن فایل"));
            } catch (ActivityNotFoundException noViewer) {
                Intent share = new Intent(Intent.ACTION_SEND);
                share.setType(mimeType == null || mimeType.isEmpty() ? "*/*" : mimeType);
                share.putExtra(Intent.EXTRA_STREAM, uri);
                share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(Intent.createChooser(share, "باز کردن / اشتراک فایل"));
            }

            JSObject result = new JSObject();
            result.put("ok", true);
            result.put("fileName", fileName);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Cannot open attachment: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void share(PluginCall call) {
        String dataUrl = call.getString("dataUrl", "");
        String fileName = safeFileName(call.getString("fileName", "export"));
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String title = call.getString("title", "ذخیره / ارسال فایل");
        if (dataUrl == null || !dataUrl.startsWith("data:") || !dataUrl.contains(",")) {
            call.reject("Invalid export data");
            return;
        }
        try {
            byte[] bytes = Base64.decode(dataUrl.substring(dataUrl.indexOf(',') + 1), Base64.DEFAULT);
            File dir = new File(getContext().getCacheDir(), "crm_attachments");
            if (!dir.exists() && !dir.mkdirs()) {
                call.reject("Cannot create export cache");
                return;
            }
            File file = new File(dir, fileName);
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(bytes);
                out.flush();
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mimeType == null || mimeType.isEmpty() ? "*/*" : mimeType);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_SUBJECT, fileName);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, title);
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getContext().startActivity(chooser);
            JSObject result = new JSObject();
            result.put("ok", true);
            result.put("fileName", fileName);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Cannot share file: " + e.getMessage(), e);
        }
    }
}
