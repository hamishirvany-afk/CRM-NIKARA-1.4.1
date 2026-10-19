import fs from 'fs';
import vm from 'vm';

class Req { constructor(){ this.result=null; this.error=null; this.onsuccess=null; this.onerror=null; this.onupgradeneeded=null; } }
class Tx {
  constructor(db,name,mode){ this.db=db; this.name=name; this.mode=mode; this.oncomplete=null; this.onerror=null; this.error=null; this._pending=0; this._completed=false; }
  objectStore(name){
    const tx=this; const map=this.db._stores.get(name); if(!map) throw new Error('missing store '+name);
    return {
      getAll(){ const r=new Req(); setTimeout(()=>{r.result=[...map.values()].map(x=>structuredClone(x)); r.onsuccess?.();},0); return r; },
      get(id){ const r=new Req(); setTimeout(()=>{r.result=map.has(id)?structuredClone(map.get(id)):undefined; r.onsuccess?.();},0); return r; },
      put(v){ tx._pending++; setTimeout(()=>{map.set(v.id,structuredClone(v)); tx._pending--; tx._maybeComplete();},0); return new Req(); },
      clear(){ tx._pending++; setTimeout(()=>{map.clear(); tx._pending--; tx._maybeComplete();},0); return new Req(); },
      delete(id){ tx._pending++; setTimeout(()=>{map.delete(id); tx._pending--; tx._maybeComplete();},0); return new Req(); },
    };
  }
  _maybeComplete(){ if(this._pending===0&&!this._completed){ this._completed=true; setTimeout(()=>this.oncomplete?.(),0); } }
}
class DB {
  constructor(){ this._stores=new Map(); this.objectStoreNames={contains:(n)=>this._stores.has(n)}; }
  createObjectStore(n){ if(!this._stores.has(n))this._stores.set(n,new Map()); }
  transaction(name,mode){ return new Tx(this,name,mode); }
}
const dbs=new Map();
globalThis.indexedDB={open(name,version){ const r=new Req(); setTimeout(()=>{ let db=dbs.get(name); let created=false; if(!db){db=new DB();dbs.set(name,db);created=true;} r.result=db; if(created||version>1)r.onupgradeneeded?.(); setTimeout(()=>r.onsuccess?.(),0);},0); return r; }};
globalThis.window=globalThis;
const projectRoot = new URL('../', import.meta.url);
const code=fs.readFileSync(new URL('frontend/offline-store.js', projectRoot),'utf8');
vm.runInThisContext(code,{filename:'offline-store.js'});
const DBAPI=globalThis.OfflineDB;
const api=DBAPI.api;
function assert(cond,msg){ if(!cond) throw new Error('ASSERT: '+msg); }
await DBAPI.resetAll();
assert(DBAPI.normalizePhone('09121234567')==='+989121234567','IR phone normalization');
const org=await api('/api/organizations',{method:'POST',body:{name:'شرکت آرتا',main_phone:'02188776655',industry:'فناوری',deal_value:1000000,relationship_types:['customer']}});
assert(org.name==='شرکت آرتا','org created');
const p1=await api('/api/contacts',{method:'POST',body:{organization_id:org.id,first_name:'علی',last_name:'رضایی',job_title:'مدیر خرید',phone:'09121234567',secondary_phones:'09121111111',is_primary_contact:true}});
const p2=await api('/api/contacts',{method:'POST',body:{organization_id:org.id,first_name:'مریم',last_name:'احمدی',job_title:'حسابدار',phone:'09351234567'}});
const detail=await api('/api/organizations/'+org.id);
assert(detail.contacts.length===2,'two people in company');
assert(detail.contacts.some(x=>x.job_title==='مدیر خرید'),'job title');
assert(detail.contacts.find(x=>x.id===p1.id).secondary_phones.includes('+989121111111'),'secondary phone');
assert(detail.contacts.filter(x=>x.is_primary_contact).length===1,'one primary contact');
await api('/api/contacts/'+p2.id,{method:'PATCH',body:{is_primary_contact:true}});
const primarySwitched=await api('/api/organizations/'+org.id);
assert(primarySwitched.contacts.filter(x=>x.is_primary_contact).length===1 && primarySwitched.contacts.find(x=>x.is_primary_contact).id===p2.id,'primary contact switch');
let dupOrg=false; try{await api('/api/organizations',{method:'POST',body:{name:'شرکت آرتا'}})}catch(e){dupOrg=true}
assert(dupOrg,'duplicate organization name blocked');
let dup=false; try{await api('/api/contacts',{method:'POST',body:{first_name:'تکراری',phone:'+989121111111'}})}catch(e){dup=true}
assert(dup,'secondary phone duplicate blocked');
await api('/api/organizations/'+org.id+'/interactions',{method:'POST',body:{body:'جلسه با شرکت'}});
const after=await api('/api/organizations/'+org.id);
assert(after.interactions.length===1,'company timeline');
await api('/api/tasks',{method:'POST',body:{organization_id:org.id,title:'ارسال پیش‌فاکتور'}});
const afterTask=await api('/api/organizations/'+org.id);
assert(afterTask.tasks.length===1,'company task');
const dash=await api('/api/dashboard');
assert(dash.organizations===1 && dash.contacts===2 && dash.accounts===1,'dashboard avoids double count');

