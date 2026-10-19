# گزارش جامع بررسی (Audit Report) — CRM-NIKARA v1.1.3

تاریخ: ۲۰۲۶-۱۰-۰۵ · حوزه: frontend / PWA / offline storage / native Android / Caller ID / UI-UX / test & CI
روش: بررسی کامل خط‌به‌خط هر لایه + اجرای قرارداد تست‌ها روی فایل‌ها

---

## ۱) معماری فعلی (خلاصه تأییدشده)

| لایه | فایل | وضعیت |
|---|---|---|
| UI (PWA تک‌صفحه، RTL، فارسی) | `frontend/index.html` + `style.css` | ۱۲ تب، نوار پاورقی موبایل، مودال متمرکز، تقویم شمسی اختصاصی |
| منطق برنامه | `frontend/app.js` (≈۱۵۹۲ خط) | مودال/تقویم/مالی/یادآوری/Caller ID sync/Backup |
| لایه داده | `frontend/offline-store.js` (≈۱۶۶۰ خط) | روتر محلی `OfflineDB.api('/api/*')` روی IndexedDB (`ai-crm-offline-v3`, نسخه ۱۰، ۱۴ Store) |
| پل | `native-bridge.js` (وب) / esbuild از `mobile/src/native-entry.js` | `window.NativeBridge {App, LocalNotifications, CallerId, AttachmentViewer}` |
| Native | `mobile/native-caller-id/*.java` (۴ کلاس) + `install-caller-id.mjs` | CallScreeningService + CallerIdActivity + FileProvider + اعلان |
| تولید | `sync-web.mjs` → `cap sync` → `install-caller-id.mjs` → gradle | ۳ Workflow: CI + APK + Release امضاشده |

## ۲) نقاط قوت (حفظ‌شوند)

1. **معماری Offline-first واقعی:** بدون هیچ وابستگی شبکه؛ CI تا پس‌زمانه ممنوعیت `server_url` را grep می‌کند. مرز API شبیه‌REST (`/api/*`) تمیز است و مسیر باز شدن به سرور/مهمانی آینده را بدون بازنویسی UI باز می‌گذارد.
2. **بهداشت داده:** نرمال‌سازی شماره ایران (`+98`)، پرچم opt-in `caller_id`، فیلتر دولایه JS+Native (`isCrmRegistered`)، یکتایی شماره/شرکت، اعتبارسنجی تخصیص مالی (جلوگیری از over-allocation و settlement بین‌پروژه‌ای).
3. **Caller ID درست طراحی‌شده:** «اول اجازه تماس، بعد شناسایی» (زنگ هرگز تعلیق نمی‌شود)، نقش `ROLE_CALL_SCREENING`، صفحه تمام‌صفحه `showWhenLocked`، دیباگ کامل (شمارنده تماس، آخرین خطا).
4. **تقویم شمسی قوی:** ورود خودکار اسلش، پیمایش کیبورد کامل (Arrow/Home/End/PageUp)، Roving tabindex + ARIA grid، منطقه زمانی تهران.
5. **امنیت XSS:** `esc()` به‌صورت سیستماتیک در همه‌ی رندرهای بررسی‌شده؛ `assetUrl` فقط `data:/blob:` را می‌پذیرد.
6. **دسترسی‌پذیری پایه:** Focus trap مودال + بازگرداندن فوکوس، `prefers-reduced-motion`، کنتراست بالا، متن درشت، WCAG-contrast تست‌شده.
7. **تست‌های قرارداد + یک تست integration رفتاری** (IDB در حافظه) که رفتار مالی/backup/migration را با اعداد دقیق می‌سنجد؛ CI با `cmp` byte-identical تضمین می‌کند bundle همان frontend است.
8. **install-caller-id مکررپذیر (idempotent)** با marker-check نهایی؛ ارتقا APK روی applicationId ثابت بدون از دست رفتن DB.
9. **نوشتن‌ها guarded:** همه handlers ذخیره در try/catch با toast خطا.

