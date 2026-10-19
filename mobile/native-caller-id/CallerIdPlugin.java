package com.aicrm.offline;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.role.RoleManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.provider.ContactsContract;
import android.content.ContentProviderOperation;
import android.content.ContentResolver;
import android.content.SharedPreferences;
import android.os.Build;
import android.net.Uri;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;

@CapacitorPlugin(name = "CallerId")
public class CallerIdPlugin extends Plugin {
    static final String PREFS = "crm_caller_id";
    static final String KEY_CONTACTS = "contacts_json";
    static final String KEY_LAST_CALL = "last_incoming_call";
    static final String KEY_PENDING_OPEN = "pending_open_contact";
    static final String KEY_SERVICE_CALLS = "screened_call_count";
    static final String KEY_LAST_ERROR = "last_caller_id_error";
    static final String KEY_ENABLED = "caller_id_enabled";

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private boolean supported() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q;
    }

    private boolean roleGranted() {
        if (!supported()) return false;
        RoleManager rm = (RoleManager) getContext().getSystemService(Context.ROLE_SERVICE);
        return rm != null && rm.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING)
                && rm.isRoleHeld(RoleManager.ROLE_CALL_SCREENING);
    }


    private boolean contactsPermissionGranted() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                || getContext().checkSelfPermission(Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean writeContactsPermissionGranted() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                || getContext().checkSelfPermission(Manifest.permission.WRITE_CONTACTS) == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void requestContactsPermission(PluginCall call) {
        JSObject out = new JSObject();
        if (contactsPermissionGranted()) {
            out.put("granted", true);
            out.put("requested", false);
            call.resolve(out);
            return;
        }
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity is not available");
            return;
        }
        activity.requestPermissions(new String[]{Manifest.permission.READ_CONTACTS}, 4917);
        out.put("granted", false);
        out.put("requested", true);
        call.resolve(out);
    }

    @PluginMethod
    public void importDeviceContacts(PluginCall call) {
        if (!contactsPermissionGranted()) {
            call.reject("Contacts permission is required");
            return;
        }
        JSArray rows = new JSArray();
        java.util.HashSet<String> seen = new java.util.HashSet<>();
        Cursor cursor = null;
        try {
            cursor = getContext().getContentResolver().query(
                    ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                    new String[]{
                            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                            ContactsContract.CommonDataKinds.Phone.NUMBER
                    },
                    null, null,
                    ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC"
            );
            if (cursor != null) {
                int nameIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
                int numberIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
                while (cursor.moveToNext()) {
                    String name = nameIndex >= 0 ? cursor.getString(nameIndex) : "";
                    String number = numberIndex >= 0 ? cursor.getString(numberIndex) : "";
                    String key = (name == null ? "" : name) + "|" + (number == null ? "" : number.replaceAll("\\D", ""));
                    if (number == null || number.trim().isEmpty() || seen.contains(key)) continue;
                    seen.add(key);
                    JSObject item = new JSObject();
                    item.put("name", name == null ? "" : name);
                    item.put("phone", number);
                    item.put("source", "device-contacts");
                    rows.put(item);
                    if (rows.length() >= 5000) break;
                }
            }
        } catch (Exception e) {
            call.reject("Failed to read device contacts", e);
            return;
        } finally {
            if (cursor != null) cursor.close();
        }
        JSObject out = new JSObject();
        out.put("contacts", rows);
        out.put("count", rows.length());
        call.resolve(out);
    }

    @PluginMethod
    public void setPhonebookLink(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        boolean createMissing = Boolean.TRUE.equals(call.getBoolean("createMissing", false));
        JSObject out = new JSObject();
        if (!contactsPermissionGranted() || (enabled && !writeContactsPermissionGranted())) {
            Activity activity = getActivity();
            if (activity == null) {
                call.reject("Activity is not available");
                return;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                activity.requestPermissions(new String[]{Manifest.permission.READ_CONTACTS, Manifest.permission.WRITE_CONTACTS}, 4921);
            }
            out.put("permissionRequested", true);
            out.put("enabled", false);
            call.resolve(out);
            return;
        }
        try {
            if (!enabled) {
                deleteManagedPhonebookContacts();
                prefs().edit().putBoolean("phonebook_link_enabled", false).apply();
                out.put("enabled", false);
                out.put("deleted", true);
                call.resolve(out);
                return;
            }
            JSONArray cached = new JSONArray(prefs().getString(KEY_CONTACTS, "[]"));
            int count = syncManagedPhonebookContacts(cached, createMissing);
            prefs().edit().putBoolean("phonebook_link_enabled", true)
                    .putBoolean("phonebook_create_missing", createMissing).apply();
            out.put("enabled", true);
            out.put("count", count);
            call.resolve(out);
        } catch (Exception e) {
            call.reject("Could not update CRM contacts in phonebook", e);
        }
    }

    @PluginMethod
    public void getPhonebookLinkStatus(PluginCall call) {
        JSObject out = new JSObject();
        out.put("enabled", prefs().getBoolean("phonebook_link_enabled", false));
        out.put("createMissing", prefs().getBoolean("phonebook_create_missing", false));
        out.put("permissionGranted", contactsPermissionGranted() && writeContactsPermissionGranted());
        call.resolve(out);
    }

    private int syncManagedPhonebookContacts(JSONArray cached, boolean createMissing) throws Exception {
        deleteManagedPhonebookContacts();
        int count = 0;
        ContentResolver resolver = getContext().getContentResolver();
        for (int i = 0; i < cached.length(); i++) {
            JSONObject row = cached.optJSONObject(i);
            if (row == null || !CrmCallScreeningService.isCrmRegistered(row)) continue;
            String id = row.optString("id", "");
            String name = row.optString("name", "").trim();
            String phone = row.optString("phone", "").trim();
            if (id.isEmpty() || name.isEmpty() || phone.isEmpty()) continue;
            ArrayList<ContentProviderOperation> ops = new ArrayList<>();
            int rawIndex = ops.size();
            ops.add(ContentProviderOperation.newInsert(ContactsContract.RawContacts.CONTENT_URI)
                    .withValue(ContactsContract.RawContacts.ACCOUNT_NAME, "CRM-NIKARA")
                    .withValue(ContactsContract.RawContacts.ACCOUNT_TYPE, "com.aicrm.offline")
                    .withValue(ContactsContract.RawContacts.SYNC1, "crm-nikara:" + id)
                    .build());
            ops.add(ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
                    .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, rawIndex)
                    .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE)
                    .withValue(ContactsContract.CommonDataKinds.StructuredName.DISPLAY_NAME, name)
                    .build());
            ops.add(ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
                    .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, rawIndex)
                    .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE)
                    .withValue(ContactsContract.CommonDataKinds.Phone.NUMBER, phone)
                    .withValue(ContactsContract.CommonDataKinds.Phone.TYPE, ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE)
                    .build());
            String note = "CRM-NIKARA | " + row.optString("company", "") + " | باز کردن پرونده در CRM";
            ops.add(ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
                    .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, rawIndex)
                    .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Note.CONTENT_ITEM_TYPE)
                    .withValue(ContactsContract.CommonDataKinds.Note.NOTE, note)
                    .build());
            String crmUri = "crm-nikara://contact/" + id;
            ops.add(ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
                    .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, rawIndex)
                    .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Website.CONTENT_ITEM_TYPE)
                    .withValue(ContactsContract.CommonDataKinds.Website.URL, crmUri)
                    .build());
            resolver.applyBatch(ContactsContract.AUTHORITY, ops);
            count++;
        }
        return count;
    }

    private void deleteManagedPhonebookContacts() {
        try {
            getContext().getContentResolver().delete(
                    ContactsContract.RawContacts.CONTENT_URI,
                    ContactsContract.RawContacts.SYNC1 + " LIKE ?",
                    new String[]{"crm-nikara:%"});
        } catch (Exception ignored) {}
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject out = new JSObject();
        out.put("supported", supported());
        out.put("granted", roleGranted());
        out.put("contacts_permission", contactsPermissionGranted());

        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        boolean notificationsEnabled = nm != null && nm.areNotificationsEnabled();
        boolean postNotificationsGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                || getContext().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        boolean fullScreenAllowed = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE && nm != null) {
            fullScreenAllowed = nm.canUseFullScreenIntent();
        }
        out.put("notifications_enabled", notificationsEnabled);
        out.put("notifications_permission", postNotificationsGranted);
        out.put("full_screen_allowed", fullScreenAllowed);
        out.put("overlay_allowed", CallerIdOverlay.canShow(getContext()));

        int count = 0;
        try {
            String raw = prefs().getString(KEY_CONTACTS, "[]");
            count = new JSONArray(raw == null ? "[]" : raw).length();
        } catch (Exception ignored) {}
        out.put("cached_contacts", count);
        out.put("enabled", prefs().getBoolean(KEY_ENABLED, true));
        out.put("screened_calls", prefs().getInt(KEY_SERVICE_CALLS, 0));
        out.put("last_error", prefs().getString(KEY_LAST_ERROR, ""));

        String lastRaw = prefs().getString(KEY_LAST_CALL, "");
        if (lastRaw != null && !lastRaw.isEmpty()) {
            try {
                JSONObject obj = new JSONObject(lastRaw);
                out.put("last_number", obj.optString("number", ""));
                out.put("last_matched", obj.optBoolean("matched", false));
                out.put("last_timestamp", obj.optLong("timestamp", 0));
            } catch (Exception ignored) {}
        }
        call.resolve(out);
    }

    @PluginMethod
    public void requestRole(PluginCall call) {
        if (!supported()) {
            call.reject("Caller ID requires Android 10 or newer");
            return;
        }
        RoleManager rm = (RoleManager) getContext().getSystemService(Context.ROLE_SERVICE);
        if (rm == null || !rm.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING)) {
            call.reject("Call screening role is not available on this device");
            return;
        }
        if (rm.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)) {
            JSObject out = new JSObject();
            out.put("granted", true);
            call.resolve(out);
            return;
        }
        Intent intent = rm.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING);
        startActivityForResult(call, intent, "roleResult");
    }

    @ActivityCallback
    private void roleResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject out = new JSObject();
        out.put("granted", roleGranted());
        out.put("result_code", result != null ? result.getResultCode() : Activity.RESULT_CANCELED);
        call.resolve(out);
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Cannot open notification settings", e);
        }
    }

    @PluginMethod
    public void openFullScreenIntentSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            call.resolve();
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Cannot open full-screen intent settings", e);
        }
    }

    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Cannot open overlay settings", e);
        }
    }

    /** Runs the exact incoming-call path (cache lookup + floating card/notification) for a number. */
    @PluginMethod
    public void simulateIncomingCall(PluginCall call) {
        try {
            String number = call.getString("number", "");
            JSONObject match = CrmCallScreeningService.findContact(getContext(), number);
            boolean overlay = CrmCallScreeningService.present(getContext(), number, match);
            JSObject out = new JSObject();
            out.put("matched", match != null);
            out.put("overlay", overlay);
            out.put("name", match != null ? match.optString("name", "") : "");
            call.resolve(out);
        } catch (Exception e) {
            prefs().edit().putString(KEY_LAST_ERROR, "simulate: " + e).apply();
            call.reject("Caller ID simulation failed", e);
        }
    }

    @PluginMethod
    public void testCallerIdPopup(PluginCall call) {
        try {
            String number = call.getString("number", "+989121234567");
            String name = call.getString("name", "تست Caller ID");
            String company = call.getString("company", "CRM-NIKARA");

            Intent activityIntent = new Intent(getContext(), CallerIdActivity.class);
            activityIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            activityIntent.putExtra("number", number);
            activityIntent.putExtra("matched", true);
            activityIntent.putExtra("contact_id", "");
            activityIntent.putExtra("name", name);
            activityIntent.putExtra("company", company);
            activityIntent.putExtra("job_title", "تست نمایش");
            activityIntent.putExtra("status", "test");
            activityIntent.putExtra("ai_score", 99);
            activityIntent.putExtra("next_action", "اگر این کارت را می‌بینی، رابط Native سالم است.");
            try {
                JSONObject profile = new JSONObject();
                profile.put("entity_type", "contact"); profile.put("id", ""); profile.put("name", name); profile.put("company", company); profile.put("job_title", "مدیر خرید"); profile.put("department", "خرید"); profile.put("phone", number); profile.put("email", "test@example.com"); profile.put("status", "negotiation"); profile.put("ai_score", 88); profile.put("ai_summary", "این یک تست پرونده کامل Caller ID است."); profile.put("next_action", "پیگیری پیشنهاد قیمت"); profile.put("notes", "نمونه یادداشت مشتری برای تست نمایش کامل.");
                JSONArray projects = new JSONArray(); JSONObject project = new JSONObject(); project.put("title", "پروژه تست واردات"); project.put("type", "import"); project.put("stage", "in_progress"); project.put("value", 25000000); projects.put(project); profile.put("projects", projects);
                JSONArray tasks = new JSONArray(); JSONObject task = new JSONObject(); task.put("title", "پیگیری فردا"); task.put("due_at", "2026-09-01"); tasks.put(task); profile.put("open_tasks", tasks);
                activityIntent.putExtra("profile_json", profile.toString());
            } catch (Exception ignored) {}

            String channelId = "crm_caller_id";
            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    NotificationChannel ch = new NotificationChannel(
                            channelId, "CRM Caller ID", NotificationManager.IMPORTANCE_HIGH);
                    ch.setDescription("نمایش اطلاعات مشتری هنگام تماس ورودی");
                    ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                    nm.createNotificationChannel(ch);
                }
                PendingIntent pi = PendingIntent.getActivity(
                        getContext(), 31002, activityIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                        ? new Notification.Builder(getContext(), channelId)
                        : new Notification.Builder(getContext());
                b.setSmallIcon(android.R.drawable.sym_action_call)
                        .setContentTitle(name)
                        .setContentText(company + " • " + number)
                        .setCategory(Notification.CATEGORY_CALL)
                        .setVisibility(Notification.VISIBILITY_PUBLIC)
                        .setAutoCancel(true)
                        .setContentIntent(pi)
                        .setFullScreenIntent(pi, true);
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                    b.setPriority(Notification.PRIORITY_MAX);
                }
                nm.notify(31002, b.build());
            }

            Activity activity = getActivity();
            if (activity != null) {
                activity.startActivity(activityIntent);
            } else {
                getContext().startActivity(activityIntent);
            }

            JSObject out = new JSObject();
            out.put("ok", true);
            call.resolve(out);
        } catch (Exception e) {
            prefs().edit().putString(KEY_LAST_ERROR, "testPopup: " + e.toString()).apply();
            call.reject("Caller ID test failed", e);
        }
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", true));
        prefs().edit().putBoolean(KEY_ENABLED, enabled).apply();
        JSObject out = new JSObject();
        out.put("enabled", enabled);
        call.resolve(out);
    }

    @PluginMethod
    public void syncContacts(PluginCall call) {
        JSArray contacts = call.getArray("contacts");
        if (contacts == null) {
            call.reject("contacts array is required");
            return;
        }
        // Defensive filter: keep only CRM-registered rows (never raw phonebook entries).
        JSONArray filtered = new JSONArray();
        for (int i = 0; i < contacts.length(); i++) {
            JSONObject row = contacts.optJSONObject(i);
            if (row != null && CrmCallScreeningService.isCrmRegistered(row)) filtered.put(row);
        }
        prefs().edit().putString(KEY_CONTACTS, filtered.toString()).apply();
        JSObject out = new JSObject();
        out.put("ok", true);
        out.put("count", filtered.length());
        out.put("skipped", contacts.length() - filtered.length());
        call.resolve(out);
    }

    @PluginMethod
    public void getCachedContacts(PluginCall call) {
        JSObject out = new JSObject();
        try {
            String raw = prefs().getString(KEY_CONTACTS, "[]");
            JSONArray parsed = new JSONArray(raw == null ? "[]" : raw);
            JSArray rows = new JSArray();
            for (int i = 0; i < parsed.length(); i++) rows.put(parsed.get(i));
            out.put("contacts", rows);
            out.put("count", rows.length());
        } catch (Exception e) {
            out.put("contacts", new JSArray());
            out.put("count", 0);
        }
        call.resolve(out);
    }

    @PluginMethod
    public void consumePendingOpen(PluginCall call) {
        String contactId = prefs().getString(KEY_PENDING_OPEN, "");
        if (contactId == null) contactId = "";
        if (!contactId.isEmpty()) prefs().edit().remove(KEY_PENDING_OPEN).apply();
        JSObject out = new JSObject();
        out.put("contact_id", contactId);
        call.resolve(out);
    }

    @PluginMethod
    public void getLastIncomingCall(PluginCall call) {
        String raw = prefs().getString(KEY_LAST_CALL, "");
        JSObject out = new JSObject();
        if (raw != null && !raw.isEmpty()) {
            try {
                JSONObject obj = new JSONObject(raw);
                for (String key : new String[]{"number", "contact_id", "name", "company", "job_title", "status", "next_action"}) {
                    if (obj.has(key)) out.put(key, obj.optString(key, ""));
                }
                out.put("matched", obj.optBoolean("matched", false));
                out.put("timestamp", obj.optLong("timestamp", 0));
            } catch (Exception ignored) {}
        }
        call.resolve(out);
    }
}
