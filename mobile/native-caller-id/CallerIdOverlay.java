package com.aicrm.offline;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Floating CRM card drawn above the incoming-call screen.
 *
 * Why an overlay: Android 10+ blocks background apps from starting an Activity while the phone rings,
 * and the dialer's own call UI is launched after call screening, so a normal Activity ends up hidden
 * behind it. A TYPE_APPLICATION_OVERLAY window (needs "Display over other apps") always stays above
 * the dialer and leaves its answer / decline buttons usable.
 */
public final class CallerIdOverlay {
    private static final long AUTO_DISMISS_MS = 3 * 60 * 1000L;
    private static View current;
    private static WindowManager currentWm;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final Runnable AUTO_DISMISS = CallerIdOverlay::dismiss;

    private CallerIdOverlay() {}

    static boolean canShow(Context ctx) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(ctx);
    }

    /** Returns true when the overlay is permitted and was queued for display. */
    static boolean show(Context ctx, String number, JSONObject profile) {
        if (ctx == null || profile == null || !canShow(ctx)) return false;
        final Context app = ctx.getApplicationContext();
        MAIN.post(() -> {
            try {
                showNow(app, number, profile);
            } catch (Exception e) {
                app.getSharedPreferences(CallerIdPlugin.PREFS, Context.MODE_PRIVATE)
                        .edit().putString(CallerIdPlugin.KEY_LAST_ERROR, "overlay: " + e).apply();
            }
        });
        return true;
    }

    static void dismiss() {
        MAIN.removeCallbacks(AUTO_DISMISS);
        if (current != null && currentWm != null) {
            try { currentWm.removeView(current); } catch (Exception ignored) {}
        }
        current = null;
        currentWm = null;
    }

    private static int dp(Context c, float v) { return Math.round(v * c.getResources().getDisplayMetrics().density); }

    private static TextView text(Context c, String value, float sp, int color, boolean bold) {
        TextView tv = new TextView(c);
        tv.setText(value == null ? "" : value);
        tv.setTextSize(sp);
        tv.setTextColor(color);
        tv.setGravity(Gravity.RIGHT);
        tv.setTextDirection(View.TEXT_DIRECTION_RTL);
        if (bold) tv.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return tv;
    }

    private static GradientDrawable round(int color, float radiusDp, Context c) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(c, radiusDp));
        return g;
    }

    private static TextView chip(Context c, String value, int bg, int fg) {
        TextView t = text(c, value, 12.5f, fg, true);
        t.setPadding(dp(c, 10), dp(c, 4), dp(c, 10), dp(c, 4));
        t.setBackground(round(bg, 999, c));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.setMargins(dp(c, 6), 0, 0, 0);
        t.setLayoutParams(lp);
        return t;
    }

    static String stageFa(String s) {
        if (s == null) return "";
        switch (s) {
            case "new": return "جدید";
            case "contacted": return "تماس گرفته شد";
            case "qualified": return "واجد شرایط";
            case "proposal": return "پیشنهاد";
            case "negotiation": return "مذاکره";
            case "follow_up": return "پیگیری";
            case "won": return "فروش موفق";
            case "lost": return "از دست رفته";
            default: return "";
        }
    }

    private static void showNow(Context c, String number, JSONObject p) {
        dismiss();
        WindowManager wm = (WindowManager) c.getSystemService(Context.WINDOW_SERVICE);
        if (wm == null) return;

        final int navy = Color.rgb(11, 18, 32);
        final int teal = Color.rgb(94, 234, 212);
        final int muted = Color.rgb(169, 182, 200);

        LinearLayout card = new LinearLayout(c);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        card.setPadding(dp(c, 16), dp(c, 12), dp(c, 16), dp(c, 14));
        GradientDrawable bg = round(navy, 22, c);
        bg.setStroke(dp(c, 1), Color.argb(70, 94, 234, 212));
        card.setBackground(bg);
        card.setElevation(dp(c, 12));

        LinearLayout top = new LinearLayout(c);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        TextView brand = text(c, "CRM-NIKARA · مشتری ثبت‌شده", 12f, teal, true);
        top.addView(brand, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
        TextView close = text(c, "✕", 18f, muted, true);
        close.setGravity(Gravity.CENTER);
        close.setContentDescription("بستن کارت مشتری");
        close.setOnClickListener(v -> dismiss());
        top.addView(close, new LinearLayout.LayoutParams(dp(c, 40), dp(c, 36)));
        card.addView(top);

        String name = p.optString("name", "مشتری CRM");
        card.addView(text(c, name, 22f, Color.WHITE, true));
        String job = p.optString("job_title", "");
        String company = p.optString("company", "");
        String sub = !job.isEmpty() && !company.isEmpty() ? job + " • " + company : (job + company);
        if (!sub.isEmpty()) card.addView(text(c, sub, 14.5f, muted, false));
        if (number != null && !number.isEmpty()) {
            TextView n = text(c, number, 13f, muted, false);
            n.setTextDirection(View.TEXT_DIRECTION_LTR);
            card.addView(n);
        }

        LinearLayout chips = new LinearLayout(c);
        chips.setOrientation(LinearLayout.HORIZONTAL);
        chips.setPadding(0, dp(c, 8), 0, dp(c, 2));
        String stage = stageFa(p.optString("status", ""));
        if (!stage.isEmpty()) chips.addView(chip(c, stage, Color.argb(40, 94, 234, 212), teal));
        JSONObject fin = p.optJSONObject("finance");
        if (fin != null) {
            double net = fin.optDouble("net_toman", 0);
            if (net > 0) chips.addView(chip(c, "طلب " + String.format("%,.0f", net) + " ت", Color.argb(45, 250, 204, 21), Color.rgb(253, 224, 71)));
            else if (net < 0) chips.addView(chip(c, "بدهی " + String.format("%,.0f", -net) + " ت", Color.argb(45, 248, 113, 113), Color.rgb(252, 165, 165)));
        }
        JSONArray tasks = p.optJSONArray("open_tasks");
        if (tasks != null && tasks.length() > 0) chips.addView(chip(c, tasks.length() + " پیگیری باز", Color.argb(40, 255, 255, 255), Color.WHITE));
        if (chips.getChildCount() > 0) card.addView(chips);

        String next = p.optString("next_action", "");
        if (next.isEmpty() && tasks != null && tasks.length() > 0) {
            JSONObject t = tasks.optJSONObject(0);
            if (t != null) next = t.optString("title", "");
        }
        if (!next.isEmpty()) {
            if (next.length() > 140) next = next.substring(0, 140) + "…";
            TextView nx = text(c, "اقدام بعدی: " + next, 13.5f, Color.rgb(226, 232, 240), false);
            nx.setPadding(0, dp(c, 6), 0, 0);
            card.addView(nx);
        }

        LinearLayout actions = new LinearLayout(c);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setPadding(0, dp(c, 12), 0, 0);
        Button open = new Button(c);
        open.setText("پرونده کامل");
        open.setAllCaps(false);
        open.setTextColor(navy);
        open.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        open.setBackground(round(teal, 14, c));
        final String profileJson = p.toString();
        final String num = number == null ? "" : number;
        open.setOnClickListener(v -> {
            Intent i = new Intent(c, CallerIdActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            i.putExtra("number", num);
            i.putExtra("matched", true);
            i.putExtra("contact_id", p.optString("id", ""));
            i.putExtra("name", p.optString("name", ""));
            i.putExtra("company", p.optString("company", ""));
            i.putExtra("job_title", p.optString("job_title", ""));
            i.putExtra("profile_json", profileJson);
            try { c.startActivity(i); } catch (Exception e) {
                c.getSharedPreferences(CallerIdPlugin.PREFS, Context.MODE_PRIVATE).edit().putString(CallerIdPlugin.KEY_LAST_ERROR, "overlay open: " + e).apply();
            }
            dismiss();
        });
        actions.addView(open, new LinearLayout.LayoutParams(0, dp(c, 46), 1));
        Button later = new Button(c);
        later.setText("بعد از تماس");
        later.setAllCaps(false);
        later.setTextColor(Color.WHITE);
        later.setBackground(round(Color.argb(40, 255, 255, 255), 14, c));
        final String pendingId = "organization".equals(p.optString("entity_type", "contact")) && !p.optString("id", "").startsWith("org:") ? "org:" + p.optString("id", "") : p.optString("id", "");
        later.setOnClickListener(v -> {
            // Remember the customer: when the app is opened next, it lands on the call-report form.
            SharedPreferences prefs = c.getSharedPreferences(CallerIdPlugin.PREFS, Context.MODE_PRIVATE);
            prefs.edit().putString(CallerIdPlugin.KEY_PENDING_OPEN, pendingId).apply();
            dismiss();
        });
        LinearLayout.LayoutParams lp2 = new LinearLayout.LayoutParams(0, dp(c, 46), 1);
        lp2.setMargins(0, 0, dp(c, 8), 0);
        actions.addView(later, lp2);
        card.addView(actions);

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        final WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                        | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP;
        lp.y = dp(c, 84);
        lp.horizontalMargin = 0.03f;

        // Drag vertically so the card never hides what the user needs on the call screen.
        final float[] down = new float[2];
        card.setOnTouchListener((v, ev) -> {
            switch (ev.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    down[0] = ev.getRawY();
                    down[1] = lp.y;
                    return true;
                case MotionEvent.ACTION_MOVE:
                    lp.y = Math.max(0, (int) (down[1] + ev.getRawY() - down[0]));
                    try { wm.updateViewLayout(card, lp); } catch (Exception ignored) {}
                    return true;
                default:
                    return false;
            }
        });

        wm.addView(card, lp);
        current = card;
        currentWm = wm;
        MAIN.postDelayed(AUTO_DISMISS, AUTO_DISMISS_MS);
    }
}