## ۳) نقاط ضعف (به اولویت)

### P0 — قابلیت اعتماد UX (کاربر عادی با «صفحه خالی» مواجه می‌شود)
- **هیچ loading state وجود ندارد** (نه `@keyframes`، نه spinner، نه skeleton؛ `aria-busy` هم نیست).
- **هر ~۳۵ خواندن غیرguarded است** (تنها `boot` catch دارد؛ `loadDashboard/loadOrganizations/loadContacts/loadProjects/loadFinance/loadDocuments/loadCalendar/loadReminders/loadTasks/loadPosts/loadEvents` + مودال‌های جزئی `openProject/openOrganization/openContact` و builders گزینه‌ها). اولین خطای IDB → پنل‌ها blank/جمد، بدون toast.
- **Toast تک‌حالت:** بدون success/error، ۲.۸ ثانیه، بدون دکمه بستن؛ پیام جدیدِ خطا روی پیام موفقیت روکش می‌شود.
- **`#recentContacts` داشبورد بدون حالت خالی** است (جدول خالی نمایش داده می‌شود).

### P0 — فرم‌ها
- **اعتبارسنجی inline وجود ندارد:** نام شخص/شرکت/عنوان پروژه/عنوان مدرک می‌تواند خالی ثبت شود؛ `required` روی `#rTitle` خنثی است (فهرم نیست).
- **دکمه save در حین ثبت disable نمی‌شود** → دو-کلیک = رکورد تکراری (به‌جز ضمیمه).
- **`confirm()`/`prompt()` نیتیو** (۱۲ + ۳ جایگاه) برای عملیات مخرب و یادداشت: بدون استایل، بدون RTL مناسب، بدون فوکوس، پیام `prompt` بی‌اعتبارسنجی وارد interaction می‌شود.

### P1 — داشبورد و ناوبری
- داشبورد: ۶ کارت ساده، بدون فعالیت اخیر/ترندها، pipeline بدون مجموع ارزش.
- کارت‌ها (`.contact-card`/`.org-card`/`.project-card`) **با کیبورد غیرقابل دسترس**‌اند (بدون `tabindex`/`role`)؛ سینتاکس `:focus-visible` CSS هیچ‌وقت فعال نمی‌شود.
- inputها و selectهای نوارابزار **label/aria-label ندارند**؛ تب فعال `aria-current` ندارد؛ `#nav` دسکتاپ بدون `aria-label`.

### P1 — PWA
- **هیچ «نسخه جدید موجود» handling وجود ندارد** (SW قبلی به‌صورت خاموش swap می‌شود).
- Manifest ناقص: فقط 192/512 بدون `purpose`، بدون `lang`/`orientation`/`shortcuts`؛ `apple-mobile-web-app-capable` هست ولی **`apple-touch-icon` لینک ندارد**؛ description فرسوده (1.1.2).

### P2 — پایدارسازی داده (offline-store.js)
- **Restore با `replace=true` تخریبی و غیراتومیک است:** ۱۴ clear متوالی → سپس record-by-record put (هرکدام transaction جدا؛ ۱۰هزار رکورد = ۱۰هزار+ transaction). قطع در میانه = DB نصفه با از دست رفتن داده اصلی.
- **marker `CRM-NIKARA-BACKUP` در import بررسی نمی‌شود** (هر JSON object با آرایه قبول می‌شود).
- `importBackup` **تعداد ورودی** را برمی‌گرداند، نه تعداد واقعیِ نوشته‌شده → toast موفقیت دروغین (رکوردهای حذف‌شده مثل `data_url` ناقص هم «بازیابی‌شده» شمرده می‌شوند).
- **CSV import خطاها را می‌بلعد:** `errors: []` همیشه خالی؛ ردیف‌های duplicate-phone بی‌سروصدا skip می‌شوند؛ `getAll('organizations')` دو بار **برای هر ردیف** اجرا می‌شود.
- **`ensureMigrations` reject را برای همیشه cache می‌کند** (L496-97): یک خطا در مهاجرت = تمام APIها تا reload reject می‌شوند (brick).
- phone-uniqueness check-then-act (race در چند-tab)؛ importBackup یکتایی شماره را بازسنجی نمی‌کند.
- آرشیو کردن شرکت، افراد آن را از KPI داشبورد پنهان می‌کند (بدون cascade).