// Offline invoice / document attachment.
const invoiceForm=new FormData();
invoiceForm.append('file',new Blob(['PDF-DATA'],{type:'application/pdf'}),'invoice-1001.pdf');
invoiceForm.append('category','invoice');
invoiceForm.append('title','فاکتور ۱۰۰۱');
invoiceForm.append('invoice_no','1001');
invoiceForm.append('invoice_date','2026-08-31');
invoiceForm.append('amount','25000000');
invoiceForm.append('note','فاکتور تست');
const attachment=await api('/api/contacts/'+p1.id+'/attachments',{method:'POST',body:invoiceForm});
assert(attachment.file_name==='invoice-1001.pdf'&&attachment.data_url.startsWith('data:application/pdf;base64,'),'offline invoice stored');
const p1WithDoc=await api('/api/contacts/'+p1.id);
assert(p1WithDoc.attachments.length===1&&p1WithDoc.interactions.some(i=>i.attachment_id===attachment.id),'invoice appears in contact history');
const orgWithDoc=await api('/api/organizations/'+org.id);
assert(orgWithDoc.attachments.length===1,'member invoice visible in company file');

// Business network: provider category + company-to-company relationship.
const logistics=await api('/api/organizations',{method:'POST',body:{name:'حمل سریع',main_phone:'02144445555',industry:'لجستیک',relationship_types:['logistics','service_provider']}});
await api('/api/organizations/'+org.id+'/links',{method:'POST',body:{target_organization_id:logistics.id,relation_type:'logistics',note:'حمل ثابت مشتری'}});
const orgNetwork=await api('/api/organizations/'+org.id);
assert(orgNetwork.related_organizations.length===1&&orgNetwork.related_organizations[0].other_organization.id===logistics.id,'organization network relationship');
const logisticsRows=await api('/api/network?category=logistics');
assert(logisticsRows.some(x=>x.id===logistics.id&&x.entity_type==='organization'),'network category filter');

// Project / opportunity object with business-network participants.
const proj=await api('/api/projects',{method:'POST',body:{title:'واردات محموله تست',type:'import',stage:'in_progress',customer_organization_id:org.id,customer_contact_id:p1.id,value:90000000,probability:80,reference_no:'IMP-100'}});
assert(proj.title==='واردات محموله تست'&&proj.customer_organization_id===org.id,'project created');
const carrier=await api('/api/organizations',{method:'POST',body:{name:'حمل تست',relationship_types:['logistics'],main_phone:'09125550123'}});
const part=await api('/api/projects/'+proj.id+'/participants',{method:'POST',body:{organization_id:carrier.id,role:'logistics',note:'حمل اصلی'}});
const projFull=await api('/api/projects/'+proj.id);
assert(projFull.participants.length===1&&projFull.participants[0].organization.name==='حمل تست','project participant relation');
await api('/api/tasks',{method:'POST',body:{project_id:proj.id,title:'پیگیری بارنامه',channel:'project'}});
const projTask=await api('/api/projects/'+proj.id);
assert(projTask.tasks.some(x=>x.title==='پیگیری بارنامه'),'project task relation');
const orgFullWithProject=await api('/api/organizations/'+org.id);
assert(orgFullWithProject.projects.some(x=>x.id===proj.id),'project visible from customer company');

