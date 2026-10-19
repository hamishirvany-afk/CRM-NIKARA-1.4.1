# معماری CRM-NIKARA 1.1.2

## Offline-first
Frontend + IndexedDB داخل APK/PWA منبع داده اصلی هستند. سرور برای عملیات روزمره لازم نیست.

## Data model
Organization → People → Projects/Opportunities → Business Network؛ در کنار Meetings، Tasks، Finance Entries، Document Checks، Attachments و Timeline.

## Android native layer
Capacitor + `CallScreeningService` + CallerIdPlugin + AttachmentViewerPlugin + LocalNotifications.

## بومی‌سازی
نمایش و ورود تاریخ‌ها شمسی است؛ برای ذخیره‌سازی و مرتب‌سازی، زمان استاندارد/ISO نگهداری و نمایش با `Asia/Tehran` انجام می‌شود.

## امنیت داده
داده‌ها در sandbox اپ هستند. Backup خروجی رمزنگاری اختصاصی ندارد.