### P2 — عملکرد (در مقیاس فعلی قابل تحمل، ولی ریسک رشد)
- `computeFinanceSummary` = O(I×E)؛ detail-viewها کل storeها را می‌خوانند؛ events log بی‌انتهای در داخل هر Backup.
- Attachments base64 (~۲۰MB در IDB برای هر ۱۵MB فایل) → ریسک quota.

### P2 — هماهنگی نسخه
- `1.1.2` / `1.1.3` در ۵+ جایگاه ناهماهنگ: footer سایدبار، پنل About، manifest description، backup `version:'1.1.2'`، `PRODUCT.version` در app.js. (نسخه فرمت backup '1.1.2' برای سازگاری با backupهای موجود کاربران **ثابت می‌ماند**؛ فقط UI/بیلد یکدست می‌شوند.)

## ۴) ریسک‌های آینده (تمهید در roadmap)

1. **بحران quota** با چند فایلی ۱۵MB → راه‌حل: هشدار ظرفیت + ذخیره فایل بزرگ در Filesystem API (فاز بعدی).
2. **روند multi-store atomik** برای فلوهای ترکیبی (attachment+interaction+party) → افزودن `bulkPut`/transaction helper (شروع در فاز ۵ برای restore).
3. **مهمانی به سرور:** مرز `/api/*` آماده است؛ برای sync، نیاز به conflict strategy و clock vector (طراحی در فاز ۷+؛ فعلاً فقط زمینه‌سازی: `updated_at` در همه رکوردها موجود است).
4. **CI fragility:** `cmp` byte-identical + grep منفی + نسخه hardcoded در ۵ فایل → هر bump نسخه، ویرایش هماهنگ ۵ نقطه (راهنما در ROADMAP).
5. **ICUpartial:** aging به `Asia/Tehran` وابسته است؛ در runtime با ICU ناقص، همه معوق «تأخیرندار» دیده می‌شوند (silent).

## ۵) فرصت‌ها (شانس ارتقای محصول)

- **داشبورد واقعی:** KPI + فعالیت اخیر + quick actions (فاز ۲).
- **حالت‌های empty با CTA** (دکمه «اولین شرکت را بساز») → onboarding خودساز (فاز ۱).
- **دیالوگ تایید اختصاصی** → حذف کامل `confirm()` (فاز ۳).
- **نوسازی PWA** با بنر «بروزرسانی موجود» (فاز ۴).
- **Restore ایمن:** marker validation + بازنویسی برشمرده + اعداد واقعی (فاز ۵).

## ۶) نتیجه‌گیری ارزیابی UX پرسش‌شده

- «آیا ساده و شهودی است؟» — **بله برای جریان اصلی** (افزودن سریع، جستجو، مودال جزئی یکپارچه)، **اما** بدون هر خطا/داده‌خوانیِ ناکام UI «مُرده» به نظر می‌رسد (بدون پیام، بدون retry).
- «کاربر غیرفنی مخاطب و تماس را مدیریت می‌کند؟» — **بله**؛ Caller ID + اعلان + مودال جزئی خوب است؛ سرنخ‌های یادآوری دقیق هم موجودند.
- «مراحل غیرضروری؟» — نه در CRUD؛ **اما** `prompt()` برای یادداشت و `confirm()` خام برای حذف، دو UX کهنه‌اند.
- «صفحات گیج‌کننده؟» — صفحات اصلی شفافند؛ **داشبورد** با اطلاعات کم/بی‌وقتی‌بندی، تنها پنلی است که «حرفه‌ای» به نظر نمی‌رسد.
- «امکانات CRM حرفه‌ایِ نایاب؟» — بدون حساب/ابر: **فعالیت‌های اخیر، وضعیت خالی هدایت‌شونده، دیالوگ تایید، نوسازی PWA، بخش فعالیت داشبورد** — همین‌ها ۸۰٪ حس SaaS را می‌سازند.