// Meetings: dedicated activity with reminder and project/customer relation.
const meeting=await api('/api/meetings',{method:'POST',body:{title:'جلسه قرارداد',organization_id:org.id,project_id:proj.id,start_at:'2026-09-02T06:30:00.000Z',end_at:'2026-09-02T07:30:00.000Z',reminder_minutes:60,location:'دفتر مرکزی',notes:'بررسی نهایی'}});
assert(meeting.status==='planned'&&meeting.reminder_minutes===60,'meeting created with reminder');
const projectMeetings=await api('/api/meetings?project_id='+proj.id);
assert(projectMeetings.length===1&&projectMeetings[0].id===meeting.id,'meeting project relation');
let invalidMeeting=false;try{await api('/api/meetings',{method:'POST',body:{title:'جلسه نامعتبر',start_at:'2026-09-02T08:00:00.000Z',end_at:'2026-09-02T07:00:00.000Z'}})}catch(e){invalidMeeting=true}
assert(invalidMeeting,'meeting end before start blocked');

// General reminders: independent of tasks and meetings, with stable native notification IDs.
const reminder=await api('/api/reminders',{method:'POST',body:{title:'تمدید قرارداد مستقل',body:'یادآوری عمومی',remind_at:'2027-01-10T05:30:00.000Z',organization_id:org.id}});
assert(reminder.status==='active'&&Number.isInteger(reminder.notification_id)&&reminder.notification_id>=300000000,'general reminder created with stable notification id');
const updatedReminder=await api('/api/reminders/'+reminder.id,{method:'PATCH',body:{body:'نسخه ویرایش‌شده',remind_at:'2027-01-11T05:30:00.000Z'}});
assert(updatedReminder.notification_id===reminder.notification_id&&updatedReminder.body==='نسخه ویرایش‌شده','reminder update keeps notification identity');
const completedReminder=await api('/api/reminders',{method:'POST',body:{title:'یادآوری تکمیل‌شونده',remind_at:'2027-01-12T05:30:00.000Z'}});
await api('/api/reminders/'+completedReminder.id+'/done',{method:'PATCH'});
assert((await api('/api/reminders')).length===1,'completed reminders excluded from active list');
assert((await api('/api/reminders?include_completed=true')).length===2,'completed reminders remain stored');
const deletedReminder=await api('/api/reminders',{method:'POST',body:{title:'یادآوری حذف‌شونده',remind_at:'2027-01-13T05:30:00.000Z'}});
const deleteResult=await api('/api/reminders/'+deletedReminder.id,{method:'DELETE'});
assert(deleteResult.notification_id===deletedReminder.notification_id&&(await api('/api/reminders?include_completed=true')).length===2,'reminder delete returns native notification id');

