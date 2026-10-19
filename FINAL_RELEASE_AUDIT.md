# CRM-NIKARA v1.1.2 — Final Release Audit

**Product:** CRM-NIKARA  
**Developer:** H.Shirvani  
**Release:** 1.1.2 Professional Final

## Scope audited
- Persian/Jalali calendar picker, automatic date separators and Tehran timezone conversion
- General reminders, meetings and Android local notifications
- Exact-alarm special access and notification permission flow
- Customer receivables/payables and invoice allocation rules
- Document checklist, status, replacement files and expiry dates
- Projects, organizations, people and business-network relations
- Offline Caller ID and full customer/company account context
- Image/PDF/Excel attachment viewer
- Backup/restore and backward compatibility
- Android manifest/plugin generation and release signing workflow
- UI handler/dead-button prevention, dialog focus control, offline fonts and contrast baselines

## Design constraints
The app is offline-first and does not require a server. Android applicationId remains `com.aicrm.offline` so existing installed data can survive an in-place update.

## Reminder behavior
CRM-NIKARA requests Android notification permission and, where required, the Alarms & reminders special access for exact general/meeting/task reminders. The first reminder creation checks exact-alarm access and creates the dedicated `crm-nikara-reminders` channel before the immediate schedule call. Scheduled notifications use `allowWhileIdle`.

## Accounting boundary
The finance module is an operational CRM ledger for receivables/payables, invoice settlements and ageing. It is intentionally not a statutory double-entry accounting/ERP ledger.

## Final acceptance condition
Release is approved for Samsung device acceptance after both GitHub workflows **CRM-NIKARA CI** and **Build CRM-NIKARA Android** are green. Public distribution should use the signed Release workflow, not the debug APK.