---

# ROADMAP — بهبودهای اولویت‌دار

> اصل: **بازنویسی بدون نیاز؛ ارتقاء لایه‌ها به همان جا.** همه تغییرات فاز ۱–۶ بدون تغییر قرارداد تست‌ها هستند؛ فاز ۷ فقط bump نسخه هماهنگ‌شده است.

| فاز | عنوان | خروجی | ریسک |
|---|---|---|---|
| **۱** | بنیان UX: toast سه‌حالت + حالت error/empty/loading + retry برای همه listها | `app.js` + `style.css` + `index.html` | کم |
| **۲** | داشبورد مدرن: کارت‌های KPI با آیکون/رنگ، pipeline با مجموع، پنل «فعالیت‌های اخیر»، quick actions | `app.js` + `style.css` + `index.html` | کم |
| **۳** | فرم‌ها و دیالوگ‌ها: اعتبارسنجی inline، دکمه save در حال ثبت، `askConfirm` اختصاصی (حذف ۱۲ confirm)، مودال یادداشت (حذف ۳ prompt) | `app.js` + `style.css` + `index.html` | متوسط |
| **۴** | PWA: بنر «نسخه جدید»، manifest کامل، apple-touch-icon | `sw.js` + `app.js` + `manifest` + `index.html` | کم |
| **۵** | پایدارسازی داده: marker validation در restore، `bulkPut` (transaction واحد به ازای هر store)، آمار واقعی restore، خطاهای CSV، reset مهاجرت در صورت خطا | `offline-store.js` | متوسط |
| **۶** | دسترس‌پذیری: aria-label نوارابزارها، `aria-current` تب فعال، کیبورد روی کارت‌ها | `app.js` + `index.html` + `style.css` | کم |
| **۷** | نسخه ۱.۱.۴ «Professional UX»: bump هماهنگ (package.json، installer، workflowها، تست اندروید، sw cache، CHANGELOG، README، schema) | ۵+ فایل | کم (هماهنگ) |

**خارج از scope این دور** (برای نسخه بعد): sync به سرور، ذخیره فایل بزرگ با Filesystem API، batch-transactions همه فلوهای ترکیبی،translation انگلیسی، نام‌بردهی بحث‌های AI محلی.

## خط قرمزها (قراردادهای تستی که حفظ می‌شوند)

- `DB_NAME='ai-crm-offline-v3'`، `DB_VERSION=10`، STORES تک‌خطی، backup `version:'1.1.2'` (فرمت)، base اعلان 300000000، اعداد دقیق تست مالی/داشبورد/CSV.
- `mobile/package.json` + installer + workflow + `android-contract.mjs` در فاز ۷ **یکجا** bump می‌شوند.
- رشته‌های contract داخل `app.js` (reminder-block، `allowWhileIdle:true`، `rows.filter(callerIdEligible)`، `addListener('localNotificationActionPerformed'` تکی با ترتیب `meeting_id`←`project_id` و …) دست نمی‌خورند.
- HTML: دقیقاً ۵ دکمه bottom-nav، markerهای محصول، idها و اribا-attributes تست‌شده، بدون id تکراری/دکمه خالی.
- CSS: `.btn.success{color:#fff`، `:focus-visible`، `prefers-reduced-motion:reduce`، `html[data-contrast="high"]`، safe-area/dvh/min-height، `.reminder-row`، `.calendar-chip.reminder` حفظ می‌شوند.
