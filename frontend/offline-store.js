(() => {
  'use strict';

  // Keep the v3 database name so installing/updating the APK preserves existing local data.
  const DB_NAME = 'ai-crm-offline-v3';
  const DB_VERSION = 11;
  const STORES = ['organizations', 'contacts', 'projects', 'project_participants', 'interactions', 'attachments', 'organization_links', 'tasks', 'meetings', 'reminders', 'finance_entries', 'document_checks', 'posts', 'events', 'products', 'invoices', 'app_settings'];
  const STAGES = ['new','contacted','qualified','proposal','negotiation','follow_up','won','lost'];
  const PROJECT_STAGES = ['new','qualified','quotation','approved','in_progress','waiting','completed','won','lost','cancelled'];
  const PROJECT_TYPES = ['opportunity','order','import','export','procurement','logistics','medical','service','other'];
  const MEETING_STATUSES = ['planned','done','cancelled'];
  const FINANCE_KINDS = ['sales_invoice','receipt','purchase_invoice','payment','receivable_adjustment','payable_adjustment'];
  const DOCUMENT_STATUSES = ['required','received','verified','rejected'];
  let dbPromise = null;
  let migrationPromise = null;

  const nowIso = () => new Date().toISOString();
  const uuid = () => globalThis.crypto?.randomUUID?.() || ('id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of STORES) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('باز کردن دیتابیس آفلاین ناموفق بود'));
    });
    return dbPromise;
  }

  async function getAll(name) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(name, 'readonly');
      const req = tx.objectStore(name).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error || new Error('خواندن اطلاعات ناموفق بود'));
    });
  }

  async function getOne(name, id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(name, 'readonly');
      const req = tx.objectStore(name).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('خواندن رکورد ناموفق بود'));
    });
  }

  async function put(name, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(name, 'readwrite');
      tx.objectStore(name).put(value);
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error || new Error('ذخیره اطلاعات ناموفق بود'));
    });
  }

  async function bulkPut(name, values = []) {
    if (!values.length) return [];
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(name, 'readwrite');
      for (const value of values) tx.objectStore(name).put(value);
      tx.oncomplete = () => resolve(values);
      tx.onerror = () => reject(tx.error || new Error('ذخیره اطلاعات ناموفق بود'));
    });
  }

  async function clearStore(name) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(name, 'readwrite');
      tx.objectStore(name).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('پاک‌سازی ناموفق بود'));
    });
  }

  async function removeOne(name, id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(name, 'readwrite');
      tx.objectStore(name).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('حذف رکورد ناموفق بود'));
    });
  }

  function toLatinDigits(v='') {
    return String(v ?? '').replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  }
  function digitsOnly(v='') { return toLatinDigits(v).replace(/\D/g, ''); }
  function defaultAreaCode() {
    try {
      const v = digitsOnly(globalThis.localStorage?.getItem('nikara-default-area-code') || '21').replace(/^0+/, '');
      return /^[1-8]\d$/.test(v) ? v : '21';
    } catch (_err) { return '21'; }
  }
  // Canonical phone format: E.164 (+98XXXXXXXXXX for Iran). Accepts Persian/Arabic digits, spaces, dashes,
  // 0912…, 912…, 0098…, 98…, +98…, landlines with area code (021…) and 8-digit local landlines (default area code).
  function normalizePhone(raw='') {
    const s = toLatinDigits(raw).trim();
    let d = digitsOnly(s);
    if (!d) return '';
    const intl = s.startsWith('+') || d.startsWith('00');
    if (d.startsWith('00')) d = d.slice(2);
    if (intl && !d.startsWith('98')) return '+' + d;
    if (d.startsWith('98') && (intl || d.length === 12)) d = d.slice(2);
    if (d.startsWith('0') && d.length === 11) d = d.slice(1);
    if (d.length === 8 && /^[2-9]/.test(d)) d = defaultAreaCode() + d;
    if (d.length === 10 && /^[1-9]/.test(d)) return '+98' + d;
    return intl ? '+98' + d : d;
  }

  function normalizePhoneList(values) {
    const arr = Array.isArray(values) ? values : String(values || '').split(/[|،,;\n]+/);
    return [...new Set(arr.map(normalizePhone).filter(Boolean))];
  }

  function normalizeTextList(values) {
    const arr = Array.isArray(values) ? values : String(values || '').split(/[|،,;\n]+/);
    return [...new Set(arr.map(x => String(x || '').trim()).filter(Boolean))];
  }

  // ===== v1.3.0 Persian-aware search =====
  // Same result whether the user types ي/ی، ك/ک، with or without نیم‌فاصله, Persian or Latin digits.
  function searchNorm(v = '') {
    return toLatinDigits(String(v ?? ''))
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[ۀة]/g, 'ه').replace(/[أإآٱ]/g, 'ا').replace(/ؤ/g, 'و').replace(/ئ/g, 'ی')
      .replace(/[\u200c\u200d\u200e\u200f\u00a0]/g, ' ')
      .replace(/[\s\-_.,،;:|/\\()]+/g, ' ')
      .trim();
  }
  function phoneQueryVariants(q = '') {
    const raw = toLatinDigits(String(q || '')).trim();
    if (/[^\d\s+\-()]/.test(raw)) return [];
    const d = digitsOnly(raw);
    if (d.length < 3) return [];
    const out = new Set([d]);
    if (d.startsWith('0098')) out.add(d.slice(4));
    if (d.startsWith('98') && d.length >= 12) out.add(d.slice(2));
    if (d.startsWith('0') && d.length > 3) out.add(d.slice(1));
    return [...out].filter(x => x.length >= 3);
  }
  // Every word of the query must appear somewhere (name, company, title...). Phone digits match partially.
  function matchesQuery(fields = [], q = '', phones = []) {
    const nq = searchNorm(q);
    if (!nq) return true;
    const hay = ' ' + searchNorm(fields.flat().filter(v => v != null).join(' ')) + ' ';
    const hayTight = hay.replace(/\s+/g, '');
    if (nq.split(' ').every(t => hay.includes(t) || hayTight.includes(t))) return true;
    const variants = phoneQueryVariants(q);
    if (variants.length) {
      const digits = phones.flat().filter(Boolean).map(digitsOnly);
      if (digits.some(p => variants.some(v => p.includes(v)))) return true;
    }
    return false;
  }
  function searchScore(name = '', q = '') {
    const n = searchNorm(name), nq = searchNorm(q);
    if (!nq) return 0;
    if (n === nq) return 100;
    if (n.startsWith(nq)) return 60;
    if (n.split(' ').some(w => w.startsWith(nq))) return 40;
    if (n.includes(nq)) return 25;
    return 0;
  }
  function attachmentPublic(a) {
    if (!a) return a;
    const { data_url, ...rest } = a;
    return { ...rest, has_file: Boolean(data_url) };
  }

  function contactName(c) {
    const full = `${c.first_name || ''} ${c.last_name || ''}`.trim();
    return full || c.name || c.phone || c.email || 'بدون نام';
  }

  const CALLER_ID_UNVERIFIED_SOURCES = new Set(['device-contacts', 'caller-id-cache']);
  function resolveCallerIdFlag(input = {}, existing = null) {
    if (typeof input.caller_id === 'boolean') return input.caller_id;
    if (typeof existing?.caller_id === 'boolean') return existing.caller_id;
    const src = String(input.source ?? existing?.source ?? 'offline').trim();
    return !CALLER_ID_UNVERIFIED_SOURCES.has(src);
  }

  function normalizeOrganization(input = {}, existing = null) {
    const created = existing?.created_at || input.created_at || nowIso();
    const mainPhoneRaw = input.main_phone_raw ?? input.main_phone ?? existing?.main_phone_raw ?? existing?.main_phone ?? '';
    const org = {
      id: input.id || existing?.id || uuid(),
      name: String(input.name ?? existing?.name ?? input.company ?? '').trim(),
      legal_name: String(input.legal_name ?? existing?.legal_name ?? '').trim(),
      industry: String(input.industry ?? existing?.industry ?? '').trim(),
      website: String(input.website ?? existing?.website ?? '').trim(),
      main_phone: normalizePhone(mainPhoneRaw),
      main_phone_raw: String(mainPhoneRaw || '').trim(),
      phones: normalizePhoneList(input.phones ?? existing?.phones ?? []),
      email: String(input.email ?? existing?.email ?? '').trim(),
      emails: normalizeTextList(input.emails ?? existing?.emails ?? []),
      address: String(input.address ?? existing?.address ?? '').trim(),
      national_id: String(input.national_id ?? existing?.national_id ?? '').trim(),
      economic_code: String(input.economic_code ?? existing?.economic_code ?? '').trim(),
      source: String(input.source ?? existing?.source ?? 'offline').trim(),
      status: STAGES.includes(input.status) ? input.status : (existing?.status || 'new'),
      deal_value: Number(input.deal_value ?? existing?.deal_value ?? 0) || 0,
      notes: String(input.notes ?? existing?.notes ?? ''),
      relationship_types: normalizeTextList(input.relationship_types ?? input.account_types ?? existing?.relationship_types ?? []),
      tags: normalizeTextList(input.tags ?? existing?.tags ?? []),
      archived: Boolean(input.archived ?? existing?.archived ?? false),
      primary_contact_id: input.primary_contact_id ?? existing?.primary_contact_id ?? null,
      caller_id: resolveCallerIdFlag(input, existing),
      last_contact_at: input.last_contact_at ?? existing?.last_contact_at ?? null,
      created_at: created,
      updated_at: nowIso(),
    };
    if (org.main_phone && !org.phones.includes(org.main_phone)) org.phones.unshift(org.main_phone);
    if (org.email && !org.emails.includes(org.email)) org.emails.unshift(org.email);
    return org;
  }

  function normalizeContact(input = {}, existing = null) {
    const created = existing?.created_at || input.created_at || nowIso();
    const rawPhone = String(input.phone_raw ?? input.phone ?? existing?.phone_raw ?? existing?.phone ?? '').trim();
    const secondary = normalizePhoneList(input.secondary_phones ?? input.phones ?? existing?.secondary_phones ?? []);
    const primary = normalizePhone(rawPhone);
    const c = {
      id: input.id || existing?.id || uuid(),
      first_name: String(input.first_name ?? existing?.first_name ?? '').trim(),
      last_name: String(input.last_name ?? existing?.last_name ?? '').trim(),
      // Explicit null must unlink ("??" used to silently keep the old company).
      organization_id: Object.prototype.hasOwnProperty.call(input, 'organization_id') ? (input.organization_id || null) : (existing?.organization_id ?? null),
      company: String(input.company ?? existing?.company ?? '').trim(), // denormalized for v2/v3 compatibility
      job_title: String(input.job_title ?? existing?.job_title ?? '').trim(),
      department: String(input.department ?? existing?.department ?? '').trim(),
      phone: primary,
      phone_raw: rawPhone,
      secondary_phones: secondary.filter(p => p !== primary),
      email: String(input.email ?? existing?.email ?? '').trim(),
      secondary_emails: normalizeTextList(input.secondary_emails ?? existing?.secondary_emails ?? []),
      whatsapp: String(input.whatsapp ?? existing?.whatsapp ?? '').trim(),
      address: String(input.address ?? existing?.address ?? '').trim(),
      source: String(input.source ?? existing?.source ?? 'offline').trim(),
      status: STAGES.includes(input.status) ? input.status : (existing?.status || 'new'),
      deal_value: Number(input.deal_value ?? existing?.deal_value ?? 0) || 0,
      ai_score: Number(input.ai_score ?? existing?.ai_score ?? 0) || 0,
      ai_summary: String(input.ai_summary ?? existing?.ai_summary ?? ''),
      next_action: String(input.next_action ?? existing?.next_action ?? ''),
      suggested_message: String(input.suggested_message ?? existing?.suggested_message ?? ''),
      consent_marketing: Boolean(input.consent_marketing ?? existing?.consent_marketing ?? false),
      is_primary_contact: Boolean(input.is_primary_contact ?? existing?.is_primary_contact ?? false),
      // Caller ID only for real CRM records. Phonebook imports stay hidden until user approves them.
      caller_id: resolveCallerIdFlag(input, existing),
      notes: String(input.notes ?? existing?.notes ?? ''),
      relationship_types: normalizeTextList(input.relationship_types ?? input.account_types ?? existing?.relationship_types ?? []),
      archived: Boolean(input.archived ?? existing?.archived ?? false),
      tags: normalizeTextList(input.tags ?? existing?.tags ?? []),
      extra: input.extra && typeof input.extra === 'object' ? input.extra : (existing?.extra || {}),
      last_contact_at: input.last_contact_at ?? existing?.last_contact_at ?? null,
      created_at: created,
      updated_at: nowIso(),
    };
    c.name = contactName(c);
    return c;
  }

  function normalizeProject(input = {}, existing = null) {
    const created = existing?.created_at || input.created_at || nowIso();
    const stage = PROJECT_STAGES.includes(input.stage) ? input.stage : (existing?.stage || 'new');
    const type = PROJECT_TYPES.includes(input.type) ? input.type : (existing?.type || 'opportunity');
    return {
      id: input.id || existing?.id || uuid(),
      title: String(input.title ?? existing?.title ?? '').trim(),
      reference_no: String(input.reference_no ?? existing?.reference_no ?? '').trim(),
      type,
      stage,
      customer_organization_id: input.customer_organization_id ?? existing?.customer_organization_id ?? null,
      customer_contact_id: input.customer_contact_id ?? existing?.customer_contact_id ?? null,
      value: Number(input.value ?? existing?.value ?? 0) || 0,
      currency: String(input.currency ?? existing?.currency ?? 'IRR').trim() || 'IRR',
      probability: Math.max(0, Math.min(100, Number(input.probability ?? existing?.probability ?? 0) || 0)),
      expected_close: input.expected_close ?? existing?.expected_close ?? null,
      start_date: input.start_date ?? existing?.start_date ?? null,
      end_date: input.end_date ?? existing?.end_date ?? null,
      notes: String(input.notes ?? existing?.notes ?? ''),
      tags: normalizeTextList(input.tags ?? existing?.tags ?? []),
      archived: Boolean(input.archived ?? existing?.archived ?? false),
      created_at: created,
      updated_at: nowIso(),
    };
  }

  function normalizeProjectParticipant(input = {}, existing = null) {
    return {
      id: input.id || existing?.id || uuid(),
      project_id: input.project_id ?? existing?.project_id ?? null,
      organization_id: input.organization_id ?? existing?.organization_id ?? null,
      contact_id: input.contact_id ?? existing?.contact_id ?? null,
      role: String(input.role ?? existing?.role ?? 'partner').trim() || 'partner',
      note: String(input.note ?? existing?.note ?? ''),
      created_at: existing?.created_at || input.created_at || nowIso(),
      updated_at: nowIso(),
    };
  }

  function normalizeMeeting(input = {}, existing = null) {
    const created = existing?.created_at || input.created_at || nowIso();
    const start = input.start_at ?? existing?.start_at ?? null;
    const end = input.end_at ?? existing?.end_at ?? null;
    return {
      id: input.id || existing?.id || uuid(),
      title: String(input.title ?? existing?.title ?? 'جلسه').trim() || 'جلسه',
      contact_id: input.contact_id ?? existing?.contact_id ?? null,
      organization_id: input.organization_id ?? existing?.organization_id ?? null,
      project_id: input.project_id ?? existing?.project_id ?? null,
      start_at: start,
      end_at: end,
      reminder_minutes: Math.max(0, Number(input.reminder_minutes ?? existing?.reminder_minutes ?? 60) || 0),
      location: String(input.location ?? existing?.location ?? '').trim(),
      notes: String(input.notes ?? existing?.notes ?? ''),
      status: MEETING_STATUSES.includes(input.status) ? input.status : (existing?.status || 'planned'),
      created_at: created,
      updated_at: nowIso(),
    };
  }

  function reminderNotificationId(id = '') {
    let hash = 2166136261;
    for (const char of String(id)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return 300000000 + ((hash >>> 0) % 99999999);
  }

  function normalizeReminder(input = {}, existing = null) {
    const created = existing?.created_at || input.created_at || nowIso();
    const id = input.id || existing?.id || uuid();
    const status = ['active','done','cancelled'].includes(input.status) ? input.status : (existing?.status || 'active');
    return {
      id,
      notification_id: Number(input.notification_id ?? existing?.notification_id) || reminderNotificationId(id),
      title: String(input.title ?? existing?.title ?? '').trim(),
      body: String(input.body ?? existing?.body ?? '').trim(),
      remind_at: input.remind_at ?? existing?.remind_at ?? null,
      contact_id: input.contact_id ?? existing?.contact_id ?? null,
      organization_id: input.organization_id ?? existing?.organization_id ?? null,
      project_id: input.project_id ?? existing?.project_id ?? null,
      status,
      created_at: created,
      updated_at: nowIso(),
    };
  }

  function normalizeFinanceEntry(input = {}, existing = null) {
    const created = existing?.created_at || input.created_at || nowIso();
    const kind = FINANCE_KINDS.includes(input.kind) ? input.kind : (existing?.kind || 'sales_invoice');
    const amountRial = Math.max(0, Number(input.amount_rial ?? existing?.amount_rial ?? 0) || 0);
    const adjustmentSign = Number(input.adjustment_sign ?? existing?.adjustment_sign ?? 1) < 0 ? -1 : 1;
    return {
      id: input.id || existing?.id || uuid(),
      party_type: ['organization','contact'].includes(input.party_type) ? input.party_type : (existing?.party_type || 'organization'),
      party_id: input.party_id ?? existing?.party_id ?? null,
      project_id: input.project_id ?? existing?.project_id ?? null,
      kind,
      amount_rial: amountRial,
      adjustment_sign: adjustmentSign,
      posting_date: input.posting_date ?? existing?.posting_date ?? nowIso().slice(0,10),
      due_date: input.due_date ?? existing?.due_date ?? null,
      reference_no: String(input.reference_no ?? existing?.reference_no ?? '').trim(),
      reference_entry_id: input.reference_entry_id ?? existing?.reference_entry_id ?? null,
      note: String(input.note ?? existing?.note ?? ''),
      created_at: created,
      updated_at: nowIso(),
    };
  }

  function financeEffects(entry) {
    const amount = Math.max(0, Number(entry?.amount_rial || 0));
    switch (entry?.kind) {
      case 'sales_invoice': return { receivable: amount, payable: 0 };
      case 'receipt': return { receivable: -amount, payable: 0 };
      case 'purchase_invoice': return { receivable: 0, payable: amount };
      case 'payment': return { receivable: 0, payable: -amount };
      case 'receivable_adjustment': return { receivable: amount * (Number(entry.adjustment_sign || 1) < 0 ? -1 : 1), payable: 0 };
      case 'payable_adjustment': return { receivable: 0, payable: amount * (Number(entry.adjustment_sign || 1) < 0 ? -1 : 1) };
      default: return { receivable: 0, payable: 0 };
    }
  }

  function financeInvoiceOutstanding(invoice, entries) {
    if (!invoice || !['sales_invoice','purchase_invoice'].includes(invoice.kind)) return 0;
    const settlementKind = invoice.kind === 'sales_invoice' ? 'receipt' : 'payment';
    const paid = entries
      .filter(e => e.kind === settlementKind && e.reference_entry_id === invoice.id)
      .reduce((sum,e) => sum + Math.max(0, Number(e.amount_rial || 0)), 0);
    return Math.max(0, Number(invoice.amount_rial || 0) - paid);
  }

  function computeFinanceSummary(entries = []) {
    let receivableBase = 0, payableBase = 0, overdueReceivable = 0, overduePayable = 0;
    const ageTemplate = () => ({ not_due: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 });
    const receivableAgeing = ageTemplate(), payableAgeing = ageTemplate();
    const today = todayTehranYmd();

    // Invoice balances are based on explicit allocations. Unallocated receipts/payments
    // are treated as customer credits / supplier advances instead of negative balances.
    for (const e of entries) {
      if (e.kind === 'sales_invoice') receivableBase += financeInvoiceOutstanding(e, entries);
      else if (e.kind === 'purchase_invoice') payableBase += financeInvoiceOutstanding(e, entries);
      else if (e.kind === 'receivable_adjustment') receivableBase += Math.max(0, Number(e.amount_rial || 0)) * (Number(e.adjustment_sign || 1) < 0 ? -1 : 1);
      else if (e.kind === 'payable_adjustment') payableBase += Math.max(0, Number(e.amount_rial || 0)) * (Number(e.adjustment_sign || 1) < 0 ? -1 : 1);
      else if (e.kind === 'receipt' && !e.reference_entry_id) payableBase += Math.max(0, Number(e.amount_rial || 0)); // advance received: we owe the party
      else if (e.kind === 'payment' && !e.reference_entry_id) receivableBase += Math.max(0, Number(e.amount_rial || 0)); // advance paid: party owes us
    }

    for (const e of entries.filter(e => ['sales_invoice','purchase_invoice'].includes(e.kind))) {
      const outstanding = financeInvoiceOutstanding(e, entries);
      if (outstanding <= 0) continue;
      const target = e.kind === 'sales_invoice' ? receivableAgeing : payableAgeing;
      if (!e.due_date || String(e.due_date) >= today) { target.not_due += outstanding; continue; }
      const dueMs = Date.parse(`${e.due_date}T12:00:00Z`), todayMs = Date.parse(`${today}T12:00:00Z`);
      const days = Number.isFinite(dueMs) ? Math.max(0, Math.floor((todayMs - dueMs) / 86400000)) : 0;
      if (days <= 30) target.d0_30 += outstanding;
      else if (days <= 60) target.d31_60 += outstanding;
      else if (days <= 90) target.d61_90 += outstanding;
      else target.d90_plus += outstanding;
      if (e.kind === 'sales_invoice') overdueReceivable += outstanding;
      else overduePayable += outstanding;
    }

    const receivable = Math.max(0, receivableBase) + Math.max(0, -payableBase);
    const payable = Math.max(0, payableBase) + Math.max(0, -receivableBase);
    return {
      receivable_rial: receivable,
      payable_rial: payable,
      net_rial: receivable - payable,
      overdue_receivable_rial: overdueReceivable,
      overdue_payable_rial: overduePayable,
      receivable_ageing: receivableAgeing,
      payable_ageing: payableAgeing,
      unallocated_receipts_rial: entries.filter(e => e.kind === 'receipt' && !e.reference_entry_id).reduce((s,e)=>s+Number(e.amount_rial||0),0),
      unallocated_payments_rial: entries.filter(e => e.kind === 'payment' && !e.reference_entry_id).reduce((s,e)=>s+Number(e.amount_rial||0),0),
    };
  }

  function normalizeDocumentCheck(input = {}, existing = null) {
    const created = existing?.created_at || input.created_at || nowIso();
    return {
      id: input.id || existing?.id || uuid(),
      scope_type: ['organization','contact','project'].includes(input.scope_type) ? input.scope_type : (existing?.scope_type || 'organization'),
      scope_id: input.scope_id ?? existing?.scope_id ?? null,
      title: String(input.title ?? existing?.title ?? 'مدرک').trim() || 'مدرک',
      category: String(input.category ?? existing?.category ?? 'other').trim() || 'other',
      document_no: String(input.document_no ?? existing?.document_no ?? '').trim(),
      issuer: String(input.issuer ?? existing?.issuer ?? '').trim(),
      status: DOCUMENT_STATUSES.includes(input.status) ? input.status : (existing?.status || 'required'),
      received_date: input.received_date ?? existing?.received_date ?? null,
      expiry_date: input.expiry_date ?? existing?.expiry_date ?? null,
      note: String(input.note ?? existing?.note ?? ''),
      attachment_id: input.attachment_id ?? existing?.attachment_id ?? null,
      created_at: created,
      updated_at: nowIso(),
    };
  }

  function todayTehranYmd() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date());
    const x = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
    return `${x.year}-${x.month}-${x.day}`;
  }

  function effectiveDocumentStatus(doc) {
    if (doc?.expiry_date && ['received','verified'].includes(doc.status)) {
      if (String(doc.expiry_date) < todayTehranYmd()) return 'expired';
    }
    return doc?.status || 'required';
  }


  async function recordEvent(event_type, payload = {}) {
    const ev = { id: uuid(), event_type, payload: clone(payload), delivered: true, attempts: 0, last_error: '', next_attempt_at: null, last_attempt_at: null, created_at: nowIso() };
    await put('events', ev);
    return ev;
  }

  function parseUrl(path) { return new URL(path, 'https://offline.local'); }

  async function ensureUniquePhones(primary, secondary = [], exceptId = '') {
    const wanted = new Set([primary, ...secondary].map(normalizePhone).filter(Boolean));
    if (!wanted.size) return;
    const rows = await getAll('contacts');
    for (const c of rows) {
      if (c.archived || c.id === exceptId) continue;
      const theirs = [c.phone, ...(c.secondary_phones || [])].map(normalizePhone).filter(Boolean);
      if (theirs.some(p => wanted.has(p))) throw new Error('یکی از شماره‌های این شخص قبلاً برای مخاطب دیگری ثبت شده است');
    }
  }

  async function ensureUniqueOrganizationPhones(org, exceptId = '') {
    const wanted = new Set([org.main_phone, ...(org.phones || [])].map(normalizePhone).filter(Boolean));
    if (!wanted.size) return;
    const rows = await getAll('organizations');
    for (const o of rows) {
      if (o.archived || o.id === exceptId) continue;
      const theirs = [o.main_phone, ...(o.phones || [])].map(normalizePhone).filter(Boolean);
      if (theirs.some(p => wanted.has(p))) throw new Error('این شماره قبلاً برای شرکت دیگری ثبت شده است');
    }
  }

  async function ensureUniqueOrganizationName(name, exceptId = '') {
    const wanted = searchNorm(name);
    if (!wanted) return;
    const rows = await getAll('organizations');
    const duplicate = rows.find(o => !o.archived && o.id !== exceptId && searchNorm(o.name) === wanted);
    if (duplicate) throw new Error('شرکتی با این نام قبلاً ثبت شده است؛ همان پرونده را باز کن و افراد جدید را به آن اضافه کن');
  }

  async function setPrimaryContact(organizationId, contactId) {
    if (!organizationId) return;
    const contacts = await getAll('contacts');
    for (const row of contacts) {
      if (row.organization_id !== organizationId) continue;
      const shouldBePrimary = row.id === contactId;
      if (Boolean(row.is_primary_contact) !== shouldBePrimary) {
        row.is_primary_contact = shouldBePrimary;
        row.updated_at = nowIso();
        await put('contacts', row);
      }
    }
    const org = await getOne('organizations', organizationId);
    if (org) {
      org.primary_contact_id = contactId || null;
      org.updated_at = nowIso();
      await put('organizations', org);
    }
  }

  async function clearPrimaryContactIfNeeded(organizationId, contactId) {
    if (!organizationId || !contactId) return;
    const org = await getOne('organizations', organizationId);
    if (org && org.primary_contact_id === contactId) {
      org.primary_contact_id = null;
      org.updated_at = nowIso();
      await put('organizations', org);
    }
  }

  async function findOrCreateOrganizationByName(name, seed = {}) {
    const clean = String(name || '').trim();
    if (!clean) return null;
    const rows = await getAll('organizations');
    const found = rows.find(o => !o.archived && searchNorm(o.name) === searchNorm(clean));
    if (found) return found;
    const org = normalizeOrganization({ ...seed, name: clean, source: seed.source || 'legacy-migration' });
    await put('organizations', org);
    return org;
  }

  async function ensureMigrations() {
    if (migrationPromise) return migrationPromise;
    migrationPromise = (async () => {
      try {
        await openDb();
        const contacts = await getAll('contacts');
        const organizations = await getAll('organizations');
        const byName = new Map(organizations.map(o => [String(o.name || '').trim().toLowerCase(), o]));
        let migrated = 0;
        const orgIds = new Set(organizations.map(o => o.id));
        for (const c of contacts) {
          const companyName = String(c.company || '').trim();
          const missingLinkedOrg = c.organization_id && !orgIds.has(c.organization_id);
          if (c.organization_id && !missingLinkedOrg) continue;
          if (!companyName) {
            if (missingLinkedOrg) { c.organization_id = null; c.updated_at = nowIso(); await put('contacts', c); migrated++; }
            continue;
          }
          const key = companyName.toLowerCase();
          let org = byName.get(key);
          if (!org) {
            org = normalizeOrganization({ name: companyName, address: c.address || '', source: 'v3-company-migration' });
            await put('organizations', org);
            byName.set(key, org);
            orgIds.add(org.id);
          }
          c.organization_id = org.id;
          c.company = org.name;
          c.updated_at = nowIso();
          await put('contacts', c);
          migrated++;
        }
        if (migrated) await recordEvent('schema.v4.organizations_migrated', { contacts: migrated });
      } catch (error) {
        migrationPromise = null;
        throw error;
      }
    })();
    return migrationPromise;
  }

  async function hydrateContact(c, orgMap = null) {
    if (!c) return null;
    const org = c.organization_id
      ? (orgMap?.get(c.organization_id) || await getOne('organizations', c.organization_id))
      : null;
    const out = { ...c, name: contactName(c), organization: org || null };
    if (org) out.company = org.name;
    return out;
  }

  async function getContactDetail(id) {
    const c = await getOne('contacts', id);
    if (!c) throw new Error('مخاطب پیدا نشد');
    const [interactions, tasks, attachments, projects, participants] = await Promise.all([getAll('interactions'), getAll('tasks'), getAll('attachments'), getAll('projects'), getAll('project_participants')]);
    const out = await hydrateContact(c);
    const projectIds = new Set(participants.filter(p => p.contact_id === id).map(p => p.project_id));
    return {
      ...out,
      interactions: interactions.filter(i => i.contact_id === id).sort((a,b) => String(b.occurred_at || '').localeCompare(String(a.occurred_at || ''))),
      attachments: attachments.filter(a => a.contact_id === id).sort((a,b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))),
      projects: projects.filter(p => !p.archived && (p.customer_contact_id === id || projectIds.has(p.id))).sort((a,b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''))),
      tasks: tasks.filter(t => t.contact_id === id).sort((a,b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))),
    };
  }

  async function getOrganizationDetail(id) {
    const org = await getOne('organizations', id);
    if (!org) throw new Error('شرکت پیدا نشد');
    const [contacts, interactions, tasks, attachments, links, organizations, projects, participants] = await Promise.all([
      getAll('contacts'), getAll('interactions'), getAll('tasks'), getAll('attachments'), getAll('organization_links'), getAll('organizations'), getAll('projects'), getAll('project_participants')
    ]);
    const membersRaw = contacts.filter(c => c.organization_id === id && !c.archived);
    const memberIds = new Set(membersRaw.map(c => c.id));
    const members = await Promise.all(membersRaw.sort((a,b) => Number(b.is_primary_contact) - Number(a.is_primary_contact) || contactName(a).localeCompare(contactName(b), 'fa')).map(c => hydrateContact(c, new Map([[id, org]]))));
    const orgMap = new Map(organizations.map(o => [o.id, o]));
    const related_organizations = links
      .filter(l => l.from_organization_id === id || l.to_organization_id === id)
      .map(l => {
        const otherId = l.from_organization_id === id ? l.to_organization_id : l.from_organization_id;
        const other = orgMap.get(otherId);
        return other ? { ...l, other_organization: other, direction: l.from_organization_id === id ? 'outgoing' : 'incoming' } : null;
      })
      .filter(Boolean)
      .sort((a,b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')));
    return {
      ...org,
      contacts: members,
      related_organizations,
      interactions: interactions.filter(i => i.organization_id === id || memberIds.has(i.contact_id)).sort((a,b) => String(b.occurred_at || '').localeCompare(String(a.occurred_at || ''))),
      attachments: attachments.filter(a => a.organization_id === id || memberIds.has(a.contact_id)).sort((a,b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))),
      projects: projects.filter(p => !p.archived && (p.customer_organization_id === id || participants.some(x => x.project_id === p.id && x.organization_id === id))).sort((a,b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''))),
      tasks: tasks.filter(t => t.organization_id === id || memberIds.has(t.contact_id)).sort((a,b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))),
    };
  }

  async function getProjectDetail(id) {
    const project = await getOne('projects', id);
    if (!project) throw new Error('پروژه / فرصت پیدا نشد');
    const [organizations, contacts, participants, tasks, interactions, attachments] = await Promise.all([
      getAll('organizations'), getAll('contacts'), getAll('project_participants'), getAll('tasks'), getAll('interactions'), getAll('attachments')
    ]);
    const orgMap = new Map(organizations.map(o => [o.id, o]));
    const contactMap = new Map(contacts.map(c => [c.id, c]));
    const rows = participants.filter(p => p.project_id === id).map(p => {
      const org = p.organization_id ? orgMap.get(p.organization_id) : null;
      const c = p.contact_id ? contactMap.get(p.contact_id) : null;
      return { ...p, organization: org || null, contact: c ? { ...c, name: contactName(c), company: orgMap.get(c.organization_id)?.name || c.company || '' } : null };
    });
    return {
      ...project,
      customer_organization: project.customer_organization_id ? orgMap.get(project.customer_organization_id) || null : null,
      customer_contact: project.customer_contact_id ? (contactMap.get(project.customer_contact_id) ? { ...contactMap.get(project.customer_contact_id), name: contactName(contactMap.get(project.customer_contact_id)) } : null) : null,
      participants: rows,
      tasks: tasks.filter(t => t.project_id === id).sort((a,b) => String(a.due_at || '9999').localeCompare(String(b.due_at || '9999'))),
      interactions: interactions.filter(i => i.project_id === id).sort((a,b) => String(b.occurred_at || '').localeCompare(String(a.occurred_at || ''))),
      attachments: attachments.filter(a => a.project_id === id).sort((a,b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))),
    };
  }

  function analyzeLocally(c, interactions) {
    const baseByStatus = { new: 20, contacted: 35, qualified: 60, proposal: 72, negotiation: 82, follow_up: 64, won: 100, lost: 5 };
    let score = baseByStatus[c.status] ?? 25;
    if ((c.deal_value || 0) > 0) score += Math.min(10, Math.round(Math.log10((c.deal_value || 1) + 1) * 2));
    if (interactions.length >= 3) score += 5;
    const last = interactions[0];
    if (last?.occurred_at) {
      const days = (Date.now() - new Date(last.occurred_at).getTime()) / 86400000;
      if (days <= 7) score += 4;
      if (days > 30) score -= 8;
    }
    score = Math.max(0, Math.min(100, score));
    const next = c.status === 'won' ? 'پیگیری رضایت و فرصت فروش مجدد' :
      c.status === 'lost' ? 'ثبت دلیل از دست رفتن و بررسی بازگشت در آینده' :
      c.status === 'proposal' || c.status === 'negotiation' ? 'پیگیری تصمیم مشتری و رفع مانع خرید' :
      c.status === 'qualified' ? 'ارسال پیشنهاد متناسب با نیاز مشتری' :
      c.status === 'follow_up' ? 'تماس پیگیری طبق زمان ثبت‌شده' : 'تماس اولیه و مشخص‌کردن نیاز';
    const summary = interactions.length
      ? `این مخاطب در مرحله «${c.status}» است و ${interactions.length} تعامل ثبت‌شده دارد. امتیاز محلی بر اساس مرحله، ارزش معامله و تازگی تعامل‌ها محاسبه شده است.`
      : `هنوز تعاملی ثبت نشده است. امتیاز محلی فعلاً بر اساس مرحله و اطلاعات موجود محاسبه شده است.`;
    const first = c.first_name || c.name || 'دوست عزیز';
    const suggested = `سلام ${first}، برای پیگیری موضوع قبلی در خدمتتان هستم. اگر زمان مناسبی است خوشحال می‌شوم ادامه گفتگو را هماهنگ کنیم.`;
    return { ai_score: score, ai_summary: summary, next_action: next, suggested_message: suggested, status: c.status };
  }

  async function blobToDataUrl(blob) {
    if (typeof FileReader === 'undefined' && blob?.arrayBuffer) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const b64 = typeof btoa === 'function' ? btoa(binary) : '';
      return `data:${blob.type || 'application/octet-stream'};base64,${b64}`;
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('خواندن فایل ناموفق بود'));
      reader.readAsDataURL(blob);
    });
  }

  const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
  const ALLOWED_ATTACHMENT_EXTENSIONS = new Set(['jpg','jpeg','png','webp','heic','heif','pdf','xls','xlsx','xlsm','csv']);
  function attachmentExtension(name='') {
    const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : '';
  }
  function validateAttachment(file) {
    if (!(file instanceof Blob)) throw new Error('فایل انتخاب نشده است');
    if (Number(file.size || 0) <= 0) throw new Error('فایل خالی است');
    if (Number(file.size || 0) > MAX_ATTACHMENT_BYTES) throw new Error('حداکثر حجم هر فایل ۱۵ مگابایت است');
    const ext = attachmentExtension(file.name || '');
    const mime = String(file.type || '').toLowerCase();
    const mimeOk = mime.startsWith('image/')
      || mime === 'application/pdf'
      || mime.includes('excel')
      || mime.includes('spreadsheet')
      || mime === 'text/csv'
      || mime === 'application/csv'
      || mime === 'application/octet-stream';
    if (!ALLOWED_ATTACHMENT_EXTENSIONS.has(ext) && !mimeOk) {
      throw new Error('فقط عکس، PDF و فایل‌های Excel/CSV پشتیبانی می‌شوند');
    }
  }

  async function createAttachmentRecord({ contact_id = null, organization_id = null, project_id = null, formData }) {
    const file = formData instanceof FormData ? formData.get('file') : null;
    validateAttachment(file);
    const data_url = await blobToDataUrl(file);
    const now = nowIso();
    return {
      id: uuid(),
      contact_id: contact_id || null,
      organization_id: organization_id || null,
      project_id: project_id || null,
      category: String(formData.get('category') || 'invoice'),
      title: String(formData.get('title') || '').trim(),
      invoice_no: String(formData.get('invoice_no') || '').trim(),
      invoice_date: String(formData.get('invoice_date') || '').trim(),
      amount: Number(formData.get('amount') || 0) || 0,
      note: String(formData.get('note') || '').trim(),
      tags: String(formData.get('tags') || '').split(/[|،,;\n]+/).map(x => x.trim()).filter(Boolean),
      file_name: String(file.name || `document-${Date.now()}`),
      mime_type: String(file.type || 'application/octet-stream'),
      size: Number(file.size || 0),
      data_url,
      created_at: now,
      updated_at: now,
    };
  }

  function csvParse(text) {
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i+1] === '"') { field += '"'; i++; }
        else if (ch === '"') quoted = false;
        else field += ch;
      } else {
        if (ch === '"') quoted = true;
        else if (ch === ',') { row.push(field); field = ''; }
        else if (ch === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
        else field += ch;
      }
    }
    if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
    if (!rows.length) return [];
    const headers = rows.shift().map(x => x.trim());
    return rows.filter(r => r.some(x => String(x).trim())).map(r => Object.fromEntries(headers.map((h,i) => [h, r[i] ?? ''])));
  }

  // ===== Invoices / Proforma invoices / Product catalog (v1.4.0) =====
  const INVOICE_TYPES = ['invoice', 'proforma'];
  const INVOICE_STATUSES = {
    invoice: ['draft', 'issued', 'paid', 'cancelled'],
    proforma: ['draft', 'sent', 'accepted', 'converted', 'expired', 'cancelled'],
  };
  const DEFAULT_UNITS = ['عدد', 'دستگاه', 'کیلوگرم', 'گرم', 'تن', 'متر', 'متر مربع', 'متر مکعب', 'لیتر', 'بسته', 'کارتن', 'جعبه', 'شاخه', 'رول', 'جفت', 'ست', 'ساعت', 'روز', 'خدمت'];
  const DEFAULT_INVOICE_COLUMNS = [
    { key: 'row', label: 'ردیف', visible: true },
    { key: 'code', label: 'کد کالا', visible: true },
    { key: 'name', label: 'شرح کالا / خدمات', visible: true },
    { key: 'specs', label: 'مشخصات', visible: true },
    { key: 'qty', label: 'مقدار / تعداد', visible: true },
    { key: 'unit', label: 'واحد', visible: true },
    { key: 'unit_price', label: 'فی (ریال)', visible: true },
    { key: 'amount', label: 'مبلغ (ریال)', visible: false },
    { key: 'discount', label: 'تخفیف (ریال)', visible: false },
    { key: 'tax', label: 'مالیات و عوارض (ریال)', visible: false },
    { key: 'total', label: 'جمع (ریال)', visible: true },
  ];
  function defaultInvoiceSettings() {
    return {
      id: 'invoice_settings',
      seller: { name: '', legal_name: '', national_id: '', economic_code: '', registration_no: '', phone: '', mobile: '', email: '', website: '', address: '', postal_code: '', logo_data_url: '', stamp_data_url: '' },
      bank: { bank_name: '', account_no: '', card_no: '', sheba: '', holder: '' },
      numbering: {
        invoice: { pattern: 'F-{YYYY}-{SEQ}', start_number: 1, digits: 4, reset_yearly: false },
        proforma: { pattern: 'P-{YYYY}-{SEQ}', start_number: 1, digits: 4, reset_yearly: false },
      },
      counters: {},
      titles: { invoice: 'صورتحساب فروش کالا و خدمات', proforma: 'پیش‌فاکتور' },
      template: 'official',
      accent: '#1D4ED8',
      paper: 'A4',
      tax_rate: 10,
      show_tax: true,
      show_signatures: true,
      show_amount_words: true,
      show_bank: true,
      proforma_validity_days: 7,
      default_terms: { invoice: '', proforma: 'اعتبار این پیش‌فاکتور ۷ روز از تاریخ صدور است. قیمت‌ها به ریال است.' },
      columns: DEFAULT_INVOICE_COLUMNS.map(c => ({ ...c })),
      units: DEFAULT_UNITS.slice(),
      updated_at: nowIso(),
    };
  }
  function mergeInvoiceSettings(raw = {}) {
    const base = defaultInvoiceSettings();
    const s = { ...base, ...(raw || {}) };
    s.id = 'invoice_settings';
    s.seller = { ...base.seller, ...(raw?.seller || {}) };
    s.bank = { ...base.bank, ...(raw?.bank || {}) };
    s.numbering = {
      invoice: { ...base.numbering.invoice, ...(raw?.numbering?.invoice || {}) },
      proforma: { ...base.numbering.proforma, ...(raw?.numbering?.proforma || {}) },
    };
    for (const t of INVOICE_TYPES) {
      const n = s.numbering[t];
      n.pattern = String(n.pattern || base.numbering[t].pattern).trim() || base.numbering[t].pattern;
      if (!/\{SEQ\}|\{N\}/.test(n.pattern)) n.pattern += '-{SEQ}';
      n.start_number = Math.max(1, Math.floor(Number(toLatinDigits(n.start_number)) || 1));
      n.digits = Math.min(10, Math.max(1, Math.floor(Number(toLatinDigits(n.digits)) || 4)));
      n.reset_yearly = Boolean(n.reset_yearly);
    }
    s.counters = { ...(raw?.counters || {}) };
    s.titles = { ...base.titles, ...(raw?.titles || {}) };
    s.default_terms = { ...base.default_terms, ...(raw?.default_terms || {}) };
    s.default_term_rows = {};
    for (const type of INVOICE_TYPES) {
      const rows = raw?.default_term_rows?.[type];
      s.default_term_rows[type] = Array.isArray(rows) ? rows.map(x => String(x ?? '')) : String(s.default_terms[type] || '').split(/\r?\n/).filter(x => x.trim());
      s.default_terms[type] = s.default_term_rows[type].map(x => x.trim()).filter(Boolean).join('\n');
    }
    const cols = Array.isArray(raw?.columns) ? raw.columns : [];
    const byKey = new Map(cols.filter(c => c && c.key).map(c => [c.key, c]));
    const ordered = cols.filter(c => c && DEFAULT_INVOICE_COLUMNS.some(d => d.key === c.key)).map(c => c.key);
    for (const d of DEFAULT_INVOICE_COLUMNS) if (!ordered.includes(d.key)) ordered.push(d.key);
    s.columns = ordered.map(key => {
      const d = DEFAULT_INVOICE_COLUMNS.find(x => x.key === key);
      const c = byKey.get(key) || {};
      return { key, label: String(c.label || d.label).trim() || d.label, visible: key === 'name' || key === 'total' ? true : (typeof c.visible === 'boolean' ? c.visible : d.visible) };
    });
    s.units = normalizeTextList(Array.isArray(raw?.units) && raw.units.length ? raw.units : base.units);
    s.tax_rate = Math.max(0, Math.min(100, Number(toLatinDigits(s.tax_rate)) || 0));
    s.proforma_validity_days = Math.max(0, Math.floor(Number(toLatinDigits(s.proforma_validity_days)) || 0));
    s.template = ['official', 'simple'].includes(s.template) ? s.template : 'official';
    s.paper = ['A4', 'A5'].includes(s.paper) ? s.paper : 'A4';
    for (const k of ['show_tax', 'show_signatures', 'show_amount_words', 'show_bank']) s[k] = s[k] !== false;
    return s;
  }
  async function getInvoiceSettings() {
    const raw = await getOne('app_settings', 'invoice_settings');
    return mergeInvoiceSettings(raw || {});
  }
  function jalaliYmd(date = new Date()) {
    try {
      const d = date instanceof Date ? date : new Date(String(date).length === 10 ? `${date}T12:00:00+03:30` : date);
      const parts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(Number.isNaN(d.getTime()) ? new Date() : d);
      const get = t => (parts.find(p => p.type === t)?.value || '').replace(/\D/g, '');
      return { y: get('year'), m: get('month').padStart(2, '0'), d: get('day').padStart(2, '0') };
    } catch (_e) { return { y: '1405', m: '01', d: '01' }; }
  }
  function formatInvoiceNumber(pattern, seq, date = new Date(), digits = 4) {
    const j = jalaliYmd(date);
    return String(pattern || '{SEQ}')
      .replace(/\{YYYY\}/g, j.y).replace(/\{YY\}/g, j.y.slice(-2)).replace(/\{MM\}/g, j.m).replace(/\{DD\}/g, j.d)
      .replace(/\{SEQ\}/g, String(seq).padStart(digits, '0')).replace(/\{N\}/g, String(seq));
  }
  function invoiceCounterKey(type, cfgNum, date) { return cfgNum.reset_yearly ? `${type}:${jalaliYmd(date).y}` : `${type}:all`; }
  function normalizeInvoiceNumber(v = '') { return toLatinDigits(String(v || '')).trim(); }
  async function previewNextInvoiceNumber(type, date = new Date(), settings = null, existing = null) {
    const s = settings || await getInvoiceSettings();
    const cfgNum = s.numbering[type] || s.numbering.invoice;
    const key = invoiceCounterKey(type, cfgNum, date);
    let seq = Math.max(cfgNum.start_number, Number(s.counters[key] || 0));
    const taken = new Set((existing || await getAll('invoices')).filter(x => x.type === type).map(x => normalizeInvoiceNumber(x.number)));
    let number = formatInvoiceNumber(cfgNum.pattern, seq, date, cfgNum.digits);
    let guard = 0;
    while (taken.has(number) && guard++ < 100000) { seq++; number = formatInvoiceNumber(cfgNum.pattern, seq, date, cfgNum.digits); }
    return { number, seq, key };
  }
  function toAmount(v) {
    const n = Number(toLatinDigits(String(v ?? '')).replace(/[,٬\s]/g, '').replace(/٫/g, '.'));
    return Number.isFinite(n) ? n : 0;
  }
  function normalizeInvoiceItem(raw = {}) {
    return {
      id: raw.id || uuid(),
      product_id: raw.product_id || null,
      code: String(raw.code ?? '').trim(),
      name: String(raw.name ?? '').trim(),
      specs: String(raw.specs ?? '').trim(),
      qty: Math.max(0, toAmount(raw.qty ?? 1)),
      unit: String(raw.unit ?? '').trim(),
      unit_price: Math.max(0, Math.round(toAmount(raw.unit_price))),
      discount: Math.max(0, Math.round(toAmount(raw.discount))),
      tax_exempt: Boolean(raw.tax_exempt),
    };
  }
  // All money in Rial (integer). Discount per line + invoice-level discount (spread proportionally for tax base).
  function computeInvoiceTotals(inv = {}) {
    const items = (inv.items || []).map(normalizeInvoiceItem).filter(i => i.name || i.code || i.unit_price);
    const taxRate = inv.tax_enabled === false ? 0 : Math.max(0, Number(toAmount(inv.tax_rate)) || 0);
    const lines = items.map(i => {
      const amount = Math.round(i.qty * i.unit_price);
      const discount = Math.min(i.discount, amount);
      const net = amount - discount;
      return { ...i, amount, discount, net, tax: 0, total: net };
    });
    const subtotal = lines.reduce((s, l) => s + l.amount, 0);
    const lineDiscount = lines.reduce((s, l) => s + l.discount, 0);
    const netSum = lines.reduce((s, l) => s + l.net, 0);
    const invoiceDiscount = Math.min(Math.max(0, Math.round(toAmount(inv.discount))), netSum);
    let taxTotal = 0;
    for (const l of lines) {
      const share = netSum ? l.net / netSum : 0;
      const base = l.net - invoiceDiscount * share;
      l.tax = l.tax_exempt || !taxRate ? 0 : Math.round(base * taxRate / 100);
      l.total = l.net + l.tax;
      taxTotal += l.tax;
    }
    const shipping = Math.max(0, Math.round(toAmount(inv.shipping)));
    const grand = netSum - invoiceDiscount + taxTotal + shipping;
    const prepaid = Math.min(Math.max(0, Math.round(toAmount(inv.prepaid))), Math.max(0, grand));
    return { lines, subtotal, line_discount: lineDiscount, net_sum: netSum, invoice_discount: invoiceDiscount, discount_total: lineDiscount + invoiceDiscount, tax_rate: taxRate, tax_total: taxTotal, shipping, grand_total: grand, prepaid, payable: grand - prepaid, item_count: lines.length, qty_total: lines.reduce((s, l) => s + l.qty, 0) };
  }
  // Persian amount in words, e.g. 1250000 → «یک میلیون و دویست و پنجاه هزار»
  function numberToPersianWords(value) {
    let n = Math.floor(Math.abs(Number(value) || 0));
    if (n === 0) return 'صفر';
    const ones = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
    const teens = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
    const tens = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
    const hundreds = ['', 'یکصد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
    const scales = ['', 'هزار', 'میلیون', 'میلیارد', 'هزار میلیارد', 'میلیون میلیارد'];
    const three = x => {
      const out = [];
      const h = Math.floor(x / 100), r = x % 100;
      if (h) out.push(hundreds[h]);
      if (r >= 10 && r < 20) out.push(teens[r - 10]);
      else { const t = Math.floor(r / 10), o = r % 10; if (t) out.push(tens[t]); if (o) out.push(ones[o]); }
      return out.join(' و ');
    };
    const groups = [];
    let i = 0;
    while (n > 0 && i < scales.length) { const g = n % 1000; if (g) groups.unshift(three(g) + (scales[i] ? ' ' + scales[i] : '')); n = Math.floor(n / 1000); i++; }
    return (value < 0 ? 'منفی ' : '') + groups.join(' و ');
  }
  function normalizeProduct(input = {}, existing = null) {
    return {
      id: input.id || existing?.id || uuid(),
      code: toLatinDigits(String(input.code ?? existing?.code ?? '')).trim(),
      name: String(input.name ?? existing?.name ?? '').trim(),
      specs: String(input.specs ?? existing?.specs ?? '').trim(),
      unit: String(input.unit ?? existing?.unit ?? 'عدد').trim() || 'عدد',
      unit_price: Math.max(0, Math.round(toAmount(input.unit_price ?? input.price ?? existing?.unit_price ?? 0))),
      category: String(input.category ?? existing?.category ?? '').trim(),
      tax_exempt: Boolean(input.tax_exempt ?? existing?.tax_exempt ?? false),
      active: input.active === undefined ? (existing?.active ?? true) : Boolean(input.active),
      note: String(input.note ?? existing?.note ?? '').trim(),
      created_at: existing?.created_at || input.created_at || nowIso(),
      updated_at: nowIso(),
    };
  }
  function addDaysYmd(ymd, days) {
    const d = new Date(`${ymd}T12:00:00Z`); if (Number.isNaN(d.getTime())) return '';
    d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
  }
  function normalizeInvoice(input = {}, existing = null) {
    const type = INVOICE_TYPES.includes(input.type) ? input.type : (existing?.type || 'invoice');
    const statuses = INVOICE_STATUSES[type];
    const buyerIn = input.buyer || {};
    const buyerOld = existing?.buyer || {};
    const pick = (k) => String(buyerIn[k] ?? buyerOld[k] ?? '').trim();
    const termRows = Array.isArray(input.term_rows) ? input.term_rows.map(x => String(x ?? ''))
      : input.terms !== undefined ? String(input.terms || '').split(/\r?\n/).filter(x => x.trim())
      : Array.isArray(existing?.term_rows) ? existing.term_rows.slice()
      : String(existing?.terms || '').split(/\r?\n/).filter(x => x.trim());
    const inv = {
      id: input.id || existing?.id || uuid(),
      type,
      number: normalizeInvoiceNumber(input.number ?? existing?.number ?? ''),
      status: statuses.includes(input.status) ? input.status : (existing?.status && statuses.includes(existing.status) ? existing.status : 'draft'),
      issue_date: String(input.issue_date ?? existing?.issue_date ?? new Date().toISOString().slice(0, 10)).slice(0, 10),
      due_date: String(input.due_date ?? existing?.due_date ?? '').slice(0, 10),
      party_type: ['organization', 'contact'].includes(input.party_type) ? input.party_type : (input.party_type === null ? null : (existing?.party_type || null)),
      party_id: input.party_id === null ? null : (input.party_id || existing?.party_id || null),
      contact_id: input.contact_id === null ? null : (input.contact_id || existing?.contact_id || null),
      project_id: input.project_id === null ? null : (input.project_id || existing?.project_id || null),
      buyer: { name: pick('name'), contact_person: pick('contact_person'), national_id: pick('national_id'), economic_code: pick('economic_code'), registration_no: pick('registration_no'), phone: pick('phone'), address: pick('address'), postal_code: pick('postal_code'), email: pick('email') },
      items: (input.items ?? existing?.items ?? []).map(normalizeInvoiceItem).filter(i => i.name || i.code || i.unit_price),
      tax_enabled: input.tax_enabled === undefined ? (existing?.tax_enabled ?? true) : Boolean(input.tax_enabled),
      tax_rate: Math.max(0, Math.min(100, toAmount(input.tax_rate ?? existing?.tax_rate ?? 10))),
      discount: Math.max(0, Math.round(toAmount(input.discount ?? existing?.discount ?? 0))),
      shipping: Math.max(0, Math.round(toAmount(input.shipping ?? existing?.shipping ?? 0))),
      prepaid: Math.max(0, Math.round(toAmount(input.prepaid ?? existing?.prepaid ?? 0))),
      payment_terms: String(input.payment_terms ?? existing?.payment_terms ?? '').trim(),
      notes: String(input.notes ?? existing?.notes ?? '').trim(),
      term_rows: termRows,
      terms: termRows.map(x => x.trim()).filter(Boolean).join('\n'),
      post_to_ledger: input.post_to_ledger === undefined ? (existing?.post_to_ledger ?? false) : Boolean(input.post_to_ledger),
      ledger_entry_id: existing?.ledger_entry_id || null,
      source_proforma_id: input.source_proforma_id || existing?.source_proforma_id || null,
      converted_invoice_id: input.converted_invoice_id || existing?.converted_invoice_id || null,
      created_at: existing?.created_at || input.created_at || nowIso(),
      updated_at: nowIso(),
    };
    if (!inv.party_id) inv.party_type = null;
    const t = computeInvoiceTotals(inv);
    Object.assign(inv, { subtotal: t.subtotal, discount_total: t.discount_total, tax_total: t.tax_total, grand_total: t.grand_total, payable: t.payable });
    return inv;
  }
  async function hydrateBuyerFromParty(inv) {
    if (!inv.party_id) return inv;
    if (inv.party_type === 'organization') {
      const o = await getOne('organizations', inv.party_id); if (!o) throw new Error('شرکت خریدار پیدا نشد');
      if (!inv.buyer.name) inv.buyer.name = o.legal_name || o.name;
      if (!inv.buyer.national_id) inv.buyer.national_id = o.national_id || '';
      if (!inv.buyer.economic_code) inv.buyer.economic_code = o.economic_code || '';
      if (!inv.buyer.phone) inv.buyer.phone = o.main_phone_raw || o.main_phone || '';
      if (!inv.buyer.address) inv.buyer.address = o.address || '';
    } else if (inv.party_type === 'contact') {
      const c = await getOne('contacts', inv.party_id); if (!c) throw new Error('شخص خریدار پیدا نشد');
      if (!inv.buyer.name) inv.buyer.name = contactName(c);
      if (!inv.buyer.phone) inv.buyer.phone = c.phone_raw || c.phone || '';
      if (!inv.buyer.address) inv.buyer.address = c.address || '';
    }
    return inv;
  }
  // Keeps one sales_invoice ledger entry in sync with an issued invoice (optional per invoice).
  async function syncInvoiceLedger(inv) {
    const entryId = inv.ledger_entry_id || `invoice-ledger-${inv.id}`;
    const existing = await getOne('finance_entries', entryId);
    const shouldPost = inv.type === 'invoice' && inv.post_to_ledger && inv.party_id && ['issued', 'paid'].includes(inv.status) && inv.grand_total > 0;
    const all = await getAll('finance_entries');
    const allocated = all.filter(e => e.reference_entry_id === entryId).reduce((s, e) => s + Number(e.amount_rial || 0), 0);
    if (!shouldPost) {
      if (existing) {
        if (allocated > 0) throw new Error('برای این فاکتور دریافت ثبت شده؛ اول دریافت‌های تخصیص‌یافته را از دفتر حساب حذف کن');
        await removeOne('finance_entries', entryId);
      }
      inv.ledger_entry_id = null;
      return inv;
    }
    if (allocated > inv.grand_total) throw new Error('مبلغ فاکتور از دریافت‌های ثبت‌شده برای آن کمتر شده است');
    if (existing && (existing.party_type !== inv.party_type || existing.party_id !== inv.party_id) && allocated > 0) throw new Error('برای این فاکتور دریافت ثبت شده؛ خریدار را نمی‌شود عوض کرد');
    const entry = normalizeFinanceEntry({ ...(existing || {}), id: entryId, party_type: inv.party_type, party_id: inv.party_id, project_id: inv.project_id || null, kind: 'sales_invoice', amount_rial: inv.grand_total, posting_date: inv.issue_date, due_date: inv.due_date || null, reference_no: inv.number, note: `فاکتور ${inv.number}${inv.buyer?.name ? ' — ' + inv.buyer.name : ''}`, source_invoice_id: inv.id }, existing);
    entry.id = entryId;
    entry.source_invoice_id = inv.id;
    await put('finance_entries', entry);
    inv.ledger_entry_id = entryId;
    return inv;
  }
  async function saveInvoiceRecord(input, existing = null) {
    const settings = await getInvoiceSettings();
    let inv = normalizeInvoice(input, existing);
    inv = await hydrateBuyerFromParty(inv);
    if (!inv.buyer.name) throw new Error('نام خریدار را وارد کن یا از مشتریان انتخاب کن');
    if (!inv.items.length) throw new Error('حداقل یک ردیف کالا / خدمات لازم است');
    if (inv.items.some(i => !i.name)) throw new Error('شرح کالا در همه ردیف‌ها لازم است');
    if (inv.items.some(i => i.qty <= 0)) throw new Error('مقدار / تعداد هر ردیف باید بیشتر از صفر باشد');
    const all = await getAll('invoices');
    if (!inv.number) {
      const next = await previewNextInvoiceNumber(inv.type, inv.issue_date, settings, all);
      inv.number = next.number;
      settings.counters[next.key] = next.seq + 1;
      settings.updated_at = nowIso();
      await put('app_settings', settings);
    } else if (all.some(x => x.id !== inv.id && x.type === inv.type && normalizeInvoiceNumber(x.number) === inv.number)) {
      throw new Error(`شماره ${inv.number} قبلاً برای ${inv.type === 'invoice' ? 'فاکتور' : 'پیش‌فاکتور'} دیگری ثبت شده است`);
    } else if (!existing || existing.number !== inv.number) {
      // A manually typed number equal to the next auto number advances the counter so auto numbers never collide.
      const cfgNum = settings.numbering[inv.type];
      const key = invoiceCounterKey(inv.type, cfgNum, inv.issue_date);
      const cur = Math.max(cfgNum.start_number, Number(settings.counters[key] || 0));
      if (formatInvoiceNumber(cfgNum.pattern, cur, inv.issue_date, cfgNum.digits) === inv.number) { settings.counters[key] = cur + 1; await put('app_settings', settings); }
    }
    inv = await syncInvoiceLedger(inv);
    await put('invoices', inv);
    await recordEvent(existing ? 'invoice.updated.local' : 'invoice.created.local', { id: inv.id, type: inv.type, number: inv.number, grand_total: inv.grand_total, party_type: inv.party_type, party_id: inv.party_id });
    if (inv.party_id) {
      await put('interactions', { id: `invoice-note-${inv.id}`, contact_id: inv.party_type === 'contact' ? inv.party_id : (inv.contact_id || null), organization_id: inv.party_type === 'organization' ? inv.party_id : null, project_id: inv.project_id || null, type: 'document', direction: 'outbound', subject: `${inv.type === 'invoice' ? 'فاکتور' : 'پیش‌فاکتور'} ${inv.number}`, body: `مبلغ کل ${inv.grand_total.toLocaleString('en-US')} ریال · ${inv.items.length} ردیف`, outcome: '', duration_seconds: 0, audio_path: '', transcript: '', ai_summary: '', attachment_id: null, attachment_name: '', invoice_id: inv.id, occurred_at: existing?.created_at || inv.created_at, created_at: existing?.created_at || inv.created_at });
    }
    return inv;
  }
  async function deleteInvoiceRecord(id) {
    const inv = await getOne('invoices', id); if (!inv) throw new Error('فاکتور پیدا نشد');
    if (inv.ledger_entry_id) {
      const all = await getAll('finance_entries');
      if (all.some(e => e.reference_entry_id === inv.ledger_entry_id)) throw new Error('برای این فاکتور دریافت ثبت شده و قابل حذف نیست؛ می‌توانی آن را «لغو» کنی بعد از حذف دریافت‌ها');
      await removeOne('finance_entries', inv.ledger_entry_id);
    }
    await removeOne('invoices', id);
    await removeOne('interactions', `invoice-note-${id}`);
    for (const x of (await getAll('invoices')).filter(x => x.source_proforma_id === id || x.converted_invoice_id === id)) {
      if (x.source_proforma_id === id) x.source_proforma_id = null;
      if (x.converted_invoice_id === id) { x.converted_invoice_id = null; if (x.status === 'converted') x.status = 'accepted'; }
      await put('invoices', x);
    }
    await recordEvent('invoice.deleted.local', { id, type: inv.type, number: inv.number });
    return { ok: true };
  }
  function invoiceSearchFields(inv) {
    return [inv.number, inv.buyer?.name, inv.buyer?.contact_person, inv.buyer?.phone, inv.buyer?.national_id, inv.buyer?.economic_code, inv.notes, ...(inv.items || []).flatMap(i => [i.code, i.name, i.specs])];
  }

  async function api(path, opts = {}) {
    await ensureMigrations();
    const u = parseUrl(path);
    const p = u.pathname;
    const method = String(opts.method || 'GET').toUpperCase();
    const body = opts.body;
    let m = null;

    if (p === '/api/auth/me') return { username: 'offline' };
    if (p === '/api/auth/login') return { ok: true, username: 'offline', access_token: 'offline' };
    if (p === '/api/auth/logout') return { ok: true };
    if (p === '/api/config') return {
      ai_enabled: false, ai_model: 'offline-rules', n8n_enabled: false, stages: STAGES, phone_region: 'IR',
      event_retry_enabled: false, app_public_url: '', mobile_api_supported: true, offline: true, organizations_supported: true,
      locale: 'fa-IR-u-ca-persian', timezone: 'Asia/Tehran', currency: 'IRR', default_money_unit: 'IRT',
      network_types: ['customer','prospect','supplier','logistics','customs','doctor','pharmacy','laboratory','insurance','finance','manufacturer','partner','service_provider','government','other'],
      project_stages: PROJECT_STAGES, project_types: PROJECT_TYPES,
      meeting_statuses: MEETING_STATUSES, finance_kinds: FINANCE_KINDS, document_statuses: DOCUMENT_STATUSES,
      invoice_types: INVOICE_TYPES, invoice_statuses: INVOICE_STATUSES, invoices_supported: true
    };

    if (p === '/api/dashboard' && method === 'GET') {
      const [contacts, organizations, tasks, projects, meetings, financeEntries, documentChecks] = await Promise.all([
        getAll('contacts'), getAll('organizations'), getAll('tasks'), getAll('projects'), getAll('meetings'), getAll('finance_entries'), getAll('document_checks')
      ]);
      const people = contacts.filter(c => !c.archived);
      const orgs = organizations.filter(o => !o.archived);
      const standalone = people.filter(c => !c.organization_id);
      const accounts = [...orgs, ...standalone];
      const openTasks = tasks.filter(t => !t.done);
      const by_status = {};
      for (const a of accounts) by_status[a.status] = (by_status[a.status] || 0) + 1;
      const pipeline = accounts.filter(a => !['lost','won'].includes(a.status)).reduce((sum,a) => sum + Number(a.deal_value || 0), 0);
      const now = Date.now();
      const activeProjects = projects.filter(p => !p.archived && !['completed','won','lost','cancelled'].includes(p.stage));
      const finance = computeFinanceSummary(financeEntries);
      const next7 = now + 7 * 24 * 3600 * 1000;
      const upcomingMeetings = meetings.filter(m => m.status === 'planned' && m.start_at && new Date(m.start_at).getTime() >= now && new Date(m.start_at).getTime() <= next7);
      const today = new Date(); today.setHours(0,0,0,0);
      const soon = new Date(today.getTime() + 30 * 24 * 3600 * 1000);
      const docsMissing = documentChecks.filter(d => effectiveDocumentStatus(d) === 'required').length;
      const docsExpiring = documentChecks.filter(d => {
        if (!d.expiry_date || !['received','verified'].includes(d.status)) return false;
        const x = new Date(`${d.expiry_date}T23:59:59`);
        return !Number.isNaN(x.getTime()) && x >= today && x <= soon;
      }).length;
      return {
        contacts: people.length,
        organizations: orgs.length,
        accounts: accounts.length,
        won: accounts.filter(a => a.status === 'won').length,
        open_tasks: openTasks.length,
        overdue_tasks: openTasks.filter(t => t.due_at && new Date(t.due_at).getTime() < now).length,
        pipeline_value: pipeline,
        projects_open: activeProjects.length,
        projects_value: activeProjects.reduce((sum,p) => sum + Number(p.value || 0), 0),
        receivable_rial: finance.receivable_rial,
        payable_rial: finance.payable_rial,
        overdue_receivable_rial: finance.overdue_receivable_rial,
        overdue_payable_rial: finance.overdue_payable_rial,
        upcoming_meetings_7d: upcomingMeetings.length,
        documents_missing: docsMissing,
        documents_expiring_30d: docsExpiring,
        by_status,
        undelivered_events: 0,
      };
    }

    if (p === '/api/network' && method === 'GET') {
      const q = String(u.searchParams.get('q') || '').trim().toLowerCase();
      const category = String(u.searchParams.get('category') || '').trim();
      const [organizations, contacts] = await Promise.all([getAll('organizations'), getAll('contacts')]);
      const orgMap = new Map(organizations.map(o => [o.id, o]));
      const orgRows = organizations.filter(o => !o.archived).map(o => ({
        entity_type: 'organization',
        id: o.id,
        name: o.name,
        subtitle: o.industry || o.legal_name || '',
        company: '',
        phone: o.main_phone || '',
        phones: o.phones || [],
        email: o.email || '',
        relationship_types: o.relationship_types || [],
        status: o.status,
        source: o.source || '',
      }));
      const contactRows = contacts.filter(c => !c.archived && (c.relationship_types || []).length).map(c => ({
        entity_type: 'contact',
        id: c.id,
        name: contactName(c),
        subtitle: c.job_title || c.department || '',
        company: orgMap.get(c.organization_id)?.name || c.company || '',
        phone: c.phone || '',
        phones: [c.phone, ...(c.secondary_phones || [])].filter(Boolean),
        email: c.email || '',
        relationship_types: c.relationship_types || [],
        status: c.status,
        source: c.source || '',
      }));
      let rows = [...orgRows, ...contactRows];
      if (category) rows = rows.filter(r => (r.relationship_types || []).includes(category));
      if (q) rows = rows.filter(r => matchesQuery([
        r.name, r.subtitle, r.company, r.email, ...(r.relationship_types || [])
      ], q, [r.phone, ...(r.phones || [])]));
      rows.sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''), 'fa'));
      return rows;
    }

    if (p === '/api/projects' && method === 'GET') {
      let rows = (await getAll('projects')).filter(p => !p.archived);
      const [organizations, contacts, participants] = await Promise.all([getAll('organizations'), getAll('contacts'), getAll('project_participants')]);
      const orgMap = new Map(organizations.map(o => [o.id, o]));
      const contactMap = new Map(contacts.map(c => [c.id, c]));
      const counts = new Map();
      for (const x of participants) counts.set(x.project_id, (counts.get(x.project_id) || 0) + 1);
      const q = String(u.searchParams.get('q') || '').trim().toLowerCase();
      const stage = String(u.searchParams.get('stage') || '');
      const type = String(u.searchParams.get('type') || '');
      if (stage) rows = rows.filter(x => x.stage === stage);
      if (type) rows = rows.filter(x => x.type === type);
      if (q) rows = rows.filter(x => matchesQuery([x.title,x.reference_no,x.notes,orgMap.get(x.customer_organization_id)?.name,contactName(contactMap.get(x.customer_contact_id)||{})], q));
      rows.sort((a,b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
      return rows.map(x => ({...x, customer_organization: orgMap.get(x.customer_organization_id) || null, customer_contact: contactMap.get(x.customer_contact_id) ? {...contactMap.get(x.customer_contact_id), name:contactName(contactMap.get(x.customer_contact_id))} : null, participants_count: counts.get(x.id) || 0}));
    }
    if (p === '/api/projects' && method === 'POST') {
      const project = normalizeProject(body || {});
      if (!project.title) throw new Error('عنوان پروژه / فرصت لازم است');
      if (project.customer_organization_id && !(await getOne('organizations', project.customer_organization_id))) throw new Error('شرکت مشتری پیدا نشد');
      if (project.customer_contact_id && !(await getOne('contacts', project.customer_contact_id))) throw new Error('شخص مشتری پیدا نشد');
      await put('projects', project);
      await recordEvent('project.created.local', { id: project.id, type: project.type, stage: project.stage });
      return getProjectDetail(project.id);
    }
    m = p.match(/^\/api\/projects\/([^/]+)$/);
    if (m && method === 'GET') return getProjectDetail(decodeURIComponent(m[1]));
    if (m && method === 'PATCH') {
      const id = decodeURIComponent(m[1]);
      const old = await getOne('projects', id); if (!old) throw new Error('پروژه / فرصت پیدا نشد');
      const project = normalizeProject({ ...old, ...(body || {}), id }, old);
      if (!project.title) throw new Error('عنوان پروژه / فرصت لازم است');
      await put('projects', project); await recordEvent('project.updated.local', { id, stage: project.stage });
      return getProjectDetail(id);
    }
    m = p.match(/^\/api\/projects\/([^/]+)\/participants$/);
    if (m && method === 'POST') {
      const project_id = decodeURIComponent(m[1]); if (!(await getOne('projects', project_id))) throw new Error('پروژه پیدا نشد');
      const organization_id = body?.organization_id || null, contact_id = body?.contact_id || null;
      if (!organization_id && !contact_id) throw new Error('یک شرکت یا شخص را انتخاب کن');
      if (organization_id && !(await getOne('organizations', organization_id))) throw new Error('شرکت پیدا نشد');
      if (contact_id && !(await getOne('contacts', contact_id))) throw new Error('شخص پیدا نشد');
      const all = await getAll('project_participants');
      if (all.some(x => x.project_id===project_id && x.organization_id===organization_id && x.contact_id===contact_id && x.role===String(body?.role||'partner'))) throw new Error('این نقش قبلاً برای پروژه ثبت شده است');
      const row = normalizeProjectParticipant({project_id,organization_id,contact_id,role:body?.role||'partner',note:body?.note||''});
      await put('project_participants', row); await recordEvent('project.participant.created.local',{id:row.id,project_id,organization_id,contact_id,role:row.role});
      return row;
    }
    m = p.match(/^\/api\/project-participants\/([^/]+)$/);
    if (m && method === 'DELETE') {
      const id = decodeURIComponent(m[1]); const row = await getOne('project_participants', id); if (!row) throw new Error('ارتباط پروژه پیدا نشد');
      await removeOne('project_participants', id); await recordEvent('project.participant.deleted.local',{id,project_id:row.project_id}); return {ok:true};
    }
    m = p.match(/^\/api\/projects\/([^/]+)\/interactions$/);
    if (m && method === 'POST') {
      const project_id = decodeURIComponent(m[1]); const project = await getOne('projects', project_id); if (!project) throw new Error('پروژه پیدا نشد');
      const i = { id:uuid(), project_id, contact_id:project.customer_contact_id||null, organization_id:project.customer_organization_id||null, type:body?.type||'note', direction:'outbound', subject:body?.subject||'', body:body?.body||'', outcome:'', duration_seconds:0, audio_path:'', transcript:'', ai_summary:'', occurred_at:body?.occurred_at||nowIso(), created_at:nowIso() };
      await put('interactions', i); project.updated_at=nowIso(); await put('projects',project); await recordEvent('project.interaction.created.local',{project_id,interaction_id:i.id}); return i;
    }
    m = p.match(/^\/api\/projects\/([^/]+)\/attachments$/);
    if (m && method === 'POST') {
      const project_id = decodeURIComponent(m[1]); const project = await getOne('projects', project_id); if (!project) throw new Error('پروژه پیدا نشد');
      if (!(body instanceof FormData)) throw new Error('فایل معتبر نیست');
      const a = await createAttachmentRecord({project_id,contact_id:project.customer_contact_id||null,organization_id:project.customer_organization_id||null,formData:body});
      await put('attachments',a);
      const label = a.category === 'invoice' ? 'فاکتور' : a.category === 'proforma' ? 'پیش‌فاکتور' : a.category === 'contract' ? 'قرارداد' : a.category === 'receipt' ? 'رسید' : 'سند';
      const i={id:uuid(),project_id,contact_id:project.customer_contact_id||null,organization_id:project.customer_organization_id||null,type:'document',direction:'outbound',subject:`${label}: ${a.title||a.file_name}`,body:a.note||'',outcome:'',duration_seconds:0,audio_path:'',transcript:'',ai_summary:'',attachment_id:a.id,attachment_name:a.file_name,occurred_at:a.created_at,created_at:a.created_at};
      await put('interactions',i); project.updated_at=nowIso(); await put('projects',project); await recordEvent('attachment.created.local',{attachment_id:a.id,project_id,file_name:a.file_name,size:a.size}); return a;
    }

    if (p === '/api/organizations' && method === 'GET') {
      let rows = (await getAll('organizations')).filter(o => !o.archived);
      const contacts = await getAll('contacts');
      const counts = new Map();
      for (const c of contacts) if (!c.archived && c.organization_id) counts.set(c.organization_id, (counts.get(c.organization_id) || 0) + 1);
      const q = (u.searchParams.get('q') || '').trim().toLowerCase();
      const status = u.searchParams.get('status') || '';
      if (q) {
        const membersByOrg = new Map();
        for (const c of contacts) if (!c.archived && c.organization_id) { const list = membersByOrg.get(c.organization_id) || []; list.push(c); membersByOrg.set(c.organization_id, list); }
        rows = rows.filter(o => {
          const members = membersByOrg.get(o.id) || [];
          return matchesQuery([o.name,o.legal_name,o.industry,o.email,o.address,o.national_id,o.economic_code,o.tags,o.relationship_types,members.map(contactName)], q, [o.main_phone,o.main_phone_raw,...(o.phones||[]),...members.flatMap(c => [c.phone, ...(c.secondary_phones||[])])]);
        });
      }
      if (status) rows = rows.filter(o => o.status === status);
      rows.sort((a,b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
      const limit = Math.max(1, Math.min(1000, Number(u.searchParams.get('limit') || 500)));
      return rows.slice(0, limit).map(o => ({ ...o, contacts_count: counts.get(o.id) || 0 }));
    }

    if (p === '/api/organizations' && method === 'POST') {
      const org = normalizeOrganization(body || {});
      if (!org.name) throw new Error('نام شرکت لازم است');
      await ensureUniqueOrganizationName(org.name);
      await ensureUniqueOrganizationPhones(org);
      await put('organizations', org);
      await recordEvent('organization.created.local', { id: org.id, name: org.name });
      return org;
    }

    m = p.match(/^\/api\/organizations\/([^/]+)$/);
    if (m && method === 'GET') return getOrganizationDetail(decodeURIComponent(m[1]));
    if (m && method === 'PATCH') {
      const id = decodeURIComponent(m[1]);
      const old = await getOne('organizations', id);
      if (!old) throw new Error('شرکت پیدا نشد');
      const org = normalizeOrganization({ ...old, ...(body || {}), id }, old);
      if (!org.name) throw new Error('نام شرکت لازم است');
      await ensureUniqueOrganizationName(org.name, id);
      await ensureUniqueOrganizationPhones(org, id);
      await put('organizations', org);
      const contacts = await getAll('contacts');
      for (const c of contacts.filter(c => c.organization_id === id)) {
        c.company = org.name;
        c.updated_at = nowIso();
        await put('contacts', c);
      }
      await recordEvent('organization.updated.local', { id: org.id });
      return org;
    }

    m = p.match(/^\/api\/organizations\/([^/]+)\/interactions$/);
    if (m && method === 'POST') {
      const organization_id = decodeURIComponent(m[1]);
      const org = await getOne('organizations', organization_id);
      if (!org) throw new Error('شرکت پیدا نشد');
      const i = {
        id: uuid(), organization_id, contact_id: body?.contact_id || null,
        type: body?.type || 'note', direction: body?.direction || 'outbound', subject: body?.subject || '', body: body?.body || '',
        outcome: body?.outcome || '', duration_seconds: Number(body?.duration_seconds || 0), audio_path: '', transcript: '', ai_summary: '',
        occurred_at: body?.occurred_at || nowIso(), created_at: nowIso(),
      };
      await put('interactions', i);
      org.last_contact_at = i.occurred_at; org.updated_at = nowIso(); if (org.status === 'new') org.status = 'contacted'; await put('organizations', org);
      await recordEvent('organization.interaction.created.local', { organization_id, interaction_id: i.id });
      return { organization: org, interaction: i };
    }

    m = p.match(/^\/api\/organizations\/([^/]+)\/attachments$/);
    if (m && method === 'POST') {
      const organization_id = decodeURIComponent(m[1]);
      const org = await getOne('organizations', organization_id);
      if (!org) throw new Error('شرکت پیدا نشد');
      if (!(body instanceof FormData)) throw new Error('فایل معتبر نیست');
      const a = await createAttachmentRecord({ organization_id, formData: body });
      await put('attachments', a);
      const label = a.category === 'invoice' ? 'فاکتور' : a.category === 'proforma' ? 'پیش‌فاکتور' : a.category === 'contract' ? 'قرارداد' : a.category === 'receipt' ? 'رسید' : 'سند';
      const i = {
        id: uuid(), organization_id, contact_id: null, type: 'document', direction: 'outbound',
        subject: `${label}: ${a.title || a.file_name}`, body: a.note || '', outcome: '', duration_seconds: 0,
        audio_path: '', transcript: '', ai_summary: '', attachment_id: a.id, attachment_name: a.file_name,
        occurred_at: a.created_at, created_at: a.created_at,
      };
      await put('interactions', i);
      org.last_contact_at = a.created_at; org.updated_at = nowIso(); await put('organizations', org);
      await recordEvent('attachment.created.local', { attachment_id: a.id, organization_id, file_name: a.file_name, size: a.size });
      return a;
    }

    m = p.match(/^\/api\/organizations\/([^/]+)\/links$/);
    if (m && method === 'POST') {
      const from_organization_id = decodeURIComponent(m[1]);
      const from = await getOne('organizations', from_organization_id);
      const to_organization_id = String(body?.target_organization_id || '').trim();
      const to = await getOne('organizations', to_organization_id);
      if (!from || !to) throw new Error('یکی از شرکت‌ها پیدا نشد');
      if (from_organization_id === to_organization_id) throw new Error('نمی‌توان یک شرکت را به خودش مرتبط کرد');
      const relation_type = String(body?.relation_type || 'partner').trim() || 'partner';
      const links = await getAll('organization_links');
      const duplicate = links.find(l =>
        ((l.from_organization_id === from_organization_id && l.to_organization_id === to_organization_id) ||
         (l.from_organization_id === to_organization_id && l.to_organization_id === from_organization_id)) &&
        String(l.relation_type || '') === relation_type
      );
      if (duplicate) throw new Error('این ارتباط قبلاً ثبت شده است');
      const link = {
        id: uuid(),
        from_organization_id,
        to_organization_id,
        relation_type,
        note: String(body?.note || '').trim(),
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      await put('organization_links', link);
      await recordEvent('organization.link.created.local', { id: link.id, from_organization_id, to_organization_id, relation_type });
      return link;
    }

    m = p.match(/^\/api\/organization-links\/([^/]+)$/);
    if (m && method === 'DELETE') {
      const id = decodeURIComponent(m[1]);
      const link = await getOne('organization_links', id);
      if (!link) throw new Error('ارتباط پیدا نشد');
      await removeOne('organization_links', id);
      await recordEvent('organization.link.deleted.local', { id, from_organization_id: link.from_organization_id, to_organization_id: link.to_organization_id });
      return { ok: true };
    }

    if (p === '/api/contacts' && method === 'GET') {
      let rows = (await getAll('contacts')).filter(c => !c.archived);
      const orgs = await getAll('organizations');
      const orgMap = new Map(orgs.map(o => [o.id, o]));
      const q = (u.searchParams.get('q') || '').trim().toLowerCase();
      const status = u.searchParams.get('status') || '';
      const organizationId = u.searchParams.get('organization_id') || '';
      if (q) rows = rows.filter(c => {
        const orgName = orgMap.get(c.organization_id)?.name || c.company || '';
        return matchesQuery([c.first_name,c.last_name,c.name,orgName,c.job_title,c.department,c.email,...(c.secondary_emails||[]),c.address,c.whatsapp,c.tags,c.relationship_types,c.notes], q, [c.phone,c.phone_raw,c.whatsapp,...(c.secondary_phones||[])]);
      });
      if (status) rows = rows.filter(c => c.status === status);
      if (organizationId) rows = rows.filter(c => c.organization_id === organizationId);
      rows.sort((a,b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
      const limit = Math.max(1, Math.min(2000, Number(u.searchParams.get('limit') || 500)));
      return Promise.all(rows.slice(0, limit).map(c => hydrateContact(c, orgMap)));
    }

    if (p === '/api/contacts' && method === 'POST') {
      let organizationId = body?.organization_id || null;
      let org = organizationId ? await getOne('organizations', organizationId) : null;
      if (!org && String(body?.company || body?.organization_name || '').trim()) org = await findOrCreateOrganizationByName(body.company || body.organization_name, { source: body?.source || 'manual' });
      const c = normalizeContact({ ...(body || {}), organization_id: org?.id || null, company: org?.name || body?.company || '' });
      if (!contactName(c) || contactName(c) === 'بدون نام') throw new Error('نام یا شماره/ایمیل مخاطب لازم است');
      await ensureUniquePhones(c.phone, c.secondary_phones);
      await put('contacts', c);
      if (org && c.is_primary_contact) await setPrimaryContact(org.id, c.id);
      await recordEvent('contact.created.local', { id: c.id, organization_id: c.organization_id, phone: c.phone });
      return hydrateContact(c, org ? new Map([[org.id, org]]) : null);
    }

    m = p.match(/^\/api\/contacts\/([^/]+)$/);
    if (m && method === 'GET') return getContactDetail(decodeURIComponent(m[1]));
    if (m && method === 'PATCH') {
      const id = decodeURIComponent(m[1]);
      const old = await getOne('contacts', id);
      if (!old) throw new Error('مخاطب پیدا نشد');
      const oldOrganizationId = old.organization_id || null;
      let organizationId = body?.organization_id !== undefined ? body.organization_id : old.organization_id;
      let org = organizationId ? await getOne('organizations', organizationId) : null;
      const typedCompany = String(body?.company ?? body?.organization_name ?? '').trim();
      if (typedCompany && body.organization_id === undefined && searchNorm(typedCompany) !== searchNorm(org?.name || '')) {
        org = await findOrCreateOrganizationByName(typedCompany, { source: old.source || 'manual' });
        organizationId = org?.id || null;
      }
      if (body?.organization_id === null || body?.organization_id === '') { org = null; organizationId = null; }
      const c = normalizeContact({ ...old, ...(body || {}), organization_id: org?.id || organizationId || null, company: org?.name || (organizationId ? old.company : ''), id }, old);
      await ensureUniquePhones(c.phone, c.secondary_phones, id);
      await put('contacts', c);
      if (oldOrganizationId && oldOrganizationId !== c.organization_id) await clearPrimaryContactIfNeeded(oldOrganizationId, c.id);
      if (c.organization_id && c.is_primary_contact) await setPrimaryContact(c.organization_id, c.id);
      else if (c.organization_id) await clearPrimaryContactIfNeeded(c.organization_id, c.id);
      await recordEvent('contact.updated.local', { id: c.id, organization_id: c.organization_id });
      return hydrateContact(c, org ? new Map([[org.id, org]]) : null);
    }

    m = p.match(/^\/api\/contacts\/([^/]+)\/interactions$/);
    if (m && method === 'POST') {
      const contact_id = decodeURIComponent(m[1]);
      const c = await getOne('contacts', contact_id);
      if (!c) throw new Error('مخاطب پیدا نشد');
      const i = {
        id: uuid(), contact_id, organization_id: c.organization_id || null, type: body?.type || 'note', direction: body?.direction || 'outbound',
        subject: body?.subject || '', body: body?.body || '', outcome: body?.outcome || '', duration_seconds: Number(body?.duration_seconds || 0),
        audio_path: body?.audio_path || '', transcript: body?.transcript || '', ai_summary: body?.ai_summary || '', occurred_at: body?.occurred_at || nowIso(), created_at: nowIso(),
      };
      await put('interactions', i);
      c.last_contact_at = i.occurred_at; c.updated_at = nowIso(); if (c.status === 'new') c.status = 'contacted'; await put('contacts', c);
      if (c.organization_id) {
        const org = await getOne('organizations', c.organization_id);
        if (org) { org.last_contact_at = i.occurred_at; org.updated_at = nowIso(); if (org.status === 'new') org.status = 'contacted'; await put('organizations', org); }
      }
      await recordEvent('interaction.created.local', { contact_id, organization_id: c.organization_id, interaction_id: i.id });
      return { contact: await hydrateContact(c), interaction: i };
    }

    m = p.match(/^\/api\/contacts\/([^/]+)\/attachments$/);
    if (m && method === 'POST') {
      const contact_id = decodeURIComponent(m[1]);
      const c = await getOne('contacts', contact_id);
      if (!c) throw new Error('مخاطب پیدا نشد');
      if (!(body instanceof FormData)) throw new Error('فایل معتبر نیست');
      const a = await createAttachmentRecord({ contact_id, organization_id: c.organization_id || null, formData: body });
      await put('attachments', a);
      const label = a.category === 'invoice' ? 'فاکتور' : a.category === 'proforma' ? 'پیش‌فاکتور' : a.category === 'contract' ? 'قرارداد' : a.category === 'receipt' ? 'رسید' : 'سند';
      const i = {
        id: uuid(), contact_id, organization_id: c.organization_id || null, type: 'document', direction: 'outbound',
        subject: `${label}: ${a.title || a.file_name}`, body: a.note || '', outcome: '', duration_seconds: 0,
        audio_path: '', transcript: '', ai_summary: '', attachment_id: a.id, attachment_name: a.file_name,
        occurred_at: a.created_at, created_at: a.created_at,
      };
      await put('interactions', i);
      c.last_contact_at = a.created_at; c.updated_at = nowIso(); await put('contacts', c);
      if (c.organization_id) {
        const org = await getOne('organizations', c.organization_id);
        if (org) { org.last_contact_at = a.created_at; org.updated_at = nowIso(); await put('organizations', org); }
      }
      await recordEvent('attachment.created.local', { attachment_id: a.id, contact_id, organization_id: c.organization_id || null, file_name: a.file_name, size: a.size });
      return a;
    }

    m = p.match(/^\/api\/contacts\/([^/]+)\/call-report$/);
    if (m && method === 'POST') {
      const contact_id = decodeURIComponent(m[1]);
      const c = await getOne('contacts', contact_id);
      if (!c) throw new Error('مخاطب پیدا نشد');
      const when = nowIso();
      const i = { id: uuid(), contact_id, organization_id: c.organization_id || null, type: 'call', direction: 'outbound', subject: '', body: body?.body || '', outcome: body?.outcome || '', duration_seconds: Number(body?.duration_seconds || 0), audio_path: '', transcript: '', ai_summary: '', occurred_at: when, created_at: when };
      await put('interactions', i);
      c.last_contact_at = when; if (STAGES.includes(body?.outcome)) c.status = body.outcome; else if (c.status === 'new') c.status = 'contacted'; c.updated_at = nowIso();
      let task = null;
      if (body?.follow_up_at) {
        task = { id: uuid(), contact_id, organization_id: c.organization_id || null, title: body?.follow_up_title || 'پیگیری تماس', description: '', due_at: body.follow_up_at, done: false, priority: 'high', channel: 'call', created_at: nowIso() };
        await put('tasks', task); c.next_action = `${task.title} - ${task.due_at}`;
      }
      await put('contacts', c);
      if (c.organization_id) {
        const org = await getOne('organizations', c.organization_id);
        if (org) {
          org.last_contact_at = when;
          if (STAGES.includes(body?.outcome)) org.status = body.outcome;
          else if (org.status === 'new') org.status = 'contacted';
          org.updated_at = nowIso(); await put('organizations', org);
        }
      }
      await recordEvent('call.completed.local', { contact_id, organization_id: c.organization_id, interaction_id: i.id });
      return { contact: await hydrateContact(c), call: i, follow_up: task };
    }

    m = p.match(/^\/api\/contacts\/([^/]+)\/audio-note$/);
    if (m && method === 'POST') {
      const contact_id = decodeURIComponent(m[1]);
      const c = await getOne('contacts', contact_id);
      if (!c) throw new Error('مخاطب پیدا نشد');
      const file = body instanceof FormData ? body.get('file') : null;
      if (!(file instanceof Blob)) throw new Error('فایل صوتی پیدا نشد');
      const dataUrl = await blobToDataUrl(file);
      const i = { id: uuid(), contact_id, organization_id: c.organization_id || null, type: 'voice_note', direction: 'outbound', subject: 'Voice note', body: '', outcome: '', duration_seconds: 0, audio_path: dataUrl, transcript: '', ai_summary: '', occurred_at: nowIso(), created_at: nowIso() };
      await put('interactions', i);
      c.last_contact_at = i.occurred_at; c.updated_at = nowIso(); await put('contacts', c);
      await recordEvent('voice_note.created.local', { contact_id, organization_id: c.organization_id, interaction_id: i.id });
      return { contact_id, interaction: i, transcription_error: 'نسخه آفلاین: صدا روی گوشی ذخیره شد؛ رونویسی خودکار ابری غیرفعال است.' };
    }

    m = p.match(/^\/api\/contacts\/([^/]+)\/ai\/analyze$/);
    if (m && method === 'POST') {
      const id = decodeURIComponent(m[1]);
      const c = await getOne('contacts', id);
      if (!c) throw new Error('مخاطب پیدا نشد');
      const interactions = (await getAll('interactions')).filter(i => i.contact_id === id).sort((a,b) => String(b.occurred_at || '').localeCompare(String(a.occurred_at || '')));
      const r = analyzeLocally(c, interactions);
      Object.assign(c, r, { updated_at: nowIso() });
      await put('contacts', c);
      await recordEvent('ai.local_analysis', { contact_id: id, score: r.ai_score });
      return { contact: await hydrateContact(c), analysis: r };
    }


    if (p === '/api/meetings' && method === 'GET') {
      let rows = await getAll('meetings');
      const status = String(u.searchParams.get('status') || '').trim();
      const contactId = String(u.searchParams.get('contact_id') || '').trim();
      const organizationId = String(u.searchParams.get('organization_id') || '').trim();
      const projectId = String(u.searchParams.get('project_id') || '').trim();
      if (status) rows = rows.filter(x => x.status === status);
      if (contactId) rows = rows.filter(x => x.contact_id === contactId);
      if (organizationId) rows = rows.filter(x => x.organization_id === organizationId);
      if (projectId) rows = rows.filter(x => x.project_id === projectId);
      rows.sort((a,b) => String(a.start_at || '9999').localeCompare(String(b.start_at || '9999')));
      return rows;
    }
    if (p === '/api/meetings' && method === 'POST') {
      const meeting = normalizeMeeting(body || {});
      if (!meeting.start_at) throw new Error('زمان جلسه الزامی است');
      if (meeting.end_at && new Date(meeting.end_at) <= new Date(meeting.start_at)) throw new Error('پایان جلسه باید بعد از شروع باشد');
      await put('meetings', meeting);
      await recordEvent('meeting.created.local', { id: meeting.id, start_at: meeting.start_at, contact_id: meeting.contact_id, organization_id: meeting.organization_id, project_id: meeting.project_id });
      return meeting;
    }
    m = p.match(/^\/api\/meetings\/([^/]+)$/);
    if (m && method === 'PATCH') {
      const id = decodeURIComponent(m[1]);
      const old = await getOne('meetings', id); if (!old) throw new Error('جلسه پیدا نشد');
      const meeting = normalizeMeeting({ ...(body || {}), id }, old);
      if (!meeting.start_at) throw new Error('زمان جلسه الزامی است');
      if (meeting.end_at && new Date(meeting.end_at) <= new Date(meeting.start_at)) throw new Error('پایان جلسه باید بعد از شروع باشد');
      await put('meetings', meeting); await recordEvent('meeting.updated.local', { id, status: meeting.status, start_at: meeting.start_at });
      return meeting;
    }
    if (m && method === 'DELETE') {
      const id = decodeURIComponent(m[1]); await removeOne('meetings', id); await recordEvent('meeting.deleted.local', { id }); return { ok: true };
    }
    m = p.match(/^\/api\/meetings\/([^/]+)\/done$/);
    if (m && method === 'PATCH') {
      const id = decodeURIComponent(m[1]); const meeting = await getOne('meetings', id); if (!meeting) throw new Error('جلسه پیدا نشد');
      meeting.status = 'done'; meeting.updated_at = nowIso(); await put('meetings', meeting); await recordEvent('meeting.completed.local', { id }); return meeting;
    }

    if (p === '/api/reminders' && method === 'GET') {
      let rows = await getAll('reminders');
      const includeCompleted = u.searchParams.get('include_completed') === 'true';
      if (!includeCompleted) rows = rows.filter(x => x.status === 'active');
      rows.sort((a,b) => String(a.remind_at || '9999').localeCompare(String(b.remind_at || '9999')) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
      return rows;
    }
    if (p === '/api/reminders' && method === 'POST') {
      const reminder = normalizeReminder(body || {});
      if (!reminder.title) throw new Error('عنوان یادآوری الزامی است');
      if (!reminder.remind_at || Number.isNaN(new Date(reminder.remind_at).getTime())) throw new Error('زمان یادآوری معتبر نیست');
      await put('reminders', reminder);
      await recordEvent('reminder.created.local', { id: reminder.id, remind_at: reminder.remind_at, notification_id: reminder.notification_id });
      return reminder;
    }
    m = p.match(/^\/api\/reminders\/([^/]+)$/);
    if (m && method === 'PATCH') {
      const id = decodeURIComponent(m[1]);
      const old = await getOne('reminders', id); if (!old) throw new Error('یادآوری پیدا نشد');
      const reminder = normalizeReminder({ ...(body || {}), id }, old);
      if (!reminder.title) throw new Error('عنوان یادآوری الزامی است');
      if (!reminder.remind_at || Number.isNaN(new Date(reminder.remind_at).getTime())) throw new Error('زمان یادآوری معتبر نیست');
      await put('reminders', reminder);
      await recordEvent('reminder.updated.local', { id, remind_at: reminder.remind_at, status: reminder.status });
      return reminder;
    }
    if (m && method === 'DELETE') {
      const id = decodeURIComponent(m[1]);
      const reminder = await getOne('reminders', id); if (!reminder) throw new Error('یادآوری پیدا نشد');
      await removeOne('reminders', id);
      await recordEvent('reminder.deleted.local', { id, notification_id: reminder.notification_id });
      return { ok: true, notification_id: reminder.notification_id };
    }
    m = p.match(/^\/api\/reminders\/([^/]+)\/done$/);
    if (m && method === 'PATCH') {
      const id = decodeURIComponent(m[1]);
      const reminder = await getOne('reminders', id); if (!reminder) throw new Error('یادآوری پیدا نشد');
      reminder.status = 'done'; reminder.updated_at = nowIso(); await put('reminders', reminder);
      await recordEvent('reminder.completed.local', { id, notification_id: reminder.notification_id });
      return reminder;
    }

    if (p === '/api/finance/summary' && method === 'GET') {
      let rows = await getAll('finance_entries');
      const partyType = String(u.searchParams.get('party_type') || '').trim();
      const partyId = String(u.searchParams.get('party_id') || '').trim();
      const projectId = String(u.searchParams.get('project_id') || '').trim();
      if (partyType) rows = rows.filter(e => e.party_type === partyType);
      if (partyId) rows = rows.filter(e => e.party_id === partyId);
      if (projectId) rows = rows.filter(e => e.project_id === projectId);
      return computeFinanceSummary(rows);
    }
    if (p === '/api/finance' && method === 'GET') {
      let rows = await getAll('finance_entries');
      const partyType = String(u.searchParams.get('party_type') || '').trim();
      const partyId = String(u.searchParams.get('party_id') || '').trim();
      const projectId = String(u.searchParams.get('project_id') || '').trim();
      const kind = String(u.searchParams.get('kind') || '').trim();
      if (partyType) rows = rows.filter(e => e.party_type === partyType);
      if (partyId) rows = rows.filter(e => e.party_id === partyId);
      if (projectId) rows = rows.filter(e => e.project_id === projectId);
      if (kind) rows = rows.filter(e => e.kind === kind);
      const all = await getAll('finance_entries');
      rows = rows.map(e => ({ ...e, outstanding_rial: financeInvoiceOutstanding(e, all) }));
      rows.sort((a,b) => String(b.posting_date || b.created_at || '').localeCompare(String(a.posting_date || a.created_at || '')));
      return rows;
    }
    if (p === '/api/finance' && method === 'POST') {
      const entry = normalizeFinanceEntry(body || {});
      if (!entry.party_id) throw new Error('طرف حساب را انتخاب کن');
      if (entry.party_type === 'organization' && !(await getOne('organizations', entry.party_id))) throw new Error('شرکت طرف حساب پیدا نشد');
      if (entry.party_type === 'contact' && !(await getOne('contacts', entry.party_id))) throw new Error('شخص طرف حساب پیدا نشد');
      if (entry.amount_rial <= 0) throw new Error('مبلغ باید بیشتر از صفر باشد');
      if (entry.reference_entry_id) {
        const ref = await getOne('finance_entries', entry.reference_entry_id);
        if (!ref) throw new Error('مرجع مالی پیدا نشد');
        if (ref.party_type !== entry.party_type || ref.party_id !== entry.party_id) throw new Error('مرجع مالی باید برای همان طرف حساب باشد');
        if (entry.kind === 'receipt' && ref.kind !== 'sales_invoice') throw new Error('دریافت فقط به فاکتور فروش تخصیص داده می‌شود');
        if (entry.kind === 'payment' && ref.kind !== 'purchase_invoice') throw new Error('پرداخت فقط به فاکتور خرید تخصیص داده می‌شود');
        if (entry.project_id && ref.project_id && entry.project_id !== ref.project_id) throw new Error('پروژه تراکنش با پروژه فاکتور مرجع یکسان نیست');
        if (!entry.project_id && ref.project_id) entry.project_id = ref.project_id;
        const allEntries = await getAll('finance_entries');
        const outstanding = financeInvoiceOutstanding(ref, allEntries);
        if (entry.amount_rial > outstanding) throw new Error(`مبلغ تخصیص از مانده فاکتور بیشتر است. مانده: ${outstanding} ریال`);
      }
      await put('finance_entries', entry);
      await recordEvent('finance.entry.created.local', { id: entry.id, kind: entry.kind, party_type: entry.party_type, party_id: entry.party_id, amount_rial: entry.amount_rial });
      return entry;
    }
    m = p.match(/^\/api\/finance\/([^/]+)$/);
    if (m && method === 'DELETE') {
      const id = decodeURIComponent(m[1]); const entry = await getOne('finance_entries', id); if (!entry) throw new Error('سند مالی پیدا نشد');
      const used = (await getAll('finance_entries')).some(e => e.reference_entry_id === id);
      if (used) throw new Error('این سند مرجع پرداخت/دریافت است و تا حذف تراکنش‌های مرتبط قابل حذف نیست');
      await removeOne('finance_entries', id); await recordEvent('finance.entry.deleted.local', { id }); return { ok: true };
    }

    if (p === '/api/document-checks' && method === 'GET') {
      let rows = await getAll('document_checks');
      const scopeType = String(u.searchParams.get('scope_type') || '').trim();
      const scopeId = String(u.searchParams.get('scope_id') || '').trim();
      const status = String(u.searchParams.get('status') || '').trim();
      if (scopeType) rows = rows.filter(d => d.scope_type === scopeType);
      if (scopeId) rows = rows.filter(d => d.scope_id === scopeId);
      rows = rows.map(d => ({ ...d, effective_status: effectiveDocumentStatus(d) }));
      if (status) rows = rows.filter(d => d.effective_status === status);
      rows.sort((a,b) => String(a.expiry_date || '9999').localeCompare(String(b.expiry_date || '9999')) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
      return rows;
    }
    if (p === '/api/document-checks' && method === 'POST') {
      const isForm = body instanceof FormData;
      const raw = isForm ? Object.fromEntries([...body.entries()].filter(([k]) => k !== 'file')) : (body || {});
      const doc = normalizeDocumentCheck(raw);
      if (!doc.scope_id) throw new Error('پرونده مرتبط با مدرک مشخص نشده است');
      let targetExists = false;
      if (doc.scope_type === 'organization') targetExists = Boolean(await getOne('organizations', doc.scope_id));
      if (doc.scope_type === 'contact') targetExists = Boolean(await getOne('contacts', doc.scope_id));
      if (doc.scope_type === 'project') targetExists = Boolean(await getOne('projects', doc.scope_id));
      if (!targetExists) throw new Error('پرونده مرتبط با مدرک پیدا نشد');
      if (isForm) {
        const file = body.get('file');
        if (file instanceof Blob && Number(file.size || 0) > 0) {
          const meta = new FormData();
          meta.append('file', file, file.name || 'document');
          meta.append('category', 'document');
          meta.append('title', doc.title);
          meta.append('note', doc.note || '');
          const target = {
            contact_id: doc.scope_type === 'contact' ? doc.scope_id : null,
            organization_id: doc.scope_type === 'organization' ? doc.scope_id : null,
            project_id: doc.scope_type === 'project' ? doc.scope_id : null,
            formData: meta
          };
          const a = await createAttachmentRecord(target);
          await put('attachments', a);
          doc.attachment_id = a.id;
        }
      }
      await put('document_checks', doc);
      await recordEvent('document.check.created.local', { id: doc.id, scope_type: doc.scope_type, scope_id: doc.scope_id, status: doc.status });
      return { ...doc, effective_status: effectiveDocumentStatus(doc) };
    }
    m = p.match(/^\/api\/document-checks\/([^/]+)$/);
    if (m && method === 'PATCH') {
      const id = decodeURIComponent(m[1]); const old = await getOne('document_checks', id); if (!old) throw new Error('مدرک پیدا نشد');
      const isForm = body instanceof FormData;
      const raw = isForm ? Object.fromEntries([...body.entries()].filter(([k]) => k !== 'file')) : (body || {});
      const doc = normalizeDocumentCheck({ ...raw, id }, old);
      if (isForm) {
        const file = body.get('file');
        if (file instanceof Blob && Number(file.size || 0) > 0) {
          const meta = new FormData();
          meta.append('file', file, file.name || 'document'); meta.append('category', 'document'); meta.append('title', doc.title); meta.append('note', doc.note || '');
          const a = await createAttachmentRecord({
            contact_id: doc.scope_type === 'contact' ? doc.scope_id : null,
            organization_id: doc.scope_type === 'organization' ? doc.scope_id : null,
            project_id: doc.scope_type === 'project' ? doc.scope_id : null,
            formData: meta
          });
          await put('attachments', a);
          const previousAttachment = doc.attachment_id;
          doc.attachment_id = a.id;
          if (previousAttachment && previousAttachment !== a.id) await removeOne('attachments', previousAttachment);
        }
      }
      await put('document_checks', doc);
      await recordEvent('document.check.updated.local', { id, status: doc.status }); return { ...doc, effective_status: effectiveDocumentStatus(doc) };
    }
    if (m && method === 'DELETE') {
      const id = decodeURIComponent(m[1]); const doc = await getOne('document_checks', id); if (!doc) throw new Error('مدرک پیدا نشد');
      if (doc.attachment_id) await removeOne('attachments', doc.attachment_id);
      await removeOne('document_checks', id); await recordEvent('document.check.deleted.local', { id }); return { ok: true };
    }

    if (p === '/api/tasks' && method === 'GET') {
      const openOnly = u.searchParams.get('open_only') !== 'false';
      let rows = await getAll('tasks');
      if (openOnly) rows = rows.filter(t => !t.done);
      rows.sort((a,b) => (Number(a.done)-Number(b.done)) || String(a.due_at || '9999').localeCompare(String(b.due_at || '9999')) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
      return rows;
    }
    if (p === '/api/tasks' && method === 'POST') {
      const t = { id: body?.id || uuid(), contact_id: body?.contact_id || null, organization_id: body?.organization_id || null, project_id: body?.project_id || null, title: body?.title || 'پیگیری', description: body?.description || '', due_at: body?.due_at || null, done: false, priority: body?.priority || 'normal', channel: body?.channel || 'call', reminder_minutes: Math.max(0, Number(body?.reminder_minutes || 0) || 0), created_at: nowIso() };
      await put('tasks', t); await recordEvent('task.created.local', { id: t.id, contact_id: t.contact_id, organization_id: t.organization_id, project_id: t.project_id }); return t;
    }
    m = p.match(/^\/api\/tasks\/([^/]+)\/done$/);
    if (m && method === 'PATCH') {
      const id = decodeURIComponent(m[1]); const t = await getOne('tasks', id); if (!t) throw new Error('Task not found'); t.done = true; await put('tasks', t); await recordEvent('task.completed.local', { id }); return t;
    }

    if (p === '/api/social-posts' && method === 'GET') {
      const rows = await getAll('posts'); return rows.sort((a,b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    }
    if (p === '/api/social-posts' && method === 'POST') {
      const post = { id: body?.id || uuid(), title: body?.title || '', body: body?.body || '', platforms: Array.isArray(body?.platforms) ? body.platforms : [], status: 'offline-draft', scheduled_at: body?.scheduled_at || null, external_results: {}, created_at: nowIso() };
      await put('posts', post); await recordEvent('social.draft.saved.local', { id: post.id }); return post;
    }

    if (p === '/api/events' && method === 'GET') {
      const limit = Math.max(1, Math.min(500, Number(u.searchParams.get('limit') || 100)));
      const rows = await getAll('events'); return rows.sort((a,b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, limit);
    }
    m = p.match(/^\/api\/events\/([^/]+)\/retry$/);
    if (m && method === 'POST') return { id: decodeURIComponent(m[1]), delivered: true, attempts: 0, last_error: '', next_attempt_at: null };

    if (p === '/api/import/contacts.csv' && method === 'POST') {
      const file = body instanceof FormData ? body.get('file') : null;
      if (!(file instanceof Blob)) throw new Error('فایل CSV پیدا نشد');
      const text = await file.text();
      const rows = csvParse(text.replace(/^\uFEFF/, ''));
      let created = 0, skipped = 0, organizationsCreated = 0;
      const errors = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        try {
          let org = null;
          const company = String(r.company || r.organization || r.organization_name || '').trim();
          if (company) {
            const before = (await getAll('organizations')).length;
            org = await findOrCreateOrganizationByName(company, { source: r.source || 'csv' });
            const after = (await getAll('organizations')).length;
            if (after > before) organizationsCreated++;
          }
          const c = normalizeContact({ ...r, organization_id: org?.id || null, company: org?.name || company, secondary_phones: r.secondary_phones || '', secondary_emails: r.secondary_emails || '', deal_value: Number(String(r.deal_value || '0').replace(/,/g,'')) || 0, source: r.source || 'csv' });
          await ensureUniquePhones(c.phone, c.secondary_phones); await put('contacts', c); created++;
        } catch (error) {
          skipped++;
          if (errors.length < 10) errors.push(`ردیف ${i + 2}: ${error?.message || 'خطا در درج'}`);
        }
      }
      await recordEvent('contacts.csv_import.local', { created, skipped, organizations_created: organizationsCreated, errors: errors.length });
      return { created, skipped, organizations_created: organizationsCreated, errors };
    }

    if (p === '/api/import/organizations.csv' && method === 'POST') {
      const file = body instanceof FormData ? body.get('file') : null;
      if (!(file instanceof Blob)) throw new Error('فایل CSV پیدا نشد');
      const rows = csvParse((await file.text()).replace(/^\uFEFF/, ''));
      let created = 0, skipped = 0;
      const errors = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        try {
          const org = normalizeOrganization({ ...r, phones: r.phones || '', emails: r.emails || '', deal_value: Number(String(r.deal_value || '0').replace(/,/g,'')) || 0, source: r.source || 'csv' });
          if (!org.name) throw new Error('نام شرکت خالی است');
          const existing = (await getAll('organizations')).find(o => String(o.name || '').trim().toLowerCase() === org.name.toLowerCase());
          if (existing) { skipped++; continue; }
          await ensureUniqueOrganizationPhones(org); await put('organizations', org); created++;
        } catch (error) {
          skipped++;
          if (errors.length < 10) errors.push(`ردیف ${i + 2}: ${error?.message || 'خطا در درج'}`);
        }
      }
      await recordEvent('organizations.csv_import.local', { created, skipped, errors: errors.length });
      return { created, skipped, errors };
    }

    if (p === '/api/search' && method === 'GET') {
      const q = String(u.searchParams.get('q') || '').trim();
      const limit = Math.max(1, Math.min(50, Number(u.searchParams.get('limit') || 8)));
      const empty = { q, contacts: [], organizations: [], projects: [], files: [], documents: [], notes: [], invoices: [], total: 0 };
      if (!searchNorm(q)) return empty;
      const [contacts, organizations, projects, attachments, docChecks, interactions, invoiceRows] = await Promise.all([
        getAll('contacts'), getAll('organizations'), getAll('projects'), getAll('attachments'), getAll('document_checks'), getAll('interactions'), getAll('invoices')
      ]);
      const orgMap = new Map(organizations.map(o => [o.id, o]));
      const contactMap = new Map(contacts.map(c => [c.id, c]));
      const projectMap = new Map(projects.map(x => [x.id, x]));
      const ownerOf = (x = {}) => {
        if (x.contact_id && contactMap.get(x.contact_id)) { const c = contactMap.get(x.contact_id); const org = orgMap.get(c.organization_id); return { type: 'contact', id: c.id, name: contactName(c) + (org ? ` — ${org.name}` : '') }; }
        if (x.organization_id && orgMap.get(x.organization_id)) return { type: 'organization', id: x.organization_id, name: orgMap.get(x.organization_id).name };
        if (x.project_id && projectMap.get(x.project_id)) return { type: 'project', id: x.project_id, name: projectMap.get(x.project_id).title };
        return null;
      };
      const scopeOwner = d => d.scope_type === 'contact' ? ownerOf({ contact_id: d.scope_id }) : d.scope_type === 'organization' ? ownerOf({ organization_id: d.scope_id }) : ownerOf({ project_id: d.scope_id });
      const byScore = (nameOf) => (a, b) => (searchScore(nameOf(b), q) - searchScore(nameOf(a), q)) || String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || ''));
      const docLabel = { invoice: 'فاکتور', proforma: 'پیش‌فاکتور', receipt: 'رسید', contract: 'قرارداد', document: 'سند', other: 'سایر' };

      const people = contacts.filter(c => !c.archived && matchesQuery([contactName(c), orgMap.get(c.organization_id)?.name || c.company, c.job_title, c.department, c.email, c.address, c.tags, c.relationship_types], q, [c.phone, c.phone_raw, c.whatsapp, ...(c.secondary_phones || [])]))
        .sort(byScore(c => contactName(c)));
      const orgs = organizations.filter(o => !o.archived && matchesQuery([o.name, o.legal_name, o.industry, o.email, o.address, o.national_id, o.economic_code, o.tags, o.relationship_types], q, [o.main_phone, o.main_phone_raw, ...(o.phones || [])]))
        .sort(byScore(o => o.name));
      const projs = projects.filter(x => !x.archived && matchesQuery([x.title, x.reference_no, x.notes, orgMap.get(x.customer_organization_id)?.name, contactName(contactMap.get(x.customer_contact_id) || {})], q))
        .sort(byScore(x => x.title));
      const files = attachments.map(a => ({ a, owner: ownerOf(a) })).filter(({ a, owner }) => matchesQuery([a.title, a.file_name, a.invoice_no, a.note, a.tags, docLabel[a.category] || a.category, a.amount ? String(a.amount) : '', owner?.name], q))
        .sort((x, y) => byScore(r => r.a?.title || r.a?.file_name)(x, y));
      const docs = docChecks.map(d => ({ d, owner: scopeOwner(d) })).filter(({ d, owner }) => matchesQuery([d.title, d.document_no, d.issuer, d.note, d.category, owner?.name], q));
      const notes = interactions.filter(i => i.type !== 'document' && matchesQuery([i.subject, i.body, i.transcript], q))
        .sort((a, b) => String(b.occurred_at || '').localeCompare(String(a.occurred_at || '')));
      const invs = invoiceRows.filter(x => matchesQuery(invoiceSearchFields(x), q, [x.buyer?.phone]))
        .sort((a, b) => String(b.issue_date || '').localeCompare(String(a.issue_date || '')));
      return {
        q,
        invoices: invs.slice(0, limit).map(x => ({ id: x.id, type: x.type, number: x.number, status: x.status, issue_date: x.issue_date, buyer_name: x.buyer?.name || '', grand_total: x.grand_total })),
        contacts: people.slice(0, limit).map(c => { const org = orgMap.get(c.organization_id); return { id: c.id, name: contactName(c), company: org?.name || c.company || '', organization_id: org?.id || null, job_title: c.job_title || '', phone: c.phone || '', status: c.status, is_primary_contact: !!c.is_primary_contact }; }),
        organizations: orgs.slice(0, limit).map(o => ({ id: o.id, name: o.name, industry: o.industry || '', main_phone: o.main_phone || '', status: o.status, contacts_count: contacts.filter(c => !c.archived && c.organization_id === o.id).length })),
        projects: projs.slice(0, limit).map(x => ({ id: x.id, title: x.title, reference_no: x.reference_no || '', stage: x.stage, type: x.type, customer: orgMap.get(x.customer_organization_id)?.name || contactName(contactMap.get(x.customer_contact_id) || {}) })),
        files: files.slice(0, limit).map(({ a, owner }) => ({ ...attachmentPublic(a), owner })),
        documents: docs.slice(0, limit).map(({ d, owner }) => ({ ...d, effective_status: effectiveDocumentStatus(d), owner })),
        notes: notes.slice(0, Math.min(limit, 6)).map(i => ({ id: i.id, type: i.type, subject: i.subject || '', body: String(i.body || i.transcript || '').slice(0, 200), occurred_at: i.occurred_at, owner: ownerOf(i) })),
        total: people.length + orgs.length + projs.length + files.length + docs.length + notes.length + invs.length,
      };
    }

    if (p === '/api/attachments' && method === 'GET') {
      const q = String(u.searchParams.get('q') || '').trim();
      const category = String(u.searchParams.get('category') || '').trim();
      const scopeType = String(u.searchParams.get('scope_type') || '').trim();
      const scopeId = String(u.searchParams.get('scope_id') || '').trim();
      const limit = Math.max(1, Math.min(1000, Number(u.searchParams.get('limit') || 300)));
      const [attachments, contacts, organizations, projects] = await Promise.all([getAll('attachments'), getAll('contacts'), getAll('organizations'), getAll('projects')]);
      const orgMap = new Map(organizations.map(o => [o.id, o]));
      const contactMap = new Map(contacts.map(c => [c.id, c]));
      const projectMap = new Map(projects.map(x => [x.id, x]));
      const docLabel = { invoice: 'فاکتور', proforma: 'پیش‌فاکتور', receipt: 'رسید', contract: 'قرارداد', document: 'سند', other: 'سایر' };
      let rows = attachments.map(a => {
        const c = contactMap.get(a.contact_id), o = orgMap.get(a.organization_id) || orgMap.get(c?.organization_id), pr = projectMap.get(a.project_id);
        const owner = c ? { type: 'contact', id: c.id, name: contactName(c) + (o ? ` — ${o.name}` : '') } : o ? { type: 'organization', id: o.id, name: o.name } : pr ? { type: 'project', id: pr.id, name: pr.title } : null;
        return { a, owner, project: pr ? { id: pr.id, title: pr.title } : null };
      });
      if (scopeType === 'contact' && scopeId) rows = rows.filter(r => r.a.contact_id === scopeId);
      if (scopeType === 'organization' && scopeId) { const members = new Set(contacts.filter(c => c.organization_id === scopeId).map(c => c.id)); rows = rows.filter(r => r.a.organization_id === scopeId || members.has(r.a.contact_id)); }
      if (scopeType === 'project' && scopeId) rows = rows.filter(r => r.a.project_id === scopeId);
      if (category) rows = rows.filter(r => r.a.category === category);
      if (q) rows = rows.filter(r => matchesQuery([r.a.title, r.a.file_name, r.a.invoice_no, r.a.note, r.a.tags, docLabel[r.a.category] || r.a.category, r.a.amount ? String(r.a.amount) : '', r.owner?.name, r.project?.title], q));
      rows.sort((x, y) => String(y.a.created_at || '').localeCompare(String(x.a.created_at || '')));
      return rows.slice(0, limit).map(r => ({ ...attachmentPublic(r.a), owner: r.owner, project: r.project }));
    }

    m = p.match(/^\/api\/attachments\/([^/]+)$/);
    if (m && method === 'PATCH') {
      const id = decodeURIComponent(m[1]);
      const a = await getOne('attachments', id);
      if (!a) throw new Error('فایل پیدا نشد');
      const b = body || {};
      for (const k of ['title', 'invoice_no', 'invoice_date', 'note']) if (b[k] !== undefined) a[k] = String(b[k] || '').trim();
      if (b.category !== undefined) a.category = String(b.category || 'document');
      if (b.amount !== undefined) a.amount = Number(toLatinDigits(String(b.amount || 0)).replace(/[,٬]/g, '')) || 0;
      if (b.tags !== undefined) a.tags = normalizeTextList(b.tags);
      a.updated_at = nowIso();
      await put('attachments', a);
      const interactions = await getAll('interactions');
      const label = a.category === 'invoice' ? 'فاکتور' : a.category === 'proforma' ? 'پیش‌فاکتور' : a.category === 'contract' ? 'قرارداد' : a.category === 'receipt' ? 'رسید' : 'سند';
      for (const i of interactions.filter(x => x.attachment_id === id)) { i.subject = `${label}: ${a.title || a.file_name}`; i.body = a.note || ''; await put('interactions', i); }
      await recordEvent('attachment.updated.local', { attachment_id: id, file_name: a.file_name });
      return attachmentPublic(a);
    }
    if (m && method === 'GET') {
      const a = await getOne('attachments', decodeURIComponent(m[1]));
      if (!a) throw new Error('فایل پیدا نشد');
      return a;
    }
    if (m && method === 'DELETE') {
      const id = decodeURIComponent(m[1]);
      const a = await getOne('attachments', id);
      if (!a) throw new Error('فایل پیدا نشد');
      await removeOne('attachments', id);
      const interactions = await getAll('interactions');
      for (const i of interactions.filter(x => x.attachment_id === id)) await removeOne('interactions', i.id);
      const docChecks = await getAll('document_checks');
      for (const d of docChecks.filter(x => x.attachment_id === id)) { d.attachment_id = null; d.updated_at = nowIso(); await put('document_checks', d); }
      await recordEvent('attachment.deleted.local', { attachment_id: id, file_name: a.file_name, contact_id: a.contact_id, organization_id: a.organization_id, project_id: a.project_id || null });
      return { ok: true };
    }

    // ===== Products =====
    if (p === '/api/products' && method === 'GET') {
      const q = String(u.searchParams.get('q') || '').trim();
      const includeInactive = u.searchParams.get('include_inactive') === 'true';
      let rows = await getAll('products');
      if (!includeInactive) rows = rows.filter(x => x.active !== false);
      if (q) rows = rows.filter(x => matchesQuery([x.code, x.name, x.specs, x.category], q));
      rows.sort((a, b) => String(a.code || '~').localeCompare(String(b.code || '~'), 'en', { numeric: true }) || String(a.name).localeCompare(String(b.name), 'fa'));
      return rows;
    }
    if (p === '/api/products' && method === 'POST') {
      const prod = normalizeProduct(body || {});
      if (!prod.name) throw new Error('نام کالا / خدمت الزامی است');
      const all = await getAll('products');
      if (prod.code && all.some(x => searchNorm(x.code) === searchNorm(prod.code))) throw new Error(`کد کالای ${prod.code} قبلاً ثبت شده است`);
      await put('products', prod);
      await recordEvent('product.created.local', { id: prod.id, code: prod.code });
      return prod;
    }
    if (p === '/api/products/import' && method === 'POST') {
      const rows = csvParse(String(body?.csv || ''));
      const all = await getAll('products');
      const byCode = new Map(all.filter(x => x.code).map(x => [searchNorm(x.code), x]));
      const pickCol = (r, names) => { for (const n of names) { const k = Object.keys(r).find(h => searchNorm(h) === searchNorm(n)); if (k && String(r[k]).trim()) return r[k]; } return ''; };
      let created = 0, updated = 0; const errors = [];
      const out = [];
      rows.forEach((r, idx) => {
        const name = pickCol(r, ['name', 'نام', 'نام کالا', 'شرح', 'شرح کالا', 'title']);
        if (!name) { errors.push(`ردیف ${idx + 2}: نام کالا خالی است`); return; }
        const input = { code: pickCol(r, ['code', 'کد', 'کد کالا', 'sku']), name, specs: pickCol(r, ['specs', 'مشخصات', 'description', 'توضیحات']), unit: pickCol(r, ['unit', 'واحد']) || 'عدد', unit_price: pickCol(r, ['unit_price', 'price', 'قیمت', 'فی', 'فی ریال', 'قیمت واحد']), category: pickCol(r, ['category', 'دسته', 'گروه']) };
        const old = input.code ? byCode.get(searchNorm(input.code)) : null;
        const prod = normalizeProduct(input, old);
        if (prod.code) byCode.set(searchNorm(prod.code), prod);
        out.push(prod); old ? updated++ : created++;
      });
      await bulkPut('products', out);
      await recordEvent('products.csv_import.local', { created, updated, errors: errors.length });
      return { created, updated, errors };
    }
    m = p.match(/^\/api\/products\/([^/]+)$/);
    if (m && method === 'PATCH') {
      const id = decodeURIComponent(m[1]);
      const old = await getOne('products', id); if (!old) throw new Error('کالا پیدا نشد');
      const prod = normalizeProduct({ ...(body || {}), id }, old);
      if (!prod.name) throw new Error('نام کالا / خدمت الزامی است');
      const all = await getAll('products');
      if (prod.code && all.some(x => x.id !== id && searchNorm(x.code) === searchNorm(prod.code))) throw new Error(`کد کالای ${prod.code} قبلاً ثبت شده است`);
      await put('products', prod);
      return prod;
    }
    if (m && method === 'DELETE') {
      const id = decodeURIComponent(m[1]);
      await removeOne('products', id);
      await recordEvent('product.deleted.local', { id });
      return { ok: true };
    }

    // ===== Invoice settings / numbering =====
    if (p === '/api/invoice-settings' && method === 'GET') return getInvoiceSettings();
    if (p === '/api/invoice-settings' && method === 'PUT') {
      const old = await getInvoiceSettings();
      const merged = { ...old, ...(body || {}), counters: old.counters,
        default_terms: { ...old.default_terms, ...(body?.default_terms || {}) },
        default_term_rows: { ...old.default_term_rows, ...(body?.default_term_rows || {}) } };
      for (const type of INVOICE_TYPES) {
        if (body?.default_terms?.[type] !== undefined && !Array.isArray(body?.default_term_rows?.[type])) delete merged.default_term_rows[type];
      }
      const s = mergeInvoiceSettings(merged);
      if (body?.reset_counters) s.counters = {};
      s.updated_at = nowIso();
      await put('app_settings', s);
      await recordEvent('invoice.settings.updated.local', {});
      return s;
    }
    if (p === '/api/invoices/next-number' && method === 'GET') {
      const type = INVOICE_TYPES.includes(u.searchParams.get('type')) ? u.searchParams.get('type') : 'invoice';
      const date = u.searchParams.get('date') || new Date().toISOString().slice(0, 10);
      const next = await previewNextInvoiceNumber(type, date);
      return { number: next.number, seq: next.seq };
    }

    // ===== Invoices & proformas =====
    if (p === '/api/invoices' && method === 'GET') {
      let rows = await getAll('invoices');
      const type = String(u.searchParams.get('type') || '').trim();
      const status = String(u.searchParams.get('status') || '').trim();
      const partyType = String(u.searchParams.get('party_type') || '').trim();
      const partyId = String(u.searchParams.get('party_id') || '').trim();
      const projectId = String(u.searchParams.get('project_id') || '').trim();
      const q = String(u.searchParams.get('q') || '').trim();
      if (type) rows = rows.filter(x => x.type === type);
      if (status) rows = rows.filter(x => x.status === status);
      if (partyType) rows = rows.filter(x => x.party_type === partyType);
      if (partyId) rows = rows.filter(x => x.party_id === partyId || x.contact_id === partyId);
      if (projectId) rows = rows.filter(x => x.project_id === projectId);
      if (q) rows = rows.filter(x => matchesQuery(invoiceSearchFields(x), q, [x.buyer?.phone]));
      const today = new Date().toISOString().slice(0, 10);
      rows = rows.map(x => ({ ...x, expired: x.type === 'proforma' && ['draft', 'sent'].includes(x.status) && x.due_date && x.due_date < today }));
      rows.sort((a, b) => String(b.issue_date || '').localeCompare(String(a.issue_date || '')) || String(b.number).localeCompare(String(a.number), 'en', { numeric: true }));
      return rows;
    }
    if (p === '/api/invoices' && method === 'POST') return saveInvoiceRecord(body || {});
    m = p.match(/^\/api\/invoices\/([^/]+)$/);
    if (m && method === 'GET') {
      const inv = await getOne('invoices', decodeURIComponent(m[1])); if (!inv) throw new Error('فاکتور پیدا نشد');
      return { ...inv, totals: computeInvoiceTotals(inv), amount_words: numberToPersianWords(inv.grand_total) };
    }
    if (m && method === 'PATCH') {
      const id = decodeURIComponent(m[1]);
      const old = await getOne('invoices', id); if (!old) throw new Error('فاکتور پیدا نشد');
      return saveInvoiceRecord({ ...(body || {}), id, type: old.type }, old);
    }
    if (m && method === 'DELETE') return deleteInvoiceRecord(decodeURIComponent(m[1]));
    m = p.match(/^\/api\/invoices\/([^/]+)\/convert$/);
    if (m && method === 'POST') {
      const id = decodeURIComponent(m[1]);
      const pf = await getOne('invoices', id); if (!pf || pf.type !== 'proforma') throw new Error('پیش‌فاکتور پیدا نشد');
      if (pf.converted_invoice_id && await getOne('invoices', pf.converted_invoice_id)) throw new Error('این پیش‌فاکتور قبلاً به فاکتور تبدیل شده است');
      const settings = await getInvoiceSettings();
      const { id: _id, number: _n, status: _s, created_at: _c, updated_at: _u, ledger_entry_id: _l, converted_invoice_id: _ci, due_date: _d, terms: _t, ...rest } = pf;
      const inv = await saveInvoiceRecord({ ...rest, ...(body || {}), type: 'invoice', status: body?.status || 'issued', issue_date: body?.issue_date || new Date().toISOString().slice(0, 10), items: pf.items.map(i => ({ ...i, id: uuid() })), source_proforma_id: pf.id, term_rows: settings.default_term_rows.invoice.slice(), terms: settings.default_terms.invoice || '' });
      pf.status = 'converted'; pf.converted_invoice_id = inv.id; pf.updated_at = nowIso();
      await put('invoices', pf);
      return inv;
    }

    if (p === '/api/ai/business-card' && method === 'POST') throw new Error('OCR ابری در نسخه کاملاً آفلاین غیرفعال است. اطلاعات را دستی یا از CSV/Backup وارد کن.');

    throw new Error(`عملیات آفلاین پشتیبانی نمی‌شود: ${method} ${p}`);
  }

  async function exportBackup() {
    await ensureMigrations();
    const data = {};
    for (const s of STORES) data[s] = await getAll(s);
    return {
      format: 'CRM-NIKARA-BACKUP', version: '1.1.2', exported_at: nowIso(),
      organizations: data.organizations,
      contacts: data.contacts,
      projects: data.projects,
      project_participants: data.project_participants,
      interactions: data.interactions,
      attachments: data.attachments,
      organization_links: data.organization_links,
      tasks: data.tasks,
      meetings: data.meetings,
      reminders: data.reminders,
      finance_entries: data.finance_entries,
      document_checks: data.document_checks,
      social_posts: data.posts,
      events: data.events,
      products: data.products,
      invoices: data.invoices,
      app_settings: data.app_settings,
    };
  }

  async function importBackup(payload, replace = false) {
    if (!payload || typeof payload !== 'object') throw new Error('ساختار Backup معتبر نیست');
    if (payload.format && payload.format !== 'CRM-NIKARA-BACKUP') throw new Error('این فایل Backup متعلق به CRM-NIKARA نیست');
    await openDb();
    if (replace) for (const s of STORES) await clearStore(s);
    const organizations = Array.isArray(payload.organizations) ? payload.organizations : [];
    const contacts = Array.isArray(payload.contacts) ? payload.contacts : [];
    const projects = Array.isArray(payload.projects) ? payload.projects : [];
    const projectParticipants = Array.isArray(payload.project_participants) ? payload.project_participants : [];
    const interactions = Array.isArray(payload.interactions) ? payload.interactions : [];
    const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
    const organizationLinks = Array.isArray(payload.organization_links) ? payload.organization_links : [];
    const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
    const meetings = Array.isArray(payload.meetings) ? payload.meetings : [];
    const reminders = Array.isArray(payload.reminders) ? payload.reminders : [];
    const financeEntries = Array.isArray(payload.finance_entries) ? payload.finance_entries : [];
    const documentChecks = Array.isArray(payload.document_checks) ? payload.document_checks : [];
    const posts = Array.isArray(payload.social_posts) ? payload.social_posts : (Array.isArray(payload.posts) ? payload.posts : []);
    const events = Array.isArray(payload.events) ? payload.events : [];
    const products = Array.isArray(payload.products) ? payload.products : [];
    const invoices = Array.isArray(payload.invoices) ? payload.invoices : [];
    const appSettings = Array.isArray(payload.app_settings) ? payload.app_settings : [];

    const orgRows = [], contactRows = [], projectRows = [], participantRows = [], interactionRows = [], attachmentRows = [], linkRows = [], taskRows = [], meetingRows = [], reminderRows = [], financeRows = [], docRows = [], postRows = [], eventRows = [];
    let orgCount = 0, cCount = 0;
    for (const raw of organizations) { const org = normalizeOrganization(raw); if (org.name) { orgRows.push(org); orgCount++; } }
    for (const raw of contacts) { const c = normalizeContact(raw); contactRows.push(c); cCount++; }
    for (const raw of projects) {
      const p = normalizeProject(raw); if (p.title) projectRows.push(p);
    }
    for (const raw of projectParticipants) {
      const p = normalizeProjectParticipant(raw); if (p.project_id && (p.organization_id || p.contact_id)) participantRows.push(p);
    }
    for (const raw of interactions) interactionRows.push({ id: raw.id || uuid(), contact_id: raw.contact_id || null, organization_id: raw.organization_id || null, project_id: raw.project_id || null, type: raw.type || 'note', direction: raw.direction || 'outbound', subject: raw.subject || '', body: raw.body || '', outcome: raw.outcome || '', duration_seconds: Number(raw.duration_seconds || 0), audio_path: raw.audio_path && String(raw.audio_path).startsWith('data:') ? raw.audio_path : '', transcript: raw.transcript || '', ai_summary: raw.ai_summary || '', attachment_id: raw.attachment_id || null, attachment_name: raw.attachment_name || '', occurred_at: raw.occurred_at || raw.created_at || nowIso(), created_at: raw.created_at || nowIso() });
    for (const raw of attachments) {
      const dataUrl = raw.data_url && String(raw.data_url).startsWith('data:') ? String(raw.data_url) : '';
      if (!dataUrl) continue;
      attachmentRows.push({
        id: raw.id || uuid(), contact_id: raw.contact_id || null, organization_id: raw.organization_id || null, project_id: raw.project_id || null,
        category: raw.category || 'document', title: raw.title || '', invoice_no: raw.invoice_no || '',
        invoice_date: raw.invoice_date || '', amount: Number(raw.amount || 0), note: raw.note || '',
        tags: normalizeTextList(raw.tags || []),
        file_name: raw.file_name || 'document', mime_type: raw.mime_type || 'application/octet-stream',
        size: Number(raw.size || 0), data_url: dataUrl,
        created_at: raw.created_at || nowIso(), updated_at: raw.updated_at || raw.created_at || nowIso()
      });
    }
    for (const raw of organizationLinks) {
      const fromId = raw.from_organization_id || raw.fromOrganizationId || '';
      const toId = raw.to_organization_id || raw.toOrganizationId || '';
      if (!fromId || !toId || fromId === toId) continue;
      linkRows.push({
        id: raw.id || uuid(),
        from_organization_id: fromId,
        to_organization_id: toId,
        relation_type: String(raw.relation_type || raw.type || 'partner'),
        note: String(raw.note || ''),
        created_at: raw.created_at || nowIso(),
        updated_at: raw.updated_at || raw.created_at || nowIso(),
      });
    }
    for (const raw of tasks) taskRows.push({ id: raw.id || uuid(), contact_id: raw.contact_id || null, organization_id: raw.organization_id || null, project_id: raw.project_id || null, title: raw.title || 'پیگیری', description: raw.description || '', due_at: raw.due_at || null, done: Boolean(raw.done), priority: raw.priority || 'normal', channel: raw.channel || 'call', reminder_minutes: Math.max(0, Number(raw.reminder_minutes || 0) || 0), created_at: raw.created_at || nowIso() });
    for (const raw of meetings) { const x = normalizeMeeting(raw); if (x.start_at) meetingRows.push(x); }
    for (const raw of reminders) { const x = normalizeReminder(raw); if (x.title && x.remind_at) reminderRows.push(x); }
    for (const raw of financeEntries) { const x = normalizeFinanceEntry(raw); if (x.party_id && x.amount_rial > 0) financeRows.push(x); }
    for (const raw of documentChecks) { const x = normalizeDocumentCheck(raw); if (x.scope_id) docRows.push(x); }
    for (const raw of posts) postRows.push({ id: raw.id || uuid(), title: raw.title || '', body: raw.body || '', platforms: Array.isArray(raw.platforms) ? raw.platforms : [], status: raw.status || 'offline-draft', scheduled_at: raw.scheduled_at || null, external_results: raw.external_results || {}, created_at: raw.created_at || nowIso() });
    for (const raw of events) eventRows.push({ id: raw.id || uuid(), event_type: raw.event_type || 'imported.event', payload: raw.payload || {}, delivered: true, attempts: Number(raw.attempts || 0), last_error: raw.last_error || '', next_attempt_at: null, last_attempt_at: raw.last_attempt_at || null, created_at: raw.created_at || nowIso() });

    if (orgRows.length) await bulkPut('organizations', orgRows);
    if (contactRows.length) await bulkPut('contacts', contactRows);
    if (projectRows.length) await bulkPut('projects', projectRows);
    if (participantRows.length) await bulkPut('project_participants', participantRows);
    if (interactionRows.length) await bulkPut('interactions', interactionRows);
    if (attachmentRows.length) await bulkPut('attachments', attachmentRows);
    if (linkRows.length) await bulkPut('organization_links', linkRows);
    if (taskRows.length) await bulkPut('tasks', taskRows);
    if (meetingRows.length) await bulkPut('meetings', meetingRows);
    if (reminderRows.length) await bulkPut('reminders', reminderRows);
    if (financeRows.length) await bulkPut('finance_entries', financeRows);
    if (docRows.length) await bulkPut('document_checks', docRows);
    if (postRows.length) await bulkPut('posts', postRows);
    if (eventRows.length) await bulkPut('events', eventRows);
    const productRows = products.map(raw => normalizeProduct(raw, raw)).filter(x => x.name);
    const invoiceRows = invoices.map(raw => { const x = normalizeInvoice(raw, raw); x.ledger_entry_id = raw.ledger_entry_id || null; x.created_at = raw.created_at || x.created_at; return x; }).filter(x => x.number && x.items.length);
    const settingsRows = appSettings.filter(x => x && x.id === 'invoice_settings').map(x => mergeInvoiceSettings(x));
    if (productRows.length) await bulkPut('products', productRows);
    if (invoiceRows.length) await bulkPut('invoices', invoiceRows);
    if (settingsRows.length) await bulkPut('app_settings', settingsRows);

    migrationPromise = null;
    await ensureMigrations(); // Converts old v2/v3 company strings into organization records.
    await recordEvent('backup.imported.local', { contacts: cCount, organizations: orgCount, replace, source_version: payload.version || 'legacy' });
    return { contacts: cCount, organizations: orgCount, projects: projectRows.length, project_participants: participantRows.length, interactions: interactionRows.length, attachments: attachmentRows.length, organization_links: linkRows.length, tasks: taskRows.length, meetings: meetingRows.length, reminders: reminderRows.length, finance_entries: financeRows.length, document_checks: docRows.length, social_posts: postRows.length, products: productRows.length, invoices: invoiceRows.length };
  }

  async function importCachedContacts(rows = []) {
    await ensureMigrations();
    let count = 0;
    const existing = await getAll('contacts');
    const allNumbers = new Set(existing.flatMap(c => [c.phone, ...(c.secondary_phones || [])].map(normalizePhone).filter(Boolean)));
    for (const raw of rows) {
      const id = String(raw.id || '');
      if (id.startsWith('org:')) continue;
      const phone = normalizePhone(raw.phone || '');
      if (!phone || allNumbers.has(phone)) continue;
      const parts = String(raw.name || '').trim().split(/\s+/);
      let org = null;
      if (raw.company) org = await findOrCreateOrganizationByName(raw.company, { source: raw.source || 'caller-id-cache' });
      const c = normalizeContact({ id: id || uuid(), first_name: parts.shift() || '', last_name: parts.join(' '), name: raw.name || '', organization_id: org?.id || null, company: org?.name || raw.company || '', job_title: raw.job_title || '', phone, status: raw.status || 'new', ai_score: raw.ai_score || 0, next_action: raw.next_action || '', source: raw.source || 'caller-id-cache' });
      await put('contacts', c); allNumbers.add(phone); count++;
    }
    if (count) await recordEvent('caller_id_cache.imported.local', { count });
    return count;
  }

  // Archive phonebook-imported contacts that never became real CRM records (no history/project/task/finance).
  async function cleanupPhonebookContacts() {
    await ensureMigrations();
    const [contacts, interactions, tasks, projects, participants, finance, meetings] = await Promise.all([
      getAll('contacts'), getAll('interactions'), getAll('tasks'), getAll('projects'),
      getAll('project_participants'), getAll('finance_entries'), getAll('meetings')
    ]);
    const used = new Set([
      ...interactions.map(x => x.contact_id), ...tasks.map(x => x.contact_id),
      ...projects.map(x => x.customer_contact_id), ...participants.map(x => x.contact_id),
      ...finance.filter(x => x.party_type === 'contact').map(x => x.party_id), ...meetings.map(x => x.contact_id)
    ].filter(Boolean));
    let archived = 0, kept = 0;
    for (const c of contacts) {
      if (c.archived || !CALLER_ID_UNVERIFIED_SOURCES.has(String(c.source || ''))) continue;
      if (c.caller_id === true || used.has(c.id)) { kept++; continue; }
      await put('contacts', { ...c, archived: true, caller_id: false, updated_at: nowIso() });
      archived++;
    }
    await recordEvent('phonebook_contacts.cleaned.local', { archived, kept });
    return { archived, kept };
  }

  function csvQuote(v) { return '"' + String(v ?? '').replace(/"/g, '""') + '"'; }

  async function exportContactsCSV() {
    await ensureMigrations();
    const [rows, orgs] = await Promise.all([getAll('contacts'), getAll('organizations')]);
    const orgMap = new Map(orgs.map(o => [o.id, o]));
    const cols = ['first_name','last_name','company','organization_id','job_title','department','phone','secondary_phones','email','secondary_emails','whatsapp','address','source','status','deal_value','ai_score','next_action','is_primary_contact','relationship_types','tags'];
    const lines = rows.sort((a,b) => String(a.created_at || '').localeCompare(String(b.created_at || ''))).map(c => {
      const flat = { ...c, company: orgMap.get(c.organization_id)?.name || c.company || '', secondary_phones: (c.secondary_phones || []).join('|'), secondary_emails: (c.secondary_emails || []).join('|'), relationship_types: (c.relationship_types || []).join('|'), tags: (c.tags || []).join('|') };
      return cols.map(k => csvQuote(flat[k])).join(',');
    });
    return '\uFEFF' + [cols.join(','), ...lines].join('\r\n');
  }

  async function exportOrganizationsCSV() {
    await ensureMigrations();
    const rows = await getAll('organizations');
    const cols = ['name','legal_name','industry','relationship_types','website','main_phone','phones','email','emails','address','national_id','economic_code','source','status','deal_value','notes','tags'];
    const lines = rows.sort((a,b) => String(a.created_at || '').localeCompare(String(b.created_at || ''))).map(o => {
      const flat = { ...o, phones: (o.phones || []).join('|'), emails: (o.emails || []).join('|'), relationship_types: (o.relationship_types || []).join('|'), tags: (o.tags || []).join('|') };
      return cols.map(k => csvQuote(flat[k])).join(',');
    });
    return '\uFEFF' + [cols.join(','), ...lines].join('\r\n');
  }

  async function resetAll() {
    await openDb();
    for (const s of STORES) await clearStore(s);
    migrationPromise = null;
  }

  window.OfflineDB = {
    api, exportBackup, importBackup, importCachedContacts, cleanupPhonebookContacts, exportContactsCSV, exportOrganizationsCSV, bulkPut,
    resetAll, normalizePhone, toLatinDigits, getAll, getOne, removeOne, ensureMigrations,
    searchNorm, matchesQuery,
    computeInvoiceTotals, numberToPersianWords, formatInvoiceNumber, jalaliYmd,
  };
})();
