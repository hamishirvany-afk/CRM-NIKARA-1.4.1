package com.aicrm.offline;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

public class CallerIdActivity extends Activity {
    private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private TextView text(String value, float sp, boolean bold) {
        TextView tv = new TextView(this);
        tv.setText(value == null ? "" : value);
        tv.setTextColor(Color.rgb(24, 31, 42));
        tv.setTextSize(sp);
        tv.setGravity(Gravity.RIGHT);
        tv.setTextDirection(View.TEXT_DIRECTION_RTL);
        if (bold) tv.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        tv.setPadding(0, dp(3), 0, dp(3));
        return tv;
    }

    private GradientDrawable rounded(int color, float radius) {
        GradientDrawable g = new GradientDrawable(); g.setColor(color); g.setCornerRadius(dp(radius));
        g.setStroke(dp(1), Color.rgb(226, 232, 240)); return g;
    }

    private LinearLayout section(String title) {
        LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(dp(14),dp(12),dp(14),dp(12));
        box.setBackground(rounded(Color.WHITE,16)); box.setElevation(dp(2));
        box.addView(text(title,14,true));
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,LinearLayout.LayoutParams.WRAP_CONTENT); lp.setMargins(0,0,0,dp(10)); box.setLayoutParams(lp);
        return box;
    }

    private void addRow(LinearLayout box, String label, String value) {
        if (value == null || value.trim().isEmpty()) return;
        TextView t=text(label+":  "+value,13,false); t.setPadding(0,dp(4),0,dp(4)); box.addView(t);
    }

    private String faStage(String s){
        if(s==null)return "";
        switch(s){case "new":return "جدید";case "contacted":return "تماس گرفته شد";case "qualified":return "واجد شرایط";case "proposal":return "پیشنهاد";case "negotiation":return "مذاکره";case "follow_up":return "پیگیری";case "won":return "موفق";case "lost":return "از دست رفته";default:return s;}
    }
    private String projectStage(String s){
        if(s==null)return ""; switch(s){case "new":return "جدید";case "qualified":return "بررسی‌شده";case "quotation":return "قیمت/پیشنهاد";case "approved":return "تأییدشده";case "in_progress":return "در حال اجرا";case "waiting":return "منتظر";case "completed":return "تکمیل‌شده";case "won":return "موفق";case "lost":return "ناموفق";case "cancelled":return "لغوشده";default:return s;}
    }
    private String projectType(String s){
        if(s==null)return ""; switch(s){case "opportunity":return "فرصت فروش";case "order":return "سفارش";case "import":return "واردات";case "export":return "صادرات";case "procurement":return "تأمین/خرید";case "logistics":return "حمل‌ونقل";case "medical":return "پزشکی/دارویی";case "service":return "خدمات";default:return "سایر";}
    }

    @Override protected void onCreate(Bundle savedInstanceState){ super.onCreate(savedInstanceState); CallerIdOverlay.dismiss(); setupWindow(); render(getIntent()); }
    @Override protected void onNewIntent(Intent intent){ super.onNewIntent(intent); setIntent(intent); render(intent); }

    private void setupWindow(){
        if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.O_MR1){setShowWhenLocked(true);setTurnScreenOn(true);}else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED|WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.rgb(246,248,252));
        if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.M) getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        setFinishOnTouchOutside(false);
    }

    private void render(Intent intent){
        boolean matched=intent.getBooleanExtra("matched",false);
        String number=intent.getStringExtra("number");
        JSONObject p=new JSONObject();
        try{String raw=intent.getStringExtra("profile_json"); if(raw!=null&&!raw.isEmpty())p=new JSONObject(raw);}catch(Exception ignored){}
        String entityType=p.optString("entity_type","contact");
        String id=p.optString("id",intent.getStringExtra("contact_id")); if(id==null) id="";
        String name=p.optString("name",intent.getStringExtra("name"));
        String company=p.optString("company",intent.getStringExtra("company"));
        String job=p.optString("job_title",intent.getStringExtra("job_title"));

        LinearLayout root=new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(Color.rgb(246,248,252)); root.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        root.setPadding(dp(14),dp(12),dp(14),dp(12));

        LinearLayout top=new LinearLayout(this); top.setOrientation(LinearLayout.HORIZONTAL); top.setGravity(Gravity.CENTER_VERTICAL); top.setPadding(0,0,0,dp(8));
        Button close=new Button(this); close.setText("بستن"); close.setOnClickListener(v->finish());
        TextView title=text(matched?"پرونده مشتری هنگام تماس":"تماس ورودی",17,true); LinearLayout.LayoutParams tlp=new LinearLayout.LayoutParams(0,LinearLayout.LayoutParams.WRAP_CONTENT,1); title.setLayoutParams(tlp); top.addView(title); top.addView(close); root.addView(top);

        ScrollView scroll=new ScrollView(this); scroll.setFillViewport(true); LinearLayout body=new LinearLayout(this); body.setOrientation(LinearLayout.VERTICAL); body.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        scroll.addView(body); root.addView(scroll,new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,0,1));

        LinearLayout hero=section(matched?"تماس ورودی از CRM":"این شماره در CRM پیدا نشد");
        TextView nm=text(matched && name!=null&&!name.isEmpty()?name:(number==null?"شماره ناشناس":number),25,true); hero.addView(nm);
        if(matched){ if(job!=null&&!job.isEmpty())hero.addView(text(job,15,false)); if(company!=null&&!company.isEmpty())hero.addView(text(company,15,true)); }
        if(number!=null&&!number.isEmpty())hero.addView(text(number,14,false));
        body.addView(hero);

        if(matched){
            LinearLayout crm=section("خلاصه CRM");
            addRow(crm,"مرحله",faStage(p.optString("status","")));
            if(p.optInt("ai_score",0)>0)addRow(crm,"امتیاز AI",String.valueOf(p.optInt("ai_score",0)));
            if(p.optDouble("deal_value",0)>0)addRow(crm,"ارزش ثبت‌شده",String.format("%,.0f",p.optDouble("deal_value",0)));
            addRow(crm,"اقدام بعدی",p.optString("next_action",""));
            addRow(crm,"آخرین تماس",p.optString("last_contact_label",p.optString("last_contact_at","")));
            body.addView(crm);

            JSONObject finance=p.optJSONObject("finance");
            if(finance!=null){
                double rec=finance.optDouble("receivable_toman",0), pay=finance.optDouble("payable_toman",0);
                if(rec!=0||pay!=0){
                    LinearLayout fb=section("حساب مشتری");
                    if(rec!=0)addRow(fb,"طلب از طرف",String.format("%,.0f تومان",rec));
                    if(pay!=0)addRow(fb,"بدهی به طرف",String.format("%,.0f تومان",pay));
                    addRow(fb,"خالص",String.format("%,.0f تومان",finance.optDouble("net_toman",0)));
                    body.addView(fb);
                }
            }

            JSONObject companyFinance=p.optJSONObject("company_finance");
            if(companyFinance!=null){
                double rec=companyFinance.optDouble("receivable_toman",0), pay=companyFinance.optDouble("payable_toman",0);
                if((rec!=0||pay!=0) && company!=null && !company.isEmpty()){
                    LinearLayout cfb=section("حساب شرکت "+company);
                    if(rec!=0)addRow(cfb,"طلب از شرکت",String.format("%,.0f تومان",rec));
                    if(pay!=0)addRow(cfb,"بدهی به شرکت",String.format("%,.0f تومان",pay));
                    addRow(cfb,"خالص",String.format("%,.0f تومان",companyFinance.optDouble("net_toman",0)));
                    body.addView(cfb);
                }
            }

            JSONObject nextMeeting=p.optJSONObject("next_meeting");
            if(nextMeeting!=null){
                LinearLayout mb=section("جلسه بعدی");
                addRow(mb,"عنوان",nextMeeting.optString("title",""));
                addRow(mb,"زمان",nextMeeting.optString("start_label",nextMeeting.optString("start_at","")));
                addRow(mb,"محل",nextMeeting.optString("location",""));
                body.addView(mb);
            }

            JSONObject docs=p.optJSONObject("documents");
            if(docs!=null&&(docs.optInt("missing",0)>0||docs.optInt("expiring",0)>0)){
                LinearLayout db=section("وضعیت مدارک");
                if(docs.optInt("missing",0)>0)addRow(db,"دریافت‌نشده",String.valueOf(docs.optInt("missing",0)));
                if(docs.optInt("expiring",0)>0)addRow(db,"نزدیک انقضا",String.valueOf(docs.optInt("expiring",0)));
                body.addView(db);
            }

            LinearLayout contact=section("اطلاعات تماس و پرونده");
            addRow(contact,"سمت",job); addRow(contact,"واحد",p.optString("department","")); addRow(contact,"ایمیل",p.optString("email","")); addRow(contact,"واتساپ",p.optString("whatsapp","")); addRow(contact,"آدرس",p.optString("address",""));
            JSONArray secondary=p.optJSONArray("secondary_phones"); if(secondary!=null&&secondary.length()>0)addRow(contact,"شماره‌های دیگر",secondary.toString().replace("[","").replace("]","").replace("\"",""));
            body.addView(contact);

            String summary=p.optString("ai_summary",""); String notes=p.optString("notes",""); String suggested=p.optString("suggested_message","");
            if(!summary.isEmpty()||!notes.isEmpty()||!suggested.isEmpty()){
                LinearLayout notesBox=section("یادداشت و شناخت مشتری"); addRow(notesBox,"خلاصه",summary); addRow(notesBox,"یادداشت",notes); addRow(notesBox,"پیام پیشنهادی",suggested); body.addView(notesBox);
            }

            JSONArray projects=p.optJSONArray("projects");
            if(projects!=null&&projects.length()>0){
                LinearLayout pb=section("پروژه‌ها / فرصت‌های فعال");
                for(int x=0;x<projects.length();x++){JSONObject q=projects.optJSONObject(x);if(q==null)continue;String line="◆ "+q.optString("title","")+" — "+projectType(q.optString("type",""))+" / "+projectStage(q.optString("stage","")); if(q.optDouble("value",0)>0)line+=" — "+String.format("%,.0f",q.optDouble("value",0)); pb.addView(text(line,13,x==0));}
                body.addView(pb);
            }

            JSONArray tasks=p.optJSONArray("open_tasks");
            if(tasks!=null&&tasks.length()>0){LinearLayout tb=section("پیگیری‌های باز");for(int x=0;x<tasks.length();x++){JSONObject q=tasks.optJSONObject(x);if(q==null)continue;tb.addView(text("✓ "+q.optString("title","")+(q.optString("due_label",q.optString("due_at","")).isEmpty()?"":" — "+q.optString("due_label",q.optString("due_at",""))),13,false));}body.addView(tb);}

            JSONArray history=p.optJSONArray("recent_history");
            if(history!=null&&history.length()>0){LinearLayout hb=section("سوابق اخیر");for(int x=0;x<history.length();x++){JSONObject q=history.optJSONObject(x);if(q==null)continue;String txt=q.optString("body",q.optString("subject",""));if(txt.length()>180)txt=txt.substring(0,180)+"…";hb.addView(text("• "+txt,12,false)); if(!q.optString("occurred_label",q.optString("occurred_at","")).isEmpty())hb.addView(text(q.optString("occurred_label",q.optString("occurred_at","")),10,false));}body.addView(hb);}

            LinearLayout actions=section("دسترسی سریع هنگام مکالمه");
            TextView hint=text("این صفحه عمداً کامل است تا هنگام صحبت بتوانی اطلاعات، پروژه‌ها و پیگیری‌ها را ببینی. اعلان Caller ID هم برای بازگشت سریع به پرونده باقی می‌ماند.",12,false); actions.addView(hint);
            Button open=new Button(this); open.setText("باز کردن پرونده کامل داخل CRM");
            final String pendingId = "organization".equals(entityType) && !id.startsWith("org:") ? "org:"+id : id;
            open.setOnClickListener(v->{SharedPreferences prefs=getSharedPreferences(CallerIdPlugin.PREFS,Context.MODE_PRIVATE);prefs.edit().putString(CallerIdPlugin.KEY_PENDING_OPEN,pendingId==null?"":pendingId).apply();Intent main=new Intent(this,MainActivity.class);main.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);startActivity(main);finish();});
            actions.addView(open); body.addView(actions);
        }
        setContentView(root);
        WindowManager.LayoutParams lp=getWindow().getAttributes(); lp.width=WindowManager.LayoutParams.MATCH_PARENT; lp.height=WindowManager.LayoutParams.MATCH_PARENT; lp.gravity=Gravity.TOP; getWindow().setAttributes(lp);
    }
}