// Operational customer ledger: invoice allocation, partial receipt, payable and outstanding.
const salesInvoice=await api('/api/finance',{method:'POST',body:{party_type:'organization',party_id:org.id,project_id:proj.id,kind:'sales_invoice',amount_rial:10000000,posting_date:'2026-08-31',due_date:'2026-09-10',reference_no:'S-100'}});
const receipt=await api('/api/finance',{method:'POST',body:{party_type:'organization',party_id:org.id,project_id:proj.id,kind:'receipt',amount_rial:4000000,posting_date:'2026-09-01',reference_no:'R-100',reference_entry_id:salesInvoice.id}});
const purchaseInvoice=await api('/api/finance',{method:'POST',body:{party_type:'organization',party_id:carrier.id,project_id:proj.id,kind:'purchase_invoice',amount_rial:3000000,posting_date:'2026-08-31',due_date:'2026-09-12',reference_no:'P-200'}});
await api('/api/finance',{method:'POST',body:{party_type:'organization',party_id:carrier.id,project_id:proj.id,kind:'payment',amount_rial:1000000,posting_date:'2026-09-02',reference_no:'PAY-200',reference_entry_id:purchaseInvoice.id}});
const customerLedger=await api('/api/finance?party_type=organization&party_id='+org.id);
assert(customerLedger.find(x=>x.id===salesInvoice.id).outstanding_rial===6000000,'partial receipt updates invoice outstanding');
const customerFinanceSummary=await api('/api/finance/summary?party_type=organization&party_id='+org.id);
assert(customerFinanceSummary.receivable_rial===6000000&&customerFinanceSummary.payable_rial===0,'customer receivable summary');
const projectFinanceSummary=await api('/api/finance/summary?project_id='+proj.id);
assert(projectFinanceSummary.receivable_rial===6000000&&projectFinanceSummary.payable_rial===2000000,'project receivable/payable summary');
let overAllocate=false;try{await api('/api/finance',{method:'POST',body:{party_type:'organization',party_id:org.id,kind:'receipt',amount_rial:7000000,posting_date:'2026-09-03',reference_entry_id:salesInvoice.id}})}catch(e){overAllocate=true}
assert(overAllocate,'over-allocation to invoice blocked');
// Unallocated receipt is a credit/debt to customer, not a negative receivable.
await api('/api/finance',{method:'POST',body:{party_type:'organization',party_id:org.id,kind:'receipt',amount_rial:7000000,posting_date:'2026-09-04',reference_no:'ADV-CUST'}});
const creditSummary=await api('/api/finance/summary?party_type=organization&party_id='+org.id);
assert(creditSummary.receivable_rial===6000000&&creditSummary.payable_rial===7000000&&creditSummary.net_rial===-1000000,'unallocated customer advance classified as payable');
// Settlement without a project inherits the referenced invoice project.
const inherited=await api('/api/finance',{method:'POST',body:{party_type:'organization',party_id:org.id,kind:'receipt',amount_rial:1000000,posting_date:'2026-09-05',reference_entry_id:salesInvoice.id}});
assert(inherited.project_id===proj.id,'settlement inherits invoice project');
const otherProj=await api('/api/projects',{method:'POST',body:{title:'پروژه دیگر',type:'service',stage:'new',customer_organization_id:org.id}});
let crossProject=false;try{await api('/api/finance',{method:'POST',body:{party_type:'organization',party_id:org.id,project_id:otherProj.id,kind:'receipt',amount_rial:100000,posting_date:'2026-09-05',reference_entry_id:salesInvoice.id}})}catch(e){crossProject=true}
assert(crossProject,'cross-project settlement blocked');

// Documents received/required checklist with optional local attachment and expiry.
const docForm=new FormData();
docForm.append('scope_type','organization');docForm.append('scope_id',org.id);docForm.append('title','کارت بازرگانی');docForm.append('category','commercial_card');docForm.append('status','verified');docForm.append('document_no','CC-7788');docForm.append('received_date','2026-08-20');docForm.append('expiry_date','2027-08-20');docForm.append('issuer','اتاق بازرگانی');docForm.append('file',new Blob(['CARD-PDF'],{type:'application/pdf'}),'commercial-card.pdf');
const docCheck=await api('/api/document-checks',{method:'POST',body:docForm});
assert(docCheck.status==='verified'&&docCheck.attachment_id,'document checklist stores attachment');
const orgDocs=await api('/api/document-checks?scope_type=organization&scope_id='+org.id);
assert(orgDocs.length===1&&orgDocs[0].effective_status==='verified','document checklist visible on organization');
const oldDocAttachment=docCheck.attachment_id;
const docEdit=new FormData();docEdit.append('scope_type','organization');docEdit.append('scope_id',org.id);docEdit.append('title','کارت بازرگانی جدید');docEdit.append('category','commercial_card');docEdit.append('status','received');docEdit.append('document_no','CC-8899');docEdit.append('file',new Blob(['NEW-CARD'],{type:'application/pdf'}),'commercial-card-new.pdf');
const updatedDoc=await api('/api/document-checks/'+docCheck.id,{method:'PATCH',body:docEdit});
assert(updatedDoc.document_no==='CC-8899'&&updatedDoc.attachment_id!==oldDocAttachment,'document checklist edit replaces attachment');
assert((await DBAPI.getOne('attachments',oldDocAttachment))===null,'old document attachment cleaned up');

