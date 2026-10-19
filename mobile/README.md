# CRM-NIKARA Mobile 1.1.2

Capacitor Android shell for CRM-NIKARA Professional Final.

- Product: CRM-NIKARA
- Developer: H.Shirvani
- Android applicationId: `com.aicrm.offline`
- Offline-first; no server URL is required.
- Caller ID, exact reminders, attachment viewer and local notifications are installed by `scripts/install-caller-id.mjs`.

The applicationId intentionally remains unchanged so an in-place APK update can preserve the existing app sandbox and IndexedDB data. Always export a JSON backup before installing a new APK.
