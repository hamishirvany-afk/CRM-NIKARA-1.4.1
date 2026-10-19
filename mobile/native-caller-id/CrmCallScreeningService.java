package com.aicrm.offline;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Notification;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.telecom.Call;
import android.telecom.CallScreeningService;

import org.json.JSONArray;
import org.json.JSONObject;

public class CrmCallScreeningService extends CallScreeningService {
    @Override
    public void onScreenCall(Call.Details callDetails) {
        SharedPreferences prefs = getSharedPreferences(CallerIdPlugin.PREFS, Context.MODE_PRIVATE);
        prefs.edit()
                .putInt(CallerIdPlugin.KEY_SERVICE_CALLS, prefs.getInt(CallerIdPlugin.KEY_SERVICE_CALLS, 0) + 1)
                .putString(CallerIdPlugin.KEY_LAST_ERROR, "")
                .apply();

        boolean incoming = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
                || callDetails.getCallDirection() == Call.Details.DIRECTION_INCOMING;

        // Never delay ringing for a CRM lookup. Allow first, identify locally second.
        if (incoming) {
            try {
                respondToCall(callDetails, new CallResponse.Builder().setDisallowCall(false).build());
            } catch (Exception e) {
                prefs.edit().putString(CallerIdPlugin.KEY_LAST_ERROR, "respondToCall: " + e).apply();
            }
        }
        if (!incoming || !prefs.getBoolean(CallerIdPlugin.KEY_ENABLED, true)) return;

        try {
            Uri handle = callDetails.getHandle();
            String number = handle != null ? handle.getSchemeSpecificPart() : "";
            JSONObject match = findContact(this, number);
            present(this, number, match);
        } catch (Exception e) {
            prefs.edit().putString(CallerIdPlugin.KEY_LAST_ERROR, "onScreenCall: " + e).apply();
        }
    }

    /** Looks the number up in the CRM-only cache. People win over a company sharing the same number. */
    static JSONObject findContact(Context ctx, String incoming) {
        SharedPreferences prefs = ctx.getSharedPreferences(CallerIdPlugin.PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(CallerIdPlugin.KEY_CONTACTS, "[]");
        JSONObject orgMatch = null;
        try {
            JSONArray rows = new JSONArray(raw == null ? "[]" : raw);
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.optJSONObject(i);
                if (row == null) continue;
                // Only CRM-registered records. Phonebook imports (unapproved) are never shown.
                if (!isCrmRegistered(row)) continue;
                if (!phoneMatches(incoming, row.optString("phone", ""))) continue;
                if ("organization".equals(row.optString("entity_type", "contact"))) {
                    if (orgMatch == null) orgMatch = row;
                } else {
                    return row;
                }
            }
        } catch (Exception ignored) {}
        return orgMatch;
    }

    static boolean isCrmRegistered(JSONObject row) {
        if (row.has("caller_id") && !row.optBoolean("caller_id", false)) return false;
        String src = row.optString("source", "");
        if (("device-contacts".equals(src) || "caller-id-cache".equals(src)) && !row.optBoolean("caller_id", false)) return false;
        String id = row.optString("id", "");
        String name = row.optString("name", "").trim();
        return !id.isEmpty() && !name.isEmpty();
    }

    static boolean phoneMatches(String a, String b) {
        String na = normalizePhone(a);
        String nb = normalizePhone(b);
        if (na.isEmpty() || nb.isEmpty()) return false;
        if (na.equals(nb)) return true;
        // Fallback: identical last 10 digits, only for full-length numbers (avoid short/partial false matches).
        String da = digitsOnly(a);
        String db = digitsOnly(b);
        if (da.length() >= 10 && db.length() >= 10 && da.length() <= 14 && db.length() <= 14) {
            return da.substring(da.length() - 10).equals(db.substring(db.length() - 10));
        }
        return false;
    }

    static String normalizePhone(String raw) {
        String d = digitsOnly(raw);
        if (d.isEmpty()) return "";
        if (d.startsWith("0098") && d.length() > 4) return "+98" + d.substring(4);
        if (d.startsWith("98") && d.length() >= 12) return "+" + d;
        if (d.startsWith("0") && d.length() == 11) return "+98" + d.substring(1);
        if (d.length() == 10 && d.charAt(0) >= '1' && d.charAt(0) <= '9') return "+98" + d;
        return raw != null && raw.trim().startsWith("+") ? "+" + d : d;
    }

