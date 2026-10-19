# CRM-NIKARA 1.1.4 — Professional & UX Final

**Developer: H.Shirvani**

CRM-NIKARA یک CRM آفلاین برای Android/PWA است که برای استفاده روزمره به Server URL، VPS یا Cloudflare نیاز ندارد.

## امکانات اصلی
- شرکت / سازمان و چندین فرد زیر هر شرکت
- پروژه‌ها و فرصت‌های کاری
- شبکه کاری: حمل‌ونقل، ترخیص، تأمین‌کننده، پزشک، داروخانه، بیمه، مالی و سایر روابط
- Caller ID آفلاین با پروفایل کامل مشتری و حساب شرکت هنگام تماس
- تقویم شمسی انتخابی با ورود خودکار اسلش، پیمایش صفحه‌کلید و منطقه زمانی تهران
- جلسه مستقل با یادآوری Android و دسترسی Alarms & reminders برای زمان‌بندی دقیق
- یادآوری عمومی مستقل از Task/Meeting با زمان‌بندی فوری در کانال اختصاصی Android
- پیگیری‌ها و Reminderهای محلی
- دفتر عملیاتی طلب/بدهی، دریافت/پرداخت، مانده فاکتور و Aging
- چک‌لیست مدارک موردنیاز/دریافت‌شده/تأییدشده/منقضی با فایل ضمیمه
- اسناد و فاکتورها: Image / PDF / Excel / CSV
- گزارش تماس، یادداشت متنی و Voice Note
- Timeline برای مشتری، شرکت و پروژه
- Import / Export CSV
- Backup / Restore کامل JSON
- ظاهر System / Light / Dark، متن درشت، کنتراست بالا و رابط موبایل Safe Area

## حریم خصوصی
CRM-NIKARA حساب آنلاین، تبلیغات یا Analytics داخلی ندارد. داده‌های عملیاتی داخل فضای محلی برنامه نگهداری می‌شوند. Backupهای خروجی رمزنگاری اختصاصی ندارند؛ آنها را در محل امن نگه دارید.

## Build
برای تست دستگاه از Workflow `Build CRM-NIKARA Android` استفاده کنید. برای انتشار عمومی از `Release CRM-NIKARA Android` و keystore خصوصی در GitHub Secrets استفاده شود.

## Update بدون حذف داده
Android applicationId عمداً `com.aicrm.offline` مانده است تا نصب APK جدید روی نسخه فعلی امکان حفظ دیتابیس آفلاین را داشته باشد. قبل از هر Update یک Backup JSON کامل بگیرید.

جزئیات تغییرات این بسته در `RELEASE_NOTES_FA.md` و نتایج کنترل‌ها در `FINAL_TEST_REPORT.md` آمده است.