const backup=await DBAPI.exportBackup();
assert(backup.version==='1.1.2'&&backup.organizations.length===3&&backup.contacts.length===2&&backup.projects.length===2&&backup.project_participants.length===1&&backup.attachments.length===2&&backup.organization_links.length===1&&backup.meetings.length===1&&backup.reminders.length===2&&backup.finance_entries.length===6&&backup.document_checks.length===1,'backup structure');
const csv=await DBAPI.exportContactsCSV();
assert(csv.includes('company')&&csv.includes('شرکت آرتا')&&csv.includes('مدیر خرید'),'people CSV');
await DBAPI.resetAll();
await DBAPI.importBackup(backup,true);
const restored=await api('/api/organizations?limit=1000');
assert(restored.length===3&&restored.find(x=>x.id===org.id)?.contacts_count===2,'restore relationships');
const restoredOrgNetwork=await api('/api/organizations/'+org.id);
assert(restoredOrgNetwork.related_organizations.length===1,'restore business network links');
const restoredP1=await api('/api/contacts/'+p1.id);
assert(restoredP1.attachments.length===1&&restoredP1.attachments[0].invoice_no==='1001','restore invoice attachment');
const restoredMeetings=await api('/api/meetings?project_id='+proj.id);
assert(restoredMeetings.length===1&&restoredMeetings[0].title==='جلسه قرارداد','restore meetings');
const restoredReminders=await api('/api/reminders?include_completed=true');
assert(restoredReminders.length===2&&restoredReminders.find(x=>x.id===reminder.id)?.notification_id===reminder.notification_id,'restore general reminders and notification identity');
const restoredFinance=await api('/api/finance/summary?party_type=organization&party_id='+org.id);
assert(restoredFinance.receivable_rial===5000000&&restoredFinance.payable_rial===7000000,'restore finance ledger and customer credit');
const restoredDocs=await api('/api/document-checks?scope_type=organization&scope_id='+org.id);
assert(restoredDocs.length===1&&restoredDocs[0].document_no==='CC-8899'&&restoredDocs[0].status==='received','restore document checklist');

// Market UI-backed features: CSV organizations, imports, drafts and event log.
const orgCsv=await DBAPI.exportOrganizationsCSV();
assert(orgCsv.includes('name')&&orgCsv.includes('شرکت آرتا'),'organizations CSV');
const post=await api('/api/social-posts',{method:'POST',body:{title:'پیش‌نویس تست',body:'متن تست',platforms:['linkedin'],status:'offline-draft'}});
const posts=await api('/api/social-posts');
assert(posts.some(x=>x.id===post.id),'social draft API');
const eventRows=await api('/api/events?limit=20');
assert(eventRows.length>0,'events API');
const contactCsvForm=new FormData();
contactCsvForm.append('file',new Blob(['first_name,last_name,phone,company\nسارا,اکبری,09120001122,شرکت بازار'],{type:'text/csv'}),'people.csv');
const importPeople=await api('/api/import/contacts.csv',{method:'POST',body:contactCsvForm});
assert(importPeople.created===1&&importPeople.organizations_created===1,'contacts CSV import API');
const orgCsvForm=new FormData();
orgCsvForm.append('file',new Blob(['name,main_phone,industry\nشرکت نوین,02122223333,خدمات'],{type:'text/csv'}),'orgs.csv');
const importOrgs=await api('/api/import/organizations.csv',{method:'POST',body:orgCsvForm});
assert(importOrgs.created===1,'organizations CSV import API');

// Legacy v3 migration: direct seed into old contacts store, no organizations.
await DBAPI.resetAll();
const rawdb=dbs.get('ai-crm-offline-v3');
rawdb._stores.get('contacts').set('legacy1',{id:'legacy1',first_name:'حسن',last_name:'کریمی',company:'شرکت قدیمی',phone:'+989191234567',status:'new',archived:false,created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
await DBAPI.ensureMigrations();
const migratedOrgs=await api('/api/organizations');
const migratedPeople=await api('/api/contacts');
assert(migratedOrgs.length===1&&migratedPeople[0].organization_id===migratedOrgs[0].id,'legacy company migration');
console.log('CRM_NIKARA_INTEGRATION_PASS');
console.log(JSON.stringify({organizations:migratedOrgs.length,people:migratedPeople.length,phone:DBAPI.normalizePhone('09121234567')},null,2));