    static String digitsOnly(String raw) {
        if (raw == null) return "";
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < raw.length(); i++) {
            char ch = raw.charAt(i);
            if (ch >= '0' && ch <= '9') out.append(ch);
            else if (ch >= '\u06F0' && ch <= '\u06F9') out.append((char) ('0' + (ch - '\u06F0')));
            else if (ch >= '\u0660' && ch <= '\u0669') out.append((char) ('0' + (ch - '\u0660')));
        }
        return out.toString();
    }

    /**
     * Shows a matched CRM customer: floating card above the call screen (when "Display over other apps"
     * is allowed), plus a notification as a reliable way back. Returns true if the floating card was used.
     */
    static boolean present(Context ctx, String number, JSONObject match) {
        boolean matched = match != null;
        SharedPreferences prefs = ctx.getSharedPreferences(CallerIdPlugin.PREFS, Context.MODE_PRIVATE);
        JSONObject last = new JSONObject();
        try {
            last.put("number", number == null ? "" : number);
            last.put("matched", matched);
            last.put("timestamp", System.currentTimeMillis());
            if (matched) {
                for (String key : new String[]{"id", "name", "company", "job_title", "status", "next_action"}) {
                    String dest = "id".equals(key) ? "contact_id" : key;
                    last.put(dest, match.optString(key, ""));
                }
            }
        } catch (Exception ignored) {}
        prefs.edit().putString(CallerIdPlugin.KEY_LAST_CALL, last.toString()).apply();

        // Unknown callers ring normally without any CRM interruption.
        if (!matched) return false;

        Intent intent = new Intent(ctx, CallerIdActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("number", number == null ? "" : number);
        intent.putExtra("matched", true);
        intent.putExtra("contact_id", match.optString("id", ""));
        intent.putExtra("name", match.optString("name", ""));
        intent.putExtra("company", match.optString("company", ""));
        intent.putExtra("job_title", match.optString("job_title", ""));
        intent.putExtra("status", match.optString("status", ""));
        intent.putExtra("ai_score", match.optInt("ai_score", 0));
        intent.putExtra("next_action", match.optString("next_action", ""));
        intent.putExtra("profile_json", match.toString());

        boolean overlay = CallerIdOverlay.show(ctx, number, match);
        // With the overlay the full-screen intent is skipped: it would cover the dialer's answer button.
        showCallerNotification(ctx, intent, number, match, !overlay);
        if (!overlay) {
            // Legacy path (Android 9 and OEMs that still allow it). Delayed so it lands above the dialer.
            final Context app = ctx.getApplicationContext();
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                try {
                    app.startActivity(intent);
                } catch (Exception e) {
                    app.getSharedPreferences(CallerIdPlugin.PREFS, Context.MODE_PRIVATE)
                            .edit().putString(CallerIdPlugin.KEY_LAST_ERROR, "startActivity: " + e).apply();
                }
            }, 900);
        }
        return overlay;
    }

    static void showCallerNotification(Context ctx, Intent activityIntent, String number, JSONObject match, boolean fullScreen) {
        try {
            String channelId = "crm_caller_id";
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel ch = new NotificationChannel(channelId, "CRM Caller ID", NotificationManager.IMPORTANCE_HIGH);
                ch.setDescription("نمایش اطلاعات مشتری هنگام تماس ورودی");
                ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                nm.createNotificationChannel(ch);
            }
            PendingIntent pi = PendingIntent.getActivity(ctx, 31001, activityIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            String title = match.optString("name", "مشتری CRM");
            String company = match.optString("company", "");
            String jobTitle = match.optString("job_title", "");
            String context = !jobTitle.isEmpty() && !company.isEmpty() ? jobTitle + " • " + company : (!company.isEmpty() ? company : jobTitle);
            String body = context.isEmpty() ? (number == null ? "" : number) : context + " • " + (number == null ? "" : number);
            String next = match.optString("next_action", "");
            Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? new Notification.Builder(ctx, channelId) : new Notification.Builder(ctx);
            b.setSmallIcon(android.R.drawable.sym_action_call)
                    .setContentTitle("📞 " + title)
                    .setContentText(body)
                    .setStyle(new Notification.BigTextStyle().bigText(next.isEmpty() ? body : body + "\nاقدام بعدی: " + next))
                    .setCategory(Notification.CATEGORY_CALL)
                    .setVisibility(Notification.VISIBILITY_PUBLIC)
                    .setAutoCancel(true)
                    .setOngoing(false)
                    .setTimeoutAfter(10 * 60 * 1000L)
                    .setContentIntent(pi);
            if (fullScreen) b.setFullScreenIntent(pi, true);
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) b.setPriority(Notification.PRIORITY_MAX);
            nm.notify(31001, b.build());
        } catch (Exception e) {
            ctx.getSharedPreferences(CallerIdPlugin.PREFS, Context.MODE_PRIVATE)
                    .edit().putString(CallerIdPlugin.KEY_LAST_ERROR, "notification: " + e).apply();
        }
    }
}
