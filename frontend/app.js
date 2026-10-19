const NATIVE = !!(window.NativeBridge?.isNative || (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()));
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let cfg = { stages: [] };
const loaderRegistry = {};
let currentContact = null;
let currentOrganization = null;
let currentProject = null;
let installPrompt = null;
let contactTimer = null;
let organizationTimer = null;
let personRowSeq = 0;
let modalReturnFocus = null;
let datePickerReturnFocus = null;
let datePickerState = { fieldId:'', jy:0, jm:0, selected:null, focusDay:1 };
const REMINDER_CHANNEL_ID = 'crm-nikara-reminders';
const REMINDER_SETUP_KEY = 'nikara-reminder-system-initialized-v1';

const stageFa = { new:'جدید', contacted:'تماس گرفته شد', qualified:'واجد شرایط', proposal:'پیشنهاد', negotiation:'مذاکره', follow_up:'پیگیری', won:'فروش موفق', lost:'از دست رفته' };
const typeFa = { call:'تماس', note:'یادداشت', voice_note:'یادداشت صوتی', email:'ایمیل', whatsapp:'واتساپ', meeting:'جلسه', document:'سند / فاکتور', project_note:'یادداشت پروژه' };
const projectStageFa={new:'جدید',qualified:'بررسی‌شده',quotation:'قیمت / پیشنهاد',approved:'تأییدشده',in_progress:'در حال اجرا',waiting:'منتظر',completed:'تکمیل‌شده',won:'موفق',lost:'ناموفق',cancelled:'لغوشده'};
const projectTypeFa={opportunity:'فرصت فروش',order:'سفارش',import:'واردات',export:'صادرات',procurement:'تأمین / خرید',logistics:'حمل‌ونقل',medical:'پزشکی / دارویی',service:'خدمات',other:'سایر'};

const networkTypeFa = {
  customer:'مشتری',
  prospect:'مشتری بالقوه',
  supplier:'تأمین‌کننده',
  logistics:'حمل‌ونقل / لجستیک',
  customs:'ترخیص‌کار / گمرکی',
  doctor:'پزشک / کلینیک',
  pharmacy:'داروخانه / پخش دارو',
  laboratory:'آزمایشگاه',
  insurance:'بیمه',
  finance:'بانک / مالی',
  manufacturer:'تولیدکننده',
  partner:'همکار / معرف',
  service_provider:'سرویس‌دهنده',
  government:'دولتی / مجوز',
  other:'سایر'
};
const networkTypeIcon = {
  customer:'★',prospect:'◌',supplier:'▦',logistics:'🚚',customs:'⚓',doctor:'⚕',pharmacy:'✚',
  laboratory:'⌬',insurance:'◈',finance:'₿',manufacturer:'⚙',partner:'🤝',service_provider:'🛠',government:'⌂',other:'•'
};
let networkTimer=null;
let projectTimer=null;

const PRODUCT = Object.freeze({
  name: 'CRM-NIKARA',
  version: '1.4.0',
  developer: 'H.Shirvani',
  storage: 'offline'
});

function networkLabel(v){ return networkTypeFa[v] || String(v||'سایر'); }
function networkIcon(v){ return networkTypeIcon[v] || '•'; }
function networkChips(types=[]){
  return (types||[]).map(t=>`<span class="network-chip">${networkIcon(t)} ${esc(networkLabel(t))}</span>`).join('');
}
function networkTypeChecklist(prefix, selected=[]){
  const set=new Set(selected||[]);
  const keys=(cfg.network_types&&cfg.network_types.length?cfg.network_types:Object.keys(networkTypeFa));
  return `<div class="network-picker">${keys.map(k=>`<label class="network-choice"><input type="checkbox" data-network-prefix="${prefix}" value="${esc(k)}" ${set.has(k)?'checked':''}><span>${networkIcon(k)} ${esc(networkLabel(k))}</span></label>`).join('')}</div>`;
}
function readNetworkTypes(prefix){
  return $$(`input[data-network-prefix="${prefix}"]:checked`).map(x=>x.value);
}


function applyTheme(mode=localStorage.getItem('nikara-theme')||'system'){
  const effective=mode==='system'
    ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light')
    : mode;
  document.documentElement.dataset.theme=effective;
  document.documentElement.dataset.themeMode=mode;
  localStorage.setItem('nikara-theme',mode);
  $$('[data-theme-choice]').forEach(b=>b.classList.toggle('active',b.dataset.themeChoice===mode));
}
function setTheme(mode){applyTheme(mode);toast(`ظاهر ${mode==='dark'?'تیره':mode==='light'?'روشن':'هماهنگ با سیستم'} فعال شد`)}
window.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change',()=>{if((localStorage.getItem('nikara-theme')||'system')==='system')applyTheme('system')});

function applyDisplayPreferences(){
  const size=localStorage.getItem('nikara-text-size')==='large'?'large':'normal';
  const contrast=localStorage.getItem('nikara-high-contrast')==='1';
  document.documentElement.dataset.textSize=size;
  document.documentElement.dataset.contrast=contrast?'high':'normal';
  $$('[data-text-size-choice]').forEach(b=>b.classList.toggle('active',b.dataset.textSizeChoice===size));
  if($('#highContrastSetting'))$('#highContrastSetting').checked=contrast;
}
function setTextSize(size){
  localStorage.setItem('nikara-text-size',size==='large'?'large':'normal');
  applyDisplayPreferences();
  toast(size==='large'?'نوشته‌های درشت فعال شد':'اندازه معمولی نوشته فعال شد');
}
function setHighContrast(enabled){
  localStorage.setItem('nikara-high-contrast',enabled?'1':'0');
  applyDisplayPreferences();
  toast(enabled?'کنتراست بیشتر فعال شد':'کنتراست معمولی فعال شد');
}

function showOnboarding(force=false){
  if(!force && localStorage.getItem('nikara-onboarded')==='1')return;
  $('#modalTitle').textContent='خوش آمدی به CRM-NIKARA';
  $('#modalBody').innerHTML=`
    <div class="onboarding">
      <div class="onboarding-brand"><span class="brand-mark">N</span><div><b>CRM-NIKARA</b><small>نسخه 1.4.0 · H.Shirvani</small></div></div>
      <h2>CRM کاری، بدون وابستگی به سرور</h2>
      <p class="muted">اطلاعات اصلی داخل همین دستگاه نگهداری می‌شود. برای شروع حرفه‌ای این سه مرحله را انجام بده.</p>
      <div class="onboarding-steps">
        <div><span>1</span><div><b>Backup را جدی بگیر</b><small>بعد از ورود اطلاعات، یک Backup JSON کامل در Files گوشی نگه دار.</small></div></div>
        <div><span>2</span><div><b>Caller ID را فعال کن</b><small>در Settings برنامه، نقش Caller ID، Contacts و Notifications را بررسی کن.</small></div></div>
        <div><span>3</span><div><b>ساختار را درست شروع کن</b><small>شرکت → افراد → پروژه/فرصت → شبکه کاری → اسناد و پیگیری‌ها.</small></div></div>
      </div>
      <div class="privacy-note"><b>حریم خصوصی:</b> CRM-NIKARA حساب آنلاین، تبلیغات و Analytics داخلی ندارد.</div>
      <div class="actions onboarding-actions"><button class="btn primary" onclick="finishOnboarding()">شروع کار</button><button class="btn" onclick="closeModal();switchTab('settings')">بررسی دسترسی‌ها</button></div>
    </div>`;
  openModal();
}
function finishOnboarding(){localStorage.setItem('nikara-onboarded','1');closeModal();toast('CRM-NIKARA آماده است','success')}

function blobToDataUrl(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error||new Error('خواندن فایل انجام نشد'));r.readAsDataURL(blob);});}
// Android WebView ignores <a download> and blob: URLs, so exports go through the native share/save sheet.
async function saveBlobDownload(blob,filename){
  const Viewer=nativePlugin('AttachmentViewer');
  if(NATIVE&&Viewer){
    const dataUrl=await blobToDataUrl(blob);
    const args={dataUrl,fileName:filename,mimeType:blob.type?.split(';')[0]||'application/octet-stream',title:'ذخیره / ارسال فایل'};
    try{ await Viewer.share(args); return 'shared'; }
    catch(shareErr){ console.warn('share unavailable, falling back to open',shareErr); await Viewer.open(args); return 'opened'; }
  }
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
  return 'downloaded';
}
async function downloadFile(kind){
  try{
    if(kind==='backup'){
      const data=await OfflineDB.exportBackup();
      const date=new Date().toISOString().slice(0,10);
      await saveBlobDownload(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),`CRM-NIKARA-backup-${date}.json`);
      localStorage.setItem('nikara-last-backup',new Date().toISOString());
      toast(NATIVE?'فایل پشتیبان آماده شد؛ در پنجره باز شده «ذخیره در Files/Drive» یا ارسال را انتخاب کن':'فایل پشتیبان کامل ذخیره شد','success');
      return;
    }
    const csv=kind==='organizations'?await OfflineDB.exportOrganizationsCSV():await OfflineDB.exportContactsCSV();
    await saveBlobDownload(new Blob([csv],{type:'text/csv;charset=utf-8'}),`CRM-NIKARA-${kind}.csv`);
    toast('فایل اکسل (CSV) آماده شد','success');
  }catch(e){toast(e?.message||'خروجی گرفتن انجام نشد','error')}
}
function openImport(){
  $('#modalTitle').textContent='ورود CSV افراد';
  $('#modalBody').innerHTML=`<div class="panel import-panel"><p class="muted">CSV افراد را انتخاب کن. شماره‌ها نرمال می‌شوند و رکوردهای تکراری رد می‌شوند.</p><input id="importFile" type="file" accept=".csv,text/csv"><button class="btn primary wide" onclick="runContactImport()">ورود افراد</button></div>`;
  openModal();
}
async function runContactImport(){
  const f=$('#importFile')?.files?.[0];if(!f)return toast('فایل CSV را انتخاب کن','error');
  const fd=new FormData();fd.append('file',f,f.name);
  try{const r=await api('/api/import/contacts.csv',{method:'POST',body:fd});closeModal();await syncCallerIdContacts();await loadContacts();await loadDashboard();toast(`${r.created||0} فرد وارد شد${r.skipped?`؛ ${r.skipped} رد شد`:''}`,'success')}catch(e){toast(e?.message||'ورود CSV انجام نشد','error')}
}
function openOrganizationImport(){
  $('#modalTitle').textContent='ورود CSV شرکت‌ها';
  $('#modalBody').innerHTML=`<div class="panel import-panel"><p class="muted">CSV شرکت‌ها را انتخاب کن. نام شرکت و تلفن اصلی برای تشخیص رکورد استفاده می‌شود.</p><input id="orgImportFile" type="file" accept=".csv,text/csv"><button class="btn primary wide" onclick="runOrganizationImport()">ورود شرکت‌ها</button></div>`;
  openModal();
}
async function runOrganizationImport(){
  const f=$('#orgImportFile')?.files?.[0];if(!f)return toast('فایل CSV را انتخاب کن','error');
  const fd=new FormData();fd.append('file',f,f.name);
  try{const r=await api('/api/import/organizations.csv',{method:'POST',body:fd});closeModal();await syncCallerIdContacts();await loadOrganizations();await loadDashboard();toast(`${r.created||0} شرکت وارد شد${r.skipped?`؛ ${r.skipped} رد شد`:''}`,'success')}catch(e){toast(e?.message||'ورود CSV انجام نشد','error')}
}
async function createPost(){
  const body=$('#postBody')?.value?.trim();if(!body)return toast('متن پیش‌نویس را بنویس','error');
  const platforms=$$('.platform:checked').map(x=>x.value);
  try{
    const v=readJalaliDateTime('postSchedule','postScheduleTime');
    await api('/api/social-posts',{method:'POST',body:{title:$('#postTitle')?.value||'',body,platforms,status:'offline-draft',scheduled_at:v}});
    $('#postTitle').value='';$('#postBody').value='';if($('#postSchedule'))$('#postSchedule').value='';
    toast('پیش‌نویس ذخیره شد','success');await loadPosts();
  }catch(e){toast(e?.message||'ذخیره پیش‌نویس انجام نشد','error')}
}
async function loadPosts(){
  try{
    const rows=await api('/api/social-posts');
    const host=$('#postList');if(!host)return;
    host.innerHTML=rows.map(p=>`<div class="post-row"><div><b>${esc(p.title||'بدون عنوان')}</b><div class="muted">${esc((p.platforms||[]).join(' · '))}${p.scheduled_at?' · '+dateFmt(p.scheduled_at):''}</div><div class="post-preview">${esc(String(p.body||'').slice(0,220))}</div></div></div>`).join('')||emptyState('✦','پیش‌نویسی ذخیره نشده است.');
  }catch(e){ console.warn('posts load failed',e); const host=$('#postList');if(host)host.innerHTML=errorState('posts'); }
}
loaderRegistry.posts=loadPosts;
async function loadEvents(){
  try{
    const rows=await api('/api/events?limit=100');
    const host=$('#eventList');if(!host)return;
    host.innerHTML=rows.map(e=>`<div class="event-row"><div><b>${esc(activityLabelFor(e))}</b><div class="muted">${dateFmt(e.created_at)}</div></div><span class="badge">${e.delivered?'محلی':'ثبت‌شده'}</span></div>`).join('')||emptyState('☰','رویدادی ثبت نشده است.');
  }catch(e){ console.warn('events load failed',e); const host=$('#eventList');if(host)host.innerHTML=errorState('events'); }
}
loaderRegistry.events=loadEvents;

function nativePlugin(name){ return window.NativeBridge?.[name] || window.Capacitor?.Plugins?.[name] || null; }
async function api(path, opts={}){ return window.OfflineDB.api(path, opts); }
function esc(v=''){ return String(v ?? '').replace(/[&<>'"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m])); }
function nfmt(v){ return new Intl.NumberFormat('fa-IR').format(Number(v || 0)); }
const TEHRAN_TZ='Asia/Tehran';
const faDateTimeFmt=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{timeZone:TEHRAN_TZ,year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'});
const faDateFmt=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{timeZone:TEHRAN_TZ,year:'numeric',month:'long',day:'numeric'});
const enPersianPartsFmt=new Intl.DateTimeFormat('en-US-u-ca-persian',{timeZone:TEHRAN_TZ,year:'numeric',month:'numeric',day:'numeric'});
const FA_DIGITS='۰۱۲۳۴۵۶۷۸۹';
function latinDigits(v=''){return String(v).replace(/[۰-۹]/g,d=>String(FA_DIGITS.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));}
function faDigits(v=''){return String(v).replace(/\d/g,d=>FA_DIGITS[Number(d)]);}
function dateFmt(v){ if(!v) return '-'; const d = new Date(v); return isNaN(d) ? '-' : faDateTimeFmt.format(d); }
function dateOnlyFmt(v){ if(!v)return '-'; const d=/^\d{4}-\d{2}-\d{2}$/.test(String(v))?new Date(String(v)+'T12:00:00'):new Date(v); return isNaN(d)?'-':faDateFmt.format(d); }
function jalaliParts(v){
  const d=v instanceof Date?v:(/^\d{4}-\d{2}-\d{2}$/.test(String(v))?new Date(String(v)+'T12:00:00'):new Date(v));
  if(Number.isNaN(d.getTime()))return null;
  const parts={};
  for(const p of enPersianPartsFmt.formatToParts(d))if(['year','month','day'].includes(p.type))parts[p.type]=Number(p.value);
  return {jy:parts.year,jm:parts.month,jd:parts.day};
}
function compareYmd(a,b){return a[0]!==b[0]?a[0]-b[0]:a[1]!==b[1]?a[1]-b[1]:a[2]-b[2];}
function jalaliToGregorian(jy,jm,jd){
  jy=Number(jy);jm=Number(jm);jd=Number(jd);
  if(!Number.isInteger(jy)||jy<1200||jy>1700||jm<1||jm>12||jd<1||jd>31)throw new Error('تاریخ شمسی معتبر نیست');
  let lo=Math.floor(Date.UTC(jy+620,0,1,12)/86400000), hi=Math.floor(Date.UTC(jy+623,0,1,12)/86400000);
  const target=[jy,jm,jd];
  while(lo<=hi){
    const mid=Math.floor((lo+hi)/2), d=new Date(mid*86400000+12*3600000), p=jalaliParts(d);
    const cmp=compareYmd([p.jy,p.jm,p.jd],target);
    if(cmp===0)return {gy:d.getUTCFullYear(),gm:d.getUTCMonth()+1,gd:d.getUTCDate()};
    if(cmp<0)lo=mid+1;else hi=mid-1;
  }
  throw new Error('تاریخ شمسی معتبر نیست');
}
function jalaliMonthDays(jy,jm){
  const a=jalaliToGregorian(jy,jm,1);
  const ny=jm===12?jy+1:jy,nm=jm===12?1:jm+1;
  const b=jalaliToGregorian(ny,nm,1);
  const da=Date.UTC(a.gy,a.gm-1,a.gd),db=Date.UTC(b.gy,b.gm-1,b.gd);
  return Math.round((db-da)/86400000);
}
function parseJalaliText(v){
  const clean=latinDigits(v).trim().replace(/[-.]/g,'/');
  const m=clean.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if(!m)throw new Error('تاریخ را مثل ۱۴۰۵/۰۶/۰۹ وارد کن');
  const jy=Number(m[1]),jm=Number(m[2]),jd=Number(m[3]);
  if(jd>jalaliMonthDays(jy,jm))throw new Error('روز واردشده برای این ماه معتبر نیست');
  return {jy,jm,jd};
}
function jalaliInputValue(v){
  if(!v)return '';
  const p=jalaliParts(v); if(!p)return '';
  return faDigits(`${p.jy}/${String(p.jm).padStart(2,'0')}/${String(p.jd).padStart(2,'0')}`);
}
function formatJalaliTyping(v=''){
  const clean=latinDigits(v).replace(/[\u200e\u200f]/g,'').trim().replace(/[-.\s]+/g,'/');
  if(clean.includes('/')){
    const parts=clean.split('/').slice(0,3).map((part,index)=>part.replace(/\D/g,'').slice(0,index===0?4:2));
    return faDigits(parts.filter((part,index)=>part||index===0).join('/').slice(0,10));
  }
  const digits=clean.replace(/\D/g,'').slice(0,8);
  const parts=[digits.slice(0,4),digits.slice(4,6),digits.slice(6,8)].filter(Boolean);
  return faDigits(parts.join('/'));
}
function jalaliCanonicalText(parts){return faDigits(`${parts.jy}/${String(parts.jm).padStart(2,'0')}/${String(parts.jd).padStart(2,'0')}`)}
function setJalaliFieldError(input,message=''){
  if(!input)return;
  input.setAttribute('aria-invalid',message?'true':'false');
  input.closest('.jalali-control')?.classList.toggle('invalid',!!message);
  const error=$('#'+input.id+'Error');if(error)error.textContent=message;
}
function handleJalaliInput(input){
  input.value=formatJalaliTyping(input.value);
  setJalaliFieldError(input,'');
}
function handleJalaliBlur(input){
  const value=input?.value?.trim();if(!value){setJalaliFieldError(input,'');return true;}
  try{const parts=parseJalaliText(value);input.value=jalaliCanonicalText(parts);setJalaliFieldError(input,'');return true;}
  catch(error){setJalaliFieldError(input,error.message);return false;}
}
function jalaliFieldKeydown(event,fieldId){
  if(event.key==='ArrowDown'&&event.altKey){event.preventDefault();openJalaliPicker(fieldId);}
}
function timeInputValue(v){
  if(!v)return '';
  const d=new Date(v);if(Number.isNaN(d.getTime()))return '';
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:TEHRAN_TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d);
  const obj=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return `${obj.hour||'00'}:${obj.minute||'00'}`;
}
function readJalaliDate(id){
  const input=$('#'+id),raw=input?.value?.trim(); if(!raw)return null;
  const p=parseJalaliText(raw),g=jalaliToGregorian(p.jy,p.jm,p.jd);
  input.value=jalaliCanonicalText(p);setJalaliFieldError(input,'');
  return `${g.gy}-${String(g.gm).padStart(2,'0')}-${String(g.gd).padStart(2,'0')}`;
}
function tehranLocalToIso(gy,gm,gd,hh=0,mm=0){
  const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:TEHRAN_TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const wanted=Date.UTC(gy,gm-1,gd,hh||0,mm||0,0);
  let guess=wanted;
  for(let i=0;i<3;i++){
    const parts=Object.fromEntries(fmt.formatToParts(new Date(guess)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
    const represented=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second||0));
    const diff=represented-wanted;
    if(Math.abs(diff)<1000)break;
    guess-=diff;
  }
  return new Date(guess).toISOString();
}
function readJalaliDateTime(id,timeId=id+'Time'){
  const ds=readJalaliDate(id); if(!ds)return null;
  const [gy,gm,gd]=ds.split('-').map(Number), tv=$('#'+timeId)?.value||'09:00', [hh,mm]=tv.split(':').map(Number);
  return tehranLocalToIso(gy,gm,gd,hh||0,mm||0);
}
function jalaliDateField(id,value='',placeholder='۱۴۰۵/۰۶/۰۹'){
  return `<div class="jalali-control"><div class="jalali-input-row"><input id="${id}" class="jalali-input ltr" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="${placeholder}" value="${esc(jalaliInputValue(value))}" aria-describedby="${id}Help ${id}Error" oninput="handleJalaliInput(this)" onblur="handleJalaliBlur(this)" onkeydown="jalaliFieldKeydown(event,'${id}')"><button class="date-picker-trigger" type="button" aria-label="انتخاب تاریخ شمسی" onclick="openJalaliPicker('${id}')">انتخاب</button></div><small id="${id}Help">تایپ با درج خودکار / یا انتخاب از تقویم</small><small id="${id}Error" class="field-error" aria-live="polite"></small></div>`;
}
function jalaliDateTimeField(id,value=''){
  return `<div class="jalali-datetime">${jalaliDateField(id,value)}<input id="${id}Time" class="time-input" type="time" value="${esc(timeInputValue(value)||'09:00')}" aria-label="ساعت"></div>`;
}
function openJalaliPicker(fieldId){
  const input=$('#'+fieldId);if(!input)return;
  let selected=null;
  try{if(input.value.trim())selected=parseJalaliText(input.value);}catch{}
  const today=jalaliParts(new Date())||{jy:1405,jm:1,jd:1};
  const cursor=selected||today;
  datePickerState={fieldId,jy:cursor.jy,jm:cursor.jm,selected,focusDay:cursor.jd};
  datePickerReturnFocus=document.activeElement;
  $('#datePickerLayer')?.classList.remove('hidden');
  document.body.classList.add('date-picker-open');
  renderJalaliPicker(true);
}
function closeJalaliPicker({restoreFocus=true}={}){
  $('#datePickerLayer')?.classList.add('hidden');
  document.body.classList.remove('date-picker-open');
  const target=datePickerReturnFocus;datePickerReturnFocus=null;
  if(restoreFocus&&target?.focus)setTimeout(()=>target.focus(),0);
}
function datePickerBackdrop(event){if(event.target?.id==='datePickerLayer')closeJalaliPicker();}
function changeJalaliPickerMonth(delta){
  let year=datePickerState.jy,month=datePickerState.jm+delta;
  while(month<1){month+=12;year--}while(month>12){month-=12;year++}
  datePickerState.jy=year;datePickerState.jm=month;
  datePickerState.focusDay=Math.min(datePickerState.focusDay,jalaliMonthDays(year,month));
  renderJalaliPicker(true);
}
function pickerDayLabel(jy,jm,jd){
  const g=jalaliToGregorian(jy,jm,jd);
  return faDateFmt.format(new Date(Date.UTC(g.gy,g.gm-1,g.gd,12)));
}
function renderJalaliPicker(focusDay=false){
  const host=$('#datePickerContent');if(!host)return;
  const {jy,jm,selected}=datePickerState,days=jalaliMonthDays(jy,jm),g=jalaliToGregorian(jy,jm,1);
  const offset=(new Date(Date.UTC(g.gy,g.gm-1,g.gd)).getUTCDay()+1)%7;
  const today=jalaliParts(new Date());
  let cells='';
  for(let i=0;i<offset;i++)cells+='<span class="date-picker-empty" role="presentation"></span>';
  for(let day=1;day<=days;day++){
    const isSelected=selected&&selected.jy===jy&&selected.jm===jm&&selected.jd===day;
    const isToday=today&&today.jy===jy&&today.jm===jm&&today.jd===day;
    const isFocus=day===datePickerState.focusDay;
    cells+=`<div role="gridcell" aria-selected="${isSelected?'true':'false'}"><button type="button" class="date-picker-day ${isSelected?'selected':''} ${isToday?'today':''}" data-picker-day="${day}" tabindex="${isFocus?'0':'-1'}" ${isToday?'aria-current="date"':''} aria-label="${esc(pickerDayLabel(jy,jm,day))}" onclick="selectJalaliPickerDate(${day})" onkeydown="handleDatePickerKey(event,${day})">${faDigits(day)}</button></div>`;
  }
  host.innerHTML=`<div class="date-picker-head"><button type="button" class="btn" onclick="changeJalaliPickerMonth(-1)" aria-label="ماه قبل">ماه قبل</button><div><b id="datePickerTitle" aria-live="polite">${JALALI_MONTHS[jm-1]} ${faDigits(jy)}</b><small>یک روز را انتخاب کن</small></div><button type="button" class="btn" onclick="changeJalaliPickerMonth(1)" aria-label="ماه بعد">ماه بعد</button></div><div class="date-picker-weekdays" role="row">${WEEKDAYS_FA_FULL.map((day,index)=>`<span role="columnheader" aria-label="${day}">${WEEKDAYS_FA[index]}</span>`).join('')}</div><div class="date-picker-grid" role="grid" aria-labelledby="datePickerTitle">${cells}</div><div class="date-picker-actions"><button type="button" class="btn primary" onclick="chooseJalaliToday()">امروز</button><button type="button" class="btn" onclick="clearJalaliPickerDate()">پاک‌کردن</button><button type="button" class="btn" onclick="closeJalaliPicker()">انصراف</button></div><p class="date-picker-help">با کلیدهای جهت‌دار بین روزها حرکت کن؛ Page Up/Down ماه را عوض می‌کند.</p>`;
  if(focusDay)setTimeout(()=>host.querySelector(`[data-picker-day="${datePickerState.focusDay}"]`)?.focus(),0);
}
function selectJalaliPickerDate(day){
  const input=$('#'+datePickerState.fieldId);if(!input)return closeJalaliPicker();
  const parts={jy:datePickerState.jy,jm:datePickerState.jm,jd:day};
  input.value=jalaliCanonicalText(parts);setJalaliFieldError(input,'');
  input.dispatchEvent(new Event('change',{bubbles:true}));
  closeJalaliPicker();
}
function chooseJalaliToday(){
  const today=jalaliParts(new Date());if(!today)return;
  datePickerState.jy=today.jy;datePickerState.jm=today.jm;selectJalaliPickerDate(today.jd);
}
function clearJalaliPickerDate(){
  const input=$('#'+datePickerState.fieldId);if(input){input.value='';setJalaliFieldError(input,'');input.dispatchEvent(new Event('change',{bubbles:true}));}
  closeJalaliPicker();
}
function moveJalaliPickerFocus(delta){
  const g=jalaliToGregorian(datePickerState.jy,datePickerState.jm,datePickerState.focusDay);
  const next=new Date(Date.UTC(g.gy,g.gm-1,g.gd+delta,12)),parts=jalaliParts(next);if(!parts)return;
  datePickerState.jy=parts.jy;datePickerState.jm=parts.jm;datePickerState.focusDay=parts.jd;renderJalaliPicker(true);
}
function handleDatePickerKey(event,day){
  datePickerState.focusDay=day;
  const key=event.key;
  if(key==='Escape'){event.preventDefault();closeJalaliPicker();return;}
  if(key==='ArrowLeft'){event.preventDefault();moveJalaliPickerFocus(1);return;}
  if(key==='ArrowRight'){event.preventDefault();moveJalaliPickerFocus(-1);return;}
  if(key==='ArrowUp'){event.preventDefault();moveJalaliPickerFocus(-7);return;}
  if(key==='ArrowDown'){event.preventDefault();moveJalaliPickerFocus(7);return;}
  if(key==='Home'||key==='End'){
    event.preventDefault();const g=jalaliToGregorian(datePickerState.jy,datePickerState.jm,day),position=(new Date(Date.UTC(g.gy,g.gm-1,g.gd)).getUTCDay()+1)%7;
    moveJalaliPickerFocus(key==='Home'?-position:6-position);return;
  }
  if(key==='PageUp'||key==='PageDown'){event.preventDefault();changeJalaliPickerMonth((key==='PageUp'?-1:1)*(event.shiftKey?12:1));}
}
function trapDatePickerFocus(event){
  if(event.key==='Escape'){event.preventDefault();closeJalaliPicker();return;}
  if(event.key!=='Tab')return;
  const focusable=$$('#datePickerDialog button:not([disabled]):not([tabindex="-1"])');if(!focusable.length)return;
  const first=focusable[0],last=focusable[focusable.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
}
window.NikaraDate = Object.freeze({jalaliParts,jalaliToGregorian,jalaliMonthDays,parseJalaliText,jalaliInputValue,formatJalaliTyping,todayJalaliText,dateOnlyFmt,dateFmt,tehranLocalToIso});
function todayJalaliText(){return jalaliInputValue(new Date());}
function initials(c){ const a=(c.first_name || c.name || c.company || c.phone || '?').trim(); return esc(a.slice(0,2)); }
function scoreClass(n){ return n >= 70 ? 'hot' : n >= 40 ? 'warm' : 'cold'; }
function stageOptions(selected='new'){ return cfg.stages.map(s => `<option value="${s}" ${s===selected?'selected':''}>${stageFa[s]||s}</option>`).join(''); }

/* ===== Phone input guide, validation & formatting (v1.2.0) ===== */
const IR_AREA_CODES={'21':'تهران','26':'البرز','25':'قم','28':'قزوین','31':'اصفهان','41':'تبریز','44':'ارومیه','45':'اردبیل','51':'مشهد','54':'زاهدان','56':'بیرجند','58':'بجنورد','61':'اهواز','66':'خرم‌آباد','71':'شیراز','74':'یاسوج','76':'بندرعباس','77':'بوشهر','81':'همدان','83':'کرمانشاه','84':'ایلام','86':'اراک','87':'سنندج','11':'ساری','13':'رشت','17':'گرگان','23':'سمنان','24':'زنجان','34':'کرمان','35':'یزد','38':'شهرکرد'};
const PHONE_SINGLE_SELECTOR='#oPhone,#cPhone,#cWa,#ePhone,#eWa,#eoPhone,.pPhone,.pWa';
const PHONE_MULTI_SELECTOR='#cPhones,#ePhones,#eoPhones';
const PHONE_HINT='موبایل: <b class="ltr">0912 345 6789</b> · ثابت با کد شهر: <b class="ltr">021 8877 6655</b> · خارج از ایران: <b class="ltr">+971 50 123 4567</b>';
function phoneDefaultArea(){const v=latinDigits(localStorage.getItem('nikara-default-area-code')||'21').replace(/\D/g,'').replace(/^0+/,'');return /^[1-8]\d$/.test(v)?v:'21';}
function setDefaultAreaCode(v){const d=latinDigits(v).replace(/\D/g,'').replace(/^0+/,'');if(!/^[1-8]\d$/.test(d))return toast('کد شهر معتبر نیست؛ مثلاً ۰۲۱ یا ۰۳۱','error');localStorage.setItem('nikara-default-area-code',d);toast(`کد شهر پیش‌فرض: ۰${faDigits(d)} ${IR_AREA_CODES[d]?'('+IR_AREA_CODES[d]+')':''}`,'success');}
function analyzePhone(raw){
  const s=latinDigits(String(raw||'')).trim();
  let d=s.replace(/\D/g,'');
  if(!d)return {empty:true,ok:true};
  const intl=s.startsWith('+')||d.startsWith('00');
  if(d.startsWith('00'))d=d.slice(2);
  if(intl&&!d.startsWith('98')){
    if(d.length<8||d.length>15)return {ok:false,error:'شماره خارجی باید با + و کد کشور و ۸ تا ۱۵ رقم باشد؛ مثل +971501234567'};
    return {ok:true,e164:'+'+d,kind:'intl',label:'شماره بین‌المللی',display:'+'+d};
  }
  if(d.startsWith('98')&&(intl||d.length===12))d=d.slice(2);
  if(d.startsWith('0')&&d.length===11)d=d.slice(1);
  let local=false;
  if(d.length===8&&/^[2-9]/.test(d)){d=phoneDefaultArea()+d;local=true;}
  if(d.length===10&&d.startsWith('9')){
    return {ok:true,e164:'+98'+d,kind:'mobile',label:'موبایل ایران',display:`0${d.slice(0,3)} ${d.slice(3,6)} ${d.slice(6)}`};
  }
  if(d.length===10&&/^[1-8]/.test(d)){
    const area=d.slice(0,2),city=IR_AREA_CODES[area];
    return {ok:true,e164:'+98'+d,kind:'landline',label:city?`تلفن ثابت ${city}`:'تلفن ثابت',display:`0${area} ${d.slice(2,6)} ${d.slice(6)}`,note:local?`کد شهر ۰${faDigits(area)} خودکار اضافه شد`:''};
  }
  if(d.length>=3&&d.length<=6&&!d.startsWith('0'))return {ok:true,e164:d,kind:'short',label:'شماره کوتاه / خدماتی',display:d};
  if(d.startsWith('9')||s.replace(/\D/g,'').startsWith('09'))return {ok:false,error:`موبایل باید ۱۱ رقم باشد و با ۰۹ شروع شود (الان ${faDigits(s.replace(/\D/g,'').length)} رقم)`};
  return {ok:false,error:'شماره کامل نیست. تلفن ثابت را با کد شهر بنویس (مثل ۰۲۱۸۸۷۷۶۶۵۵) یا ۸ رقم بدون کد'};
}
function phoneDisplay(v){if(!v)return '';const a=analyzePhone(v);return a.ok&&a.display?a.display:String(v);}
function phoneParts(input){return String(input.value||'').split(/[|،,;\n]+/).map(x=>x.trim()).filter(Boolean);}
function phoneHintFor(input){let h=input.parentElement?.querySelector(':scope > .phone-hint');if(!h){h=document.createElement('small');h.className='phone-hint';input.insertAdjacentElement('afterend',h);}return h;}
function phoneLive(input,final=false){
  const multi=input.matches(PHONE_MULTI_SELECTOR),hint=phoneHintFor(input);
  const parts=multi?phoneParts(input):[String(input.value||'').trim()].filter(Boolean);
  if(!parts.length){input.classList.remove('invalid','valid');input.removeAttribute('aria-invalid');hint.className='phone-hint';hint.innerHTML=multi?'چند شماره را با ویرگول (،) یا | جدا کن. '+PHONE_HINT:PHONE_HINT;return true;}
  const res=parts.map(analyzePhone),bad=res.find(r=>!r.ok);
  if(bad){input.classList.add('invalid');input.classList.remove('valid');input.setAttribute('aria-invalid','true');hint.className='phone-hint bad';hint.textContent='⚠ '+bad.error;return false;}
  input.classList.remove('invalid');input.classList.add('valid');input.removeAttribute('aria-invalid');hint.className='phone-hint ok';
  hint.innerHTML=res.map(r=>`✓ ${esc(r.label)}: <b class="ltr">${esc(r.display)}</b>${r.note?` <span>(${esc(r.note)})</span>`:''}`).join('<br>');
  if(final&&!multi&&res[0]?.display)input.value=res[0].display;
  return true;
}
function enhancePhoneInputs(root=document){
  root.querySelectorAll?.(`${PHONE_SINGLE_SELECTOR},${PHONE_MULTI_SELECTOR}`).forEach(input=>{
    if(input.dataset.phoneReady)return;input.dataset.phoneReady='1';
    input.type='tel';input.setAttribute('inputmode','tel');input.setAttribute('dir','ltr');input.setAttribute('autocomplete','tel');input.classList.add('phone-input');
    if(!input.placeholder||/جدا کن/.test(input.placeholder))input.placeholder=input.matches(PHONE_MULTI_SELECTOR)?'0912 345 6789 ، 021 8877 6655':'0912 345 6789';
    input.addEventListener('input',()=>phoneLive(input));
    input.addEventListener('blur',()=>phoneLive(input,true));
    if(input.value)phoneLive(input);else phoneLive(input);
  });
  root.querySelectorAll?.('#cEmail,#eEmail,#oEmail,#eoEmail,.pEmail').forEach(i=>{if(i.dataset.emailReady)return;i.dataset.emailReady='1';i.type='email';i.setAttribute('dir','ltr');i.setAttribute('autocomplete','email');i.placeholder=i.placeholder||'name@example.com';});
  root.querySelectorAll?.('#oWebsite,#eoWebsite').forEach(i=>{i.setAttribute('dir','ltr');i.placeholder=i.placeholder||'example.com';});
}
function validateContactFields(root=$('#modalBody')){
  if(!root)return true;
  for(const input of root.querySelectorAll(`${PHONE_SINGLE_SELECTOR},${PHONE_MULTI_SELECTOR}`)){
    if(!phoneLive(input)){input.focus();input.scrollIntoView?.({block:'center'});toast('فرمت شماره تلفن درست نیست؛ راهنمای زیر فیلد را ببین','error');return false;}
  }
  for(const input of root.querySelectorAll('#cEmail,#eEmail,#oEmail,#eoEmail,.pEmail')){
    const v=String(input.value||'').trim();
    if(v&&!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)){input.classList.add('invalid');input.focus();toast('ایمیل معتبر نیست؛ مثل name@example.com','error');return false;}
    input.classList.remove('invalid');
  }
  return true;
}
(()=>{const body=document.getElementById('modalBody');if(!body||!window.MutationObserver)return;new MutationObserver(()=>enhancePhoneInputs(body)).observe(body,{childList:true,subtree:true});})();

function toast(msg, type='info'){ const t=$('#toast'); if(!t) return; t.textContent=msg; t.classList.remove('hidden','success','error'); if(type==='success')t.classList.add('success'); if(type==='error')t.classList.add('error'); clearTimeout(t._timer); t._timer=setTimeout(()=>t.classList.add('hidden'),2800); }
function showApp(){ $('#appView')?.classList.remove('hidden'); }
function assetUrl(path){ if(!path) return ''; return /^(data:|blob:)/i.test(path) ? path : ''; }
function retryLoad(key){ const fn=loaderRegistry[key]; if(typeof fn==='function')fn(); }
function emptyState(icon='∅', msg='', actionHtml=''){ return `<div class="state-block empty-state"><span class="state-icon">${icon}</span><div class="state-msg">${msg}</div>${actionHtml}</div>`; }
function errorState(retryKey, msg='بارگذاری انجام نشد'){ return `<div class="state-block error-state"><span class="state-icon">⚠</span><div class="state-msg">${msg}</div><button class="btn" type="button" onclick="retryLoad('${retryKey}')">↻ تلاش دوباره</button></div>`; }
function loadingState(label='در حال بارگذاری...'){ return `<div class="state-block loading-state"><span class="spinner"></span><span class="state-msg">${label}</span></div>`; }
function cardKey(event, fn, ...args){
  if(event.key!=='Enter'&&event.key!==' ')return;
  event.preventDefault();
  const f=typeof window[fn]==='function'?window[fn]:null;
  if(f)f(...args);
}

function switchTab(tab){
  $$('.page').forEach(x=>x.classList.add('hidden'));
  $('#'+tab)?.classList.remove('hidden');
  $$('[data-tab]').forEach(x=>{const on=x.dataset.tab===tab;x.classList.toggle('active',on);if(on)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current');});
  const moreTabs=['projects','calendar','network','finance','invoices','documents','tasks','social','automation','settings'];
  $('#mobileMoreButton')?.classList.toggle('active',moreTabs.includes(tab));
  const titles={dashboard:'داشبورد',organizations:'شرکت‌ها و سازمان‌ها',contacts:'افراد',projects:'پروژه‌ها و فرصت‌ها',calendar:'تقویم شمسی',network:'شبکه کاری',finance:'حساب مشتریان',invoices:'فاکتورها',documents:'مدارک',tasks:'پیگیری‌ها',social:'پیش‌نویس‌های آفلاین',automation:'رویدادهای محلی',settings:'تنظیمات'};
  $('#pageTitle').textContent=titles[tab]||'';
  if(tab==='dashboard') loadDashboard();
  if(tab==='organizations') loadOrganizations();
  if(tab==='contacts') loadContacts();
  if(tab==='projects') loadProjects();
  if(tab==='calendar') loadCalendar();
  if(tab==='network') loadNetwork();
  if(tab==='finance') loadFinance();
  if(tab==='invoices') loadInvoices();
  if(tab==='documents') loadDocuments();
  if(tab==='tasks'){loadTasks();loadReminders();}
  if(tab==='social') loadPosts();
  if(tab==='automation') loadEvents();
  if(tab==='settings') setTimeout(()=>{loadCallerIdStatus().catch(()=>{});refreshReminderStatus().catch(()=>{})},50);
  window.scrollTo({top:0,behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}

async function boot(){
  try{
    applyTheme();
    applyDisplayPreferences();
    showApp();
    await OfflineDB.ensureMigrations();
    await seedFromCallerIdCache();
    cfg=await api('/api/config');
    $('#engineLabel').textContent='کاملاً آفلاین';
    $('#aiStatus').textContent='تحلیل محلی بدون اینترنت فعال است؛ اطلاعات مشتری از گوشی خارج نمی‌شود.';
    $('#n8nStatus').textContent='هیچ Server، Cloudflare، Webhook یا n8n برای کار روزمره لازم نیست.';
    $('#stageFilter').innerHTML='<option value="">همه مراحل</option>'+cfg.stages.map(s=>`<option value="${s}">${stageFa[s]||s}</option>`).join('');
    $('#orgStageFilter').innerHTML='<option value="">همه مراحل</option>'+cfg.stages.map(s=>`<option value="${s}">${stageFa[s]||s}</option>`).join('');
    if($('#networkCategory')) $('#networkCategory').innerHTML='<option value="">همه دسته‌ها</option>'+((cfg.network_types||Object.keys(networkTypeFa)).map(k=>`<option value="${k}">${networkIcon(k)} ${networkLabel(k)}</option>`).join(''));
    if($('#projectStageFilter')) $('#projectStageFilter').innerHTML='<option value="">همه مراحل</option>'+((cfg.project_stages||Object.keys(projectStageFa)).map(k=>`<option value="${k}">${projectStageFa[k]||k}</option>`).join(''));
    if($('#projectTypeFilter')) $('#projectTypeFilter').innerHTML='<option value="">همه انواع</option>'+((cfg.project_types||Object.keys(projectTypeFa)).map(k=>`<option value="${k}">${projectTypeFa[k]||k}</option>`).join(''));
    if($('#moneyUnitSetting')) $('#moneyUnitSetting').value=moneyUnit();
    if($('#defaultAreaCodeSetting')) $('#defaultAreaCodeSetting').value='0'+phoneDefaultArea();
    await loadDashboard();
    resumePendingCall();
    if(NATIVE){ initNativeNotificationActions().catch(()=>{}); syncCallerIdContacts().catch(()=>{}); consumeCallerIdOpen().catch(()=>{}); setTimeout(()=>syncNativeNotifications().catch(()=>{}),600); }
    const pendingContact=localStorage.getItem('pendingContact');
    const pendingOrg=localStorage.getItem('pendingOrganization');
    if(pendingContact){ localStorage.removeItem('pendingContact'); setTimeout(()=>openContact(pendingContact),250); }
    if(pendingOrg){ localStorage.removeItem('pendingOrganization'); setTimeout(()=>openOrganization(pendingOrg),250); }
    setTimeout(()=>showOnboarding(false),350);
  }catch(e){ console.error(e); showApp(); toast(e?.message||'خطا در باز کردن دیتابیس آفلاین','error'); }
}

const ACTIVITY_ICONS={call:'📞',note:'📝',voice_note:'🎙',audio_note:'🎙',email:'✉',whatsapp:'💬',meeting:'▦',document:'▤',project_note:'◆',task:'✓',finance:'﷼',attachment:'📎'};
function activityIconFor(event){
  const p=event?.payload||{};
  if(ACTIVITY_ICONS[p.type])return ACTIVITY_ICONS[p.type];
  const t=String(event?.event_type||'');
  if(t.includes('call'))return '📞';if(t.includes('finance'))return '﷼';if(t.includes('document')||t.includes('attachment'))return '▤';
  if(t.includes('meeting'))return '▦';if(t.includes('project'))return '◆';if(t.includes('task'))return '✓';if(t.includes('reminder'))return '◉';
  return '•';
}
const EVENT_TYPE_FA={'ai.local_analysis':'تحلیل محلی مشتری','attachment.created':'سند پیوست شد','attachment.deleted':'سند حذف شد','attachment.updated':'جزئیات سند ویرایش شد','backup.imported':'پشتیبان بازیابی شد','call.completed':'گزارش تماس ثبت شد','caller_id_cache.imported':'بازیابی مخاطبین شناسه تماس','contact.created':'شخص جدید ثبت شد','contact.updated':'اطلاعات شخص به‌روز شد','contacts.csv_import':'ورود گروهی افراد','document.check.created':'مدرک ثبت شد','document.check.deleted':'مدرک حذف شد','document.check.updated':'مدرک به‌روز شد','finance.entry.created':'تراکنش مالی ثبت شد','finance.entry.deleted':'تراکنش مالی حذف شد','interaction.created':'یادداشت / تعامل ثبت شد','meeting.completed':'جلسه انجام شد','meeting.created':'جلسه ثبت شد','meeting.deleted':'جلسه حذف شد','meeting.updated':'جلسه به‌روز شد','organization.created':'شرکت جدید ثبت شد','organization.interaction.created':'یادداشت شرکت ثبت شد','organization.link.created':'ارتباط شرکت‌ها ثبت شد','organization.link.deleted':'ارتباط شرکت‌ها حذف شد','organization.updated':'اطلاعات شرکت به‌روز شد','organizations.csv_import':'ورود گروهی شرکت‌ها','phonebook_contacts.cleaned':'پاکسازی دفترچه تلفن','project.created':'پروژه جدید ساخته شد','project.interaction.created':'یادداشت پروژه ثبت شد','project.participant.created':'طرف جدید به پروژه اضافه شد','project.participant.deleted':'طرف پروژه حذف شد','project.updated':'پروژه به‌روز شد','reminder.completed':'یادآوری انجام شد','reminder.created':'یادآوری ثبت شد','reminder.deleted':'یادآوری حذف شد','reminder.updated':'یادآوری به‌روز شد','schema.v4.organizations_migrated':'به‌روزرسانی ساختار داده','social.draft.saved':'پیش‌نویس ذخیره شد','task.completed':'پیگیری انجام شد','task.created':'پیگیری جدید ثبت شد','voice_note.created':'یادداشت صوتی ثبت شد'};
function eventTypeLabel(t){t=String(t||'').replace(/\.local$/,'');return EVENT_TYPE_FA[t]||'رویداد ثبت شد';}
const UUIDISH=/^[0-9a-f]{8}-[0-9a-f]{4}-/i;
function activityLabelFor(event){
  const p=event?.payload||{};
  const name=[p.contact_name,p.organization_name,p.title,p.name,p.file_name].find(v=>v&&!UUIDISH.test(String(v)));
  const kind=eventTypeLabel(event?.event_type);
  return name?`${kind}: ${name}`:(typeFa[p.type]?`${kind} · ${typeFa[p.type]}`:kind);
}
function activityRowHtml(event){
  return `<div class="activity-row"><span class="activity-icon">${activityIconFor(event)}</span><div class="activity-main"><b>${esc(activityLabelFor(event))}</b><small>${dateFmt(event?.created_at)}</small></div></div>`;
}
async function loadDashboard(){
  if($('#homeSearchResults')&&!String($('#homeSearch')?.value||'').trim())$('#homeSearchResults').innerHTML=recentOpenHtml();
  refreshCallerHome().catch(()=>{});
  try{
    const [d,orgs,contacts,tasks,projects,meetings,events]=await Promise.all([api('/api/dashboard'),api('/api/organizations?limit=5'),api('/api/contacts?limit=6'),api('/api/tasks'),api('/api/projects?limit=4'),api('/api/meetings?status=planned'),api('/api/events?limit=8')]);
    const cards=[['شرکت',d.organizations,'▣'],['افراد',d.contacts,'☷'],['پروژه باز',d.projects_open||0,'◆'],['ارزش پروژه‌ها',nfmt(d.projects_value||0),'◈'],['پیگیری باز',d.open_tasks,'✓'],['فروش موفق',d.won,'★']];
    $('#stats').innerHTML=cards.map(([a,b,c])=>`<div class="panel stat"><div class="stat-head"><span class="stat-icon">${c}</span><span class="muted">${a}</span></div><b>${b}</b></div>`).join('');
    const byStatus=d.by_status||{};
    const pipelineTotal=Object.values(byStatus).reduce((s,v)=>s+Number(v||0),0);
    const max=Math.max(1,...Object.values(byStatus));
    $('#pipeline').innerHTML=`<div class="pipeline-total"><span>کل pipeline فروش</span><b>${nfmt(pipelineTotal)} مورد</b></div>`+cfg.stages.map(s=>{const v=byStatus[s]||0;return `<div class="pipeline-row"><span>${stageFa[s]||s}</span><div class="bar"><i style="width:${Math.round(v/max*100)}%"></i></div><b>${nfmt(v)}</b></div>`}).join('');
    $('#dashboardTasks').innerHTML=tasks.slice(0,6).map(taskRow).join('')||emptyState('✓','پیگیری بازی نداری.',`<button class="btn" type="button" onclick="openTask()">+ پیگیری جدید</button>`);
    const upcomingMeetings=meetings.filter(m=>m.start_at&&new Date(m.start_at)>=new Date()).sort((a,b)=>new Date(a.start_at)-new Date(b.start_at)).slice(0,5);
    if($('#dashboardMeetings')) $('#dashboardMeetings').innerHTML=upcomingMeetings.map(meetingRow).join('')||emptyState('▦','جلسه آینده‌ای ثبت نشده است.',`<button class="btn" type="button" onclick="openMeeting()">+ جلسه</button>`);
    if($('#dashboardFinance')) $('#dashboardFinance').innerHTML=`<div><span>طلب</span><b>${moneyFmt(d.receivable_rial||0)}</b></div><div><span>بدهی</span><b>${moneyFmt(d.payable_rial||0)}</b></div><div><span>طلب معوق</span><b>${moneyFmt(d.overdue_receivable_rial||0)}</b></div><div><span>مدارک ناقص</span><b>${nfmt(d.documents_missing||0)}</b></div>`;
    if($('#recentActivity')) $('#recentActivity').innerHTML=(events||[]).slice(0,6).map(activityRowHtml).join('')||emptyState('◷','هنوز تعامل یا رویدادی ثبت نشده است.');
    $('#recentOrganizations').innerHTML=orgs.map(orgCard).join('')||emptyState('▣','هنوز شرکتی ثبت نشده است.',`<button class="btn primary" type="button" onclick="openNewOrganization()">+ شرکت جدید</button>`);
    if($('#recentProjects')) $('#recentProjects').innerHTML=projects.map(projectCard).join('')||emptyState('◆','هنوز پروژه‌ای ثبت نشده است.',`<button class="btn" type="button" onclick="openNewProject()">+ پروژه جدید</button>`);
    $('#recentContacts').innerHTML=contacts.length?`<table class="simple-table"><thead><tr><th>شخص</th><th>سمت</th><th>شرکت</th><th>شماره</th></tr></thead><tbody>${contacts.map(c=>`<tr onclick="openContact('${c.id}')"><td><b>${esc(c.name)}</b>${c.is_primary_contact?'<span class="mini-star">★</span>':''}</td><td>${esc(c.job_title||'-')}</td><td>${esc(c.company||'—')}</td><td class="ltr">${esc(phoneDisplay(c.phone)||'-')}</td></tr>`).join('')}</tbody></table>`:emptyState('☷','هنوز فردی ثبت نشده است.',`<button class="btn" type="button" onclick="openNewPerson()">+ شخص جدید</button>`);
  }catch(e){
    console.warn('dashboard load failed',e);
    const fail=errorState('dashboard');
    for(const id of ['stats','pipeline','dashboardTasks','dashboardMeetings','recentActivity','recentOrganizations','recentProjects','recentContacts']){
      const el=$('#'+id);if(el)el.innerHTML=fail;
    }
  }
}
loaderRegistry.dashboard=loadDashboard;

function orgCard(o){
  return `<div class="contact-card org-card" tabindex="0" role="button" onclick="openOrganization('${o.id}')" onkeydown="cardKey(event,'openOrganization','${o.id}')"><div class="contact-top"><div class="avatar org-avatar">${initials(o)}</div><div class="contact-main"><div class="contact-name">${esc(o.name)}</div><div class="meta">${esc(o.industry||'بدون صنعت')} · ${nfmt(o.contacts_count||0)} نفر</div><div class="network-chip-row">${networkChips((o.relationship_types||[]).slice(0,3))}</div></div><span class="badge">${stageFa[o.status]||o.status}</span></div><div class="card-footer"><span class="muted">${o.main_phone?esc(phoneDisplay(o.main_phone)):'شماره اصلی ثبت نشده'}</span><span>${o.deal_value?`ارزش ${nfmt(o.deal_value)}`:''}</span></div></div>`;
}

function debouncedOrganizations(){ clearTimeout(organizationTimer); organizationTimer=setTimeout(loadOrganizations,220); }
async function loadOrganizations(){
  try{
    const q=encodeURIComponent($('#orgSearch')?.value||''),status=encodeURIComponent($('#orgStageFilter')?.value||'');
    const rows=await api(`/api/organizations?q=${q}&status=${status}`);
    $('#organizationList').innerHTML=rows.map(orgCard).join('')||emptyState('▣',q||status?'شرکتی مطابق فیلتر پیدا نشد.':'هنوز شرکتی ثبت نشده است.',`<button class="btn primary" type="button" onclick="openNewOrganization()">+ شرکت جدید</button>`);
  }catch(e){ console.warn('organizations load failed',e); $('#organizationList').innerHTML=errorState('organizations'); }
}
loaderRegistry.organizations=loadOrganizations;

function debouncedContacts(){ clearTimeout(contactTimer); contactTimer=setTimeout(loadContacts,220); }
async function loadContacts(){
  try{
    const q=encodeURIComponent($('#search')?.value||''),status=encodeURIComponent($('#stageFilter')?.value||'');
    const rows=await api(`/api/contacts?q=${q}&status=${status}`);
    $('#contactList').innerHTML=rows.map(c=>`<div class="contact-card" tabindex="0" role="button" onclick="openContact('${c.id}')" onkeydown="cardKey(event,'openContact','${c.id}')"><div class="contact-top"><div class="avatar">${initials(c)}</div><div class="contact-main"><div class="contact-name">${esc(c.name)} ${c.is_primary_contact?'<span class="mini-star">★</span>':''}</div><div class="meta">${esc(c.job_title||'بدون سمت')}${c.company?' · 🏢 '+esc(c.company):''}</div><div class="meta ltr rtl-align">${esc(phoneDisplay(c.phone)||'شماره ثبت نشده')}</div></div><span class="badge">${stageFa[c.status]||c.status}</span></div><div class="card-footer"><span class="muted">${c.department?esc(c.department):' '}</span><span class="score ${scoreClass(c.ai_score)}">AI ${c.ai_score||0}</span></div></div>`).join('')||emptyState('☷',q||status?'فردی مطابق فیلتر پیدا نشد.':'هنوز فردی ثبت نشده است.',`<button class="btn primary" type="button" onclick="openNewPerson()">+ شخص جدید</button>`);
  }catch(e){ console.warn('contacts load failed',e); $('#contactList').innerHTML=errorState('contacts'); }
}
loaderRegistry.contacts=loadContacts;


function debouncedNetwork(){ clearTimeout(networkTimer); networkTimer=setTimeout(loadNetwork,220); }
async function loadNetwork(){
  try{
    const q=encodeURIComponent($('#networkSearch')?.value||'');
    const category=encodeURIComponent($('#networkCategory')?.value||'');
    const rows=await api(`/api/network?q=${q}&category=${category}`);
    const counts={};
    for(const row of rows) for(const t of (row.relationship_types||[])) counts[t]=(counts[t]||0)+1;
    const top=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6);
    if($('#networkSummary')) $('#networkSummary').innerHTML=top.map(([k,v])=>`<button class="network-summary-chip" onclick="setNetworkCategory('${esc(k)}')">${networkIcon(k)} ${esc(networkLabel(k))}<b>${nfmt(v)}</b></button>`).join('')||'<span class="muted">هنوز دسته‌بندی شبکه ثبت نشده است.</span>';
    if($('#networkList')) $('#networkList').innerHTML=rows.map(networkCard).join('')||emptyState('⌘',q||category?'موردی مطابق فیلتر پیدا نشد.':'هنوز موردی در شبکه کاری ثبت نشده است.',`<button class="btn primary" type="button" onclick="openQuickAdd()">+ افزودن</button>`);
  }catch(e){ console.warn('network load failed',e); if($('#networkList'))$('#networkList').innerHTML=errorState('network'); }
}
loaderRegistry.network=loadNetwork;
function setNetworkCategory(k){ if($('#networkCategory')){$('#networkCategory').value=k;loadNetwork();} }
function networkCard(r){
  const isOrg=r.entity_type==='organization';
  const open=isOrg?`openOrganization('${r.id}')`:`openContact('${r.id}')`;
  const company=!isOrg&&r.company?`<div class="muted">🏢 ${esc(r.company)}</div>`:'';
  return `<div class="network-card">
    <div class="network-card-main" onclick="${open}">
      <div class="network-card-title"><span class="network-kind">${isOrg?'🏢':'👤'}</span><div><b>${esc(r.name)}</b><div class="muted">${esc(r.subtitle||'')}</div>${company}</div></div>
      <div class="network-chip-row">${networkChips(r.relationship_types||[])}</div>
    </div>
    <div class="network-card-actions">
      ${r.phone?`<a class="btn success" href="tel:${esc(r.phone)}">📞 تماس</a>`:''}
      <button class="btn" onclick="${open}">پرونده</button>
    </div>
  </div>`;
}

function projectStageLabel(v){return projectStageFa[v]||String(v||'');}
function projectTypeLabel(v){return projectTypeFa[v]||String(v||'');}
function projectStageOptions(selected='new'){return (cfg.project_stages||Object.keys(projectStageFa)).map(s=>`<option value="${s}" ${s===selected?'selected':''}>${projectStageLabel(s)}</option>`).join('');}
function projectTypeOptions(selected='opportunity'){return (cfg.project_types||Object.keys(projectTypeFa)).map(s=>`<option value="${s}" ${s===selected?'selected':''}>${projectTypeLabel(s)}</option>`).join('');}
function projectCard(p){
  const customer=p.customer_organization?.name||p.customer_contact?.name||'بدون مشتری اصلی';
  return `<div class="project-card" tabindex="0" role="button" onclick="openProject('${p.id}')" onkeydown="cardKey(event,'openProject','${p.id}')"><div class="project-card-head"><div><span class="project-type">${esc(projectTypeLabel(p.type))}</span><b>${esc(p.title)}</b><div class="muted">${esc(customer)}${p.reference_no?' · '+esc(p.reference_no):''}</div></div><span class="badge">${esc(projectStageLabel(p.stage))}</span></div><div class="project-card-meta"><span>${p.value?`ارزش ${nfmt(p.value)}`:'بدون ارزش ثبت‌شده'}</span><span>${nfmt(p.participants_count||0)} طرف مرتبط</span>${p.expected_close?`<span>${dateOnlyFmt(p.expected_close)}</span>`:''}</div></div>`;
}
function debouncedProjects(){clearTimeout(projectTimer);projectTimer=setTimeout(loadProjects,220);}
async function loadProjects(){
  try{
    const q=encodeURIComponent($('#projectSearch')?.value||''),stage=encodeURIComponent($('#projectStageFilter')?.value||''),type=encodeURIComponent($('#projectTypeFilter')?.value||'');
    const rows=await api(`/api/projects?q=${q}&stage=${stage}&type=${type}`);
    $('#projectList').innerHTML=rows.map(projectCard).join('')||emptyState('◆',q||stage||type?'پروژه یا فرصتی مطابق فیلتر پیدا نشد.':'هنوز پروژه یا فرصتی ثبت نشده است.',`<button class="btn primary" type="button" onclick="openNewProject()">+ پرونده جدید</button>`);
  }catch(e){ console.warn('projects load failed',e); $('#projectList').innerHTML=errorState('projects'); }
}
loaderRegistry.projects=loadProjects;
async function projectTargetOptions(selectedOrg='',selectedContact=''){
  const [orgs,people]=await Promise.all([api('/api/organizations?limit=1000'),api('/api/contacts?limit=2000')]);
  return {orgs,people,orgOptions:'<option value="">بدون شرکت مشتری</option>'+orgs.map(o=>`<option value="${o.id}" ${o.id===selectedOrg?'selected':''}>🏢 ${esc(o.name)}</option>`).join(''),personOptions:'<option value="">بدون شخص مشتری</option>'+people.map(c=>`<option value="${c.id}" ${c.id===selectedContact?'selected':''}>👤 ${esc(c.name)}${c.company?' — '+esc(c.company):''}</option>`).join('')};
}
async function openNewProject(){
  const o=await projectTargetOptions(); $('#modalTitle').textContent='پروژه / فرصت جدید';
  $('#modalBody').innerHTML=`<div class="panel"><div class="two-col"><label>عنوان *<input id="pTitle" autofocus placeholder="مثلاً واردات محموله شماره ۱۲"></label><label>شماره مرجع<input id="pRef" placeholder="PO / قرارداد / پروفرما"></label></div><div class="two-col"><label>نوع<select id="pType">${projectTypeOptions()}</select></label><label>مرحله<select id="pStage">${projectStageOptions()}</select></label></div><div class="two-col"><label>شرکت مشتری<select id="pOrg">${o.orgOptions}</select></label><label>شخص مشتری<select id="pContact">${o.personOptions}</select></label></div><div class="two-col"><label>ارزش<input id="pValue" type="number" min="0"></label><label>احتمال موفقیت %<input id="pProb" type="number" min="0" max="100" value="0"></label></div><div class="two-col"><label>تاریخ شروع (شمسی)${jalaliDateField('pStart')}</label><label>تاریخ مورد انتظار پایان (شمسی)${jalaliDateField('pClose')}</label></div><label>یادداشت<textarea id="pNotes" placeholder="شرح سفارش، نیاز مشتری، شرایط، مسیر حمل و..."></textarea></label><button class="btn primary wide" onclick="createProject()">ساخت پرونده پروژه</button></div>`; openModal();
}
async function createProject(){try{const p=await api('/api/projects',{method:'POST',body:{title:$('#pTitle').value,reference_no:$('#pRef').value,type:$('#pType').value,stage:$('#pStage').value,customer_organization_id:$('#pOrg').value||null,customer_contact_id:$('#pContact').value||null,value:Number($('#pValue').value||0),probability:Number($('#pProb').value||0),start_date:readJalaliDate('pStart'),expected_close:readJalaliDate('pClose'),notes:$('#pNotes').value}});toast('پرونده پروژه ساخته شد','success');await openProject(p.id);loadProjects();loadDashboard();syncCallerIdContacts().catch(()=>{});}catch(e){toast(e.message,'error')}}
function projectParticipantLabel(x){if(x.organization)return `🏢 ${esc(x.organization.name)}`;if(x.contact)return `👤 ${esc(x.contact.name)}${x.contact.company?' — '+esc(x.contact.company):''}`;return 'طرف نامشخص';}
function projectParticipantPhone(x){return x.organization?.main_phone||x.contact?.phone||'';}
async function openProject(id){
  const [p,financeEntries,financeSummary,docChecks,meetings]=await Promise.all([api('/api/projects/'+id),api(`/api/finance?project_id=${id}`),api(`/api/finance/summary?project_id=${id}`),api(`/api/document-checks?scope_type=project&scope_id=${id}`),api(`/api/meetings?project_id=${id}`)]); currentProject=p; currentContact=null; currentOrganization=null; $('#modalTitle').textContent=p.title;
  const parts=(p.participants||[]).map(x=>`<div class="project-party"><div onclick="${x.organization?`openOrganization('${x.organization.id}')`:`openContact('${x.contact?.id||''}')`}"><b>${projectParticipantLabel(x)}</b><div class="muted">${esc(networkLabel(x.role))}${x.note?' · '+esc(x.note):''}</div></div><div class="actions">${projectParticipantPhone(x)?`<a class="btn success" href="tel:${esc(projectParticipantPhone(x))}">📞</a>`:''}<button class="icon-btn danger-text" onclick="event.stopPropagation();deleteProjectParticipant('${x.id}','${p.id}')">×</button></div></div>`).join('');
  const timeline=renderTimeline(p.interactions||[],p.attachments||[]); const tasks=(p.tasks||[]).filter(t=>!t.done).map(taskRow).join('');
  const customer=p.customer_organization?`<button class="company-link" onclick="openOrganization('${p.customer_organization.id}')">🏢 مشتری: ${esc(p.customer_organization.name)}</button>`:(p.customer_contact?`<button class="company-link" onclick="openContact('${p.customer_contact.id}')">👤 مشتری: ${esc(p.customer_contact.name)}</button>`:'');
  $('#modalBody').innerHTML=`<div class="panel project-detail-head"><div class="panel-head"><div><span class="project-type">${esc(projectTypeLabel(p.type))}</span><h3>${esc(p.title)}</h3><div class="muted">${p.reference_no?'مرجع '+esc(p.reference_no)+' · ':''}${projectStageLabel(p.stage)}</div></div><button class="btn" onclick="editProject('${p.id}')">ویرایش</button></div>${customer}<div class="project-kpis"><span><b>${nfmt(p.value||0)}</b><small>ارزش</small></span><span><b>${nfmt(p.probability||0)}٪</b><small>احتمال</small></span><span><b>${p.expected_close?dateOnlyFmt(p.expected_close):'—'}</b><small>پایان مورد انتظار</small></span></div>${p.notes?`<div class="note-box">${esc(p.notes)}</div>`:''}</div><div class="panel"><div class="panel-head"><div><h3>طرف‌های مرتبط</h3><div class="muted">تأمین‌کننده، حمل‌ونقل، ترخیص‌کار، پزشک، بیمه و هر شرکت/شخص مرتبط.</div></div><button class="btn primary" onclick="openProjectParticipantPicker('${p.id}')">+ طرف مرتبط</button></div><div class="project-party-list">${parts||'<div class="empty">هنوز طرف مرتبطی اضافه نشده است.</div>'}</div></div>${financeSummaryPanel(financeSummary,financeEntries,'project',p.id)}${renderDocumentChecklistPanel(docChecks,'project',p.id)}${renderMeetingsPanel(meetings,`project:${p.id}`)}${renderDocumentsPanel(p.attachments||[],'project',p.id)}<div class="panel"><div class="panel-head"><h3>پیگیری‌های پروژه</h3><button class="btn" onclick="openTask('project:${p.id}')">+ پیگیری</button></div>${tasks||'<div class="muted">پیگیری بازی نیست.</div>'}</div><div class="panel"><div class="panel-head"><h3>سوابق پروژه</h3><button class="btn" onclick="addProjectNote('${p.id}')">+ یادداشت</button></div><div class="timeline">${timeline||'<div class="muted">هنوز سابقه‌ای ثبت نشده است.</div>'}</div></div>`; openModal();
}
async function editProject(id){const p=await api('/api/projects/'+id),o=await projectTargetOptions(p.customer_organization_id,p.customer_contact_id);$('#modalTitle').textContent='ویرایش پروژه';$('#modalBody').innerHTML=`<div class="panel"><div class="two-col"><label>عنوان<input id="epTitle" value="${esc(p.title)}"></label><label>مرجع<input id="epRef" value="${esc(p.reference_no)}"></label></div><div class="two-col"><label>نوع<select id="epType">${projectTypeOptions(p.type)}</select></label><label>مرحله<select id="epStage">${projectStageOptions(p.stage)}</select></label></div><div class="two-col"><label>شرکت مشتری<select id="epOrg">${o.orgOptions}</select></label><label>شخص مشتری<select id="epContact">${o.personOptions}</select></label></div><div class="two-col"><label>ارزش<input id="epValue" type="number" value="${p.value||0}"></label><label>احتمال<input id="epProb" type="number" min="0" max="100" value="${p.probability||0}"></label></div><div class="two-col"><label>شروع (شمسی)${jalaliDateField('epStart',p.start_date||'')}</label><label>پایان مورد انتظار (شمسی)${jalaliDateField('epClose',p.expected_close||'')}</label></div><label>یادداشت<textarea id="epNotes">${esc(p.notes||'')}</textarea></label><button class="btn primary wide" onclick="saveProjectEdit('${id}')">ذخیره</button></div>`;}
async function saveProjectEdit(id){try{await api('/api/projects/'+id,{method:'PATCH',body:{title:$('#epTitle').value,reference_no:$('#epRef').value,type:$('#epType').value,stage:$('#epStage').value,customer_organization_id:$('#epOrg').value||null,customer_contact_id:$('#epContact').value||null,value:Number($('#epValue').value||0),probability:Number($('#epProb').value||0),start_date:readJalaliDate('epStart'),expected_close:readJalaliDate('epClose'),notes:$('#epNotes').value}});toast('پروژه ذخیره شد','success');await openProject(id);loadProjects();loadDashboard();syncCallerIdContacts().catch(()=>{});}catch(e){toast(e.message,'error')}}
async function openProjectParticipantPicker(projectId){const [orgs,people]=await Promise.all([api('/api/organizations?limit=1000'),api('/api/contacts?limit=2000')]);const options=['<option value="">انتخاب کن</option>',...orgs.map(o=>`<option value="org:${o.id}">🏢 ${esc(o.name)}</option>`),...people.map(c=>`<option value="person:${c.id}">👤 ${esc(c.name)}${c.company?' — '+esc(c.company):''}</option>`)].join('');$('#modalTitle').textContent='افزودن طرف پروژه';$('#modalBody').innerHTML=`<div class="panel"><label>شرکت / شخص<select id="ppTarget">${options}</select></label><label>نقش<select id="ppRole">${Object.keys(networkTypeFa).map(k=>`<option value="${k}">${networkIcon(k)} ${networkLabel(k)}</option>`).join('')}</select></label><label>یادداشت<input id="ppNote" placeholder="مثلاً حمل اصلی از بندرعباس"></label><button class="btn primary wide" onclick="addProjectParticipant('${projectId}')">افزودن</button></div>`;openModal();}
async function addProjectParticipant(projectId){const t=$('#ppTarget').value;if(!t)return toast('یک شرکت یا شخص انتخاب کن','error');const isOrg=t.startsWith('org:');await api(`/api/projects/${projectId}/participants`,{method:'POST',body:{organization_id:isOrg?t.slice(4):null,contact_id:!isOrg?t.slice(7):null,role:$('#ppRole').value,note:$('#ppNote').value}});toast('طرف پروژه اضافه شد','success');await openProject(projectId);syncCallerIdContacts().catch(()=>{});}
async function deleteProjectParticipant(id,projectId){if(!await askConfirm('این ارتباط از پروژه حذف شود؟',{title:'حذف ارتباط'}))return;await api('/api/project-participants/'+id,{method:'DELETE'});toast('حذف شد','success');await openProject(projectId);syncCallerIdContacts().catch(()=>{});}
function addProjectNote(id){openNoteModal(`/api/projects/${id}/interactions`,()=>openProject(id),'project_note','یادداشت پروژه');}


const JALALI_MONTHS=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const WEEKDAYS_FA=['ش','ی','د','س','چ','پ','ج'];
const WEEKDAYS_FA_FULL=['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'];
let calendarCursor=jalaliParts(new Date())||{jy:1405,jm:1,jd:1};
let financeTimer=null,documentsTimer=null;

function moneyUnit(){return localStorage.getItem('nikara-money-unit')||'IRT';}
function setMoneyUnit(unit){localStorage.setItem('nikara-money-unit',unit==='IRR'?'IRR':'IRT');toast(`واحد نمایش مالی: ${unit==='IRR'?'ریال':'تومان'}`);loadDashboard();if(!$('#finance')?.classList.contains('hidden'))loadFinance();}
function moneyInputToRial(v){const n=Math.max(0,Number(latinDigits(v).replace(/,/g,'')||0));return moneyUnit()==='IRT'?Math.round(n*10):Math.round(n);}
function moneyFmt(rial){const n=Number(rial||0);return `${nfmt(moneyUnit()==='IRT'?n/10:n)} ${moneyUnit()==='IRT'?'تومان':'ریال'}`;}
function financeKindLabel(k){return ({sales_invoice:'طلب / فاکتور فروش',receipt:'دریافت از مشتری',purchase_invoice:'بدهی / فاکتور خرید',payment:'پرداخت به طرف',receivable_adjustment:'اصلاح طلب',payable_adjustment:'اصلاح بدهی'})[k]||k;}
function financeEffectLocal(e){
  const a=Number(e.amount_rial||0),sign=Number(e.adjustment_sign||1)<0?-1:1;
  if(e.kind==='sales_invoice')return {r:a,p:0};if(e.kind==='receipt')return {r:-a,p:0};
  if(e.kind==='purchase_invoice')return {r:0,p:a};if(e.kind==='payment')return {r:0,p:-a};
  if(e.kind==='receivable_adjustment')return {r:a*sign,p:0};if(e.kind==='payable_adjustment')return {r:0,p:a*sign};
  return {r:0,p:0};
}
function financeSummaryLocal(rows=[]){
  const outstanding=inv=>{if(!['sales_invoice','purchase_invoice'].includes(inv.kind))return 0;const settlement=inv.kind==='sales_invoice'?'receipt':'payment';const paid=rows.filter(e=>e.kind===settlement&&e.reference_entry_id===inv.id).reduce((s,e)=>s+Math.max(0,Number(e.amount_rial||0)),0);return Math.max(0,Number(inv.amount_rial||0)-paid)};
  let rBase=0,pBase=0;
  for(const e of rows){const a=Math.max(0,Number(e.amount_rial||0)),sign=Number(e.adjustment_sign||1)<0?-1:1;if(e.kind==='sales_invoice')rBase+=outstanding(e);else if(e.kind==='purchase_invoice')pBase+=outstanding(e);else if(e.kind==='receivable_adjustment')rBase+=a*sign;else if(e.kind==='payable_adjustment')pBase+=a*sign;else if(e.kind==='receipt'&&!e.reference_entry_id)pBase+=a;else if(e.kind==='payment'&&!e.reference_entry_id)rBase+=a;}
  const r=Math.max(0,rBase)+Math.max(0,-pBase),p=Math.max(0,pBase)+Math.max(0,-rBase);return {receivable_rial:r,payable_rial:p,net_rial:r-p};
}
function financeStatusClass(n){return n>0?'bad':n<0?'ok':'';}
function financeSummaryPanel(summary={},entries=[],scope='',id=''){
  const r=Number(summary.receivable_rial||0),p=Number(summary.payable_rial||0);
  const addAction=scope==='project'?`openFinanceEntry('','sales_invoice','${id}')`:`openFinanceEntry('${scope}:${id}')`;
  return `<div class="panel finance-party-panel">
    <div class="panel-head"><div><h3>حساب طرف</h3><div class="muted">مانده عملیاتی؛ جایگزین حسابداری رسمی نیست.</div></div><button class="btn primary" onclick="${addAction}">+ تراکنش</button></div>
    <div class="finance-mini-stats"><div><span>طلب از طرف</span><b>${moneyFmt(r)}</b></div><div><span>بدهی به طرف</span><b>${moneyFmt(p)}</b></div><div><span>خالص</span><b>${moneyFmt(r-p)}</b></div></div>
    <div class="finance-mini-list">${(entries||[]).slice(0,5).map(financeEntryRow).join('')||'<div class="empty">تراکنش مالی ثبت نشده است.</div>'}</div>
  </div>`;
}

const documentCategoryFa={
  national_id:'کارت ملی / هویتی',company_registration:'روزنامه رسمی / ثبت شرکت',economic:'کد اقتصادی / مالیاتی',
  license:'مجوز / پروانه',commercial_card:'کارت بازرگانی',contract:'قرارداد / توافق',guarantee:'چک / ضمانت',
  proforma:'پروفرما / پیش‌فاکتور',invoice:'فاکتور',packing_list:'Packing List',bill_of_lading:'بارنامه',
  certificate_origin:'گواهی مبدأ',customs:'مدارک گمرکی / ترخیص',medical_license:'مجوز پزشکی / دارویی',
  prescription:'نسخه / دستور پزشکی',insurance:'بیمه‌نامه',bank:'مدرک بانکی',other:'سایر'
};
const documentStatusFa={required:'دریافت نشده',received:'دریافت شده',verified:'تأیید شده',expired:'منقضی',rejected:'رد شده'};
function documentCategoryOptions(selected='other'){return Object.entries(documentCategoryFa).map(([k,v])=>`<option value="${k}" ${k===selected?'selected':''}>${v}</option>`).join('');}
function documentStatusLabel(s){return documentStatusFa[s]||s;}
function documentStatusClass(s){return s==='verified'?'ok':s==='received'?'warn':s==='required'||s==='expired'||s==='rejected'?'bad':'';}
function renderDocumentChecklistPanel(rows=[],scope,id){
  const missing=rows.filter(d=>(d.effective_status||d.status)==='required').length;
  const expiring=rows.filter(d=>d.expiry_date&&['received','verified'].includes(d.status)&&new Date(d.expiry_date+'T23:59:59')>=new Date()&&new Date(d.expiry_date+'T23:59:59')<=new Date(Date.now()+30*86400000)).length;
  return `<div class="panel checklist-panel"><div class="panel-head"><div><h3>مدارک پرونده</h3><div class="muted">${nfmt(missing)} مورد دریافت‌نشده · ${nfmt(expiring)} مورد نزدیک انقضا</div></div><button class="btn" onclick="openDocumentCheck('${scope}','${id}')">+ مدرک</button></div><div class="doc-check-mini">${rows.slice(0,6).map(documentCheckRow).join('')||'<div class="empty">چک‌لیست مدرکی ثبت نشده است.</div>'}</div></div>`;
}

function meetingTargetLink(m){
  if(m.project_id)return `<button class="link" onclick="openProject('${m.project_id}')">پروژه</button>`;
  if(m.contact_id)return `<button class="link" onclick="openContact('${m.contact_id}')">شخص</button>`;
  if(m.organization_id)return `<button class="link" onclick="openOrganization('${m.organization_id}')">شرکت</button>`;
  return '';
}
function meetingRow(m){
  const past=m.start_at&&new Date(m.start_at)<new Date();
  return `<div class="meeting-row ${m.status!=='planned'?'done':''}"><div class="meeting-time"><b>${dateFmt(m.start_at)}</b><small>${m.location?esc(m.location):'بدون محل'}</small></div><div class="meeting-main"><b>${esc(m.title)}</b><div class="muted">${m.notes?esc(m.notes):' '}</div></div><div class="actions">${meetingTargetLink(m)}${m.status==='planned'?`<button class="btn" onclick="openMeeting('', '${m.id}')">ویرایش</button><button class="btn success" onclick="doneMeeting('${m.id}')">انجام شد</button>`:''}</div></div>`;
}
function renderMeetingsPanel(rows=[],defaultTarget=''){
  const planned=rows.filter(m=>m.status==='planned').sort((a,b)=>new Date(a.start_at)-new Date(b.start_at));
  return `<div class="panel meetings-panel"><div class="panel-head"><div><h3>جلسات</h3><div class="muted">${nfmt(planned.length)} جلسه برنامه‌ریزی‌شده</div></div><button class="btn" onclick="openMeeting('${defaultTarget}')">+ جلسه</button></div><div>${planned.slice(0,5).map(meetingRow).join('')||'<div class="empty">جلسه آینده‌ای ثبت نشده است.</div>'}</div></div>`;
}

async function meetingTargetOptions(selected=''){
  const [orgs,people,projects]=await Promise.all([api('/api/organizations?limit=1000'),api('/api/contacts?limit=2000'),api('/api/projects?limit=2000')]);
  return ['<option value="">بدون اتصال</option>',...projects.map(p=>`<option value="project:${p.id}" ${selected===`project:${p.id}`?'selected':''}>◆ ${esc(p.title)}</option>`),...orgs.map(o=>`<option value="org:${o.id}" ${selected===`org:${o.id}`?'selected':''}>🏢 ${esc(o.name)}</option>`),...people.map(c=>`<option value="person:${c.id}" ${selected===`person:${c.id}`?'selected':''}>👤 ${esc(c.name)}${c.company?' — '+esc(c.company):''}</option>`)].join('');
}
async function openMeeting(defaultTarget='',meetingId=''){
  const existing=meetingId?(await api('/api/meetings')).find(x=>x.id===meetingId):null;
  const selected=existing?.project_id?`project:${existing.project_id}`:existing?.organization_id?`org:${existing.organization_id}`:existing?.contact_id?`person:${existing.contact_id}`:defaultTarget;
  const targets=await meetingTargetOptions(selected);
  const defaultStart=new Date(Date.now()+30*60000),defaultEnd=new Date(defaultStart.getTime()+60*60000);
  $('#modalTitle').textContent=existing?'ویرایش جلسه':'جلسه جدید';
  $('#modalBody').innerHTML=`<div class="panel meeting-form">
    <label>عنوان جلسه<input id="mTitle" value="${esc(existing?.title||'')}" placeholder="مثلاً جلسه بررسی قرارداد"></label>
    <label>برای<select id="mTarget">${targets}</select></label>
    <div class="two-col"><label>شروع (شمسی)${jalaliDateTimeField('mStart',existing?.start_at||defaultStart)}</label><label>پایان (شمسی)${jalaliDateTimeField('mEnd',existing?.end_at||defaultEnd)}</label></div>
    <div class="two-col"><label>یادآوری قبل<select id="mReminder"><option value="10" ${existing?.reminder_minutes===10?'selected':''}>۱۰ دقیقه</option><option value="30" ${existing?.reminder_minutes===30?'selected':''}>۳۰ دقیقه</option><option value="60" ${!existing||existing?.reminder_minutes===60?'selected':''}>۱ ساعت</option><option value="120" ${existing?.reminder_minutes===120?'selected':''}>۲ ساعت</option><option value="1440" ${existing?.reminder_minutes===1440?'selected':''}>۱ روز</option></select></label><label>محل / لینک<input id="mLocation" value="${esc(existing?.location||'')}" placeholder="دفتر، بیمارستان، آنلاین..."></label></div>
    <label>یادداشت<textarea id="mNotes">${esc(existing?.notes||'')}</textarea></label>
    <div class="actions"><button class="btn primary" onclick="saveMeeting('${meetingId}')">${existing?'ذخیره تغییرات':'ثبت جلسه'}</button>${existing?`<button class="btn danger" onclick="deleteMeeting('${meetingId}')">حذف</button>`:''}</div>
  </div>`;
  openModal();
}
async function saveMeeting(id=''){
  try{
    const target=$('#mTarget').value,isOrg=target.startsWith('org:'),isPerson=target.startsWith('person:'),isProject=target.startsWith('project:');
    const start=readJalaliDateTime('mStart'),end=readJalaliDateTime('mEnd');
    if(!start)return toast('تاریخ و ساعت شروع جلسه را وارد کن','error');
    if(end&&new Date(end)<=new Date(start))return toast('زمان پایان جلسه باید بعد از شروع باشد','error');
    const body={title:$('#mTitle').value||'جلسه',start_at:start,end_at:end,reminder_minutes:Number($('#mReminder').value||60),location:$('#mLocation').value,notes:$('#mNotes').value,project_id:isProject?target.slice(8):null,organization_id:isOrg?target.slice(4):null,contact_id:isPerson?target.slice(7):null};
    const meeting=await api(id?`/api/meetings/${id}`:'/api/meetings',{method:id?'PATCH':'POST',body});
    closeModal();toast(id?'جلسه به‌روزرسانی شد':'جلسه ثبت شد','success');
    if(NATIVE)await scheduleEntityReminder('meeting',meeting,{firstCreation:!id});
    await loadCalendar();await loadDashboard();await syncCallerIdContacts();
  }catch(e){toast(e.message||'ثبت جلسه انجام نشد','error')}
}
async function doneMeeting(id){await api(`/api/meetings/${id}/done`,{method:'PATCH'});if(NATIVE)await cancelNativeNotification(notificationIdForRecord('meeting',id));toast('جلسه انجام‌شده ثبت شد','success');await loadCalendar();await loadDashboard();await syncCallerIdContacts();}
async function deleteMeeting(id){if(!await askConfirm('جلسه حذف شود؟',{title:'حذف جلسه'}))return;await api(`/api/meetings/${id}`,{method:'DELETE'});if(NATIVE)await cancelNativeNotification(notificationIdForRecord('meeting',id));closeModal();toast('جلسه حذف شد','success');await loadCalendar();await loadDashboard();await syncCallerIdContacts();}

function calendarEventChip(item){
  const cls={meeting:'meeting',task:'task',reminder:'reminder',receivable:'money-in',payable:'money-out',document:'document'}[item.type]||'';
  return `<button class="calendar-chip ${cls}" title="${esc(item.title)}" onclick="${item.onclick}">${item.icon} ${esc(item.title)}</button>`;
}
function changeCalendarMonth(delta){
  let y=calendarCursor.jy,m=calendarCursor.jm+delta;
  if(m<1){m=12;y--}if(m>12){m=1;y++}
  calendarCursor={jy:y,jm:m,jd:1};loadCalendar();
}
function goCalendarToday(){calendarCursor=jalaliParts(new Date())||calendarCursor;loadCalendar();}
async function loadCalendar(){
  const host=$('#persianCalendar');if(!host)return;
  try{
    await loadCalendarInner();
  }catch(e){ console.warn('calendar load failed',e); const fail=errorState('calendar'); for(const id of ['meetingList','reminderList','calendarAgenda']){const el=$('#'+id);if(el)el.innerHTML=fail;} }
}
async function loadCalendarInner(){
  const host=$('#persianCalendar');if(!host)return;
  const [meetings,tasks,reminders,finance,docs]=await Promise.all([api('/api/meetings'),api('/api/tasks?open_only=false'),api('/api/reminders'),api('/api/finance'),api('/api/document-checks')]);
  const y=calendarCursor.jy,m=calendarCursor.jm,days=jalaliMonthDays(y,m),g=jalaliToGregorian(y,m,1);
  const offset=(new Date(g.gy,g.gm-1,g.gd).getDay()+1)%7;
  $('#calendarTitle').textContent=`${JALALI_MONTHS[m-1]} ${faDigits(y)}`;
  $('#calendarToday').textContent=`امروز: ${dateOnlyFmt(new Date())}`;
  const items=new Map(); const add=(key,item)=>{if(!key)return;if(!items.has(key))items.set(key,[]);items.get(key).push(item);};
  const keyFor=v=>{const p=jalaliParts(v);return p?`${p.jy}/${p.jm}/${p.jd}`:''};
  for(const x of meetings.filter(x=>x.status==='planned'))add(keyFor(x.start_at),{type:'meeting',icon:'●',title:x.title,sort:new Date(x.start_at).getTime(),onclick:`openMeeting('', '${x.id}')`});
  for(const t of tasks.filter(t=>!t.done&&t.due_at))add(keyFor(t.due_at),{type:'task',icon:'✓',title:t.title,sort:new Date(t.due_at).getTime(),onclick:t.project_id?`openProject('${t.project_id}')`:t.contact_id?`openContact('${t.contact_id}')`:t.organization_id?`openOrganization('${t.organization_id}')`:`switchTab('tasks')`});
  for(const r of reminders.filter(x=>x.status==='active'&&x.remind_at))add(keyFor(r.remind_at),{type:'reminder',icon:'◉',title:r.title,sort:new Date(r.remind_at).getTime(),onclick:`openReminder('${r.id}')`});
  for(const f of finance.filter(x=>['sales_invoice','purchase_invoice'].includes(x.kind)&&x.due_date&&Number(x.outstanding_rial||0)>0))add(keyFor(f.due_date),{type:f.kind==='sales_invoice'?'receivable':'payable',icon:f.kind==='sales_invoice'?'↑':'↓',title:`${f.kind==='sales_invoice'?'طلب':'بدهی'} ${moneyFmt(f.outstanding_rial)}`,sort:new Date(f.due_date+'T12:00:00').getTime(),onclick:`switchTab('finance')`});
  for(const d of docs.filter(x=>x.expiry_date&&['received','verified'].includes(x.status)))add(keyFor(d.expiry_date),{type:'document',icon:'▤',title:`انقضا: ${d.title}`,sort:new Date(d.expiry_date+'T12:00:00').getTime(),onclick:`switchTab('documents')`});
  let cells=WEEKDAYS_FA.map(w=>`<div class="calendar-weekday">${w}</div>`).join('');
  for(let i=0;i<offset;i++)cells+='<div class="calendar-day empty-day"></div>';
  const today=jalaliParts(new Date());
  for(let d=1;d<=days;d++){
    const key=`${y}/${m}/${d}`,dayItems=(items.get(key)||[]).sort((a,b)=>a.sort-b.sort),isToday=today&&today.jy===y&&today.jm===m&&today.jd===d;
    cells+=`<div class="calendar-day ${isToday?'today':''}"><div class="calendar-number">${faDigits(d)}</div><div class="calendar-day-items">${dayItems.slice(0,4).map(calendarEventChip).join('')}${dayItems.length>4?`<small>+${faDigits(dayItems.length-4)} مورد</small>`:''}</div></div>`;
  }
  host.innerHTML=cells;
  const upcoming=meetings.filter(x=>x.status==='planned'&&x.start_at&&new Date(x.start_at)>=new Date()).sort((a,b)=>new Date(a.start_at)-new Date(b.start_at)).slice(0,8);
  $('#meetingList').innerHTML=upcoming.map(meetingRow).join('')||emptyState('▦','جلسه آینده‌ای ثبت نشده است.',`<button class="btn" type="button" onclick="openMeeting()">+ جلسه</button>`);
  if($('#reminderList'))$('#reminderList').innerHTML=reminders.map(reminderRow).join('')||emptyState('◉','یادآوری مستقلی ثبت نشده است.',`<button class="btn" type="button" onclick="openReminder()">+ یادآوری</button>`);
  const agenda=[];
  for(const [key,arr] of items)for(const x of arr){if(x.sort>=Date.now()-86400000)agenda.push(x)}
  agenda.sort((a,b)=>a.sort-b.sort);
  $('#calendarAgenda').innerHTML=agenda.slice(0,12).map(x=>`<div class="agenda-row"><span>${x.icon}</span><div><b>${esc(x.title)}</b><small>${dateFmt(new Date(x.sort))}</small></div><button class="link" onclick="${x.onclick}">باز کردن</button></div>`).join('')||emptyState('◷','مورد نزدیکی در پیش رو نیست.');
}
loaderRegistry.calendar=loadCalendar;

function reminderTargetLink(reminder){
  if(reminder.project_id)return `<button class="link" onclick="openProject('${reminder.project_id}')">پروژه</button>`;
  if(reminder.contact_id)return `<button class="link" onclick="openContact('${reminder.contact_id}')">شخص</button>`;
  if(reminder.organization_id)return `<button class="link" onclick="openOrganization('${reminder.organization_id}')">شرکت</button>`;
  return '';
}
function reminderRow(reminder){
  const past=reminder.remind_at&&new Date(reminder.remind_at)<new Date();
  return `<div class="reminder-row ${past?'overdue-reminder':''}"><div class="reminder-marker">◉</div><div class="reminder-main"><b>${esc(reminder.title)}</b><small>${dateFmt(reminder.remind_at)}${reminder.body?' · '+esc(reminder.body):''}</small></div><div class="actions">${reminderTargetLink(reminder)}<button class="btn" onclick="openReminder('${reminder.id}')">ویرایش</button><button class="btn success" onclick="doneReminder('${reminder.id}',${Number(reminder.notification_id)||0})">انجام شد</button></div></div>`;
}
async function loadReminders(){
  try{
    const reminders=await api('/api/reminders');
    const content=reminders.map(reminderRow).join('')||emptyState('◉','یادآوری مستقلی ثبت نشده است.',`<button class="btn" type="button" onclick="openReminder()">+ یادآوری</button>`);
    if($('#reminderList'))$('#reminderList').innerHTML=content;
    if($('#taskReminderList'))$('#taskReminderList').innerHTML=content;
    return reminders;
  }catch(e){ console.warn('reminders load failed',e); const fail=errorState('reminders'); if($('#reminderList'))$('#reminderList').innerHTML=fail; if($('#taskReminderList'))$('#taskReminderList').innerHTML=fail; return []; }
}
loaderRegistry.reminders=loadReminders;
async function openReminder(reminderId=''){
  const existing=reminderId?(await api('/api/reminders?include_completed=true')).find(x=>x.id===reminderId):null;
  if(reminderId&&!existing)return toast('این یادآوری دیگر وجود ندارد');
  const selected=existing?.project_id?`project:${existing.project_id}`:existing?.organization_id?`org:${existing.organization_id}`:existing?.contact_id?`person:${existing.contact_id}`:'';
  const targets=await meetingTargetOptions(selected);
  const defaultTime=new Date(Date.now()+60*60000);
  $('#modalTitle').textContent=existing?'ویرایش یادآوری مستقل':'یادآوری مستقل جدید';
  $('#modalBody').innerHTML=`<div class="panel reminder-form"><label>عنوان *<input id="rTitle" value="${esc(existing?.title||'')}" placeholder="مثلاً تمدید قرارداد یا تماس مهم" required></label><label>اتصال اختیاری<select id="rTarget">${targets}</select></label><label>زمان یادآوری (شمسی)${jalaliDateTimeField('rAt',existing?.remind_at||defaultTime)}</label><label>توضیح<textarea id="rBody" placeholder="جزئیات کوتاه اعلان">${esc(existing?.body||'')}</textarea></label><div class="actions"><button class="btn primary" onclick="saveReminder('${reminderId}')">${existing?'ذخیره و زمان‌بندی مجدد':'ثبت و زمان‌بندی'}</button>${existing?`<button class="btn danger" onclick="deleteReminder('${reminderId}',${Number(existing.notification_id)||0})">حذف</button>`:''}</div><p class="muted">در APK، اعلان بلافاصله پس از ذخیره در کانال اختصاصی Reminder زمان‌بندی می‌شود.</p></div>`;
  openModal();
}
async function saveReminder(id=''){
  try{
    const title=$('#rTitle')?.value?.trim();if(!title)return toast('عنوان یادآوری را وارد کن','error');
    const remindAt=readJalaliDateTime('rAt');if(!remindAt)return toast('تاریخ و ساعت یادآوری را وارد کن','error');
    if(new Date(remindAt).getTime()<=Date.now())return toast('زمان یادآوری باید در آینده باشد','error');
    const target=$('#rTarget')?.value||'',isOrg=target.startsWith('org:'),isPerson=target.startsWith('person:'),isProject=target.startsWith('project:');
    const reminder=await api(id?`/api/reminders/${id}`:'/api/reminders',{method:id?'PATCH':'POST',body:{title,body:$('#rBody')?.value||'',remind_at:remindAt,status:'active',project_id:isProject?target.slice(8):null,organization_id:isOrg?target.slice(4):null,contact_id:isPerson?target.slice(7):null}});
    closeModal();
    const scheduled=NATIVE?await scheduleIndependentReminder(reminder,{firstCreation:!id}):false;
    toast(NATIVE?(scheduled?'یادآوری ذخیره و همان لحظه زمان‌بندی شد':'یادآوری ذخیره شد؛ دسترسی اعلان یا Exact Alarm را کامل کن'):'یادآوری در نسخه آفلاین ذخیره شد',scheduled===false?'error':'success');
    await loadReminders();if($('#persianCalendar'))await loadCalendar();
  }catch(error){toast(error?.message||'ثبت یادآوری انجام نشد','error')}
}
async function doneReminder(id,notificationId=0){
  await api(`/api/reminders/${id}/done`,{method:'PATCH'});if(NATIVE)await cancelNativeNotification(notificationId);
  toast('یادآوری انجام‌شده ثبت شد','success');await loadReminders();if($('#persianCalendar'))await loadCalendar();
}
async function deleteReminder(id,notificationId=0){
  if(!await askConfirm('این یادآوری حذف شود؟',{title:'حذف یادآوری'}))return;
  await api(`/api/reminders/${id}`,{method:'DELETE'});if(NATIVE)await cancelNativeNotification(notificationId);
  closeModal();toast('یادآوری حذف شد','success');await loadReminders();if($('#persianCalendar'))await loadCalendar();
}

function financeEntryRow(e,partyName=''){
  const fx=financeEffectLocal(e),isIn=fx.r>0||fx.p<0,amount=moneyFmt(e.amount_rial);
  const outstanding=['sales_invoice','purchase_invoice'].includes(e.kind)&&e.outstanding_rial!=null?` · مانده ${moneyFmt(e.outstanding_rial)}`:'';
  return `<div class="finance-entry"><div class="finance-entry-icon ${isIn?'in':'out'}">${isIn?'↑':'↓'}</div><div class="finance-entry-main"><b>${financeKindLabel(e.kind)}</b>${partyName?`<div class="muted">${esc(partyName)}</div>`:''}<div class="muted">${dateOnlyFmt(e.posting_date)}${e.reference_no?' · '+esc(e.reference_no):''}${outstanding}</div>${e.note?`<small>${esc(e.note)}</small>`:''}</div><div class="finance-amount"><b>${amount}</b>${e.due_date?`<small>سررسید ${dateOnlyFmt(e.due_date)}</small>`:''}</div><button class="icon-btn danger-text" onclick="deleteFinanceEntry('${e.id}')">×</button></div>`;
}
function debouncedFinance(){clearTimeout(financeTimer);financeTimer=setTimeout(loadFinance,180);}
function financeAgeingHtml(summary={}){
  const r=summary.receivable_ageing||{},p=summary.payable_ageing||{};
  const buckets=[['سررسیدنشده','not_due'],['۰ تا ۳۰ روز','d0_30'],['۳۱ تا ۶۰ روز','d31_60'],['۶۱ تا ۹۰ روز','d61_90'],['بیش از ۹۰ روز','d90_plus']];
  return `<div class="panel-head"><div><h3>سن بدهی و مطالبات</h3><div class="muted">مانده فاکتورها بر اساس فاصله از سررسید</div></div></div><div class="ageing-table"><div class="ageing-head"><b>بازه</b><b>طلب</b><b>بدهی</b></div>${buckets.map(([label,key])=>`<div class="ageing-row"><span>${label}</span><b>${moneyFmt(r[key]||0)}</b><b>${moneyFmt(p[key]||0)}</b></div>`).join('')}</div>`;
}
async function loadFinance(){
  try{ await loadFinanceInner(); }catch(e){ console.warn('finance load failed',e); const fail=errorState('finance'); const el=$('#financeList');if(el)el.innerHTML=fail; const bal=$('#partyBalanceList');if(bal)bal.innerHTML=fail; }
}
loaderRegistry.finance=loadFinance;
async function loadFinanceInner(){
  const [rows,summary,orgs,people]=await Promise.all([api('/api/finance'),api('/api/finance/summary'),api('/api/organizations?limit=2000'),api('/api/contacts?limit=4000')]);
  const names=new Map([...orgs.map(o=>[`organization:${o.id}`,o.name]),...people.map(c=>[`contact:${c.id}`,c.name+(c.company?` — ${c.company}`:'')])]);
  let filtered=rows,kind=$('#financeKindFilter')?.value||'',q=($('#financeSearch')?.value||'').trim().toLowerCase();
  if(kind)filtered=filtered.filter(x=>x.kind===kind);
  if(q)filtered=filtered.filter(x=>`${names.get(`${x.party_type}:${x.party_id}`)||''} ${x.reference_no||''} ${x.note||''}`.toLowerCase().includes(q));
  $('#financeStats').innerHTML=[
    ['طلب فعلی',moneyFmt(summary.receivable_rial),'↑'],['بدهی فعلی',moneyFmt(summary.payable_rial),'↓'],
    ['طلب معوق',moneyFmt(summary.overdue_receivable_rial),'!'],['بدهی معوق',moneyFmt(summary.overdue_payable_rial),'!']
  ].map(([a,b,c])=>`<div class="panel stat"><span class="muted">${c} ${a}</span><b>${b}</b></div>`).join('');
  if($('#financeAgeing'))$('#financeAgeing').innerHTML=financeAgeingHtml(summary);
  $('#financeList').innerHTML=filtered.map(e=>financeEntryRow(e,names.get(`${e.party_type}:${e.party_id}`)||'طرف نامشخص')).join('')||emptyState('﷼','تراکنشی مطابق فیلتر پیدا نشد.',`<button class="btn" type="button" onclick="openFinanceEntry()">ثبت تراکنش</button>`);
  const groups=new Map();
  for(const e of rows){const k=`${e.party_type}:${e.party_id}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e)}
  const balances=[...groups.entries()].map(([k,es])=>({key:k,name:names.get(k)||'طرف نامشخص',...financeSummaryLocal(es)})).filter(x=>x.receivable_rial||x.payable_rial).sort((a,b)=>Math.abs(b.net_rial)-Math.abs(a.net_rial));
  $('#partyBalanceList').innerHTML=balances.map(x=>`<button class="party-balance" onclick="${x.key.startsWith('organization:')?`openOrganization('${x.key.slice(13)}')`:`openContact('${x.key.slice(8)}')`}"><div><b>${esc(x.name)}</b><small>طلب ${moneyFmt(x.receivable_rial)} · بدهی ${moneyFmt(x.payable_rial)}</small></div><strong class="${financeStatusClass(x.net_rial)}">${x.net_rial>=0?'طلب خالص':'بدهی خالص'} ${moneyFmt(Math.abs(x.net_rial))}</strong></button>`).join('')||'<div class="empty">مانده‌ای ثبت نشده است.</div>';
}
async function financeTargetOptions(selected='',selectedProject=''){
  const [orgs,people,projects]=await Promise.all([api('/api/organizations?limit=2000'),api('/api/contacts?limit=4000'),api('/api/projects?limit=2000')]);
  const party=['<option value="">طرف حساب را انتخاب کن</option>',...orgs.map(o=>`<option value="organization:${o.id}" ${selected===`organization:${o.id}`?'selected':''}>🏢 ${esc(o.name)}</option>`),...people.map(c=>`<option value="contact:${c.id}" ${selected===`contact:${c.id}`?'selected':''}>👤 ${esc(c.name)}${c.company?' — '+esc(c.company):''}</option>`)].join('');
  const project='<option value="">بدون پروژه</option>'+projects.map(p=>`<option value="${p.id}" ${selectedProject===p.id?'selected':''}>◆ ${esc(p.title)}</option>`).join('');
  return {party,project};
}
async function openFinanceEntry(defaultTarget='',defaultKind='sales_invoice',defaultProject=''){
  const opts=await financeTargetOptions(defaultTarget,defaultProject);
  $('#modalTitle').textContent='ثبت تراکنش مالی';
  $('#modalBody').innerHTML=`<div class="panel finance-form">
    <label>طرف حساب<select id="fParty" onchange="refreshFinanceReferenceOptions()">${opts.party}</select></label>
    <div class="two-col"><label>نوع تراکنش<select id="fKind" onchange="refreshFinanceReferenceOptions()"><option value="sales_invoice" ${defaultKind==='sales_invoice'?'selected':''}>طلب / فاکتور فروش</option><option value="receipt">دریافت از مشتری</option><option value="purchase_invoice">بدهی / فاکتور خرید</option><option value="payment">پرداخت به طرف</option><option value="receivable_adjustment">اصلاح طلب</option><option value="payable_adjustment">اصلاح بدهی</option></select></label><label>پروژه<select id="fProject">${opts.project}</select></label></div>
    <div class="two-col"><label>مبلغ (${moneyUnit()==='IRT'?'تومان':'ریال'})<input id="fAmount" inputmode="numeric" type="number" min="0"></label><label id="fAdjustSignWrap" class="hidden">اثر اصلاح<select id="fAdjustSign"><option value="1">افزایش مانده</option><option value="-1">کاهش مانده</option></select></label></div>
    <div class="two-col"><label>تاریخ ثبت (شمسی)${jalaliDateField('fPosting',new Date())}</label><label>سررسید (شمسی)${jalaliDateField('fDue')}</label></div>
    <div class="two-col"><label>شماره مرجع<input id="fRefNo" placeholder="شماره فاکتور، رسید، چک..."></label><label id="fReferenceWrap" class="hidden">تخصیص به فاکتور<select id="fReference"><option value="">بدون تخصیص</option></select></label></div>
    <label>یادداشت<textarea id="fNote"></textarea></label>
    <div class="finance-help">برای گزارش مانده دقیق، دریافت/پرداخت را در صورت امکان به فاکتور مربوط تخصیص بده.</div>
    <button class="btn primary wide" onclick="createFinanceEntry()">ثبت در دفتر حساب</button>
  </div>`;
  openModal();await refreshFinanceReferenceOptions();
}
async function refreshFinanceReferenceOptions(){
  const kind=$('#fKind')?.value||'',party=$('#fParty')?.value||'',wrap=$('#fReferenceWrap'),adj=$('#fAdjustSignWrap');
  adj?.classList.toggle('hidden',!kind.includes('adjustment'));
  const settlement=kind==='receipt'||kind==='payment';wrap?.classList.toggle('hidden',!settlement);
  if(!settlement||!party||!$('#fReference'))return;
  const [pt,pid]=party.split(':');const rows=await api(`/api/finance?party_type=${pt}&party_id=${pid}`);
  const invoiceKind=kind==='receipt'?'sales_invoice':'purchase_invoice';
  const options=rows.filter(x=>x.kind===invoiceKind&&Number(x.outstanding_rial||0)>0).map(x=>`<option value="${x.id}">${esc(x.reference_no||financeKindLabel(x.kind))} — مانده ${moneyFmt(x.outstanding_rial)} — ${dateOnlyFmt(x.posting_date)}</option>`).join('');
  $('#fReference').innerHTML='<option value="">بدون تخصیص / علی‌الحساب</option>'+options;
}
async function createFinanceEntry(){
  try{
    const target=$('#fParty').value;if(!target)return toast('طرف حساب را انتخاب کن','error');const [party_type,party_id]=target.split(':');
    const kind=$('#fKind').value,amount_rial=moneyInputToRial($('#fAmount').value);if(amount_rial<=0)return toast('مبلغ را وارد کن','error');
    const entry=await api('/api/finance',{method:'POST',body:{party_type,party_id,project_id:$('#fProject').value||null,kind,amount_rial,adjustment_sign:Number($('#fAdjustSign').value||1),posting_date:readJalaliDate('fPosting')||new Date().toISOString().slice(0,10),due_date:readJalaliDate('fDue'),reference_no:$('#fRefNo').value,reference_entry_id:$('#fReference')?.value||null,note:$('#fNote').value}});
    closeModal();toast('تراکنش مالی ثبت شد','success');await loadFinance();await loadDashboard();await syncCallerIdContacts();
  }catch(e){toast(e.message||'ثبت مالی انجام نشد','error')}
}
async function deleteFinanceEntry(id){if(!await askConfirm('این تراکنش مالی حذف شود؟',{title:'حذف تراکنش'}))return;try{await api(`/api/finance/${id}`,{method:'DELETE'});toast('تراکنش حذف شد','success');loadFinance();loadDashboard();syncCallerIdContacts().catch(()=>{})}catch(e){toast(e.message,'error')}}

function debouncedDocuments(){clearTimeout(documentsTimer);documentsTimer=setTimeout(loadDocuments,180);}
function documentCheckRow(d,targetName=''){
  const st=d.effective_status||d.status;
  return `<div class="document-check-row"><div class="document-status ${documentStatusClass(st)}">${st==='verified'?'✓':st==='received'?'●':st==='expired'?'!':st==='rejected'?'×':'○'}</div><div class="document-check-main"><b>${esc(d.title)}</b>${targetName?`<div class="muted">${esc(targetName)}</div>`:''}<div class="muted">${documentCategoryFa[d.category]||esc(d.category)}${d.document_no?' · '+esc(d.document_no):''}${d.expiry_date?' · انقضا '+dateOnlyFmt(d.expiry_date):''}</div></div><span class="badge ${documentStatusClass(st)}">${documentStatusLabel(st)}</span>${d.attachment_id?`<button class="btn" onclick="openAttachment('${d.attachment_id}')">فایل</button>`:''}<button class="btn" onclick="openDocumentCheck('${d.scope_type}','${d.scope_id}','${d.id}')">ویرایش</button><button class="icon-btn danger-text" onclick="deleteDocumentCheck('${d.id}')">×</button></div>`;
}
async function loadDocuments(){
  loadFiles();
  try{ await loadDocumentsInner(); }catch(e){ console.warn('documents load failed',e); const el=$('#documentList');if(el)el.innerHTML=errorState('documents'); }
}
loaderRegistry.documents=loadDocuments;
async function loadDocumentsInner(){
  const [rows,orgs,people,projects]=await Promise.all([api('/api/document-checks'),api('/api/organizations?limit=2000'),api('/api/contacts?limit=4000'),api('/api/projects?limit=2000')]);
  const names=new Map([...orgs.map(o=>[`organization:${o.id}`,o.name]),...people.map(c=>[`contact:${c.id}`,c.name+(c.company?` — ${c.company}`:'')]),...projects.map(p=>[`project:${p.id}`,p.title])]);
  let filtered=rows,status=$('#documentStatusFilter')?.value||'',q=($('#documentSearch')?.value||'').trim().toLowerCase();
  if(status)filtered=filtered.filter(x=>(x.effective_status||x.status)===status);
  if(q)filtered=filtered.filter(x=>OfflineDB.matchesQuery([x.title,x.document_no,x.issuer,x.note,documentCategoryFa[x.category],names.get(`${x.scope_type}:${x.scope_id}`)],q));
  const missing=rows.filter(x=>(x.effective_status||x.status)==='required').length,expired=rows.filter(x=>(x.effective_status||x.status)==='expired').length;
  const expiring=rows.filter(x=>x.expiry_date&&['received','verified'].includes(x.status)&&new Date(x.expiry_date+'T23:59:59')>=new Date()&&new Date(x.expiry_date+'T23:59:59')<=new Date(Date.now()+30*86400000)).length;
  $('#documentStats').innerHTML=[['دریافت نشده',missing,'○'],['نزدیک انقضا',expiring,'!'],['منقضی',expired,'×'],['کل مدارک',rows.length,'▤']].map(([a,b,c])=>`<div class="panel stat"><span class="muted">${c} ${a}</span><b>${nfmt(b)}</b></div>`).join('');
  $('#documentList').innerHTML=filtered.map(d=>documentCheckRow(d,names.get(`${d.scope_type}:${d.scope_id}`)||'پرونده نامشخص')).join('')||'<div class="panel empty">مدرکی پیدا نشد.</div>';
}
const DOCUMENT_PACKS={
  corporate:{label:'شرکتی عمومی',items:[['company_registration','روزنامه رسمی / ثبت شرکت'],['economic','کد اقتصادی / مالیاتی'],['national_id','مدارک هویتی صاحب امضا'],['license','مجوز فعالیت'],['contract','قرارداد / توافق']]},
  trade:{label:'بازرگانی / واردات / ترخیص',items:[['commercial_card','کارت بازرگانی'],['proforma','پروفرما / پیش‌فاکتور'],['packing_list','Packing List'],['bill_of_lading','بارنامه'],['certificate_origin','گواهی مبدأ'],['customs','مدارک گمرکی / ترخیص']]},
  medical:{label:'پزشکی / دارویی',items:[['medical_license','مجوز پزشکی / دارویی'],['license','پروانه فعالیت'],['economic','مدارک مالیاتی'],['insurance','بیمه‌نامه / قرارداد بیمه'],['contract','قرارداد همکاری']]},
  supplier:{label:'تأمین‌کننده / خدمات',items:[['company_registration','ثبت شرکت'],['economic','کد اقتصادی / مالیاتی'],['license','مجوز فعالیت'],['contract','قرارداد'],['guarantee','ضمانت / چک']]}
};
async function openDocumentTemplate(scope='',id=''){
  const targets=await documentTargetOptions(scope,id);$('#modalTitle').textContent='بسته آماده مدارک';
  $('#modalBody').innerHTML=`<div class="panel document-pack-form"><p class="muted">یک چک‌لیست آماده بساز؛ بعد هر مورد را با فایل، شماره، تاریخ دریافت و انقضا تکمیل کن.</p><label>برای<select id="dpTarget">${targets}</select></label><label>بسته<select id="dpPack">${Object.entries(DOCUMENT_PACKS).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select></label><button class="btn primary wide" onclick="applyDocumentTemplate()">ساخت چک‌لیست</button></div>`;openModal();
}
async function applyDocumentTemplate(){
  const target=$('#dpTarget')?.value||'',pack=DOCUMENT_PACKS[$('#dpPack')?.value];if(!target)return toast('پرونده مرتبط را انتخاب کن','error');if(!pack)return;
  const [scope_type,scope_id]=target.split(':');
  const existing=await api(`/api/document-checks?scope_type=${scope_type}&scope_id=${scope_id}`);const keys=new Set(existing.map(x=>`${x.category}:${x.title}`));let created=0;
  for(const [category,title] of pack.items){if(keys.has(`${category}:${title}`))continue;await api('/api/document-checks',{method:'POST',body:{scope_type,scope_id,category,title,status:'required'}});created++;}
  closeModal();toast(`${nfmt(created)} مورد به چک‌لیست مدارک اضافه شد`,'success');await loadDocuments();await loadDashboard();await syncCallerIdContacts();
}

async function documentTargetOptions(scope='',id=''){
  const [orgs,people,projects]=await Promise.all([api('/api/organizations?limit=2000'),api('/api/contacts?limit=4000'),api('/api/projects?limit=2000')]);
  const selected=scope&&id?`${scope}:${id}`:'';
  return ['<option value="">پرونده را انتخاب کن</option>',...orgs.map(o=>`<option value="organization:${o.id}" ${selected===`organization:${o.id}`?'selected':''}>🏢 ${esc(o.name)}</option>`),...people.map(c=>`<option value="contact:${c.id}" ${selected===`contact:${c.id}`?'selected':''}>👤 ${esc(c.name)}${c.company?' — '+esc(c.company):''}</option>`),...projects.map(p=>`<option value="project:${p.id}" ${selected===`project:${p.id}`?'selected':''}>◆ ${esc(p.title)}</option>`)].join('');
}
async function openDocumentCheck(scope='',id='',documentId=''){
  let existing=null;
  if(documentId){const rows=await api(`/api/document-checks?scope_type=${scope}&scope_id=${id}`);existing=rows.find(x=>x.id===documentId)||null;}
  const targets=await documentTargetOptions(scope,id);$('#modalTitle').textContent=existing?'تکمیل / ویرایش مدرک':'ثبت مدرک / چک‌لیست';
  $('#modalBody').innerHTML=`<div class="panel document-check-form">
    <label>برای<select id="dTarget" ${existing?'disabled':''}>${targets}</select></label>
    <div class="two-col"><label>نوع مدرک<select id="dCategory">${documentCategoryOptions(existing?.category||'other')}</select></label><label>عنوان<input id="dTitle" value="${esc(existing?.title||'')}" placeholder="مثلاً کارت بازرگانی مدیرعامل"></label></div>
    <div class="two-col"><label>وضعیت<select id="dStatus"><option value="required" ${existing?.status==='required'?'selected':''}>موردنیاز / هنوز نگرفته‌ام</option><option value="received" ${existing?.status==='received'?'selected':''}>دریافت شده</option><option value="verified" ${existing?.status==='verified'?'selected':''}>دریافت و تأیید شده</option><option value="rejected" ${existing?.status==='rejected'?'selected':''}>رد / ناقص</option></select></label><label>شماره مدرک<input id="dNumber" value="${esc(existing?.document_no||'')}"></label></div>
    <div class="two-col"><label>تاریخ دریافت (شمسی)${jalaliDateField('dReceived',existing?.received_date||'')}</label><label>تاریخ انقضا (شمسی)${jalaliDateField('dExpiry',existing?.expiry_date||'')}</label></div>
    <label>صادرکننده<input id="dIssuer" value="${esc(existing?.issuer||'')}" placeholder="سازمان، بانک، وزارتخانه..."></label>
    <label>فایل مدرک ${existing?.attachment_id?'(اختیاری؛ انتخاب فایل جدید جایگزین فایل فعلی می‌شود)':'(اختیاری)'}<input id="dFile" type="file" accept="image/*,.pdf,.xls,.xlsx,.xlsm,.csv"></label>
    ${existing?.attachment_id?`<button class="btn" onclick="openAttachment('${existing.attachment_id}')">مشاهده فایل فعلی</button>`:''}
    <label>یادداشت<textarea id="dNote">${esc(existing?.note||'')}</textarea></label>
    <button class="btn primary wide" onclick="saveDocumentCheck('${documentId}')">${existing?'ذخیره تغییرات':'ثبت مدرک'}</button>
  </div>`;openModal();
}
async function saveDocumentCheck(documentId=''){
  try{
    const target=$('#dTarget').value;if(!target)return toast('پرونده مرتبط را انتخاب کن','error');const [scope_type,scope_id]=target.split(':');
    const fd=new FormData();fd.append('scope_type',scope_type);fd.append('scope_id',scope_id);fd.append('title',$('#dTitle').value||documentCategoryFa[$('#dCategory').value]||'مدرک');fd.append('category',$('#dCategory').value);fd.append('status',$('#dStatus').value);fd.append('document_no',$('#dNumber').value);fd.append('received_date',readJalaliDate('dReceived')||'');fd.append('expiry_date',readJalaliDate('dExpiry')||'');fd.append('issuer',$('#dIssuer').value);fd.append('note',$('#dNote').value);const f=$('#dFile')?.files?.[0];if(f)fd.append('file',f,f.name);
    await api(documentId?`/api/document-checks/${documentId}`:'/api/document-checks',{method:documentId?'PATCH':'POST',body:fd});closeModal();toast(documentId?'مدرک به‌روزرسانی شد':'مدرک ثبت شد','success');await loadDocuments();await loadDashboard();await syncCallerIdContacts();
  }catch(e){toast(e.message||'ثبت مدرک انجام نشد','error')}
}
async function createDocumentCheck(){return saveDocumentCheck('');}
async function deleteDocumentCheck(id){if(!await askConfirm('این مورد از چک‌لیست مدارک حذف شود؟',{title:'حذف مدرک'}))return;await api(`/api/document-checks/${id}`,{method:'DELETE'});toast('مدرک حذف شد','success');await loadDocuments();await loadDashboard();await syncCallerIdContacts();}

function openMobileMore(){
  $('#modalTitle').textContent='بیشتر';
  $('#modalBody').innerHTML=`
    <div class="mobile-more-head">
      <div class="brand-mark small">N</div>
      <div><b>CRM-NIKARA</b><div class="muted">نسخه حرفه‌ای · آفلاین و خصوصی</div></div>
    </div>
    <div class="mobile-more-grid">
      <button class="more-card featured" onclick="closeModal();switchTab('calendar')">
        <span class="more-card-icon">▦</span><b>تقویم شمسی</b><small>جلسات، پیگیری‌ها و سررسیدها</small>
      </button>
      <button class="more-card" onclick="closeModal();switchTab('finance')">
        <span class="more-card-icon">﷼</span><b>حساب مشتریان</b><small>طلب، بدهی، دریافت و پرداخت</small>
      </button>
      <button class="more-card" onclick="closeModal();switchTab('documents')">
        <span class="more-card-icon">▤</span><b>مدارک</b><small>گرفته‌شده، موردنیاز و انقضا</small>
      </button>
      <button class="more-card" onclick="closeModal();switchTab('projects')">
        <span class="more-card-icon">◆</span><b>پروژه‌ها / فرصت‌ها</b><small>سفارش، فروش، واردات و پرونده‌های کاری</small>
      </button>
      <button class="more-card" onclick="closeModal();switchTab('network')">
        <span class="more-card-icon">⌘</span><b>شبکه کاری</b><small>حمل، ترخیص، پزشک و تامین‌کنندگان</small>
      </button>
      <button class="more-card" onclick="closeModal();switchTab('tasks')">
        <span class="more-card-icon">✓</span><b>پیگیری‌ها</b><small>کارها و یادآوری‌ها</small>
      </button>
      <button class="more-card" onclick="closeModal();switchTab('settings')">
        <span class="more-card-icon">⚙</span><b>تنظیمات</b><small>Caller ID، Backup و دسترسی‌ها</small>
      </button>
      <button class="more-card" onclick="closeModal();switchTab('social')">
        <span class="more-card-icon">✦</span><b>پیش‌نویس‌ها</b><small>محتوای ذخیره‌شده</small>
      </button>
    </div>
    <div class="offline-pill">● تاریخ‌ها شمسی · داده‌ها داخل همین دستگاه</div>`;
  openModal();
}

function openQuickAdd(){
  $('#modalTitle').textContent='افزودن مشتری';
  $('#modalBody').innerHTML=`<div class="choice-grid"><button class="choice-card" onclick="openNewOrganization()"><b>🏢 شرکت / سازمان</b><span>یک پرونده شرکتی بساز و چند نفر را زیر همان پرونده ثبت کن.</span></button><button class="choice-card" onclick="openNewPerson()"><b>👤 شخص</b><span>مشتری شخصی یا فردی که بعداً می‌توانی به یک شرکت وصل کنی.</span></button><button class="choice-card" onclick="openNewProject()"><b>◆ پروژه / فرصت</b><span>یک سفارش، فروش، واردات یا پرونده کاری با همه طرف‌های مرتبط بساز.</span></button></div>`;
  openModal();
}

function addOrgPersonRow(seed={}){
  const host=$('#orgPeopleRows'); if(!host) return;
  const n=++personRowSeq;
  const row=document.createElement('div'); row.className='person-editor org-person-row'; row.dataset.row=String(n);
  row.innerHTML=`<div class="person-editor-head"><b>فرد مرتبط</b><button class="icon-btn small" type="button" onclick="this.closest('.org-person-row').remove()">×</button></div><div class="two-col"><label>نام<input class="pFn" value="${esc(seed.first_name||'')}"></label><label>نام خانوادگی<input class="pLn" value="${esc(seed.last_name||'')}"></label></div><div class="two-col"><label>سمت<input class="pTitle" value="${esc(seed.job_title||'')}"></label><label>واحد / دپارتمان<input class="pDept" value="${esc(seed.department||'')}"></label></div><div class="two-col"><label>موبایل<input class="pPhone" inputmode="tel" value="${esc(seed.phone||'')}"></label><label>ایمیل<input class="pEmail" inputmode="email" value="${esc(seed.email||'')}"></label></div><div class="two-col"><label>واتساپ<input class="pWa" inputmode="tel" value="${esc(seed.whatsapp||'')}"></label><label class="checks primary-check"><input class="pPrimary" type="checkbox" ${seed.is_primary_contact?'checked':''}> رابط اصلی شرکت</label></div>`;
  host.appendChild(row);
  row.querySelector('.pPrimary')?.addEventListener('change', e => {
    if (!e.target.checked) return;
    $$('.org-person-row .pPrimary').forEach(x => { if (x !== e.target) x.checked = false; });
  });
}

function openNewOrganization(){
  personRowSeq=0;
  $('#modalTitle').textContent='شرکت / سازمان جدید';
  $('#modalBody').innerHTML=`<div class="panel"><h3>پرونده شرکت</h3><div class="two-col"><label>نام شرکت *<input id="oName" autofocus></label><label>نام حقوقی<input id="oLegal"></label></div><div class="two-col"><label>صنعت / حوزه فعالیت<input id="oIndustry"></label><label>وب‌سایت<input id="oWebsite" inputmode="url"></label></div><div class="network-field"><b>نقش در شبکه کاری</b><div class="muted">می‌تواند همزمان چند نقش داشته باشد؛ مثلاً تأمین‌کننده + حمل‌ونقل.</div>${networkTypeChecklist('oNet',['customer'])}</div><div class="two-col"><label>تلفن اصلی شرکت<input id="oPhone" inputmode="tel"></label><label>ایمیل عمومی<input id="oEmail" inputmode="email"></label></div><label>آدرس<textarea id="oAddress"></textarea></label><div class="two-col"><label>شناسه ملی / کد ثبت<input id="oNational"></label><label>ارزش فرصت فروش<input id="oDeal" type="number" min="0"></label></div><div class="two-col"><label>مرحله فروش<select id="oStatus">${stageOptions('new')}</select></label><label>منبع<input id="oSource" value="manual"></label></div><label>یادداشت شرکت<textarea id="oNotes" placeholder="نیازها، قرارداد، شرایط پرداخت، توضیحات..."></textarea></label></div><div class="panel"><div class="panel-head"><div><h3>افراد این شرکت</h3><div class="muted">هر تعداد مدیر، خرید، مالی، فنی و... را همین‌جا اضافه کن.</div></div><button class="btn" type="button" onclick="addOrgPersonRow()">+ فرد دیگر</button></div><div id="orgPeopleRows"></div></div><button class="btn primary wide" onclick="createOrganizationWithPeople()">ذخیره پرونده کامل شرکت</button>`;
  openModal(); addOrgPersonRow({is_primary_contact:true});
}

async function createOrganizationWithPeople(){
  if(!validateContactFields())return;
  const name=String($('#oName')?.value||'').trim();
  if(!name){$('#oName')?.focus();return toast('نام شرکت را وارد کن','error');}
  const btn=$('#modalBody .btn.primary.wide');if(btn?.disabled)return;if(btn){btn.disabled=true;btn.textContent='در حال ذخیره...';}
  const rows=$$('.org-person-row').map(row=>({organization_id:null,first_name:row.querySelector('.pFn').value,last_name:row.querySelector('.pLn').value,job_title:row.querySelector('.pTitle').value,department:row.querySelector('.pDept').value,phone:row.querySelector('.pPhone').value,email:row.querySelector('.pEmail').value,whatsapp:row.querySelector('.pWa').value,is_primary_contact:row.querySelector('.pPrimary').checked,source:'manual'})).filter(d=>[d.first_name,d.last_name,d.phone,d.email].some(v=>String(v||'').trim()));
  let org=null;
  try{
    org=await api('/api/organizations',{method:'POST',body:{name,legal_name:$('#oLegal').value,industry:$('#oIndustry').value,website:$('#oWebsite').value,main_phone:$('#oPhone').value,email:$('#oEmail').value,address:$('#oAddress').value,national_id:$('#oNational').value,deal_value:Number(latinDigits(String($('#oDeal').value||0)).replace(/[,٬]/g,''))||0,status:$('#oStatus').value,source:$('#oSource').value||'manual',notes:$('#oNotes').value,relationship_types:readNetworkTypes('oNet')}});
  }catch(e){ if(btn){btn.disabled=false;btn.textContent='ذخیره پرونده کامل شرکت';} return toast(e?.message||'ذخیره شرکت انجام نشد','error'); }
  let people=0;const failed=[];
  for(const data of rows){ try{ await api('/api/contacts',{method:'POST',body:{...data,organization_id:org.id}}); people++; }catch(e){ failed.push(`${(data.first_name+' '+data.last_name).trim()||data.phone}: ${e?.message||'خطا'}`); } }
  closeModal();
  if(failed.length) toast(`شرکت ذخیره شد، اما ${faDigits(failed.length)} نفر ثبت نشد — ${failed[0]}`,'error');
  else toast(`شرکت ذخیره شد${people?`؛ ${faDigits(people)} نفر اضافه شد`:''}`,'success');
  syncCallerIdContacts().catch(()=>{}); await loadDashboard(); switchTab('organizations'); setTimeout(()=>openOrganization(org.id),200);
}

async function organizationOptions(selected=''){
  const orgs=await api('/api/organizations?limit=1000');
  return '<option value="">مستقل / بدون شرکت</option>'+orgs.map(o=>`<option value="${o.id}" ${o.id===selected?'selected':''}>${esc(o.name)}</option>`).join('');
}

async function openNewPerson(orgId=''){
  $('#modalTitle').textContent=orgId?'افزودن فرد به شرکت':'شخص جدید';
  const companyField=await companyPickerField('cOrg',orgId,'شرکت / سازمان (اختیاری)');
  $('#modalBody').innerHTML=`<div class="panel"><div class="two-col"><label>نام<input id="cFn" autofocus></label><label>نام خانوادگی<input id="cLn"></label></div>${companyField}<div class="network-field"><b>نقش در شبکه کاری</b><div class="muted">برای افراد حرفه‌ای مستقل مثل پزشک، ترخیص‌کار، معرف یا کارشناس.</div>${networkTypeChecklist('cNet')}</div><div class="two-col"><label>سمت<input id="cTitle" placeholder="مدیر خرید، مدیرعامل، حسابداری..."></label><label>واحد / دپارتمان<input id="cDept"></label></div><div class="two-col"><label>شماره اصلی<input id="cPhone" inputmode="tel"></label><label>شماره‌های دیگر<input id="cPhones" inputmode="tel" placeholder="با | جدا کن"></label></div><div class="two-col"><label>ایمیل<input id="cEmail" inputmode="email"></label><label>واتساپ<input id="cWa" inputmode="tel"></label></div><label>آدرس / توضیح محل<textarea id="cAddress"></textarea></label><div class="two-col"><label>مرحله<select id="cStatus">${stageOptions('new')}</select></label><label>ارزش معامله شخصی<input id="cDeal" type="number" min="0"></label></div><label class="checks"><input id="cPrimary" type="checkbox"> رابط اصلی شرکت</label><label class="checks"><input id="cConsent" type="checkbox"> رضایت دریافت پیام بازاریابی</label><button class="btn primary wide" onclick="createPerson()">ذخیره شخص</button></div>`;
  openModal(); initCompanyPickers();
}

async function createPerson(){
  if(!validateContactFields())return;
  try{
    const companyPick=readCompanyPicker('cOrg');
    const c=await api('/api/contacts',{method:'POST',body:{first_name:$('#cFn').value,last_name:$('#cLn').value,...companyPick,job_title:$('#cTitle').value,department:$('#cDept').value,phone:$('#cPhone').value,secondary_phones:$('#cPhones').value,email:$('#cEmail').value,whatsapp:$('#cWa').value,address:$('#cAddress').value,status:$('#cStatus').value,deal_value:Number($('#cDeal').value||0),source:'manual',is_primary_contact:$('#cPrimary').checked,consent_marketing:$('#cConsent').checked,relationship_types:readNetworkTypes('cNet')}});
    closeModal(); toast(companyPick.company?`شخص ثبت شد و پرونده شرکت «${companyPick.company}» ساخته شد`:'شخص ثبت شد','success'); await syncCallerIdContacts(); await loadDashboard(); if(!$('#contacts').classList.contains('hidden')) loadContacts(); if(!$('#organizations').classList.contains('hidden')) loadOrganizations(); setTimeout(()=>openContact(c.id),150);
  }catch(e){ toast(e.message,'error'); }
}

function bytesFmt(v=0){
  const n=Number(v||0);
  if(n<1024)return `${n} B`;
  if(n<1024*1024)return `${(n/1024).toFixed(1)} KB`;
  return `${(n/1024/1024).toFixed(1)} MB`;
}
function attachmentKindFa(a={}){
  const c=String(a.category||'document');
  return ({invoice:'فاکتور',proforma:'پیش‌فاکتور',contract:'قرارداد',receipt:'رسید',document:'سند',other:'سایر'})[c]||'سند';
}
function attachmentIcon(a={}){
  const mime=String(a.mime_type||'').toLowerCase(),name=String(a.file_name||'').toLowerCase();
  if(mime.startsWith('image/'))return '🖼️';
  if(mime.includes('pdf')||name.endsWith('.pdf'))return '📕';
  if(mime.includes('excel')||mime.includes('spreadsheet')||/\.(xls|xlsx|xlsm|csv)$/i.test(name))return '📊';
  return '📎';
}
function renderAttachmentCard(a,opts={}){
  const image=String(a.mime_type||'').startsWith('image/')&&assetUrl(a.data_url)
    ? `<img class="doc-thumb" src="${assetUrl(a.data_url)}" alt="${esc(a.title||a.file_name)}">`
    : `<div class="doc-icon">${attachmentIcon(a)}</div>`;
  const meta=[
    a.invoice_no?`شماره ${esc(a.invoice_no)}`:'',
    a.invoice_date?dateOnlyFmt(a.invoice_date):'',
    a.amount?`مبلغ ${nfmt(a.amount)}`:'',
    bytesFmt(a.size)
  ].filter(Boolean).join(' · ');
  const ctx=opts.ctx||'';
  const owner=opts.owner&&a.owner?`<button type="button" class="doc-owner" onclick="event.stopPropagation();${ownerOpenCall(a.owner)}">${a.owner.type==='organization'?'🏢':a.owner.type==='project'?'◆':'👤'} ${esc(a.owner.name)}</button>`:'';
  const tags=(a.tags||[]).length?`<div class="doc-tags">${a.tags.map(t=>`<span>#${esc(t)}</span>`).join('')}</div>`:'';
  return `<div class="doc-card" data-cat="${esc(a.category||'document')}" data-search="${esc(attachmentSearchText({...a,_owner:a.owner?.name})+' '+sNorm(a.owner?.name||''))}" onclick="openAttachment('${a.id}')">
    ${image}
    <div class="doc-main">
      <div class="doc-title"><span class="badge">${attachmentKindFa(a)}</span> <b>${esc(a.title||a.file_name)}</b></div>
      ${owner}
      <div class="muted">${esc(a.file_name)}</div>
      <div class="muted">${meta}</div>
      ${tags}
      ${a.note?`<div class="doc-note">${esc(a.note)}</div>`:''}
    </div>
    <div class="doc-actions">
      <button class="icon-btn" title="باز کردن" aria-label="باز کردن فایل" onclick="event.stopPropagation();openAttachment('${a.id}')">↗</button>
      <button class="icon-btn" title="ویرایش جزئیات" aria-label="ویرایش جزئیات فایل" onclick="event.stopPropagation();openAttachmentEdit('${a.id}','${ctx}')">✎</button>
      <button class="icon-btn danger-text" title="حذف" aria-label="حذف فایل" onclick="event.stopPropagation();deleteAttachment('${a.id}','${ctx}')">×</button>
    </div>
  </div>`;
}
function renderDocumentsPanel(items=[],scope,id){
  const total=(items||[]).reduce((s,a)=>s+Number(a.size||0),0);
  return `<div class="panel documents-panel">
    <div class="panel-head">
      <div><h3>اسناد و فاکتورها</h3><div class="muted">${nfmt((items||[]).length)} فایل · ${bytesFmt(total)} روی حافظه گوشی</div></div>
      <button class="btn primary" onclick="openAttachmentPicker('${scope}','${id}')">📎 افزودن</button>
    </div>
    ${(items||[]).length>1?`<div class="doc-filter"><div class="doc-filter-box"><span aria-hidden="true">⌕</span><input class="doc-filter-input" type="search" enterkeyhint="search" placeholder="جستجو در عنوان، شماره فاکتور، برچسب، یادداشت..." aria-label="جستجو در اسناد این پرونده" oninput="filterDocPanel(this)"><small class="doc-filter-count"></small></div><div class="doc-filter-chips"><button type="button" class="doc-filter-chip active" data-cat="" onclick="setDocFilterCat(this)">همه</button>${[...new Set((items||[]).map(a=>a.category||'document'))].map(k=>`<button type="button" class="doc-filter-chip" data-cat="${esc(k)}" onclick="setDocFilterCat(this)">${attachmentKindFa({category:k})} · ${nfmt((items||[]).filter(a=>(a.category||'document')===k).length)}</button>`).join('')}</div></div>`:''}
    <div class="document-list">${(items||[]).map(a=>renderAttachmentCard(a)).join('')||'<div class="empty">هنوز فاکتور یا سندی ثبت نشده است.</div>'}<div class="empty doc-filter-empty hidden">سندی با این مشخصات در این پرونده نیست.</div></div>
  </div>`;
}
function renderTimeline(items=[],attachments=[]){
  const amap=new Map((attachments||[]).map(a=>[a.id,a]));
  return (items||[]).map(i=>{
    const a=i.attachment_id?amap.get(i.attachment_id):null;
    const attached=a?`<button class="timeline-document" onclick="openAttachment('${a.id}')">${attachmentIcon(a)} ${esc(a.title||a.file_name)} <span>باز کردن</span></button>`:'';
    return `<div class="timeline-item"><b>${typeFa[i.type]||i.type}${i.outcome?` · ${stageFa[i.outcome]||esc(i.outcome)}`:''}</b><div class="timeline-body">${esc(i.body||i.transcript||i.subject||'')}</div>${i.audio_path?`<audio controls src="${assetUrl(i.audio_path)}"></audio>`:''}${attached}<div class="muted">${dateFmt(i.occurred_at)}</div></div>`;
  }).join('');
}
function dataUrlToBlob(dataUrl){
  const [head,data]=String(dataUrl||'').split(',');
  const mime=(head.match(/^data:([^;]+)/)||[])[1]||'application/octet-stream';
  const binary=atob(data||'');
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return new Blob([bytes],{type:mime});
}
async function openAttachment(id){
  try{
    const a=await api('/api/attachments/'+id);
    const Viewer=nativePlugin('AttachmentViewer');
    if(NATIVE&&Viewer?.open){
      try{
        await Viewer.open({dataUrl:a.data_url,fileName:a.file_name||'document',mimeType:a.mime_type||'application/octet-stream'});
        return;
      }catch(nativeErr){
        console.warn('Native AttachmentViewer failed; using WebView fallback',nativeErr);
      }
    }
    const blob=dataUrlToBlob(a.data_url);
    const url=URL.createObjectURL(blob);
    if(String(a.mime_type||'').startsWith('image/')||String(a.mime_type||'').includes('pdf')){
      window.open(url,'_blank');
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    }else{
      const link=document.createElement('a');link.href=url;link.download=a.file_name||'document';link.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
    }
  }catch(e){toast(e?.message||'باز کردن فایل انجام نشد')}
}
function openAttachmentPicker(scope,id){
  const title=scope==='organization'?'افزودن سند به شرکت':scope==='project'?'افزودن سند به پروژه':'افزودن سند به مشتری';
  $('#modalTitle').textContent=title;
  $('#modalBody').innerHTML=`<div class="panel attachment-form">
    <div class="upload-drop">
      <div class="upload-icon">📎</div>
      <b>عکس، PDF یا Excel</b>
      <div class="muted">می‌توانی چند فایل را همزمان انتخاب کنی. حداکثر حجم هر فایل ۱۵ مگابایت.</div>
      <input id="attachmentFiles" type="file" multiple accept="image/*,.pdf,.xls,.xlsx,.xlsm,.csv,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
    </div>
    <div class="two-col">
      <label>نوع سند<select id="attachmentCategory"><option value="invoice">فاکتور</option><option value="proforma">پیش‌فاکتور</option><option value="receipt">رسید</option><option value="contract">قرارداد</option><option value="document">سند</option><option value="other">سایر</option></select></label>
      <label>عنوان<input id="attachmentTitle" placeholder="مثلاً فاکتور خرید مرداد"></label>
    </div>
    <div class="two-col">
      <label>شماره فاکتور<input id="attachmentInvoiceNo"></label>
      <label>تاریخ فاکتور (شمسی)${jalaliDateField('attachmentInvoiceDate')}</label>
    </div>
    <div class="two-col">
      <label>مبلغ<input id="attachmentAmount" type="number" min="0" inputmode="decimal"></label>
      <label>برچسب‌ها (برای پیدا کردن راحت‌تر)<input id="attachmentTags" placeholder="مثلاً حمل، بیمه، ۱۴۰۵"></label>
    </div>
    <label>یادداشت<textarea id="attachmentNote" placeholder="توضیح کوتاه درباره این سند..."></textarea></label>
    <button id="saveAttachmentBtn" class="btn primary wide" onclick="saveAttachments('${scope}','${id}')">ذخیره روی گوشی</button>
  </div>`;
  openModal();
}
async function saveAttachments(scope,id){
  const files=[...($('#attachmentFiles')?.files||[])];
  if(!files.length)return toast('حداقل یک فایل انتخاب کن','error');
  const btn=$('#saveAttachmentBtn'); if(btn){btn.disabled=true;btn.textContent='در حال ذخیره...'}
  try{
    let saved=0;
    for(const file of files){
      const fd=new FormData();
      fd.append('file',file,file.name);
      fd.append('category',$('#attachmentCategory').value);
      fd.append('title',$('#attachmentTitle').value);
      fd.append('invoice_no',$('#attachmentInvoiceNo').value);
      fd.append('invoice_date',readJalaliDate('attachmentInvoiceDate')||'');
      fd.append('amount',$('#attachmentAmount').value||'0');
      fd.append('note',$('#attachmentNote').value);
      fd.append('tags',$('#attachmentTags')?.value||'');
      const path=scope==='organization'?`/api/organizations/${id}/attachments`:scope==='project'?`/api/projects/${id}/attachments`:`/api/contacts/${id}/attachments`;
      await api(path,{method:'POST',body:fd});
      saved++;
    }
    toast(`${nfmt(saved)} فایل روی گوشی ذخیره شد`,'success');
    if(scope==='organization')await openOrganization(id); else if(scope==='project')await openProject(id); else await openContact(id);
  }catch(e){toast(e?.message||'ذخیره فایل انجام نشد','error'); if(btn){btn.disabled=false;btn.textContent='ذخیره روی گوشی'}}
}
async function deleteAttachment(id,ctx=''){
  if(!await askConfirm('این فایل از حافظه CRM گوشی حذف شود؟',{title:'حذف فایل'}))return;
  try{
    await api('/api/attachments/'+id,{method:'DELETE'});
    toast('فایل حذف شد','success');
    if(ctx==='files'){loadFiles();return;}
    if(currentContact?.id)await openContact(currentContact.id);
    else if(currentOrganization?.id)await openOrganization(currentOrganization.id);
    else if(currentProject?.id)await openProject(currentProject.id);
  }catch(e){toast(e?.message||'حذف فایل انجام نشد','error')}
}


function renderRelatedOrganizations(o){
  const links=o.related_organizations||[];
  return links.map(l=>{
    const other=l.other_organization||{};
    return `<div class="network-link-row">
      <div class="network-link-main" onclick="openOrganization('${other.id}')">
        <div><b>${esc(other.name||'شرکت')}</b><div class="network-chip-row"><span class="network-chip">${networkIcon(l.relation_type)} ${esc(networkLabel(l.relation_type))}</span></div></div>
        ${l.note?`<div class="muted">${esc(l.note)}</div>`:''}
      </div>
      <div class="actions">
        ${other.main_phone?`<a class="btn success" href="tel:${esc(other.main_phone)}">📞</a>`:''}
        <button class="btn" onclick="event.stopPropagation();openOrganization('${other.id}')">پرونده</button>
        <button class="icon-btn danger-text" onclick="event.stopPropagation();deleteOrganizationLink('${l.id}','${o.id}')">×</button>
      </div>
    </div>`;
  }).join('');
}
async function openOrganizationLinkPicker(orgId){
  const orgs=await api('/api/organizations?limit=1000');
  const options=orgs.filter(o=>o.id!==orgId).map(o=>`<option value="${o.id}">${esc(o.name)}${(o.relationship_types||[]).length?` — ${(o.relationship_types||[]).map(networkLabel).join('، ')}`:''}</option>`).join('');
  if(!options)return toast('اول یک شرکت یا سرویس‌دهنده دیگر ثبت کن','error');
  $('#modalTitle').textContent='افزودن ارتباط کاری';
  $('#modalBody').innerHTML=`<div class="panel">
    <label>شرکت / سرویس مرتبط<select id="linkTarget">${options}</select></label>
    <label>نوع ارتباط<select id="linkType">${(cfg.network_types||Object.keys(networkTypeFa)).map(k=>`<option value="${k}">${networkIcon(k)} ${networkLabel(k)}</option>`).join('')}</select></label>
    <label>یادداشت<textarea id="linkNote" placeholder="مثلاً ترخیص‌کار ثابت این مشتری، حمل از بندرعباس، پزشک معرف..."></textarea></label>
    <button class="btn primary wide" onclick="saveOrganizationLink('${orgId}')">ثبت ارتباط</button>
  </div>`;
  openModal();
}
async function saveOrganizationLink(orgId){
  try{
    await api(`/api/organizations/${orgId}/links`,{method:'POST',body:{target_organization_id:$('#linkTarget').value,relation_type:$('#linkType').value,note:$('#linkNote').value}});
    toast('ارتباط کاری ثبت شد','success');
    await openOrganization(orgId);
  }catch(e){toast(e?.message||'ثبت ارتباط انجام نشد','error')}
}
async function deleteOrganizationLink(linkId,orgId){
  if(!await askConfirm('این ارتباط کاری حذف شود؟',{title:'حذف ارتباط'}))return;
  try{await api(`/api/organization-links/${linkId}`,{method:'DELETE'});toast('ارتباط حذف شد','success');await openOrganization(orgId);}catch(e){toast(e?.message||'حذف ارتباط انجام نشد','error')}
}

async function openOrganization(id){
  const [o,financeEntries,financeSummary,docChecks,meetings]=await Promise.all([api('/api/organizations/'+id),api(`/api/finance?party_type=organization&party_id=${id}`),api(`/api/finance/summary?party_type=organization&party_id=${id}`),api(`/api/document-checks?scope_type=organization&scope_id=${id}`),api(`/api/meetings?organization_id=${id}`)]); currentOrganization=o; currentContact=null; currentProject=null; $('#modalTitle').textContent=o.name; rememberRecent({type:'organization',id:o.id,name:o.name});
  const people=(o.contacts||[]).map(c=>`<div class="member-row"><div class="avatar">${initials(c)}</div><div class="member-main" onclick="openContact('${c.id}')"><b>${esc(c.name)} ${c.is_primary_contact?'<span class="mini-star">★</span>':''}</b><div class="muted">${esc(c.job_title||'بدون سمت')}${c.department?' · '+esc(c.department):''}</div><div class="muted ltr rtl-align">${esc(phoneDisplay(c.phone)||c.email||'اطلاعات تماس ثبت نشده')}</div>${(c.relationship_types||[]).length?`<div class="network-chip-row">${networkChips(c.relationship_types)}</div>`:''}</div><div class="actions">${c.phone?`<button class="btn success" onclick="event.stopPropagation();startCall('${c.id}','${esc(c.phone)}')">📞</button>`:''}<button class="btn" onclick="event.stopPropagation();openContact('${c.id}')">پرونده</button></div></div>`).join('');
  const timeline=renderTimeline(o.interactions||[],o.attachments||[]);
  const tasks=(o.tasks||[]).filter(t=>!t.done).map(taskRow).join('');
  const related=renderRelatedOrganizations(o);
  $('#modalBody').innerHTML=`<div class="panel"><div class="detail-head"><div class="avatar org-avatar">${initials(o)}</div><div><h3>${esc(o.name)}</h3><div class="muted">${esc(o.industry||'')} ${o.main_phone?'· '+esc(phoneDisplay(o.main_phone)):''}</div><div class="network-chip-row">${networkChips(o.relationship_types||[])}</div></div></div><div class="quick-actions">${o.main_phone?`<a class="btn success" href="tel:${esc(o.main_phone)}">📞 شرکت</a>`:'<button class="btn" disabled>📞 شرکت</button>'}${o.email?`<a class="btn" href="mailto:${encodeURIComponent(o.email)}">✉ ایمیل</a>`:'<button class="btn" disabled>✉ ایمیل</button>'}${o.website?`<a class="btn" href="${safeWebsite(o.website)}" target="_blank">🌐 وب‌سایت</a>`:'<button class="btn" disabled>🌐 وب‌سایت</button>'}<button class="btn" onclick="editCurrentOrganization()">ویرایش</button></div><div class="actions"><span class="badge">${stageFa[o.status]||o.status}</span><span class="badge">ارزش ${nfmt(o.deal_value)}</span><span class="badge">${nfmt((o.contacts||[]).length)} فرد مرتبط</span></div>${o.address?`<p class="muted">📍 ${esc(o.address)}</p>`:''}${o.notes?`<div class="note-box">${esc(o.notes)}</div>`:''}</div><div class="panel"><div class="panel-head"><div><h3>شبکه مرتبط این شرکت</h3><div class="muted">مثلاً حمل‌ونقل، ترخیص‌کار، تامین‌کننده، بیمه یا همکار ثابت همین مشتری.</div></div><button class="btn primary" onclick="openOrganizationLinkPicker('${o.id}')">+ ارتباط</button></div><div class="network-link-list">${related||'<div class="empty">هنوز شرکت یا سرویس مرتبطی وصل نشده است.</div>'}</div></div><div class="panel"><div class="panel-head"><div><h3>افراد شرکت</h3><div class="muted">همه افراد زیر یک پرونده شرکتی نگهداری می‌شوند.</div></div><button class="btn primary" onclick="openNewPerson('${o.id}')">+ فرد</button></div><div class="member-list">${people||'<div class="empty">هنوز فردی برای این شرکت ثبت نشده است.</div>'}</div></div>${(o.projects||[]).length?`<div class="panel"><div class="panel-head"><h3>پروژه‌ها / فرصت‌های این شرکت</h3><button class="link" onclick="closeModal();switchTab('projects')">همه پروژه‌ها</button></div><div class="project-mini-list">${(o.projects||[]).slice(0,6).map(projectCard).join('')}</div></div>`:''}${financeSummaryPanel(financeSummary,financeEntries,'organization',o.id)}${renderDocumentChecklistPanel(docChecks,'organization',o.id)}${renderMeetingsPanel(meetings,`org:${o.id}`)}${renderDocumentsPanel(o.attachments||[],'organization',o.id)}<div class="panel"><div class="panel-head"><h3>سوابق و گزارش‌های شرکت</h3><div class="actions"><button class="btn" onclick="addOrganizationNote('${o.id}')">+ یادداشت</button><button class="btn" onclick="openAttachmentPicker('organization','${o.id}')">📎 فاکتور / فایل</button></div></div><div class="timeline">${timeline||'<div class="muted">هنوز تعاملی ثبت نشده است.</div>'}</div></div><div class="panel"><h3>پیگیری‌های این شرکت</h3>${tasks||'<div class="muted">پیگیری بازی وجود ندارد.</div>'}</div>`;
  openModal();
}

function safeWebsite(v=''){ const s=String(v||'').trim(); if(!s) return '#'; return /^https?:\/\//i.test(s)?esc(s):'https://'+esc(s); }

function editCurrentOrganization(){
  const o=currentOrganization; if(!o) return;
  $('#modalTitle').textContent='ویرایش شرکت';
  $('#modalBody').innerHTML=`<div class="panel"><div class="two-col"><label>نام شرکت<input id="eoName" value="${esc(o.name)}"></label><label>نام حقوقی<input id="eoLegal" value="${esc(o.legal_name)}"></label></div><div class="two-col"><label>صنعت<input id="eoIndustry" value="${esc(o.industry)}"></label><label>وب‌سایت<input id="eoWebsite" value="${esc(o.website)}"></label></div><div class="network-field"><b>نقش در شبکه کاری</b>${networkTypeChecklist('eoNet',o.relationship_types||[])}</div><div class="two-col"><label>تلفن اصلی<input id="eoPhone" value="${esc(o.main_phone_raw||o.main_phone)}"></label><label>تلفن‌های دیگر<input id="eoPhones" value="${esc((o.phones||[]).filter(p=>p!==o.main_phone).join(' | '))}"></label></div><div class="two-col"><label>ایمیل<input id="eoEmail" value="${esc(o.email)}"></label><label>شناسه ملی<input id="eoNational" value="${esc(o.national_id)}"></label></div><label>آدرس<textarea id="eoAddress">${esc(o.address)}</textarea></label><div class="two-col"><label>مرحله<select id="eoStatus">${stageOptions(o.status)}</select></label><label>ارزش معامله<input id="eoDeal" type="number" value="${o.deal_value||0}"></label></div><label>یادداشت<textarea id="eoNotes">${esc(o.notes)}</textarea></label><div class="actions"><button class="btn primary" onclick="saveOrganizationEdit('${o.id}')">ذخیره</button><button class="btn" onclick="openOrganization('${o.id}')">انصراف</button><button class="btn danger" onclick="archiveOrganization('${o.id}')">آرشیو شرکت</button></div></div>`;
}

async function saveOrganizationEdit(id){
  if(!validateContactFields())return;
  try{ await api('/api/organizations/'+id,{method:'PATCH',body:{name:$('#eoName').value,legal_name:$('#eoLegal').value,industry:$('#eoIndustry').value,website:$('#eoWebsite').value,main_phone:$('#eoPhone').value,phones:$('#eoPhones').value,email:$('#eoEmail').value,national_id:$('#eoNational').value,address:$('#eoAddress').value,status:$('#eoStatus').value,deal_value:Number($('#eoDeal').value||0),notes:$('#eoNotes').value,relationship_types:readNetworkTypes('eoNet')}}); toast('شرکت ذخیره شد','success'); await syncCallerIdContacts(); await openOrganization(id); loadDashboard(); loadOrganizations(); }catch(e){ toast(e.message,'error'); }
}
async function archiveOrganization(id){ if(!await askConfirm('این شرکت آرشیو شود؟ افراد آن حذف نمی‌شوند.',{title:'آرشیو شرکت'})) return; await api('/api/organizations/'+id,{method:'PATCH',body:{archived:true}}); closeModal(); toast('شرکت آرشیو شد','success'); await syncCallerIdContacts(); loadOrganizations(); loadDashboard(); }
function addOrganizationNote(id){ openNoteModal(`/api/organizations/${id}/interactions`,()=>openOrganization(id),'note','یادداشت شرکت'); }

async function openContact(id, highlightCall=false){
  const [c,financeEntries,financeSummary,docChecks,meetings]=await Promise.all([api('/api/contacts/'+id),api(`/api/finance?party_type=contact&party_id=${id}`),api(`/api/finance/summary?party_type=contact&party_id=${id}`),api(`/api/document-checks?scope_type=contact&scope_id=${id}`),api(`/api/meetings?contact_id=${id}`)]); currentContact=c; currentOrganization=null; currentProject=null; $('#modalTitle').textContent=c.name; rememberRecent({type:'contact',id:c.id,name:c.name});
  const timeline=renderTimeline(c.interactions||[],c.attachments||[]);
  const tasks=(c.tasks||[]).filter(t=>!t.done).map(taskRow).join('');
  const secondary=(c.secondary_phones||[]).length?`<div class="muted ltr rtl-align">شماره‌های دیگر: ${esc((c.secondary_phones||[]).join(' · '))}</div>`:'';
  $('#modalBody').innerHTML=`<div class="panel"><div class="detail-head"><div class="avatar">${initials(c)}</div><div><h3>${esc(c.name)} ${c.is_primary_contact?'<span class="mini-star">★ رابط اصلی</span>':''}</h3><div class="muted">${esc([c.job_title,c.company].filter(Boolean).join(' · '))}</div><div class="muted ltr rtl-align">${esc(phoneDisplay(c.phone)||'شماره اصلی ثبت نشده')}</div>${secondary}<div class="network-chip-row">${networkChips(c.relationship_types||[])}</div></div></div>${c.organization?`<button class="company-link" onclick="openOrganization('${c.organization.id}')">🏢 پرونده شرکت: ${esc(c.organization.name)}</button>`:`<button class="company-link add" onclick="editCurrentContact()">🏢 این شخص هنوز به شرکتی وصل نیست · افزودن نام شرکت</button>`}<div class="quick-actions">${c.phone?`<button class="btn success" onclick="startCall('${c.id}','${esc(c.phone)}')">📞 تماس</button>`:'<button class="btn" disabled>📞 تماس</button>'}${c.whatsapp?`<a class="btn" target="_blank" href="https://wa.me/${encodeURIComponent(c.whatsapp.replace(/\D/g,''))}">WhatsApp</a>`:'<button class="btn" disabled>WhatsApp</button>'}${c.email?`<a class="btn" href="mailto:${encodeURIComponent(c.email)}">✉ ایمیل</a>`:'<button class="btn" disabled>ایمیل</button>'}<button class="btn" onclick="downloadVCard()">VCF</button><button class="btn" onclick="editCurrentContact()">ویرایش</button></div><div class="actions"><span class="badge">${stageFa[c.status]||c.status}</span>${!c.organization_id?`<span class="badge">ارزش ${nfmt(c.deal_value)}</span>`:''}<span class="score ${scoreClass(c.ai_score)}">AI ${c.ai_score||0}</span></div></div><div class="panel ai-box"><div class="panel-head"><h3>تحلیل محلی</h3><button class="btn" onclick="runAI('${c.id}')">تحلیل دوباره</button></div><p>${esc(c.ai_summary||'هنوز تحلیل نشده است.')}</p><div><b>اقدام بعدی:</b> ${esc(c.next_action||'-')}</div>${c.suggested_message?`<div style="margin-top:10px"><b>پیام پیشنهادی:</b><div class="timeline-body">${esc(c.suggested_message)}</div><button class="link" onclick="copyText(currentContact.suggested_message)">کپی پیام</button></div>`:''}</div><div id="callReport" class="panel ${highlightCall?'call-report-highlight':''}"><h3>گزارش تماس</h3><textarea id="callNotes" placeholder="نتیجه تماس را بنویس..."></textarea><div class="two-col"><label>نتیجه<select id="callOutcome">${cfg.stages.filter(s=>s!=='new').map(s=>`<option value="${s}" ${s==='contacted'?'selected':''}>${stageFa[s]}</option>`).join('')}</select></label><label>پیگیری بعدی (شمسی)${jalaliDateTimeField('callFollow')}</label></div><div class="actions"><button class="btn primary" onclick="saveCall('${c.id}')">ثبت گزارش</button><button class="btn" id="recordBtn" onclick="toggleRecord('${c.id}',this)">🎙 یادداشت صوتی</button><button class="btn" onclick="addNote('${c.id}')">+ یادداشت متنی</button><button class="btn" onclick="openAttachmentPicker('contact','${c.id}')">📎 فاکتور / فایل</button></div></div>${(c.projects||[]).length?`<div class="panel"><h3>پروژه‌ها / فرصت‌های مرتبط</h3><div class="project-mini-list">${(c.projects||[]).slice(0,6).map(projectCard).join('')}</div></div>`:''}${financeSummaryPanel(financeSummary,financeEntries,'contact',c.id)}${renderDocumentChecklistPanel(docChecks,'contact',c.id)}${renderMeetingsPanel(meetings,`person:${c.id}`)}${renderDocumentsPanel(c.attachments||[],'contact',c.id)}<div class="panel"><h3>پیگیری‌های باز</h3>${tasks||'<div class="muted">پیگیری بازی برای این فرد نیست.</div>'}</div><div class="panel"><h3>سوابق و گزارش‌ها</h3><div class="timeline">${timeline||'<div class="muted">هنوز تعاملی ثبت نشده است.</div>'}</div></div>`;
  openModal(); renderInvoicePartyPanel('contact',c.id); if(highlightCall) setTimeout(()=>$('#callReport')?.scrollIntoView({behavior:'smooth',block:'center'}),150);
}

async function editCurrentContact(){
  const c=currentContact; if(!c) return; const companyField=await companyPickerField('eOrg',c.organization_id||'');
  $('#modalTitle').textContent='ویرایش شخص';
  $('#modalBody').innerHTML=`<div class="panel"><div class="two-col"><label>نام<input id="eFn" value="${esc(c.first_name)}"></label><label>نام خانوادگی<input id="eLn" value="${esc(c.last_name)}"></label></div>${companyField}<div class="network-field"><b>نقش در شبکه کاری</b>${networkTypeChecklist('eNet',c.relationship_types||[])}</div><div class="two-col"><label>سمت<input id="eTitle" value="${esc(c.job_title)}"></label><label>دپارتمان<input id="eDept" value="${esc(c.department)}"></label></div><div class="two-col"><label>شماره اصلی<input id="ePhone" value="${esc(c.phone_raw||c.phone)}"></label><label>شماره‌های دیگر<input id="ePhones" value="${esc((c.secondary_phones||[]).join(' | '))}"></label></div><div class="two-col"><label>ایمیل<input id="eEmail" value="${esc(c.email)}"></label><label>واتساپ<input id="eWa" value="${esc(c.whatsapp)}"></label></div><label>آدرس<textarea id="eAddress">${esc(c.address)}</textarea></label><div class="two-col"><label>مرحله<select id="eStatus">${stageOptions(c.status)}</select></label><label>ارزش شخصی<input id="eDeal" type="number" value="${c.deal_value||0}"></label></div><label class="checks"><input id="ePrimary" type="checkbox" ${c.is_primary_contact?'checked':''}> رابط اصلی شرکت</label><label class="checks"><input id="eCallerId" type="checkbox" ${c.caller_id!==false&&!(c.caller_id!==true&&['device-contacts','caller-id-cache'].includes(c.source))?'checked':''}> نمایش پرونده هنگام تماس (Caller ID)</label><div class="actions"><button class="btn primary" onclick="saveContactEdit('${c.id}')">ذخیره</button><button class="btn" onclick="openContact('${c.id}')">انصراف</button><button class="btn danger" onclick="archiveContact('${c.id}')">آرشیو</button></div></div>`;
  initCompanyPickers();
}
async function saveContactEdit(id){ if(!validateContactFields())return; try{ const r=await api('/api/contacts/'+id,{method:'PATCH',body:{first_name:$('#eFn').value,last_name:$('#eLn').value,...readCompanyPicker('eOrg'),job_title:$('#eTitle').value,department:$('#eDept').value,phone:$('#ePhone').value,secondary_phones:$('#ePhones').value,email:$('#eEmail').value,whatsapp:$('#eWa').value,address:$('#eAddress').value,status:$('#eStatus').value,deal_value:Number($('#eDeal').value||0),is_primary_contact:$('#ePrimary').checked,caller_id:$('#eCallerId').checked,relationship_types:readNetworkTypes('eNet')}}); toast('ذخیره شد','success'); await syncCallerIdContacts(); await openContact(id); loadDashboard(); loadOrganizations(); if(!$('#contacts').classList.contains('hidden')) loadContacts(); }catch(e){ toast(e.message,'error'); } }
async function archiveContact(id){ if(!await askConfirm('این فرد آرشیو شود؟',{title:'آرشیو شخص'})) return; await api('/api/contacts/'+id,{method:'PATCH',body:{archived:true}}); closeModal(); toast('آرشیو شد','success'); await syncCallerIdContacts(); loadContacts(); loadDashboard(); }

function startCall(id,phone){ if(!phone) return toast('شماره تلفن ثبت نشده','error'); localStorage.setItem('pendingCall',JSON.stringify({id,phone,startedAt:Date.now()})); window.location.href='tel:'+phone; }
function resumePendingCall(){ const raw=localStorage.getItem('pendingCall'); if(!raw) return; try{ const p=JSON.parse(raw); if(Date.now()-p.startedAt<1000*60*120){ localStorage.removeItem('pendingCall'); setTimeout(()=>openContact(p.id,true),300); } else localStorage.removeItem('pendingCall'); }catch{ localStorage.removeItem('pendingCall'); } }
window.addEventListener('focus',()=>{ if(localStorage.getItem('pendingCall')) setTimeout(resumePendingCall,400); });
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'&&localStorage.getItem('pendingCall')) setTimeout(resumePendingCall,400); });

async function saveCall(id){ try{ const fv=readJalaliDateTime('callFollow'); const result=await api(`/api/contacts/${id}/call-report`,{method:'POST',body:{body:$('#callNotes').value,outcome:$('#callOutcome').value,follow_up_at:fv}}); if(NATIVE&&result?.follow_up)await scheduleEntityReminder('task',result.follow_up,{firstCreation:true}); toast('گزارش تماس ثبت شد','success'); await syncCallerIdContacts(); await openContact(id); loadDashboard(); loadOrganizations(); }catch(e){ toast(e.message,'error'); } }
function addNote(id){ openNoteModal(`/api/contacts/${id}/interactions`,()=>openContact(id),'note','یادداشت تماس'); }
async function runAI(id){ toast('در حال تحلیل محلی...'); try{ await api(`/api/contacts/${id}/ai/analyze`,{method:'POST'}); toast('تحلیل محلی به‌روز شد','success'); await syncCallerIdContacts(); openContact(id); loadDashboard(); }catch(e){ toast(e.message,'error'); } }
function copyText(t){ navigator.clipboard?.writeText(t).then(()=>toast('کپی شد','success')).catch(()=>toast('امکان کپی نبود','error')); }

let recorder=null, recordChunks=[], recordStream=null;
async function toggleRecord(id,btn){
  if(recorder&&recorder.state==='recording'){ recorder.stop(); btn.textContent='در حال ذخیره...'; btn.disabled=true; return; }
  try{ recordStream=await navigator.mediaDevices.getUserMedia({audio:true}); recordChunks=[]; recorder=new MediaRecorder(recordStream); recorder.ondataavailable=e=>{if(e.data.size)recordChunks.push(e.data)}; recorder.onstop=async()=>{ try{ const blob=new Blob(recordChunks,{type:recorder.mimeType||'audio/webm'}); const fd=new FormData(); fd.append('file',blob,'voice.webm'); const saved=await api(`/api/contacts/${id}/audio-note?auto_transcribe=true`,{method:'POST',body:fd}); toast(saved.transcription_error?'صدا روی گوشی ذخیره شد':'یادداشت صوتی ذخیره شد','success'); await syncCallerIdContacts(); await openContact(id); }catch(e){ toast(e.message,'error'); }finally{ recordStream?.getTracks().forEach(t=>t.stop()); } }; recorder.start(); btn.textContent='■ پایان ضبط'; }catch(e){ toast('دسترسی میکروفن لازم است','error'); }
}

function taskRow(t){ const overdue=t.due_at&&new Date(t.due_at)<new Date(); return `<div class="task-row"><div><div class="task-title ${overdue?'overdue':''}">${esc(t.title)}</div><div class="muted">${dateFmt(t.due_at)}${t.channel?' · '+esc(typeFa[t.channel]||t.channel):''}</div></div><div class="actions">${t.project_id?`<button class="btn" onclick="openProject('${t.project_id}')">پروژه</button>`:''}${t.contact_id&&!t.project_id?`<button class="btn" onclick="openContact('${t.contact_id}')">شخص</button>`:''}${t.organization_id&&!t.contact_id&&!t.project_id?`<button class="btn" onclick="openOrganization('${t.organization_id}')">شرکت</button>`:''}<button class="btn success" onclick="doneTask('${t.id}')">انجام شد</button></div></div>`; }
async function loadTasks(){
  try{
    const rows=await api('/api/tasks');
    $('#taskList').innerHTML=rows.map(taskRow).join('')||emptyState('✓','همه کارها انجام شده‌اند یا پیگیری بازی نداری.',`<button class="btn" type="button" onclick="openTask()">+ پیگیری جدید</button>`);
  }catch(e){ console.warn('tasks load failed',e); $('#taskList').innerHTML=errorState('tasks'); }
}
loaderRegistry.tasks=loadTasks;
async function doneTask(id){ await api('/api/tasks/'+id+'/done',{method:'PATCH'});if(NATIVE)await cancelNativeNotification(notificationIdForRecord('task',id)); toast('انجام شد','success'); await syncCallerIdContacts(); loadTasks(); loadDashboard(); }
async function openTask(defaultTarget=''){
  const [orgs,people,projects]=await Promise.all([api('/api/organizations?limit=1000'),api('/api/contacts?limit=2000'),api('/api/projects?limit=2000')]);
  const targets=['<option value="">بدون اتصال</option>',...projects.map(p=>`<option value="project:${p.id}" ${defaultTarget===`project:${p.id}`?'selected':''}>◆ ${esc(p.title)}</option>`),...orgs.map(o=>`<option value="org:${o.id}" ${defaultTarget===`org:${o.id}`?'selected':''}>🏢 ${esc(o.name)}</option>`),...people.map(c=>`<option value="person:${c.id}" ${defaultTarget===`person:${c.id}`?'selected':''}>👤 ${esc(c.name)}${c.company?' — '+esc(c.company):''}</option>`)].join('');
  const defaultDue=new Date(Date.now()+60*60000);
  $('#modalTitle').textContent='پیگیری جدید'; $('#modalBody').innerHTML=`<div class="panel"><label>عنوان *<input id="tTitle" required></label><label>برای<select id="tTarget">${targets}</select></label><label>توضیح<textarea id="tDesc"></textarea></label><div class="two-col"><label>زمان (شمسی)${jalaliDateTimeField('tDue',defaultDue)}</label><label>کانال<select id="tChannel"><option value="call">تماس</option><option value="email">ایمیل</option><option value="whatsapp">واتساپ</option><option value="meeting">جلسه</option><option value="project">پروژه</option></select></label></div><label>یادآوری قبل از موعد<select id="tReminder"><option value="0">در زمان موعد</option><option value="10">۱۰ دقیقه قبل</option><option value="30">۳۰ دقیقه قبل</option><option value="60" selected>۱ ساعت قبل</option><option value="1440">۱ روز قبل</option></select></label><button class="btn primary wide" onclick="createTask()">ثبت</button></div>`; openModal();
}
async function createTask(){
  try{
    const title=$('#tTitle').value.trim();if(!title)return toast('عنوان پیگیری را وارد کن','error');
    const v=readJalaliDateTime('tDue');if(!v)return toast('تاریخ و ساعت پیگیری را وارد کن','error');
    const target=$('#tTarget').value,isOrg=target.startsWith('org:'),isPerson=target.startsWith('person:'),isProject=target.startsWith('project:');
    const task=await api('/api/tasks',{method:'POST',body:{title,description:$('#tDesc').value,due_at:v,reminder_minutes:Number($('#tReminder').value||0),channel:$('#tChannel').value,project_id:isProject?target.slice(8):null,organization_id:isOrg?target.slice(4):null,contact_id:isPerson?target.slice(7):null}});
    closeModal();if(NATIVE)await scheduleEntityReminder('task',task,{firstCreation:true});toast('پیگیری ثبت شد','success');await syncCallerIdContacts();loadTasks();loadDashboard();
  }catch(error){toast(error.message||'ثبت پیگیری انجام نشد','error')}
}

function openBackupImport(){ $('#modalTitle').textContent='بازیابی Backup'; $('#modalBody').innerHTML=`<div class="panel"><p class="muted">Backup نسخه‌های قدیمی سروری/آفلاین و Backup نسخه 4 پشتیبانی می‌شود. فیلد قدیمی company خودکار به پرونده شرکت تبدیل می‌شود و افراد همان شرکت زیر یک پرونده قرار می‌گیرند.</p><input id="backupFile" type="file" accept="application/json,.json"><label class="checks"><input id="replaceBackup" type="checkbox"> قبل از بازیابی، اطلاعات فعلی گوشی پاک شود</label><button class="btn primary wide" onclick="importBackupJSON()">بازیابی روی گوشی</button></div>`; openModal(); }
async function importBackupJSON(){ const f=$('#backupFile')?.files?.[0]; if(!f) return toast('فایل Backup را انتخاب کن','error'); try{ const data=JSON.parse(await f.text()); const replace=$('#replaceBackup')?.checked||false; const r=await OfflineDB.importBackup(data,replace); await syncCallerIdContacts();if(NATIVE)await syncNativeNotifications(); closeModal(); await loadDashboard(); toast(`${r.contacts} فرد، ${r.organizations||0} شرکت، ${r.projects||0} پروژه، ${r.reminders||0} یادآوری و ${r.attachments||0} فایل از Backup خوانده شد`,'success'); }catch(e){ toast(e?.message||'Backup معتبر نیست','error'); } }
async function resetOfflineData(){ if(!await askConfirm('همه اطلاعات آفلاین این برنامه از روی گوشی پاک شود؟ بدون Backup قابل برگشت نیست.',{title:'پاک‌کردن اطلاعات محلی',confirmLabel:'پاک‌کردن'})) return; await OfflineDB.resetAll();if(NATIVE)await syncNativeNotifications(); await syncCallerIdContacts(); await loadDashboard(); toast('اطلاعات محلی و اعلان‌های زمان‌بندی‌شده پاک شدند','success'); }

function openModal(){
  const modal=$('#modal');if(!modal)return;
  if(modal.classList.contains('hidden'))modalReturnFocus=document.activeElement;
  modal.classList.remove('hidden');document.body.classList.add('modal-open');
  setTimeout(()=>{const target=modal.querySelector('[autofocus],input:not([type="hidden"]),select,textarea,button');(target||modal).focus();},0);
}
function closeModal(){
  if(!$('#datePickerLayer')?.classList.contains('hidden'))closeJalaliPicker({restoreFocus:false});
  $('#modal')?.classList.add('hidden');document.body.classList.remove('modal-open');
  currentContact=null;currentOrganization=null;currentProject=null;
  const target=modalReturnFocus;modalReturnFocus=null;if(target?.focus)setTimeout(()=>target.focus(),0);
}
function modalBackdrop(e){ if(e.target.id==='modal') closeModal(); }
let confirmResolve=null;
function askConfirm(message, options={}){
  if(!document.getElementById('confirmLayer'))return Promise.resolve(window.confirm(String(message||'')));
  return new Promise(resolve=>{
    confirmResolve=resolve;
    $('#confirmTitle').textContent=options.title||'تأیید عملیات';
    $('#confirmBody').textContent=String(message||'');
    const ok=$('#confirmOkBtn');
    ok.textContent=options.confirmLabel||'تأیید';
    ok.classList.toggle('danger',options.danger!==false);
    $('#confirmLayer')?.classList.remove('hidden');
    setTimeout(()=>$('#confirmCancelBtn')?.focus(),0);
  });
}
function resolveConfirm(ok){
  const layer=$('#confirmLayer');if(!layer||layer.classList.contains('hidden'))return;
  layer.classList.add('hidden');
  const fn=confirmResolve;confirmResolve=null;
  if(fn)fn(ok);
}
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&$('#confirmLayer')&&!$('#confirmLayer').classList.contains('hidden')){e.preventDefault();resolveConfirm(false);} });
let noteModalTask=null;
function openNoteModal(path, refresh, noteType='note', title='یادداشت جدید'){
  noteModalTask={path,refresh,noteType};
  $('#modalTitle').textContent=title;
  $('#modalBody').innerHTML=`<div class="panel note-form"><label>متن یادداشت<textarea id="noteText" autofocus rows="6" placeholder="یادداشت را بنویس..."></textarea></label><div class="actions"><button class="btn primary" onclick="saveNoteModal()">ذخیره یادداشت</button><button class="btn" onclick="closeModal()">انصراف</button></div></div>`;
  openModal();
}
async function saveNoteModal(){
  const text=$('#noteText')?.value?.trim(); const task=noteModalTask;
  if(!text||!task)return toast('متن یادداشت را بنویس','error');
  try{
    await api(task.path,{method:'POST',body:{type:task.noteType,body:text}});
    toast('یادداشت ثبت شد','success');
    await syncCallerIdContacts();
    const refresh=task.refresh;noteModalTask=null;
    if(typeof refresh==='function')await refresh();
  }catch(e){ toast(e?.message||'ثبت یادداشت انجام نشد','error'); }
}
function trapModalFocus(event){
  if(event.key==='Escape'){event.preventDefault();closeModal();return;}
  if(event.key!=='Tab'||!$('#datePickerLayer')?.classList.contains('hidden'))return;
  const modal=$('#modal'),focusable=[...modal.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(x=>x.offsetParent!==null);
  if(!focusable.length)return;const first=focusable[0],last=focusable[focusable.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
}

window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('#installBtn')?.classList.remove('hidden')});
$('#installBtn')?.addEventListener('click',async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('#installBtn').classList.add('hidden')});
if(!NATIVE&&'serviceWorker' in navigator){
  navigator.serviceWorker.register('/sw.js').then(reg=>{
    const notifyUpdate=()=>{
      if(!navigator.serviceWorker.controller)return;
      if(localStorage.getItem('nikara-sw-update-notified'))return;
      localStorage.setItem('nikara-sw-update-notified','1');
      toast('نسخه جدید CRM-NIKARA آماده است؛ برای اعمال تغییرات، صفحه را یک بار دوباره بارگذاری کن','info');
    };
    reg.addEventListener?.('updatefound',()=>{
      const nw=reg.installing;if(!nw)return;
      nw.addEventListener('statechange',()=>{if(nw.state==='installed')notifyUpdate();});
    });
    const poll=()=>{reg.update().catch(()=>{});};
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')poll();});
    window.addEventListener('focus',poll);
  }).catch(()=>{});
}

function initNativeBridge(){
  if(!NATIVE)return;
  document.documentElement.classList.add('native');
  const App=nativePlugin('App');
  App?.addListener?.('appUrlOpen',event=>{
    const raw=String(event?.url||'');
    const match=raw.match(/^crm-nikara:\/\/contact\/([^/?#]+)/i);
    if(match){
      const id=decodeURIComponent(match[1]);
      setTimeout(()=>openContact(id,true),120);
    }
  });
  App?.addListener?.('appStateChange',state=>{if(state?.isActive){if(localStorage.getItem('pendingCall'))setTimeout(resumePendingCall,350);setTimeout(()=>consumeCallerIdOpen().catch(()=>{}),300);setTimeout(()=>syncNativeNotifications().catch(()=>{}),700);setTimeout(()=>refreshCallerHome().catch(()=>{}),500)}});
  initNativeNotificationActions().catch(()=>{});
}

async function seedFromCallerIdCache(){
  if(!NATIVE)return;
  try{ const current=await api('/api/contacts?limit=1'); if(current.length)return; const CI=nativePlugin('CallerId'); if(!CI?.getCachedContacts)return; const cached=await CI.getCachedContacts(); const rows=cached?.contacts||[]; if(rows.length){const count=await OfflineDB.importCachedContacts(rows);if(count)toast(`${count} مخاطب از حافظه Caller ID گوشی بازیابی شد`)} }catch(e){console.warn('caller cache seed',e)}
}

async function syncCallerIdContacts(){
  if(!NATIVE)return {count:0}; const CI=nativePlugin('CallerId'); if(!CI?.syncContacts)return {count:0};
  const [rows,orgs,tasks,projects,participants,interactions,financeEntries,meetings,docChecks]=await Promise.all([
    api('/api/contacts?limit=2000'),api('/api/organizations?limit=1000'),api('/api/tasks?open_only=false'),api('/api/projects?limit=2000'),
    OfflineDB.getAll('project_participants'),OfflineDB.getAll('interactions'),OfflineDB.getAll('finance_entries'),OfflineDB.getAll('meetings'),api('/api/document-checks')
  ]);
  const contacts=[],now=Date.now();
  const projectIdsFor=(entityType,id)=>new Set(participants.filter(x=>entityType==='contact'?x.contact_id===id:x.organization_id===id).map(x=>x.project_id));
  const summaries=(entityType,id)=>{
    const linked=projectIdsFor(entityType,id);
    return projects.filter(p=>!p.archived&&((entityType==='contact'&&p.customer_contact_id===id)||(entityType==='organization'&&p.customer_organization_id===id)||linked.has(p.id))).filter(p=>!['lost','cancelled'].includes(p.stage)).slice(0,5).map(p=>({id:p.id,title:p.title,type:p.type,stage:p.stage,value:p.value||0,expected_close:p.expected_close||'',expected_close_label:p.expected_close?dateOnlyFmt(p.expected_close):''}));
  };
  const historyFor=(entityType,id)=>interactions.filter(x=>entityType==='contact'?x.contact_id===id:x.organization_id===id).sort((x,y)=>String(y.occurred_at||'').localeCompare(String(x.occurred_at||''))).slice(0,4).map(x=>({type:x.type||'',subject:x.subject||'',body:String(x.body||x.transcript||'').slice(0,180),occurred_at:x.occurred_at||'',occurred_label:x.occurred_at?dateFmt(x.occurred_at):''}));
  const taskFor=(entityType,id,projectSummaries)=>{const pids=new Set(projectSummaries.map(p=>p.id));return tasks.filter(t=>!t.done&&((entityType==='contact'&&t.contact_id===id)||(entityType==='organization'&&t.organization_id===id)||pids.has(t.project_id))).sort((a,b)=>String(a.due_at||'9999').localeCompare(String(b.due_at||'9999'))).slice(0,5).map(t=>({title:t.title,due_at:t.due_at||'',due_label:t.due_at?dateFmt(t.due_at):'',priority:t.priority||''}));};
  const financeFor=(entityType,id)=>financeSummaryLocal(financeEntries.filter(e=>e.party_type===entityType&&e.party_id===id));
  const meetingFor=(entityType,id,projectSummaries)=>{
    const pids=new Set(projectSummaries.map(p=>p.id));
    const list=meetings.filter(m=>m.status==='planned'&&m.start_at&&new Date(m.start_at).getTime()>=now&&((entityType==='contact'&&m.contact_id===id)||(entityType==='organization'&&m.organization_id===id)||pids.has(m.project_id))).sort((a,b)=>new Date(a.start_at)-new Date(b.start_at));
    const m=list[0];return m?{id:m.id,title:m.title,start_at:m.start_at,start_label:dateFmt(m.start_at),location:m.location||''}:null;
  };
  const docsFor=(entityType,id,projectSummaries)=>{
    const pids=new Set(projectSummaries.map(p=>p.id)),list=docChecks.filter(d=>(d.scope_type===entityType&&d.scope_id===id)||(d.scope_type==='project'&&pids.has(d.scope_id)));
    const missing=list.filter(d=>(d.effective_status||d.status)==='required').length;
    const expiring=list.filter(d=>d.expiry_date&&['received','verified'].includes(d.status)&&new Date(d.expiry_date+'T23:59:59')>=new Date()&&new Date(d.expiry_date+'T23:59:59')<=new Date(Date.now()+30*86400000)).length;
    return {missing,expiring};
  };
  const callerIdEligible=r=>!r.archived&&(r.caller_id===true||(r.caller_id!==false&&!['device-contacts','caller-id-cache'].includes(String(r.source||''))));
  if(localStorage.getItem('crm_caller_id_enabled')==='0'){ return CI.syncContacts({contacts:[]}); }
  for(const c of rows.filter(callerIdEligible)){
    const ps=summaries('contact',c.id),ts=taskFor('contact',c.id,ps),hs=historyFor('contact',c.id),fs=financeFor('contact',c.id),meeting=meetingFor('contact',c.id,ps),docs=docsFor('contact',c.id,ps);
    const companyFs=c.organization_id?financeFor('organization',c.organization_id):null;const base={entity_type:'contact',caller_id:true,source:c.source||'',id:c.id,name:c.name||'',company:c.company||'',job_title:c.job_title||'',department:c.department||'',email:c.email||'',whatsapp:c.whatsapp||'',address:c.address||'',notes:String(c.notes||'').slice(0,500),phone:c.phone||'',secondary_phones:c.secondary_phones||[],status:c.status||'',deal_value:c.deal_value||0,ai_score:c.ai_score||0,ai_summary:String(c.ai_summary||'').slice(0,500),next_action:String(c.next_action||'').slice(0,300),suggested_message:String(c.suggested_message||'').slice(0,300),last_contact_at:c.last_contact_at||'',last_contact_label:c.last_contact_at?dateFmt(c.last_contact_at):'',relationship_types:c.relationship_types||[],projects:ps,open_tasks:ts,recent_history:hs,finance:{receivable_toman:Math.round(fs.receivable_rial/10),payable_toman:Math.round(fs.payable_rial/10),net_toman:Math.round(fs.net_rial/10)},company_finance:companyFs?{receivable_toman:Math.round(companyFs.receivable_rial/10),payable_toman:Math.round(companyFs.payable_rial/10),net_toman:Math.round(companyFs.net_rial/10)}:null,next_meeting:meeting,documents:docs};
    for(const phone of [c.phone,...(c.secondary_phones||[])].filter(Boolean))contacts.push({...base,phone});
  }
  for(const o of orgs.filter(callerIdEligible)){
    const ps=summaries('organization',o.id),ts=taskFor('organization',o.id,ps),hs=historyFor('organization',o.id),fs=financeFor('organization',o.id),meeting=meetingFor('organization',o.id,ps),docs=docsFor('organization',o.id,ps);
    const base={entity_type:'organization',caller_id:true,source:o.source||'',id:'org:'+o.id,organization_id:o.id,name:o.name||'',company:'',job_title:o.industry||'شرکت / سازمان',department:'',email:o.email||'',whatsapp:'',address:o.address||'',notes:String(o.notes||'').slice(0,500),phone:o.main_phone||'',secondary_phones:o.phones||[],status:o.status||'',deal_value:o.deal_value||0,ai_score:0,ai_summary:'',next_action:String(o.notes||'').slice(0,300),suggested_message:'',last_contact_at:o.last_contact_at||'',last_contact_label:o.last_contact_at?dateFmt(o.last_contact_at):'',relationship_types:o.relationship_types||[],projects:ps,open_tasks:ts,recent_history:hs,finance:{receivable_toman:Math.round(fs.receivable_rial/10),payable_toman:Math.round(fs.payable_rial/10),net_toman:Math.round(fs.net_rial/10)},next_meeting:meeting,documents:docs};
    for(const phone of [o.main_phone,...(o.phones||[])].filter(Boolean))contacts.push({...base,phone});
  }
  return CI.syncContacts({contacts});
}
async function enableCallerId(){
  if(!NATIVE)return toast('Caller ID فقط در APK Android فعال می‌شود','error');
  const CI=nativePlugin('CallerId'); if(!CI?.requestRole)return toast('Caller ID در این APK وجود ندارد','error');
  try{
    let status=await CI.getStatus();
    if(status?.supported===false)return toast('Caller ID به Android 10 یا جدیدتر نیاز دارد','error');

    if(status?.contacts_permission===false && CI.requestContactsPermission){
      await CI.requestContactsPermission();
      toast('مجوز Contacts را Allow کن و دوباره همین دکمه را بزن؛ بدون آن، مشتری‌هایی که در دفترچه گوشی هم ذخیره‌اند شناسایی نمی‌شوند');
      setTimeout(()=>loadCallerIdStatus().catch(()=>{}),800);
      return;
    }

    if(!status?.granted){
      const res=await CI.requestRole();
      if(!res?.granted){
        toast('CRM-NIKARA را در Caller ID & spam app انتخاب کن','error');
        setTimeout(()=>loadCallerIdStatus().catch(()=>{}),800);
        return;
      }
    }

    // Caller ID is useless if Android 13+ cannot show the notification.
    const LN=nativePlugin('LocalNotifications');
    try{
      const perm=await LN?.requestPermissions?.();
      if(perm && perm.display && perm.display!=='granted'){
        toast('برای نمایش Caller ID، مجوز Notifications را Allow کن','error');
      }
    }catch{}

    const synced=await syncCallerIdContacts();
    status=await CI.getStatus();
    // Android 10+ blocks a background app from opening a screen during the ringing; the floating
    // card needs "Display over other apps". Without it only the notification is guaranteed.
    if(status?.overlay_allowed===false && CI.openOverlaySettings){
      await loadCallerIdStatus();
      if(await askConfirm('برای اینکه کارت مشتری روی صفحه زنگ خوردن باز شود، اجازه «نمایش روی برنامه‌های دیگر» را برای CRM-NIKARA روشن کن.',{title:'یک مجوز دیگر مانده',confirmLabel:'باز کردن تنظیمات',danger:false})){
        await CI.openOverlaySettings();
      }
      return;
    }
    await loadCallerIdStatus();
    refreshCallerHome().catch(()=>{});
    toast(`Caller ID کامل فعال است؛ ${synced?.count ?? status?.cached_contacts ?? 0} شماره در حافظه Caller ID`,'success');
  }catch(e){
    toast(e?.message||'فعال‌سازی Caller ID انجام نشد','error');
    loadCallerIdStatus().catch(()=>{});
  }
}

async function loadCallerIdStatus(){
  const box=$('#callerIdDiagnostics'), badge=$('#callerIdBadge');
  const tg=$('#callerIdEnabledSetting'); if(tg) tg.checked=localStorage.getItem('crm_caller_id_enabled')!=='0';
  const phonebookToggle=$('#phonebookLinkSetting');
  const phonebookCreate=$('#phonebookCreateMissingSetting');
  if(phonebookToggle&&phonebookCreate&&!NATIVE){
    phonebookToggle.disabled=true; phonebookCreate.disabled=true;
  }
  if(!box||!badge)return;
  if(!NATIVE){
    badge.textContent='فقط Android';
    box.innerHTML='<div class="diag-row bad"><span>Native APK</span><b>غیرفعال</b></div>';
    return;
  }
  const CI=nativePlugin('CallerId');
  if(!CI?.getStatus){
    badge.textContent='پلاگین موجود نیست';
    box.innerHTML='<div class="diag-row bad"><span>Caller ID Plugin</span><b>وجود ندارد</b></div>';
    return;
  }
  try{
    const s=await CI.getStatus();
    try{
      const pb=await CI.getPhonebookLinkStatus?.();
      if(phonebookToggle) phonebookToggle.checked=!!pb?.enabled;
      if(phonebookCreate) phonebookCreate.checked=!!pb?.createMissing;
    }catch(_e){}
    const yes=v=>v===true;
    const fmtTime=ts=>ts?new Date(ts).toLocaleString('fa-IR'):'—';
    badge.textContent=s.granted?'فعال':'نیاز به فعال‌سازی';
    badge.classList.toggle('success',!!s.granted);
    box.innerHTML=`
      <div class="diag-row ${yes(s.granted)?'ok':'bad'}"><span>Caller ID & spam role</span><b>${yes(s.granted)?'فعال':'غیرفعال'}</b></div>
      <div class="diag-row ${yes(s.contacts_permission)?'ok':'bad'}"><span>مجوز Contacts <small>لازم برای مشتری‌هایی که در دفترچه گوشی هم ذخیره‌اند</small></span><b>${yes(s.contacts_permission)?'دارد':'ندارد'}</b></div>
      <div class="diag-row ${s.overlay_allowed===undefined?'warn':yes(s.overlay_allowed)?'ok':'bad'}"><span>نمایش روی برنامه‌ها <small>کارت مشتری روی صفحه زنگ خوردن</small></span><b>${s.overlay_allowed===undefined?'APK قدیمی':yes(s.overlay_allowed)?'مجاز':'نیاز به اجازه'}</b></div>
      <div class="diag-row ${yes(s.notifications_permission)&&yes(s.notifications_enabled)?'ok':'bad'}"><span>مجوز Notifications</span><b>${yes(s.notifications_permission)&&yes(s.notifications_enabled)?'فعال':'غیرفعال'}</b></div>
      <div class="diag-row ${yes(s.full_screen_allowed)?'ok':'warn'}"><span>نمایش Full-screen</span><b>${yes(s.full_screen_allowed)?'مجاز':'نیاز به اجازه'}</b></div>
      <div class="diag-row"><span>شماره‌های cache شده</span><b>${Number(s.cached_contacts||0).toLocaleString('fa-IR')}</b></div>
      <div class="diag-row"><span>تماس‌های دریافت‌شده توسط سرویس</span><b>${Number(s.screened_calls||0).toLocaleString('fa-IR')}</b></div>
      <div class="diag-row"><span>آخرین شماره دیده‌شده</span><b dir="ltr">${esc(s.last_number||'—')}</b></div>
      <div class="diag-row"><span>زمان آخرین تماس</span><b>${fmtTime(s.last_timestamp||0)}</b></div>
      ${s.last_error?`<div class="diag-error"><b>خطای Native:</b><br>${esc(s.last_error)}</div>`:''}`;
    $('#fullScreenSettingsBtn')?.classList.toggle('attention',!s.full_screen_allowed);
    $('#overlaySettingsBtn')?.classList.toggle('attention',s.overlay_allowed===false);
  }catch(e){
    badge.textContent='خطا';
    box.innerHTML=`<div class="diag-error">${esc(e?.message||String(e))}</div>`;
  }
}

async function testCallerIdPopup(){
  if(!NATIVE)return toast('این تست فقط داخل APK اجرا می‌شود','error');
  const CI=nativePlugin('CallerId');
  if(!CI?.testCallerIdPopup)return toast('APK فعلی تست Native Caller ID را ندارد','error');
  try{
    const LN=nativePlugin('LocalNotifications');
    try{await LN?.requestPermissions?.()}catch{}
    await CI.testCallerIdPopup({name:'تست Caller ID',company:'CRM-NIKARA',number:'+989121234567'});
    toast('کارت تست باید روی صفحه ظاهر شده باشد');
    setTimeout(()=>loadCallerIdStatus().catch(()=>{}),500);
  }catch(e){toast(e?.message||'تست Caller ID اجرا نشد','error')}
}

async function openCallerNotificationSettings(){
  if(!NATIVE)return;
  const CI=nativePlugin('CallerId');
  try{await CI?.openNotificationSettings?.()}catch(e){toast(e?.message||'تنظیمات اعلان باز نشد','error')}
}

async function openCallerFullScreenSettings(){
  if(!NATIVE)return;
  const CI=nativePlugin('CallerId');
  try{await CI?.openFullScreenIntentSettings?.()}catch(e){toast(e?.message||'تنظیمات Full-screen باز نشد','error')}
}

async function importDeviceContacts(){
  if(!NATIVE)return toast('ورود دفترچه تلفن فقط در APK Android فعال است','error');
  const CI=nativePlugin('CallerId');
  if(!CI?.importDeviceContacts)return toast('این APK قابلیت خواندن دفترچه تلفن را ندارد','error');
  try{
    const status=await CI.getStatus();
    if(status?.contacts_permission===false){
      await CI.requestContactsPermission();
      toast('مجوز مخاطبین را تأیید کن و دوباره دکمه ورود دفترچه تلفن را بزن');
      return;
    }
    const result=await CI.importDeviceContacts();
    const count=await OfflineDB.importCachedContacts(result?.contacts||[]);
    await syncCallerIdContacts();
    await loadDashboard();
    toast(`${count} مخاطب از دفترچه تلفن وارد شد؛ Caller ID برای آن‌ها خاموش است تا خودت در ویرایش تأییدشان کنی`,'success');
  }catch(e){toast(e?.message||'خواندن دفترچه تلفن انجام نشد','error')}
}
async function cleanupPhonebookContacts(){
  if(!await askConfirm('مخاطبین واردشده از دفترچه تلفن که هیچ تماس، یادداشت، پروژه، وظیفه یا تراکنشی ندارند آرشیو شوند؟',{title:'پاکسازی مخاطبین دفترچه تلفن'}))return;
  if(!await askConfirm('تأیید دوم: این کار برگشت‌پذیر است (آرشیو)، ولی آن‌ها از لیست و Caller ID حذف می‌شوند. ادامه؟',{title:'تأیید نهایی',confirmLabel:'ادامه'}))return;
  try{const r=await OfflineDB.cleanupPhonebookContacts();await syncCallerIdContacts();await loadDashboard();if(typeof loadCallerIdStatus==='function')loadCallerIdStatus();toast(`${r.archived} مخاطب دفترچه تلفن آرشیو شد؛ ${r.kept} مورد دارای سابقه نگه داشته شد`,'success')}catch(e){toast(e?.message||'پاکسازی انجام نشد','error')}
}
async function setCallerIdEnabled(on){
  localStorage.setItem('crm_caller_id_enabled',on?'1':'0');
  const CI=NATIVE?nativePlugin('CallerId'):null;
  try{await CI?.setEnabled?.({enabled:!!on});}catch(e){}
  try{await syncCallerIdContacts();}catch(e){}
  toast(on?'Caller ID روشن شد':'Caller ID خاموش شد');
  if(typeof loadCallerIdStatus==='function')loadCallerIdStatus();
}
async function consumeCallerIdOpen(){ if(!NATIVE)return; const CI=nativePlugin('CallerId'); if(!CI?.consumePendingOpen)return; const r=await CI.consumePendingOpen(); const id=r?.contact_id||''; if(!id||$('#appView').classList.contains('hidden'))return; if(id.startsWith('org:')) setTimeout(()=>openOrganization(id.slice(4)),250); else setTimeout(()=>openContact(id,true),250); }

let nativeNotificationListenerReady=false;
async function initNativeNotificationActions(){
  if(!NATIVE||nativeNotificationListenerReady)return;
  const LN=nativePlugin('LocalNotifications');if(!LN?.addListener)return;
  await LN.addListener('localNotificationActionPerformed',ev=>{
    const x=ev?.notification?.extra||ev?.notification?.data||{};
    if(x.meeting_id){switchTab('calendar');setTimeout(()=>openMeeting('',x.meeting_id).catch(()=>{}),120);return;}
    if(x.kind==='reminder'&&x.reminder_id){switchTab('calendar');setTimeout(()=>openReminder(x.reminder_id).catch(()=>{}),120);return;}
    if(x.kind==='task'){if(x.project_id)return openProject(x.project_id);if(x.contact_id)return openContact(x.contact_id);if(x.organization_id)return openOrganization(x.organization_id);switchTab('tasks');return;}
    if(x.project_id)return openProject(x.project_id);
    if(x.contact_id)return openContact(x.contact_id);
    if(x.organization_id)return openOrganization(x.organization_id);
    switchTab('tasks');
  });
  nativeNotificationListenerReady=true;
}
function exactAlarmGranted(value){return value?.exact_alarm==='granted'||value?.value==='granted'||value?.display==='granted'||value==='granted'}
function notificationIdForRecord(kind,id=''){
  let hash=2166136261;
  for(const char of String(id)){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619)}
  const base=kind==='task'?100000000:kind==='meeting'?200000000:300000000;
  return base+((hash>>>0)%99999999);
}
async function createReminderChannel(LN=nativePlugin('LocalNotifications')){
  if(!NATIVE||!LN?.createChannel)return false;
  try{
    await LN.createChannel({id:REMINDER_CHANNEL_ID,name:'یادآوری‌های CRM-NIKARA',description:'جلسه‌ها، پیگیری‌ها و یادآوری‌های مستقل',importance:4,visibility:1,vibration:true,lights:true,lightColor:'#0F9F8F',sound:'default'});
    return true;
  }catch(error){
    const platform=window.Capacitor?.getPlatform?.();
    if(platform==='android')throw error;
    return false;
  }
}
async function reminderPermissionStatus(){
  if(!NATIVE)return {notifications:false,exact:false,channel:false};const LN=nativePlugin('LocalNotifications');if(!LN)return {notifications:false,exact:false,channel:false};
  try{
    const p=await LN.checkPermissions?.();let exact=true,channel=true;
    if(LN.checkExactNotificationSetting)exact=exactAlarmGranted(await LN.checkExactNotificationSetting());
    if(LN.listChannels){const result=await LN.listChannels();channel=(result?.channels||[]).some(x=>x.id===REMINDER_CHANNEL_ID)}
    return {notifications:p?.display==='granted',exact,channel};
  }catch{return {notifications:false,exact:false,channel:false}}
}
async function ensureReminderPermission({quiet=false,requestExact=false,firstCreation=false}={}){
  if(!NATIVE)return false;
  const LN=nativePlugin('LocalNotifications');if(!LN)return false;
  try{
    const first=firstCreation&&localStorage.getItem(REMINDER_SETUP_KEY)!=='1';
    let perm=first?await LN.requestPermissions?.():await LN.checkPermissions?.();
    if(!first&&(!perm||perm.display!=='granted'))perm=await LN.requestPermissions?.();
    let exact=true;
    if(LN.checkExactNotificationSetting)exact=exactAlarmGranted(await LN.checkExactNotificationSetting());
    await createReminderChannel(LN);
    if(first)localStorage.setItem(REMINDER_SETUP_KEY,'1');
    const ok=perm?.display==='granted';
    if(!ok){if(!quiet)toast('برای زمان‌بندی Reminder، مجوز Notifications را Allow کن');return false;}
    if(requestExact&&!exact&&LN.changeExactNotificationSetting){
      if(!quiet)toast('برای اجرای دقیق، Alarms & reminders را فعال کن؛ اعلان همین حالا ثبت و پس از بازگشت همگام می‌شود');
      await LN.changeExactNotificationSetting();
    }
    await initNativeNotificationActions();return true;
  }catch(e){if(!quiet)toast('بررسی مجوز یادآوری انجام نشد');return false}
}
async function enableMobileReminders(){
  if(!NATIVE)return toast('یادآوری Native فقط در APK فعال است','error');
  if(await ensureReminderPermission({requestExact:true,firstCreation:true})){await syncNativeNotifications();toast('کانال یادآوری‌های عمومی، جلسات و پیگیری‌ها فعال شد','success')}
}
async function refreshReminderStatus(){
  const host=$('#reminderDiagnostics');if(!host)return;const s=await reminderPermissionStatus();host.innerHTML=`<div class="diag-row ${s.notifications?'ok':'bad'}"><span>Notifications</span><b>${s.notifications?'فعال':'غیرفعال'}</b></div><div class="diag-row ${s.exact?'ok':'warn'}"><span>Alarms & reminders</span><b>${s.exact?'دقیق':'نیاز به اجازه'}</b></div><div class="diag-row ${s.channel?'ok':'warn'}"><span>کانال Reminder</span><b>${s.channel?'ساخته شده':'هنوز ساخته نشده'}</b></div>`;
}
function nativeNotificationFor(kind,row){
  let at=0,title='',body='',extra={kind};
  if(kind==='task'){
    at=new Date(row.due_at).getTime()-Math.max(0,Number(row.reminder_minutes||0))*60000;
    title='CRM-NIKARA · پیگیری';body=row.title||'پیگیری';
    extra={...extra,task_id:row.id,contact_id:row.contact_id||'',organization_id:row.organization_id||'',project_id:row.project_id||''};
  }else if(kind==='meeting'){
    at=new Date(row.start_at).getTime()-Math.max(0,Number(row.reminder_minutes??60))*60000;
    title='CRM-NIKARA · جلسه';body=`${row.title||'جلسه'}${row.location?' · '+row.location:''}`;
    extra={...extra,meeting_id:row.id,contact_id:row.contact_id||'',organization_id:row.organization_id||'',project_id:row.project_id||''};
  }else{
    at=new Date(row.remind_at).getTime();title='CRM-NIKARA · یادآوری';body=row.title||'یادآوری';
    extra={...extra,reminder_id:row.id,contact_id:row.contact_id||'',organization_id:row.organization_id||'',project_id:row.project_id||''};
  }
  if(!Number.isFinite(at))return null;
  const id=kind==='reminder'?(Number(row.notification_id)||notificationIdForRecord(kind,row.id)):notificationIdForRecord(kind,row.id);
  return {id,title,body,largeBody:row.body||body,channelId:REMINDER_CHANNEL_ID,schedule:{at:new Date(at),allowWhileIdle:true},extra,_sortAt:at};
}
async function cancelNativeNotification(id){
  if(!NATIVE||!Number(id))return;
  const LN=nativePlugin('LocalNotifications');if(!LN?.cancel)return;
  try{await LN.cancel({notifications:[{id:Number(id)}]})}catch(error){console.warn('notification cancel failed',error)}
}
async function scheduleEntityReminder(kind,row,{firstCreation=false}={}){
  if(!NATIVE)return false;
  const LN=nativePlugin('LocalNotifications');if(!LN?.schedule)return false;
  const notification=nativeNotificationFor(kind,row);if(!notification||notification._sortAt<=Date.now())return false;
  try{
    if(!await ensureReminderPermission({quiet:false,requestExact:true,firstCreation}))return false;
    await cancelNativeNotification(notification.id);delete notification._sortAt;
    await LN.schedule({notifications:[notification]});
    return true;
  }catch(error){console.warn('immediate reminder schedule failed',error);return false}
}
async function scheduleIndependentReminder(reminder,options={}){return scheduleEntityReminder('reminder',reminder,options)}
function isManagedNotification(notification){
  const extra=notification?.extra||notification?.data||{},id=Number(notification?.id||0);
  return ['task','meeting','reminder'].includes(extra.kind)||(id>=1000&&id<1400)||(id>=100000000&&id<400000000);
}
async function syncNativeNotifications(){
  if(!NATIVE)return; const LN=nativePlugin('LocalNotifications'); if(!LN)return;
  try{
    const pending=await LN.getPending();
    const old=(pending?.notifications||[]).filter(isManagedNotification).map(n=>({id:n.id}));
    if(old.length)await LN.cancel({notifications:old});
    const permission=await LN.checkPermissions?.();if(permission?.display!=='granted')return;
    await createReminderChannel(LN);
    const [tasks,meetings,reminders]=await Promise.all([api('/api/tasks'),api('/api/meetings?status=planned'),api('/api/reminders')]);
    const now=Date.now();
    const prepare=(kind,rows,limit)=>rows.map(row=>nativeNotificationFor(kind,row)).filter(n=>n&&n._sortAt>now).sort((a,b)=>a._sortAt-b._sortAt).slice(0,limit).map(n=>{delete n._sortAt;return n});
    const notifications=[...prepare('task',tasks.filter(t=>t.due_at),100),...prepare('meeting',meetings.filter(m=>m.start_at),100),...prepare('reminder',reminders.filter(r=>r.remind_at),200)];
    if(notifications.length)await LN.schedule({notifications});
  }catch(e){console.warn('notification sync failed',e)}
}

function downloadVCard(c=currentContact){
  if(!c)return; const clean=s=>String(s||'').replace(/\n/g,' ');
  const phones=[c.phone,...(c.secondary_phones||[])].filter(Boolean).map((p,i)=>`TEL;TYPE=${i===0?'CELL':'VOICE'}:${clean(p)}`);
  const emails=[c.email,...(c.secondary_emails||[])].filter(Boolean).map(e=>`EMAIL:${clean(e)}`);
  const card=['BEGIN:VCARD','VERSION:3.0',`N:${clean(c.last_name)};${clean(c.first_name)};;;`,`FN:${clean(c.name)}`,c.company?`ORG:${clean(c.company)}`:'',c.job_title?`TITLE:${clean(c.job_title)}`:'',...phones,...emails,c.address?`ADR:;;${clean(c.address)};;;;`:'','END:VCARD'].filter(Boolean).join('\r\n');
  saveBlobDownload(new Blob([card],{type:'text/vcard'}),(c.name||'contact')+'.vcf').catch(e=>toast(e?.message||'ساخت کارت تماس انجام نشد','error'));
}


/* =====================================================================
   CRM-NIKARA 1.4.0 — پیدا کردن سریع مشتری، شرکت قابل تایپ، جستجوی اسناد
   ===================================================================== */
const sNorm=v=>window.OfflineDB?.searchNorm?window.OfflineDB.searchNorm(v):String(v||'').toLowerCase().trim();
const RECENT_OPEN_KEY='nikara-recent-open-v1';

/* ---------- Company picker: type a company name instead of a dead-end select ---------- */
let companyPickerCache=[];
async function companyPickerField(id,selectedOrgId='',label='شرکت / سازمان'){
  try{companyPickerCache=await api('/api/organizations?limit=1000');}catch{companyPickerCache=[];}
  const sel=companyPickerCache.find(o=>o.id===selectedOrgId);
  return `<div class="company-picker" data-picker="${id}"><label class="company-picker-label" for="${id}">${label}</label><div class="company-picker-row"><span class="company-picker-icon" aria-hidden="true">🏢</span><input id="${id}" autocomplete="off" enterkeyhint="next" value="${esc(sel?.name||'')}" placeholder="نام شرکت را بنویس یا از لیست انتخاب کن" aria-describedby="${id}Hint" oninput="companyPickerInput('${id}')" onfocus="companyPickerInput('${id}')" onblur="companyPickerBlur('${id}')"><button type="button" class="company-picker-clear" aria-label="بدون شرکت" onclick="companyPickerClear('${id}')">×</button></div><div id="${id}Suggest" class="company-suggest hidden" role="listbox" aria-label="شرکت‌های ثبت‌شده"></div><small id="${id}Hint" class="company-hint" aria-live="polite"></small></div>`;
}
function companyPickerMatch(name){const n=sNorm(name);return n?companyPickerCache.find(o=>sNorm(o.name)===n)||null:null;}
function companyPickerHint(id){
  const input=$('#'+id),hint=$('#'+id+'Hint');if(!input||!hint)return;
  const v=String(input.value||'').trim(),m=companyPickerMatch(v);
  hint.className='company-hint '+(m?'ok':v?'new':'');
  hint.innerHTML=m?`✓ به پرونده شرکت <b>${esc(m.name)}</b> وصل می‌شود`:v?`+ شرکت جدید <b>${esc(v)}</b> ساخته می‌شود و این شخص زیر آن ثبت می‌شود`:'بدون شرکت ثبت می‌شود؛ هر وقت خواستی نام شرکت را اینجا بنویس.';
}
function companyPickerInput(id){
  const input=$('#'+id),box=$('#'+id+'Suggest');if(!input||!box)return;
  const q=String(input.value||'').trim();
  let rows=q?companyPickerCache.filter(o=>window.OfflineDB?.matchesQuery?OfflineDB.matchesQuery([o.name,o.legal_name,o.industry],q):sNorm(o.name).includes(sNorm(q))):companyPickerCache.slice();
  rows=rows.slice(0,6);
  const exact=companyPickerMatch(q);
  const items=rows.map(o=>`<button type="button" role="option" class="company-option ${exact&&exact.id===o.id?'active':''}" onmousedown="event.preventDefault()" onclick="companyPickerChoose('${id}','${o.id}')"><b>${esc(o.name)}</b><small>${esc(o.industry||'')}${o.contacts_count?` · ${nfmt(o.contacts_count)} نفر`:''}</small></button>`);
  if(q&&!exact)items.push(`<button type="button" role="option" class="company-option create" onmousedown="event.preventDefault()" onclick="companyPickerConfirmNew('${id}')"><b>+ ساخت شرکت «${esc(q)}»</b><small>پرونده شرکت جدید ساخته می‌شود</small></button>`);
  box.innerHTML=items.join('');
  box.classList.toggle('hidden',!items.length||document.activeElement!==input);
  companyPickerHint(id);
}
function companyPickerChoose(id,orgId){const o=companyPickerCache.find(x=>x.id===orgId),input=$('#'+id);if(!o||!input)return;input.value=o.name;$('#'+id+'Suggest')?.classList.add('hidden');companyPickerHint(id);}
function companyPickerConfirmNew(id){$('#'+id+'Suggest')?.classList.add('hidden');companyPickerHint(id);}
function companyPickerBlur(id){setTimeout(()=>{$('#'+id+'Suggest')?.classList.add('hidden');companyPickerHint(id);},160);}
function companyPickerClear(id){const input=$('#'+id);if(!input)return;input.value='';companyPickerHint(id);input.focus();}
// {organization_id} for an existing company, {company} to create a new one, {organization_id:null} for none.
function readCompanyPicker(id){
  const v=String($('#'+id)?.value||'').trim();
  if(!v)return {organization_id:null};
  const m=companyPickerMatch(v);
  return m?{organization_id:m.id}:{company:v};
}
function initCompanyPickers(root=document){$$('.company-picker input').forEach(i=>companyPickerHint(i.id));}

/* ---------- Recently opened customers ---------- */
function rememberRecent(item){
  try{const list=JSON.parse(localStorage.getItem(RECENT_OPEN_KEY)||'[]').filter(x=>!(x.type===item.type&&x.id===item.id));list.unshift({...item,at:Date.now()});localStorage.setItem(RECENT_OPEN_KEY,JSON.stringify(list.slice(0,8)));}catch{}
}
function recentOpenHtml(){
  let list=[];try{list=JSON.parse(localStorage.getItem(RECENT_OPEN_KEY)||'[]');}catch{}
  if(!list.length)return `<div class="finder-tip">مثلاً: <button type="button" class="finder-sample" onclick="fillSearchSample(this)">نام مشتری</button> <button type="button" class="finder-sample" onclick="fillSearchSample(this)">۴ رقم آخر شماره</button> <button type="button" class="finder-sample" onclick="fillSearchSample(this)">شماره فاکتور</button></div>`;
  return `<div class="finder-recent"><span class="muted">اخیراً باز شده</span><div class="finder-recent-row">${list.map(x=>`<button type="button" class="recent-chip" onclick="${x.type==='organization'?`openOrganization('${x.id}')`:x.type==='project'?`openProject('${x.id}')`:`openContact('${x.id}')`}"><span>${x.type==='organization'?'🏢':x.type==='project'?'◆':'👤'}</span>${esc(x.name||'')}</button>`).join('')}</div></div>`;
}
function fillSearchSample(btn){const input=btn.closest('.finder')?.querySelector('input');if(input){input.focus();input.placeholder=btn.textContent+'...';}}

/* ---------- Global search (dashboard + every page) ---------- */
let homeSearchTimer=null,gsTimer=null,searchSeq=0;
function debouncedHomeSearch(){clearTimeout(homeSearchTimer);homeSearchTimer=setTimeout(()=>runGlobalSearch('homeSearch','homeSearchResults'),160);}
function debouncedGlobalSearch(){clearTimeout(gsTimer);gsTimer=setTimeout(()=>runGlobalSearch('gsInput','gsResults'),160);}
function clearHomeSearch(){const i=$('#homeSearch');if(!i)return;i.value='';runGlobalSearch('homeSearch','homeSearchResults');i.focus();}
function searchKey(event,inputId){
  if(event.key==='Escape'&&inputId==='homeSearch'){clearHomeSearch();return;}
  if(event.key!=='Enter')return;
  event.preventDefault();
  const box=event.target.closest('.finder')?.querySelector('.finder-results');
  box?.querySelector('[data-first]')?.click();
}
function highlightMatch(text,q){
  const t=String(text||'');const nq=sNorm(q);if(!nq||nq.length<2)return esc(t);
  const idx=t.toLowerCase().indexOf(String(q).trim().toLowerCase());
  if(idx<0)return esc(t);
  const len=String(q).trim().length;
  return esc(t.slice(0,idx))+'<mark>'+esc(t.slice(idx,idx+len))+'</mark>'+esc(t.slice(idx+len));
}
function ownerOpenCall(owner){if(!owner)return '';return owner.type==='organization'?`openOrganization('${owner.id}')`:owner.type==='project'?`openProject('${owner.id}')`:`openContact('${owner.id}')`;}
function searchGroup(title,count,html){return count?`<div class="finder-group"><div class="finder-group-head"><b>${title}</b><span>${nfmt(count)}</span></div>${html}</div>`:'';}
function renderSearchResults(r,q){
  let first=true;const mark=()=>{if(first){first=false;return 'data-first="1"';}return '';};
  const people=(r.contacts||[]).map(c=>`<div class="finder-item"><button type="button" class="finder-main" ${mark()} onclick="openContact('${c.id}')"><span class="avatar">${initials(c)}</span><span class="finder-text"><b>${highlightMatch(c.name,q)}${c.is_primary_contact?' <span class="mini-star">★</span>':''}</b><small>${esc([c.job_title,c.company||'بدون شرکت'].filter(Boolean).join(' · '))}</small><small class="ltr">${esc(phoneDisplay(c.phone)||'')}</small></span></button>${c.phone?`<button type="button" class="finder-call" aria-label="تماس با ${esc(c.name)}" onclick="startCall('${c.id}','${esc(c.phone)}')">📞</button>`:''}</div>`).join('');
  const orgs=(r.organizations||[]).map(o=>`<div class="finder-item"><button type="button" class="finder-main" ${mark()} onclick="openOrganization('${o.id}')"><span class="avatar org-avatar">${initials(o)}</span><span class="finder-text"><b>${highlightMatch(o.name,q)}</b><small>${esc(o.industry||'شرکت / سازمان')} · ${nfmt(o.contacts_count||0)} نفر</small><small class="ltr">${esc(phoneDisplay(o.main_phone)||'')}</small></span></button>${o.main_phone?`<a class="finder-call" aria-label="تماس با ${esc(o.name)}" href="tel:${esc(o.main_phone)}">📞</a>`:''}</div>`).join('');
  const projects=(r.projects||[]).map(p=>`<div class="finder-item"><button type="button" class="finder-main" ${mark()} onclick="openProject('${p.id}')"><span class="avatar project-avatar">◆</span><span class="finder-text"><b>${highlightMatch(p.title,q)}</b><small>${esc([projectStageLabel(p.stage),p.reference_no,p.customer].filter(Boolean).join(' · '))}</small></span></button></div>`).join('');
  const files=(r.files||[]).map(a=>`<div class="finder-item"><button type="button" class="finder-main" ${mark()} onclick="openAttachment('${a.id}')"><span class="avatar file-avatar">${attachmentIcon(a)}</span><span class="finder-text"><b>${highlightMatch(a.title||a.file_name,q)}</b><small>${esc(attachmentKindFa(a))}${a.invoice_no?' · شماره '+esc(a.invoice_no):''}${a.owner?' · '+esc(a.owner.name):''}</small>${(a.tags||[]).length?`<small class="finder-tags">${a.tags.map(t=>'#'+esc(t)).join(' ')}</small>`:''}</span></button>${a.owner?`<button type="button" class="finder-call" aria-label="باز کردن پرونده" onclick="${ownerOpenCall(a.owner)}">↗</button>`:''}</div>`).join('');
  const docs=(r.documents||[]).map(d=>`<div class="finder-item"><button type="button" class="finder-main" ${mark()} onclick="${d.owner?ownerOpenCall(d.owner):`switchTab('documents')`}"><span class="avatar doc-avatar">▤</span><span class="finder-text"><b>${highlightMatch(d.title,q)}</b><small>${esc(documentStatusLabel(d.effective_status||d.status))}${d.document_no?' · '+esc(d.document_no):''}${d.owner?' · '+esc(d.owner.name):''}</small></span></button></div>`).join('');
  const notes=(r.notes||[]).map(n=>`<div class="finder-item"><button type="button" class="finder-main" ${mark()} onclick="${n.owner?ownerOpenCall(n.owner):''}"><span class="avatar note-avatar">${ACTIVITY_ICONS[n.type]||'📝'}</span><span class="finder-text"><b>${esc(n.owner?.name||typeFa[n.type]||'یادداشت')}</b><small class="finder-snippet">${highlightMatch(n.body||n.subject,q)}</small><small>${dateFmt(n.occurred_at)}</small></span></button></div>`).join('');
  const html=searchGroup('افراد',(r.contacts||[]).length,people)+searchGroup('شرکت‌ها',(r.organizations||[]).length,orgs)+searchGroup('فایل‌ها و فاکتورها',(r.files||[]).length,files)+searchGroup('پروژه‌ها',(r.projects||[]).length,projects)+searchGroup('مدارک',(r.documents||[]).length,docs)+searchGroup('در یادداشت‌ها و گزارش تماس‌ها',(r.notes||[]).length,notes);
  const invoices=(r.invoices||[]).map(x=>`<div class="finder-item"><button type="button" class="finder-main" ${mark()} onclick="openInvoice('${x.id}')"><span class="avatar file-avatar">${x.type==='invoice'?'🧾':'📄'}</span><span class="finder-text"><b>${highlightMatch(x.number,q)}</b><small>${esc(window.INVOICE_TYPE_FA?.[x.type]||x.type)} · ${esc(x.buyer_name||'')} · ${nfmt(x.grand_total)} ریال</small></span></button></div>`).join('');
  const allHtml=html+searchGroup('فاکتورها و پیش‌فاکتورها',(r.invoices||[]).length,invoices);
  if(!allHtml)return `<div class="finder-empty"><b>چیزی برای «${esc(q)}» پیدا نشد</b><span>املای دیگر، بخشی از نام یا چند رقم آخر شماره را امتحان کن.</span><div class="actions"><button type="button" class="btn" onclick="openNewPerson()">+ ثبت شخص جدید</button><button type="button" class="btn" onclick="openNewOrganization()">+ ثبت شرکت جدید</button></div></div>`;
  return allHtml;

}
async function runGlobalSearch(inputId,resultsId){
  const input=$('#'+inputId),box=$('#'+resultsId);if(!input||!box)return;
  const q=String(input.value||'').trim();
  $('#homeSearchClear')?.classList.toggle('hidden',!($('#homeSearch')?.value));
  if(!q){box.innerHTML=recentOpenHtml();box.closest('.finder')?.classList.remove('has-results');return;}
  const seq=++searchSeq;
  try{
    const r=await api('/api/search?q='+encodeURIComponent(q)+'&limit=8');
    if(seq!==searchSeq)return;
    box.innerHTML=renderSearchResults(r,q);
    box.closest('.finder')?.classList.add('has-results');
  }catch(e){box.innerHTML=errorState('dashboard','جستجو انجام نشد');}
}
function openGlobalSearch(){
  if(!$('#dashboard')?.classList.contains('hidden')&&$('#modal')?.classList.contains('hidden')){const i=$('#homeSearch');i?.focus();i?.scrollIntoView({block:'center',behavior:'smooth'});return;}
  $('#modalTitle').textContent='جستجوی سریع';
  $('#modalBody').innerHTML=`<div class="finder finder-modal" role="search"><div class="finder-box"><span class="finder-icon" aria-hidden="true">⌕</span><input id="gsInput" type="search" enterkeyhint="search" autocomplete="off" placeholder="نام، شرکت، چند رقم شماره، فاکتور یا فایل..." aria-label="جستجو در همه CRM" oninput="debouncedGlobalSearch()" onkeydown="searchKey(event,'gsInput')"></div><div id="gsResults" class="finder-results" aria-live="polite">${recentOpenHtml()}</div></div>`;
  openModal();
}

/* ---------- Searchable documents panel inside each customer file ---------- */
function attachmentSearchText(a={}){return sNorm([a.title,a.file_name,a.invoice_no,a.note,(a.tags||[]).join(' '),attachmentKindFa(a),a.amount?String(a.amount):'',a.invoice_date?dateOnlyFmt(a.invoice_date):''].join(' '));}
function filterDocPanel(input){
  const panel=input.closest('.documents-panel');if(!panel)return;
  const tokens=sNorm(input.value).split(' ').filter(Boolean);
  const cat=panel.querySelector('.doc-filter-chip.active')?.dataset.cat||'';
  let shown=0;
  panel.querySelectorAll('.doc-card').forEach(card=>{const hay=card.dataset.search||'';const ok=(!cat||card.dataset.cat===cat)&&tokens.every(t=>hay.includes(t));card.classList.toggle('hidden',!ok);if(ok)shown++;});
  const none=panel.querySelector('.doc-filter-empty');if(none)none.classList.toggle('hidden',shown>0);
  const count=panel.querySelector('.doc-filter-count');if(count)count.textContent=tokens.length||cat?`${nfmt(shown)} نتیجه`:'';
}
function setDocFilterCat(btn){const panel=btn.closest('.documents-panel');if(!panel)return;panel.querySelectorAll('.doc-filter-chip').forEach(b=>b.classList.toggle('active',b===btn));const input=panel.querySelector('.doc-filter-input');if(input)filterDocPanel(input);}

/* ---------- Edit file details (so old uploads become findable) ---------- */
async function openAttachmentEdit(id,ctx=''){
  try{
    const a=await api('/api/attachments/'+id);
    const back=ctx==='files'?'files':currentContact?.id?`contact:${currentContact.id}`:currentOrganization?.id?`organization:${currentOrganization.id}`:currentProject?.id?`project:${currentProject.id}`:'';
    $('#modalTitle').textContent='جزئیات فایل';
    $('#modalBody').innerHTML=`<div class="panel attachment-form"><div class="doc-edit-file">${attachmentIcon(a)} <b>${esc(a.file_name)}</b> <span class="muted">${bytesFmt(a.size)}</span></div><div class="two-col"><label>نوع سند<select id="aeCategory">${['invoice','proforma','receipt','contract','document','other'].map(k=>`<option value="${k}" ${a.category===k?'selected':''}>${attachmentKindFa({category:k})}</option>`).join('')}</select></label><label>عنوان<input id="aeTitle" value="${esc(a.title||'')}" placeholder="عنوانی که بعداً با آن پیدایش می‌کنی"></label></div><div class="two-col"><label>شماره فاکتور / سند<input id="aeInvoiceNo" value="${esc(a.invoice_no||'')}"></label><label>تاریخ (شمسی)${jalaliDateField('aeInvoiceDate',a.invoice_date||'')}</label></div><div class="two-col"><label>مبلغ<input id="aeAmount" inputmode="decimal" value="${a.amount||''}"></label><label>برچسب‌ها<input id="aeTags" value="${esc((a.tags||[]).join('، '))}" placeholder="مثلاً حمل، بیمه، ۱۴۰۵"></label></div><label>یادداشت<textarea id="aeNote">${esc(a.note||'')}</textarea></label><div class="actions"><button class="btn primary" onclick="saveAttachmentEdit('${a.id}','${back}')">ذخیره</button><button class="btn" onclick="openAttachment('${a.id}')">↗ باز کردن فایل</button></div></div>`;
    openModal();
  }catch(e){toast(e?.message||'فایل پیدا نشد','error');}
}
async function saveAttachmentEdit(id,back=''){
  try{
    await api('/api/attachments/'+id,{method:'PATCH',body:{category:$('#aeCategory').value,title:$('#aeTitle').value,invoice_no:$('#aeInvoiceNo').value,invoice_date:readJalaliDate('aeInvoiceDate')||'',amount:$('#aeAmount').value,tags:$('#aeTags').value,note:$('#aeNote').value}});
    toast('جزئیات فایل ذخیره شد','success');
    const [kind,ref]=String(back).split(':');
    if(kind==='contact')await openContact(ref);else if(kind==='organization')await openOrganization(ref);else if(kind==='project')await openProject(ref);else{closeModal();loadFiles();}
  }catch(e){toast(e?.message||'ذخیره انجام نشد','error');}
}

/* ---------- Files & invoices list on the Documents page ---------- */
let filesTimer=null;
function debouncedFiles(){clearTimeout(filesTimer);filesTimer=setTimeout(loadFiles,180);}
async function loadFiles(){
  const host=$('#fileList');if(!host)return;
  try{
    const q=encodeURIComponent($('#fileSearch')?.value||''),cat=encodeURIComponent($('#fileCategoryFilter')?.value||'');
    const rows=await api(`/api/attachments?q=${q}&category=${cat}&limit=200`);
    const count=$('#fileCount');if(count)count.textContent=`${nfmt(rows.length)} فایل`;
    host.innerHTML=rows.map(a=>renderAttachmentCard(a,{owner:true,ctx:'files'})).join('')||emptyState('📎',q||cat?'فایلی با این مشخصات پیدا نشد.':'هنوز فایلی برای مشتری‌ها ثبت نشده است. از داخل پرونده هر شخص یا شرکت «📎 افزودن» را بزن.');
  }catch(e){console.warn('files load failed',e);host.innerHTML=errorState('files');}
}
loaderRegistry.files=loadFiles;

/* ---------- Caller ID: last call banner, setup nudge, overlay permission, real simulation ---------- */
async function refreshCallerHome(){
  const host=$('#callerHome');if(!host)return;
  if(!NATIVE){host.innerHTML='';host.classList.add('hidden');return;}
  const CI=nativePlugin('CallerId');if(!CI?.getStatus){host.classList.add('hidden');return;}
  let html='';
  try{
    const last=CI.getLastIncomingCall?await CI.getLastIncomingCall():null;
    const ts=Number(last?.timestamp||0),dismissed=Number(localStorage.getItem('nikara-last-call-dismissed')||0);
    if(last?.matched&&last.contact_id&&ts&&Date.now()-ts<45*60*1000&&ts!==dismissed){
      const isOrg=String(last.contact_id).startsWith('org:');const id=isOrg?last.contact_id.slice(4):last.contact_id;
      const mins=Math.max(0,Math.round((Date.now()-ts)/60000));
      html+=`<div class="last-call"><span class="last-call-icon" aria-hidden="true">📞</span><div class="last-call-main"><small>${mins?`${nfmt(mins)} دقیقه پیش`:'همین الان'} · تماس ورودی</small><b>${esc(last.name||'مشتری CRM')}</b>${last.company?`<small>${esc(last.company)}</small>`:''}</div><div class="last-call-actions">${isOrg?`<button class="btn primary" onclick="openOrganization('${id}')">پرونده</button>`:`<button class="btn primary" onclick="openContact('${id}',true)">ثبت گزارش تماس</button>`}<button class="icon-btn small" aria-label="بستن" onclick="dismissLastCall(${ts})">×</button></div></div>`;
    }
    const s=await CI.getStatus();
    const missing=[];
    if(s?.supported!==false){
      if(!s.granted)missing.push('نقش Caller ID');
      if(s.contacts_permission===false)missing.push('مجوز مخاطبین');
      if(s.overlay_allowed===false)missing.push('نمایش روی برنامه‌ها');
      if(!(s.notifications_permission&&s.notifications_enabled))missing.push('اعلان‌ها');
    }
    if(missing.length&&localStorage.getItem('nikara-caller-nudge-off')!=='1'&&localStorage.getItem('crm_caller_id_enabled')!=='0')html+=`<div class="caller-nudge"><span aria-hidden="true">⚠</span><div><b>پرونده مشتری هنگام تماس ممکن است باز نشود</b><small>باقی‌مانده: ${missing.join('، ')}</small></div><button class="btn" onclick="switchTab('settings');setTimeout(enableCallerId,300)">درست کن</button><button class="icon-btn small" aria-label="بستن" onclick="localStorage.setItem('nikara-caller-nudge-off','1');refreshCallerHome()">×</button></div>`;
  }catch(e){console.warn('caller home',e);}
  host.innerHTML=html;host.classList.toggle('hidden',!html);
}
function dismissLastCall(ts){localStorage.setItem('nikara-last-call-dismissed',String(ts));refreshCallerHome();}
async function openCallerOverlaySettings(){
  if(!NATIVE)return;
  const CI=nativePlugin('CallerId');
  if(!CI?.openOverlaySettings)return toast('این APK قدیمی است؛ نسخه 1.4.0 را نصب کن','error');
  try{await CI.openOverlaySettings();toast('CRM-NIKARA را در «نمایش روی برنامه‌های دیگر» روشن کن و برگرد');}catch(e){toast(e?.message||'تنظیمات باز نشد','error')}
}
async function openCallerSimulation(){
  if(!NATIVE)return toast('شبیه‌سازی فقط داخل APK اجرا می‌شود','error');
  const rows=(await api('/api/contacts?limit=2000')).filter(c=>c.phone&&!c.archived&&(c.caller_id===true||(c.caller_id!==false&&!['device-contacts','caller-id-cache'].includes(String(c.source||'')))));
  $('#modalTitle').textContent='شبیه‌سازی تماس ورودی';
  $('#modalBody').innerHTML=`<div class="panel"><p class="muted">دقیقاً همان مسیری اجرا می‌شود که هنگام زنگ خوردن واقعی اجرا می‌شود: تطبیق شماره با حافظه Caller ID و نمایش کارت مشتری روی صفحه.</p><label>مشتری<select id="simContact" onchange="$('#simNumber').value=this.value">${rows.slice(0,300).map(c=>`<option value="${esc(c.phone)}">${esc(c.name)}${c.company?' — '+esc(c.company):''}</option>`).join('')||'<option value="">هنوز شخصی با شماره ثبت نشده</option>'}</select></label><label>شماره تماس‌گیرنده<input id="simNumber" class="ltr" inputmode="tel" value="${esc(rows[0]?.phone||'')}"></label><button class="btn primary wide" onclick="runCallerSimulation()">📞 اجرای تماس آزمایشی</button></div>`;
  openModal();
}
async function runCallerSimulation(){
  const CI=nativePlugin('CallerId');const number=String($('#simNumber')?.value||'').trim();
  if(!number)return toast('شماره را وارد کن','error');
  if(!CI?.simulateIncomingCall)return testCallerIdPopup();
  try{
    await syncCallerIdContacts();
    const r=await CI.simulateIncomingCall({number});
    closeModal();
    if(!r?.matched)toast('این شماره در حافظه Caller ID نبود؛ «نمایش پرونده هنگام تماس» را در ویرایش شخص روشن کن','error');
    else toast(r.overlay?'کارت مشتری روی صفحه باز شد ✓':'پرونده با اعلان باز شد؛ برای نمایش روی صفحه تماس، «نمایش روی برنامه‌ها» را روشن کن','success');
    setTimeout(()=>loadCallerIdStatus().catch(()=>{}),600);
  }catch(e){toast(e?.message||'شبیه‌سازی اجرا نشد','error')}
}

$$('[data-tab]').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
async function startApp(){ initNativeBridge(); await boot(); }
startApp();

/* ===================== Invoices, proforma invoices & product catalog (v1.4.0) ===================== */
let invoiceView='invoice';
let invoiceTimer=null;
let productTimer=null;
let invDraft=null;
let invCtx={products:[],orgs:[],people:[],projects:[],settings:null,nextNumber:''};
const INVOICE_STATUS_FA={draft:'پیش‌نویس',issued:'صادرشده',paid:'تسویه‌شده',cancelled:'لغوشده',sent:'ارسال‌شده',accepted:'تأییدشده',converted:'تبدیل به فاکتور',expired:'منقضی'};
const INVOICE_TYPE_FA={invoice:'فاکتور',proforma:'پیش‌فاکتور'};
function invNum(v){const n=Number(latinDigits(String(v??'')).replace(/[,٬\s]/g,'').replace(/٫/g,'.'));return Number.isFinite(n)?n:0;}
function invMoney(v){return nfmt(Math.round(Number(v||0)));}
function invQty(v){return new Intl.NumberFormat('fa-IR',{maximumFractionDigits:3}).format(Number(v||0));}
function invInputMoney(v){const n=Math.round(invNum(v));return n?n.toLocaleString('en-US'):'';}
function invFormatMoneyInput(el){if(!el)return;el.value=invInputMoney(el.value);}
function invStatusBadge(inv){const st=inv.expired?'expired':inv.status;return `<span class="badge inv-status inv-status-${esc(st)}">${esc(INVOICE_STATUS_FA[st]||st)}</span>`;}
function invoiceTotalsLocal(inv){return OfflineDB.computeInvoiceTotals(inv);}
function invoiceWords(v){return OfflineDB.numberToPersianWords(Math.round(Number(v||0)));}

function setInvoiceView(view){
  invoiceView=['invoice','proforma','products','settings'].includes(view)?view:'invoice';
  $$('[data-inv-view]').forEach(b=>{const on=b.dataset.invView===invoiceView;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on?'true':'false');});
  const listMode=invoiceView==='invoice'||invoiceView==='proforma';
  $('#invoiceToolbar')?.classList.toggle('hidden',!listMode);
  $('#invoiceStats')?.classList.toggle('hidden',!listMode);
  if(listMode&&$('#invoiceStatusFilter')){
    const sts=invoiceView==='invoice'?['draft','issued','paid','cancelled']:['draft','sent','accepted','converted','expired','cancelled'];
    const cur=$('#invoiceStatusFilter').value;
    $('#invoiceStatusFilter').innerHTML='<option value="">همه وضعیت‌ها</option>'+sts.map(s=>`<option value="${s}" ${cur===s?'selected':''}>${INVOICE_STATUS_FA[s]}</option>`).join('');
  }
  loadInvoices();
}
function debouncedInvoices(){clearTimeout(invoiceTimer);invoiceTimer=setTimeout(loadInvoices,180);}
async function loadInvoices(){
  try{await loadInvoicesInner();}catch(e){console.warn('invoices load failed',e);const el=$('#invoiceContent');if(el)el.innerHTML=errorState('invoices');}
}
loaderRegistry.invoices=loadInvoices;
async function loadInvoicesInner(){
  const box=$('#invoiceContent');if(!box)return;
  if(invoiceView==='products')return renderProductsView(box);
  if(invoiceView==='settings')return renderInvoiceSettingsView(box);
  box.innerHTML=loadingState();
  const type=invoiceView;
  const q=($('#invoiceSearch')?.value||'').trim();
  const statusFilter=$('#invoiceStatusFilter')?.value||'';
  const all=await api(`/api/invoices?type=${type}`);
  let rows=q?await api(`/api/invoices?type=${type}&q=${encodeURIComponent(q)}`):all;
  if(statusFilter)rows=rows.filter(x=>statusFilter==='expired'?x.expired:(x.status===statusFilter&&!x.expired));
  const live=all.filter(x=>x.status!=='cancelled');
  const thisMonth=(()=>{const j=jalaliParts(new Date());return live.filter(x=>{const p=jalaliParts(x.issue_date);return p&&p.jy===j.jy&&p.jm===j.jm;});})();
  const sum=a=>a.reduce((s,x)=>s+Number(x.grand_total||0),0);
  const stats=type==='invoice'
    ?[['🧾 فاکتورهای معتبر',nfmt(live.length)],['جمع کل (ریال)',invMoney(sum(live))],['این ماه (ریال)',invMoney(sum(thisMonth))],['پیش‌نویس',nfmt(all.filter(x=>x.status==='draft').length)]]
    :[['📄 پیش‌فاکتورها',nfmt(all.length)],['باز (ارسال/پیش‌نویس)',nfmt(all.filter(x=>['draft','sent'].includes(x.status)&&!x.expired).length)],['تأیید / تبدیل‌شده',nfmt(all.filter(x=>['accepted','converted'].includes(x.status)).length)],['جمع باز (ریال)',invMoney(sum(all.filter(x=>['draft','sent'].includes(x.status)&&!x.expired)))]];
  $('#invoiceStats').innerHTML=stats.map(([a,b])=>`<div class="panel stat"><span class="muted">${a}</span><b>${b}</b></div>`).join('');
  box.innerHTML=rows.length?`<div class="inv-list">${rows.map(invoiceListRow).join('')}</div>`:emptyState('🧾',q||statusFilter?'موردی مطابق جستجو پیدا نشد.':`هنوز ${INVOICE_TYPE_FA[type]}ی صادر نشده است.`,`<button class="btn primary" type="button" onclick="openInvoiceEditor('${type}')">+ ${INVOICE_TYPE_FA[type]} جدید</button>`);
}
function invoiceListRow(x){
  return `<div class="inv-list-row" role="button" tabindex="0" onclick="openInvoice('${x.id}')" onkeydown="cardKey(event,'openInvoice','${x.id}')"><div class="inv-list-icon ${x.type}">${x.type==='invoice'?'🧾':'📄'}</div><div class="inv-list-main"><b class="ltr-num">${esc(x.number)}</b><div>${esc(x.buyer?.name||'-')}</div><small class="muted">${dateOnlyFmt(x.issue_date)} · ${nfmt((x.items||[]).length)} ردیف${x.due_date?` · ${x.type==='proforma'?'اعتبار تا':'سررسید'} ${dateOnlyFmt(x.due_date)}`:''}</small></div><div class="inv-list-side"><b>${invMoney(x.grand_total)} <small>ریال</small></b>${invStatusBadge(x)}<button type="button" class="icon-btn inv-quick-share" aria-label="اشتراک‌گذاری PDF ${esc(x.number)}" title="اشتراک‌گذاری PDF" onclick="event.stopPropagation();exportInvoicePdf('${x.id}','share')">📤</button></div></div>`;
}

/* ---------- Editor ---------- */
async function loadInvoiceContext(type){
  const [products,orgs,people,projects,settings,next]=await Promise.all([api('/api/products'),api('/api/organizations?limit=2000'),api('/api/contacts?limit=4000'),api('/api/projects?limit=2000'),api('/api/invoice-settings'),api(`/api/invoices/next-number?type=${type}`)]);
  invCtx={products,orgs,people,projects,settings,nextNumber:next.number};
}
// Default terms are copied into each document; editing a document never edits settings.
function invoiceTermRows(rows, text=''){
  return Array.isArray(rows)?rows.map(x=>String(x??'')):String(text||'').split(/\r?\n/).filter(x=>x.trim());
}
function invoiceDefaultTermRows(settings,type){
  return invoiceTermRows(settings.default_term_rows?.[type],settings.default_terms?.[type]);
}
function syncInvoiceTerms(){invDraft.terms=invDraft.term_rows.map(x=>x.trim()).filter(Boolean).join('\n');}
function renderInvoiceTermRows(){
  const box=$('#invTermRows');if(!box||!invDraft)return;
  box.innerHTML=invDraft.term_rows.map((text,i)=>`<div class="inv-term-row"><label>متن ${nfmt(i+1)}<textarea rows="2" oninput="invDraft.term_rows[${i}]=this.value;syncInvoiceTerms()">${esc(text)}</textarea></label><button type="button" class="icon-btn" aria-label="حذف متن ${nfmt(i+1)} از این سند" onclick="removeInvoiceTermRow(${i})">×</button></div>`).join('');
}
function addInvoiceTermRow(){invDraft.term_rows.push('');renderInvoiceTermRows();}
function removeInvoiceTermRow(i){invDraft.term_rows.splice(i,1);syncInvoiceTerms();renderInvoiceTermRows();}
function renderDefaultTermRows(type){
  const box=$('#invDefaultTerms_'+type);if(!box||!invSettingsDraft)return;
  const rows=invSettingsDraft.default_term_rows[type];
  box.innerHTML=rows.map((text,i)=>`<div class="inv-term-row"><label>متن ${nfmt(i+1)}<textarea rows="2" oninput="setDefaultTermRow('${type}',${i},this.value)">${esc(text)}</textarea></label><button type="button" class="icon-btn" aria-label="حذف متن پیش‌فرض ${nfmt(i+1)}" onclick="removeDefaultTermRow('${type}',${i})">×</button></div>`).join('');
}
function syncDefaultTerms(type){invSettingsDraft.default_terms[type]=invSettingsDraft.default_term_rows[type].map(x=>x.trim()).filter(Boolean).join('\n');}
function setDefaultTermRow(type,i,value){invSettingsDraft.default_term_rows[type][i]=value;syncDefaultTerms(type);}
function addDefaultTermRow(type){invSettingsDraft.default_term_rows[type].push('');renderDefaultTermRows(type);}
function removeDefaultTermRow(type,i){invSettingsDraft.default_term_rows[type].splice(i,1);syncDefaultTerms(type);renderDefaultTermRows(type);}
function blankInvoiceItem(){return {id:'r'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),product_id:null,code:'',name:'',specs:'',qty:1,unit:'عدد',unit_price:0,discount:0,tax_exempt:false};}
async function openInvoiceEditor(type='invoice',id='',preset={}){
  try{
    let inv=null;
    if(id){inv=await api('/api/invoices/'+id);type=inv.type;}
    await loadInvoiceContext(type);
    const s=invCtx.settings,today=new Date().toISOString().slice(0,10);
    if(inv){invDraft=JSON.parse(JSON.stringify(inv));delete invDraft.totals;delete invDraft.amount_words;}
    else{
      invDraft={type,number:'',status:type==='invoice'?'issued':'sent',issue_date:today,due_date:type==='proforma'&&s.proforma_validity_days?addDaysLocal(today,s.proforma_validity_days):'',party_type:null,party_id:null,contact_id:null,project_id:preset.project_id||null,buyer:{name:'',contact_person:'',national_id:'',economic_code:'',registration_no:'',phone:'',address:'',postal_code:'',email:''},items:[blankInvoiceItem()],tax_enabled:s.show_tax!==false,tax_rate:s.tax_rate,discount:0,shipping:0,prepaid:0,payment_terms:'',notes:'',terms:s.default_terms[type]||'',post_to_ledger:type==='invoice',...(preset.copy||{})};
      if(preset.copy){invDraft.type=type;invDraft.number='';invDraft.status=type==='invoice'?'issued':'sent';invDraft.issue_date=today;invDraft.items=(preset.copy.items||[]).map(i=>({...i,id:blankInvoiceItem().id}));delete invDraft.id;delete invDraft.ledger_entry_id;delete invDraft.converted_invoice_id;delete invDraft.source_proforma_id;}
      if(preset.party_type&&preset.party_id)invApplyParty(preset.party_type,preset.party_id,false);
    }
    invDraft.term_rows=invoiceTermRows(invDraft.term_rows,invDraft.terms);
    if(!inv&&!preset.copy)invDraft.term_rows=invoiceDefaultTermRows(s,type);
    syncInvoiceTerms();
    renderInvoiceEditor();
  }catch(e){toast(e.message||'باز کردن فرم فاکتور انجام نشد','error');}
}
function addDaysLocal(ymd,days){const d=new Date(`${ymd}T12:00:00Z`);if(Number.isNaN(d.getTime()))return '';d.setUTCDate(d.getUTCDate()+Number(days||0));return d.toISOString().slice(0,10);}
function renderInvoiceEditor(){
  const d=invDraft,s=invCtx.settings,isNew=!d.id,typeFa=INVOICE_TYPE_FA[d.type];
  const statuses=d.type==='invoice'?['draft','issued','paid','cancelled']:['draft','sent','accepted','expired','cancelled'].concat(d.status==='converted'?['converted']:[]);
  $('#modalTitle').textContent=isNew?`${typeFa} جدید`:`ویرایش ${typeFa} ${d.number}`;
  const linked=d.party_id?invPartyName(d.party_type,d.party_id):'';
  const orgPeople=d.party_type==='organization'?invCtx.people.filter(c=>c.organization_id===d.party_id):[];
  const projects='<option value="">بدون پروژه</option>'+invCtx.projects.map(p=>`<option value="${p.id}" ${d.project_id===p.id?'selected':''}>◆ ${esc(p.title)}</option>`).join('');
  $('#modalBody').innerHTML=`<div class="inv-editor">
    ${isNew?`<div class="segmented inv-type-switch" role="group" aria-label="نوع سند"><button type="button" class="btn ${d.type==='invoice'?'active':''}" onclick="switchInvoiceDraftType('invoice')">🧾 فاکتور</button><button type="button" class="btn ${d.type==='proforma'?'active':''}" onclick="switchInvoiceDraftType('proforma')">📄 پیش‌فاکتور</button></div>`:''}
    <div class="panel">
      <div class="inv-grid-3">
        <label>شماره ${typeFa}<input id="invNumber" class="ltr" value="${esc(d.number||'')}" placeholder="${esc(invCtx.nextNumber)}" oninput="invDraft.number=this.value"><small class="muted">${isNew?`خالی بماند = خودکار (${esc(invCtx.nextNumber)})`:'قابل ویرایش؛ تکراری قبول نمی‌شود'}</small></label>
        <label>تاریخ صدور${jalaliDateField('invDate',d.issue_date)}</label>
        <label>${d.type==='proforma'?'اعتبار تا':'سررسید پرداخت'}${jalaliDateField('invDue',d.due_date||'')}</label>
      </div>
      <div class="inv-grid-2"><label>وضعیت<select id="invStatus" onchange="invDraft.status=this.value">${statuses.map(x=>`<option value="${x}" ${d.status===x?'selected':''}>${INVOICE_STATUS_FA[x]}</option>`).join('')}</select></label><label>پروژه / فرصت<select id="invProject" onchange="invDraft.project_id=this.value||null">${projects}</select></label></div>
    </div>
    <div class="panel inv-buyer">
      <div class="panel-head"><h3>مشخصات خریدار</h3>${linked?`<span class="inv-linked">🔗 ${esc(linked)} <button type="button" class="link" onclick="invUnlinkParty()">قطع اتصال</button></span>`:''}</div>
      <div class="inv-buyer-search"><input id="invBuyerSearch" type="search" autocomplete="off" placeholder="جستجوی مشتری یا شرکت از CRM (نام، شماره، شناسه ملی)..." oninput="invBuyerSearch(this.value)"><div id="invBuyerResults" class="inv-suggest hidden"></div></div>
      <small class="muted">از CRM انتخاب کن تا اطلاعات خودکار پر شود، یا فیلدها را دستی بنویس.</small>
      <div class="inv-grid-2">
        <label>نام خریدار / شرکت *<input id="invBuyerName" value="${esc(d.buyer.name)}" oninput="invDraft.buyer.name=this.value"></label>
        <label>شخص رابط${orgPeople.length?`<select id="invBuyerPerson" onchange="invPickPerson(this.value)"><option value="">—</option>${orgPeople.map(c=>`<option value="${c.id}" ${d.contact_id===c.id?'selected':''}>${esc(c.name)}${c.job_title?' · '+esc(c.job_title):''}</option>`).join('')}</select>`:`<input id="invBuyerPerson" value="${esc(d.buyer.contact_person)}" oninput="invDraft.buyer.contact_person=this.value">`}</label>
        <label>شناسه ملی / کد ملی<input class="ltr" inputmode="numeric" value="${esc(d.buyer.national_id)}" oninput="invDraft.buyer.national_id=this.value"></label>
        <label>کد اقتصادی<input class="ltr" inputmode="numeric" value="${esc(d.buyer.economic_code)}" oninput="invDraft.buyer.economic_code=this.value"></label>
        <label>شماره ثبت<input class="ltr" inputmode="numeric" value="${esc(d.buyer.registration_no)}" oninput="invDraft.buyer.registration_no=this.value"></label>
        <label>تلفن<input class="ltr" inputmode="tel" value="${esc(d.buyer.phone)}" oninput="invDraft.buyer.phone=this.value"></label>
        <label>کد پستی<input class="ltr" inputmode="numeric" value="${esc(d.buyer.postal_code)}" oninput="invDraft.buyer.postal_code=this.value"></label>
        <label>ایمیل<input class="ltr" type="email" value="${esc(d.buyer.email)}" oninput="invDraft.buyer.email=this.value"></label>
      </div>
      <label>نشانی<input value="${esc(d.buyer.address)}" oninput="invDraft.buyer.address=this.value"></label>
      ${d.party_id?'':`<label class="switch-row inv-save-buyer"><span><b>این خریدار در CRM هم ثبت شود</b><small>بعد از ذخیره، پرونده مشتری ساخته و فاکتور به آن وصل می‌شود.</small></span><select id="invSaveBuyerAs"><option value="">ثبت نشود</option><option value="organization">به‌عنوان شرکت</option><option value="contact">به‌عنوان شخص</option></select></label>`}
    </div>
    <div class="panel">
      <div class="panel-head"><h3>کالاها و خدمات</h3><div class="actions"><button type="button" class="btn" onclick="toggleInvProductPicker()">📦 از لیست کالاها</button><button type="button" class="btn primary" onclick="addInvoiceRow()">+ ردیف</button></div></div>
      <div id="invProductPicker" class="inv-product-picker hidden"><input id="invProductQuery" type="search" placeholder="کد یا نام کالا..." oninput="renderInvProductPicker()"><div id="invProductPickerList"></div></div>
      <div id="invRows" class="inv-rows"></div>
      <datalist id="invCodeList">${invCtx.products.filter(p=>p.code).map(p=>`<option value="${esc(p.code)}">${esc(p.name)}</option>`).join('')}</datalist>
      <datalist id="invNameList">${invCtx.products.map(p=>`<option value="${esc(p.name)}">${esc(p.code||'')}</option>`).join('')}</datalist>
      <datalist id="invUnitList">${(s.units||[]).map(u=>`<option value="${esc(u)}"></option>`).join('')}</datalist>
    </div>
    <div class="panel inv-totals-panel">
      <div class="inv-grid-4">
        <label>تخفیف کل (ریال)<input class="ltr" inputmode="numeric" value="${invInputMoney(d.discount)}" oninput="invDraft.discount=invNum(this.value);refreshInvoiceTotals()" onblur="invFormatMoneyInput(this)"></label>
        <label>هزینه حمل / سایر (ریال)<input class="ltr" inputmode="numeric" value="${invInputMoney(d.shipping)}" oninput="invDraft.shipping=invNum(this.value);refreshInvoiceTotals()" onblur="invFormatMoneyInput(this)"></label>
        <label>پیش‌پرداخت (ریال)<input class="ltr" inputmode="numeric" value="${invInputMoney(d.prepaid)}" oninput="invDraft.prepaid=invNum(this.value);refreshInvoiceTotals()" onblur="invFormatMoneyInput(this)"></label>
        <label>مالیات بر ارزش افزوده<span class="inv-tax-row"><input type="checkbox" ${d.tax_enabled!==false?'checked':''} onchange="invDraft.tax_enabled=this.checked;refreshInvoiceTotals()" aria-label="محاسبه مالیات"><input class="ltr" inputmode="decimal" value="${esc(String(d.tax_rate))}" oninput="invDraft.tax_rate=invNum(this.value);refreshInvoiceTotals()" aria-label="درصد مالیات"><span>٪</span></span></label>
      </div>
      <div id="invTotals" class="inv-totals"></div>
    </div>
    <div class="panel">
      <label>شرایط پرداخت<input value="${esc(d.payment_terms||'')}" placeholder="نقدی، چک ۳۰ روزه، ۵۰٪ پیش‌پرداخت..." oninput="invDraft.payment_terms=this.value"></label>
      <label>توضیحات<textarea rows="2" oninput="invDraft.notes=this.value">${esc(d.notes||'')}</textarea></label>
      <div class="inv-term-section"><h3>شرایط و ملاحظات (پایین ${typeFa})</h3><p class="muted">حذف یا ویرایش متن‌ها فقط برای همین سند است؛ متن‌های پیش‌فرض تنظیمات محفوظ می‌مانند.</p><div id="invTermRows"></div><button type="button" class="btn" onclick="addInvoiceTermRow()">+ افزودن متن</button></div>
      ${d.type==='invoice'?`<label class="switch-row"><span><b>ثبت مبلغ در حساب مشتری (طلب)</b><small>فقط برای خریدار وصل‌شده به CRM و وضعیت «صادرشده/تسویه‌شده»؛ با ویرایش فاکتور خودکار به‌روز می‌شود.</small></span><input type="checkbox" ${d.post_to_ledger?'checked':''} onchange="invDraft.post_to_ledger=this.checked"></label>`:''}
    </div>
    <div class="inv-editor-actions"><button type="button" class="btn" onclick="saveInvoiceDraft(false,true)">👁 پیش‌نمایش</button><button type="button" class="btn primary" onclick="saveInvoiceDraft(false)">💾 ذخیره</button><button type="button" class="btn success" onclick="saveInvoiceDraft('share')">📤 ذخیره و اشتراک‌گذاری</button><button type="button" class="btn" onclick="saveInvoiceDraft('print')">🖨 ذخیره و چاپ</button></div>
  </div>`;
  openModal();
  renderInvoiceRows();renderInvoiceTermRows();
}
function switchInvoiceDraftType(type){
  if(!invDraft||invDraft.id||invDraft.type===type)return;
  collectInvoiceDates();
  const s=invCtx.settings;
  invDraft.type=type;invDraft.status=type==='invoice'?'issued':'sent';invDraft.term_rows=invoiceDefaultTermRows(s,type);syncInvoiceTerms();invDraft.post_to_ledger=type==='invoice';
  if(type==='proforma'&&!invDraft.due_date&&s.proforma_validity_days)invDraft.due_date=addDaysLocal(invDraft.issue_date,s.proforma_validity_days);
  api(`/api/invoices/next-number?type=${type}`).then(r=>{invCtx.nextNumber=r.number;renderInvoiceEditor();}).catch(()=>renderInvoiceEditor());
}
function collectInvoiceDates(){
  try{invDraft.issue_date=readJalaliDate('invDate')||invDraft.issue_date;}catch(_e){}
  try{const v=$('#invDue')?.value?.trim();invDraft.due_date=v?readJalaliDate('invDue'):'';}catch(_e){}
}
function invPartyName(type,id){
  if(type==='organization'){const o=invCtx.orgs.find(x=>x.id===id);return o?`🏢 ${o.name}`:'شرکت';}
  const c=invCtx.people.find(x=>x.id===id);return c?`👤 ${c.name}${c.company?' — '+c.company:''}`:'شخص';
}
function invBuyerSearch(q){
  const box=$('#invBuyerResults');if(!box)return;
  q=String(q||'').trim();if(!q){box.classList.add('hidden');box.innerHTML='';return;}
  const mq=OfflineDB.matchesQuery;
  const orgs=invCtx.orgs.filter(o=>mq([o.name,o.legal_name,o.national_id,o.economic_code,o.industry],q,[o.main_phone,...(o.phones||[])])).slice(0,6);
  const people=invCtx.people.filter(c=>mq([c.name,c.company,c.job_title],q,[c.phone,...(c.secondary_phones||[])])).slice(0,6);
  box.innerHTML=[...orgs.map(o=>`<button type="button" onclick="invApplyParty('organization','${o.id}')"><b>🏢 ${esc(o.name)}</b><small>${esc([o.legal_name,o.economic_code&&('کد اقتصادی '+o.economic_code),phoneDisplay(o.main_phone)].filter(Boolean).join(' · '))}</small></button>`),...people.map(c=>`<button type="button" onclick="invApplyParty('contact','${c.id}')"><b>👤 ${esc(c.name)}</b><small>${esc([c.company,c.job_title,phoneDisplay(c.phone)].filter(Boolean).join(' · '))}</small></button>`)].join('')||'<div class="muted inv-suggest-empty">پیدا نشد؛ اطلاعات را دستی وارد کن.</div>';
  box.classList.remove('hidden');
}
function invApplyParty(type,id,rerender=true){
  if(rerender)collectInvoiceDates();
  const b=invDraft.buyer;
  if(type==='organization'){
    const o=invCtx.orgs.find(x=>x.id===id);if(!o)return;
    invDraft.party_type='organization';invDraft.party_id=o.id;invDraft.contact_id=o.primary_contact_id||null;
    Object.assign(b,{name:o.legal_name||o.name,national_id:o.national_id||'',economic_code:o.economic_code||'',phone:phoneDisplay(o.main_phone)||o.main_phone||'',address:o.address||'',email:o.email||''});
    const pc=invCtx.people.find(c=>c.id===invDraft.contact_id);b.contact_person=pc?.name||'';
  }else{
    const c=invCtx.people.find(x=>x.id===id);if(!c)return;
    const org=c.organization_id?invCtx.orgs.find(o=>o.id===c.organization_id):null;
    if(org){invApplyParty('organization',org.id,false);invDraft.contact_id=c.id;b.contact_person=c.name;}
    else{invDraft.party_type='contact';invDraft.party_id=c.id;invDraft.contact_id=c.id;Object.assign(b,{name:c.name,contact_person:'',national_id:c.extra?.national_id||'',economic_code:'',phone:phoneDisplay(c.phone)||c.phone||'',address:c.address||'',email:c.email||''});}
  }
  if(rerender){renderInvoiceEditor();toast('اطلاعات خریدار از CRM وارد شد','success');}
}
function invPickPerson(id){const c=invCtx.people.find(x=>x.id===id);invDraft.contact_id=c?.id||null;invDraft.buyer.contact_person=c?.name||'';}
function invUnlinkParty(){collectInvoiceDates();invDraft.party_type=null;invDraft.party_id=null;invDraft.contact_id=null;renderInvoiceEditor();}
function renderInvoiceRows(){
  const box=$('#invRows');if(!box)return;
  box.innerHTML=invDraft.items.map((it,i)=>`<div class="inv-row" data-row="${i}">
    <div class="inv-row-head"><b class="inv-row-no">${nfmt(i+1)}</b><span class="inv-row-tools"><button type="button" class="icon-btn" aria-label="بالا" onclick="moveInvoiceRow(${i},-1)" ${i===0?'disabled':''}>↑</button><button type="button" class="icon-btn" aria-label="پایین" onclick="moveInvoiceRow(${i},1)" ${i===invDraft.items.length-1?'disabled':''}>↓</button>${!it.product_id&&it.name?`<button type="button" class="icon-btn" aria-label="ذخیره در لیست کالاها" title="ذخیره در لیست کالاها" onclick="saveInvoiceRowAsProduct(${i})">💾</button>`:''}<button type="button" class="icon-btn danger-text" aria-label="حذف ردیف" onclick="removeInvoiceRow(${i})">×</button></span></div>
    <div class="inv-row-grid">
      <label class="c-code">کد کالا<input class="ltr" list="invCodeList" value="${esc(it.code)}" oninput="invRowInput(${i},'code',this.value)" onchange="invRowPick(${i},'code',this.value)"></label>
      <label class="c-name">شرح کالا / خدمات *<input list="invNameList" value="${esc(it.name)}" oninput="invRowInput(${i},'name',this.value)" onchange="invRowPick(${i},'name',this.value)"></label>
      <label class="c-specs">مشخصات<input value="${esc(it.specs)}" oninput="invRowInput(${i},'specs',this.value)"></label>
      <label class="c-qty">مقدار / تعداد<input class="ltr" inputmode="decimal" value="${esc(String(it.qty??''))}" oninput="invRowInput(${i},'qty',this.value)"></label>
      <label class="c-unit">واحد<input list="invUnitList" value="${esc(it.unit)}" oninput="invRowInput(${i},'unit',this.value)"></label>
      <label class="c-price">فی (ریال)<input class="ltr" inputmode="numeric" value="${invInputMoney(it.unit_price)}" oninput="invRowInput(${i},'unit_price',this.value)" onblur="invFormatMoneyInput(this)"></label>
      <label class="c-disc">تخفیف (ریال)<input class="ltr" inputmode="numeric" value="${invInputMoney(it.discount)}" oninput="invRowInput(${i},'discount',this.value)" onblur="invFormatMoneyInput(this)"></label>
      <div class="c-total"><span>جمع (ریال)</span><b id="invRowTotal${i}">-</b><label class="inv-exempt"><input type="checkbox" ${it.tax_exempt?'checked':''} onchange="invRowInput(${i},'tax_exempt',this.checked)"> معاف از مالیات</label></div>
    </div></div>`).join('')||emptyState('📦','ردیفی اضافه نشده است.');
  refreshInvoiceTotals();
}
function invRowInput(i,field,value){
  const it=invDraft.items[i];if(!it)return;
  if(['qty','unit_price','discount'].includes(field))it[field]=invNum(value);
  else if(field==='tax_exempt')it.tax_exempt=Boolean(value);
  else it[field]=value;
  if((field==='code'||field==='name')&&it.product_id){const p=invCtx.products.find(x=>x.id===it.product_id);if(p&&p[field]!==value)it.product_id=null;}
  refreshInvoiceTotals();
}
function invFindProduct(field,value){
  const v=OfflineDB.searchNorm(value);if(!v)return null;
  return invCtx.products.find(p=>OfflineDB.searchNorm(p[field])===v)||null;
}
function invRowPick(i,field,value){
  const p=invFindProduct(field,value);if(!p)return;
  const it=invDraft.items[i];
  Object.assign(it,{product_id:p.id,code:p.code||'',name:p.name,specs:p.specs||it.specs||'',unit:p.unit||it.unit,unit_price:p.unit_price||it.unit_price,tax_exempt:!!p.tax_exempt});
  if(!it.qty)it.qty=1;
  renderInvoiceRows();
  setTimeout(()=>$(`.inv-row[data-row="${i}"] .c-qty input`)?.focus(),0);
}
function addInvoiceRow(product=null){
  const it=blankInvoiceItem();
  if(product)Object.assign(it,{product_id:product.id,code:product.code||'',name:product.name,specs:product.specs||'',unit:product.unit||'عدد',unit_price:product.unit_price||0,tax_exempt:!!product.tax_exempt});
  const last=invDraft.items[invDraft.items.length-1];
  if(product&&last&&!last.name&&!last.code&&!last.unit_price)invDraft.items[invDraft.items.length-1]=it;else invDraft.items.push(it);
  renderInvoiceRows();
  const idx=invDraft.items.indexOf(it);
  setTimeout(()=>{const row=$(`.inv-row[data-row="${idx}"]`);row?.scrollIntoView({block:'center',behavior:'smooth'});row?.querySelector(product?'.c-qty input':'.c-code input')?.focus();},30);
}
function removeInvoiceRow(i){invDraft.items.splice(i,1);if(!invDraft.items.length)invDraft.items.push(blankInvoiceItem());renderInvoiceRows();}
function moveInvoiceRow(i,dir){const j=i+dir;if(j<0||j>=invDraft.items.length)return;[invDraft.items[i],invDraft.items[j]]=[invDraft.items[j],invDraft.items[i]];renderInvoiceRows();}
async function saveInvoiceRowAsProduct(i){
  const it=invDraft.items[i];if(!it?.name)return;
  try{const p=await api('/api/products',{method:'POST',body:{code:it.code,name:it.name,specs:it.specs,unit:it.unit,unit_price:it.unit_price,tax_exempt:it.tax_exempt}});invCtx.products.push(p);it.product_id=p.id;renderInvoiceRows();toast('به لیست کالاها اضافه شد','success');}
  catch(e){toast(e.message||'ذخیره کالا انجام نشد','error');}
}
function toggleInvProductPicker(){const el=$('#invProductPicker');if(!el)return;el.classList.toggle('hidden');if(!el.classList.contains('hidden')){renderInvProductPicker();$('#invProductQuery')?.focus();}}
function renderInvProductPicker(){
  const box=$('#invProductPickerList');if(!box)return;
  const q=$('#invProductQuery')?.value||'';
  const rows=invCtx.products.filter(p=>OfflineDB.matchesQuery([p.code,p.name,p.specs,p.category],q)).slice(0,40);
  box.innerHTML=rows.map(p=>`<button type="button" class="inv-pick" onclick="pickInvoiceProduct('${p.id}')"><span class="ltr-num">${esc(p.code||'—')}</span><b>${esc(p.name)}</b><small>${esc(p.specs||'')}</small><em>${invMoney(p.unit_price)} ریال / ${esc(p.unit)}</em></button>`).join('')||`<div class="muted inv-suggest-empty">کالایی ثبت نشده. از تب «کالاها و خدمات» یا دکمه 💾 روی هر ردیف اضافه کن.</div>`;
}
function pickInvoiceProduct(id){const p=invCtx.products.find(x=>x.id===id);if(p)addInvoiceRow(p);}
function refreshInvoiceTotals(){
  if(!invDraft)return;
  const t=invoiceTotalsLocal(invDraft);
  invDraft.items.forEach((it,i)=>{const el=$('#invRowTotal'+i);if(!el)return;const amount=Math.round(Number(it.qty||0)*Number(it.unit_price||0));el.textContent=invMoney(Math.max(0,amount-Math.min(Number(it.discount||0),amount)));});
  const box=$('#invTotals');if(!box)return;
  box.innerHTML=`<div><span>جمع ردیف‌ها</span><b>${invMoney(t.subtotal)}</b></div>${t.discount_total?`<div><span>تخفیف</span><b>− ${invMoney(t.discount_total)}</b></div>`:''}${t.tax_rate?`<div><span>مالیات و عوارض (${nfmt(t.tax_rate)}٪)</span><b>${invMoney(t.tax_total)}</b></div>`:''}${t.shipping?`<div><span>حمل / سایر</span><b>${invMoney(t.shipping)}</b></div>`:''}<div class="inv-grand"><span>مبلغ کل (ریال)</span><b>${invMoney(t.grand_total)}</b></div>${t.prepaid?`<div><span>پیش‌پرداخت</span><b>− ${invMoney(t.prepaid)}</b></div><div class="inv-grand"><span>مانده قابل پرداخت</span><b>${invMoney(t.payable)}</b></div>`:''}<div class="inv-words">${esc(invoiceWords(t.grand_total))} ریال</div>`;
}
async function saveInvoiceDraft(andPrint=false,previewOnly=false){
  try{
    collectInvoiceDates();
    invDraft.number=($('#invNumber')?.value||'').trim();
    invDraft.items=invDraft.items.filter(i=>i.name||i.code||Number(i.unit_price));
    if(!invDraft.items.length){invDraft.items.push(blankInvoiceItem());renderInvoiceRows();return toast('حداقل یک ردیف کالا وارد کن','error');}
    if(!String(invDraft.buyer.name||'').trim())return toast('نام خریدار را وارد کن یا از CRM انتخاب کن','error');
    const saveAs=$('#invSaveBuyerAs')?.value||'';
    if(!invDraft.party_id&&saveAs){
      const b=invDraft.buyer;
      if(saveAs==='organization'){const o=await api('/api/organizations',{method:'POST',body:{name:b.name,legal_name:b.name,national_id:b.national_id,economic_code:b.economic_code,main_phone:b.phone,address:b.address,email:b.email,relationship_types:['customer']}});invDraft.party_type='organization';invDraft.party_id=o.id;}
      else{const c=await api('/api/contacts',{method:'POST',body:{first_name:b.name,phone:b.phone,address:b.address,email:b.email,relationship_types:['customer']}});invDraft.party_type='contact';invDraft.party_id=c.id;invDraft.contact_id=c.id;}
    }
    const body={...invDraft};
    const saved=body.id?await api('/api/invoices/'+body.id,{method:'PATCH',body}):await api('/api/invoices',{method:'POST',body});
    invDraft=null;
    toast(`${INVOICE_TYPE_FA[saved.type]} ${saved.number} ذخیره شد`,'success');
    if(!$('#invoices')?.classList.contains('hidden'))loadInvoices();
    if(saved.ledger_entry_id){loadDashboard().catch(()=>{});syncCallerIdContacts().catch(()=>{});}
    await openInvoice(saved.id);
    if(andPrint==='share')setTimeout(()=>exportInvoicePdf(saved.id,'share'),250);
    else if(andPrint)setTimeout(()=>printInvoice(saved.id),250);
  }catch(e){toast(e.message||'ذخیره انجام نشد','error');}
}

/* ---------- View / print ---------- */
async function openInvoice(id){
  try{
    const [inv,settings]=await Promise.all([api('/api/invoices/'+id),api('/api/invoice-settings')]);
    rememberRecent?.({type:'invoice',id:inv.id,name:`${INVOICE_TYPE_FA[inv.type]} ${inv.number}`});
    $('#modalTitle').textContent=`${INVOICE_TYPE_FA[inv.type]} ${inv.number}`;
    const owner=inv.party_id?(inv.party_type==='organization'?`<button type="button" class="btn" onclick="openOrganization('${inv.party_id}')">🏢 پرونده خریدار</button>`:`<button type="button" class="btn" onclick="openContact('${inv.party_id}')">👤 پرونده خریدار</button>`):'';
    const convert=inv.type==='proforma'&&!inv.converted_invoice_id&&inv.status!=='cancelled'?`<button type="button" class="btn success" onclick="convertProforma('${inv.id}')">⇄ تبدیل به فاکتور</button>`:'';
    const related=inv.converted_invoice_id?`<button type="button" class="btn" onclick="openInvoice('${inv.converted_invoice_id}')">🧾 فاکتور صادرشده</button>`:inv.source_proforma_id?`<button type="button" class="btn" onclick="openInvoice('${inv.source_proforma_id}')">📄 پیش‌فاکتور مبنا</button>`:'';
    $('#modalBody').innerHTML=`<div class="inv-view-actions inv-output-actions"><button type="button" class="btn primary" onclick="exportInvoicePdf('${inv.id}','share')">📤 اشتراک‌گذاری PDF</button><button type="button" class="btn" onclick="exportInvoicePdf('${inv.id}','save')">⬇ ذخیره PDF در گوشی</button>${inv.party_id?`<button type="button" class="btn" onclick="exportInvoicePdf('${inv.id}','attach')">📎 ذخیره در پرونده مشتری</button>`:''}<button type="button" class="btn" onclick="printInvoice('${inv.id}')">🖨 چاپ</button></div><div class="inv-view-actions"><button type="button" class="btn" onclick="openInvoiceEditor('${inv.type}','${inv.id}')">✏ ویرایش</button>${convert}<button type="button" class="btn" onclick="duplicateInvoice('${inv.id}','${inv.type}')">⧉ کپی جدید</button>${inv.type==='invoice'?'':`<button type="button" class="btn" onclick="duplicateInvoice('${inv.id}','invoice')">🧾 فاکتور از روی این</button>`}${owner}${related}<button type="button" class="btn danger" onclick="deleteInvoice('${inv.id}')">🗑 حذف</button></div>
      <div class="inv-view-meta">${invStatusBadge(inv)}${inv.ledger_entry_id?'<span class="badge">﷼ ثبت در حساب مشتری</span>':''}</div>
      <div class="inv-preview">${invoiceDocHtml(inv,settings)}</div>`;
    openModal();
  }catch(e){toast(e.message||'فاکتور باز نشد','error');}
}
function invoiceDocHtml(inv,s){
  const t=inv.totals||invoiceTotalsLocal(inv);
  const cols=(s.columns||[]).filter(c=>c.visible&&(c.key!=='tax'||t.tax_rate));
  const specsCol=cols.some(c=>c.key==='specs');
  const cell=(c,l,i)=>{switch(c.key){
    case 'row':return `<td class="num">${nfmt(i+1)}</td>`;
    case 'code':return `<td class="code">${esc(l.code||'')}</td>`;
    case 'name':return `<td class="name"><b>${esc(l.name)}</b>${!specsCol&&l.specs?`<small>${esc(l.specs)}</small>`:''}</td>`;
    case 'specs':return `<td class="specs">${esc(l.specs||'')}</td>`;
    case 'qty':return `<td class="num">${invQty(l.qty)}</td>`;
    case 'unit':return `<td>${esc(l.unit||'')}</td>`;
    case 'unit_price':return `<td class="num">${invMoney(l.unit_price)}</td>`;
    case 'amount':return `<td class="num">${invMoney(l.amount)}</td>`;
    case 'discount':return `<td class="num">${l.discount?invMoney(l.discount):'—'}</td>`;
    case 'tax':return `<td class="num">${l.tax?invMoney(l.tax):'—'}</td>`;
    case 'total':return `<td class="num strong">${invMoney(cols.some(x=>x.key==='tax')?l.total:l.net)}</td>`;
    default:return '<td></td>';}};
  const sel=s.seller||{},b=inv.buyer||{},bank=s.bank||{};
  const party=(title,p,isSeller)=>{const rows=[['نام',p.name||p.legal_name],[isSeller?'نام حقوقی':'شخص رابط',isSeller?(p.legal_name&&p.legal_name!==p.name?p.legal_name:''):p.contact_person],['شناسه / کد ملی',p.national_id],['کد اقتصادی',p.economic_code],['شماره ثبت',p.registration_no],['تلفن',[p.phone,p.mobile].filter(Boolean).join(' · ')],['کد پستی',p.postal_code],['نشانی',p.address]].filter(([,v])=>v);return `<div class="inv-party"><div class="inv-party-title">${title}</div><div class="inv-party-grid">${rows.map(([k,v])=>`<div class="${k==='نشانی'?'wide':''}"><span>${k}:</span> <b>${esc(v)}</b></div>`).join('')||'<div class="muted">—</div>'}</div></div>`;};
  const title=(s.titles||{})[inv.type]||INVOICE_TYPE_FA[inv.type];
  const totalsRows=[['جمع کل',t.subtotal],t.discount_total?['تخفیف',-t.discount_total]:null,t.tax_rate?[`مالیات و عوارض ارزش افزوده (${nfmt(t.tax_rate)}٪)`,t.tax_total]:null,t.shipping?['حمل / سایر هزینه‌ها',t.shipping]:null].filter(Boolean);
  const bankLine=s.show_bank?[bank.bank_name&&`بانک ${bank.bank_name}`,bank.account_no&&`حساب ${bank.account_no}`,bank.card_no&&`کارت ${bank.card_no}`,bank.sheba&&`شبا ${bank.sheba}`,bank.holder&&`به نام ${bank.holder}`].filter(Boolean).join(' · '):'';
  return `<div class="inv-doc tpl-${esc(s.template)} paper-${esc(s.paper)}" style="--inv-accent:${esc(s.accent||'#1D4ED8')}">
    <header class="inv-doc-head">
      <div class="inv-doc-logo">${sel.logo_data_url?`<img src="${esc(sel.logo_data_url)}" alt="">`:`<b>${esc(sel.name||'')}</b>`}</div>
      <div class="inv-doc-title"><h1>${esc(title)}</h1>${inv.status==='cancelled'?'<div class="inv-void">باطل شده</div>':inv.status==='draft'?'<div class="inv-void draft">پیش‌نویس</div>':''}</div>
      <div class="inv-doc-meta"><div><span>شماره:</span> <b class="ltr-num">${esc(inv.number)}</b></div><div><span>تاریخ:</span> <b>${dateOnlyFmt(inv.issue_date)}</b></div>${inv.due_date?`<div><span>${inv.type==='proforma'?'اعتبار تا':'سررسید'}:</span> <b>${dateOnlyFmt(inv.due_date)}</b></div>`:''}</div>
    </header>
    <section class="inv-parties">${party('مشخصات فروشنده',sel,true)}${party('مشخصات خریدار',b,false)}</section>
    <table class="inv-table"><thead><tr>${cols.map(c=>`<th class="h-${c.key}">${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${t.lines.map((l,i)=>`<tr>${cols.map(c=>cell(c,l,i)).join('')}</tr>`).join('')}</tbody></table>
    <section class="inv-summary">
      <div class="inv-summary-notes">
        ${s.show_amount_words?`<div class="inv-words-box"><span>مبلغ به حروف:</span> <b>${esc(invoiceWords(t.grand_total))} ریال</b></div>`:''}
        ${inv.payment_terms?`<div><span>شرایط پرداخت:</span> ${esc(inv.payment_terms)}</div>`:''}
        ${inv.notes?`<div><span>توضیحات:</span> ${esc(inv.notes)}</div>`:''}
        ${bankLine?`<div><span>اطلاعات پرداخت:</span> ${esc(bankLine)}</div>`:''}
        ${inv.terms?`<div class="inv-terms">${esc(inv.terms)}</div>`:''}
      </div>
      <table class="inv-totals-table">${totalsRows.map(([k,v])=>`<tr><th>${k}</th><td>${v<0?'− ':''}${invMoney(Math.abs(v))}</td></tr>`).join('')}<tr class="grand"><th>مبلغ قابل پرداخت (ریال)</th><td>${invMoney(t.grand_total)}</td></tr>${t.prepaid?`<tr><th>پیش‌پرداخت</th><td>− ${invMoney(t.prepaid)}</td></tr><tr class="grand"><th>مانده</th><td>${invMoney(t.payable)}</td></tr>`:''}</table>
    </section>
    ${s.show_signatures?`<section class="inv-signs"><div><span>مهر و امضای فروشنده</span>${sel.stamp_data_url?`<img src="${esc(sel.stamp_data_url)}" alt="">`:''}</div><div><span>مهر و امضای خریدار</span></div></section>`:''}
    <footer class="inv-doc-foot">${esc([sel.address,sel.phone,sel.website,sel.email].filter(Boolean).join(' · '))}</footer>
  </div>`;
}
function invoiceDocCss(){
  const out=[];
  const re=/\.inv-(doc|void|part|table|summary|words-box|terms|totals-table|signs)/;
  for(const sheet of [...document.styleSheets]){
    let rules=[];try{rules=[...sheet.cssRules];}catch(_e){continue;}
    for(const r of rules){if(r.selectorText&&re.test(r.selectorText))out.push(r.cssText);}
  }
  return out.join('\n');
}
function invoiceStandaloneHtml(inv,settings){
  const paper=settings.paper==='A5'?'A5':'A4';
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(INVOICE_TYPE_FA[inv.type])} ${esc(inv.number)}</title><style>
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@page{size:${paper};margin:0}
html,body{margin:0;padding:0;background:#fff}
${invoiceDocCss()}
.inv-doc{box-shadow:none!important;margin:0!important;width:100%!important;min-height:0!important}
.inv-table tr,.inv-summary,.inv-signs{break-inside:avoid}
.inv-table thead{display:table-header-group}
</style></head><body>${invoiceDocHtml(inv,settings)}</body></html>`;
}
function invoicePdfFileName(inv){
  const kind=inv.type==='invoice'?'Invoice':'Proforma';
  const num=latinDigits(String(inv.number||'')).replace(/[\\/:*?"<>|\s]+/g,'-');
  return `${kind}-${num||'draft'}.pdf`;
}
function invoiceShareText(inv,settings){
  const seller=settings?.seller?.name?` · ${settings.seller.name}`:'';
  return `${INVOICE_TYPE_FA[inv.type]} شماره ${inv.number} — ${inv.buyer?.name||''}\nمبلغ کل: ${invMoney(inv.grand_total)} ریال${seller}`;
}
async function loadInvoiceForOutput(id){
  const [inv,settings]=await Promise.all([api('/api/invoices/'+id),api('/api/invoice-settings')]);
  return {inv,settings,html:invoiceStandaloneHtml(inv,settings),fileName:invoicePdfFileName(inv),paper:settings.paper||'A4'};
}
function webPrintInvoice(inv,settings){
  let area=$('#printArea');
  if(!area){area=document.createElement('div');area.id='printArea';area.className='print-area';document.body.appendChild(area);}
  area.innerHTML=invoiceDocHtml(inv,settings);
  document.body.classList.add('has-print');
  const old=document.title;document.title=invoicePdfFileName(inv).replace(/\.pdf$/,'');
  setTimeout(()=>{window.print();setTimeout(()=>{document.title=old;document.body.classList.remove('has-print');},800);},120);
}
async function printInvoice(id){
  try{
    const o=await loadInvoiceForOutput(id);
    const Printer=nativePlugin('NikaraPrint');
    if(NATIVE&&Printer?.print){await Printer.print({html:o.html,jobName:o.fileName.replace(/\.pdf$/,''),paper:o.paper});return;}
    if(NATIVE)return toast('چاپ در این نسخه نصب‌شده موجود نیست؛ APK نسخه 1.4.0 را نصب کن','error');
    webPrintInvoice(o.inv,o.settings);
  }catch(e){toast(e.message||'چاپ انجام نشد','error');}
}
function setInvoiceBusy(on,label=''){
  $$('.inv-view-actions .btn,.inv-editor-actions .btn').forEach(b=>{b.disabled=!!on;});
  if(on)toast(label||'در حال ساخت PDF...');
}
// action: share (WhatsApp/Telegram/Email…), save (Download/CRM-NIKARA), attach (customer file inside CRM)
async function exportInvoicePdf(id,action='share'){
  let o=null;
  const Printer=nativePlugin('NikaraPrint');
  try{
    o=await loadInvoiceForOutput(id);
    if(!(NATIVE&&Printer?.pdf)){
      if(action==='share'&&navigator.share){try{await navigator.share({title:o.fileName,text:invoiceShareText(o.inv,o.settings)});return;}catch(_e){}}
      toast('در پنجره چاپ «Save as PDF / ذخیره به‌صورت PDF» را انتخاب کن');
      return webPrintInvoice(o.inv,o.settings);
    }
    setInvoiceBusy(true,'در حال ساخت PDF...');
    if(action==='attach'){
      if(!o.inv.party_id)throw new Error('این سند به مشتری CRM وصل نیست؛ اول خریدار را از CRM انتخاب کن');
      const r=await Printer.pdf({html:o.html,fileName:o.fileName,paper:o.paper,action:'data'});
      const blob=dataUrlToBlob(r.dataUrl);
      const fd=new FormData();
      fd.append('file',new File([blob],o.fileName,{type:'application/pdf'}),o.fileName);
      fd.append('category',o.inv.type);
      fd.append('title',`${INVOICE_TYPE_FA[o.inv.type]} ${o.inv.number}`);
      fd.append('invoice_no',o.inv.number);
      fd.append('invoice_date',o.inv.issue_date||'');
      fd.append('amount',String(o.inv.grand_total||0));
      fd.append('note',`${o.inv.buyer?.name||''} · مبلغ کل ${invMoney(o.inv.grand_total)} ریال`);
      fd.append('tags',o.inv.type==='invoice'?'فاکتور':'پیش‌فاکتور');
      const path=o.inv.party_type==='organization'?`/api/organizations/${o.inv.party_id}/attachments`:`/api/contacts/${o.inv.party_id}/attachments`;
      await api(path,{method:'POST',body:fd});
      toast('PDF در پرونده مشتری (اسناد و فاکتورها) ذخیره شد','success');
      return;
    }
    const r=await Printer.pdf({html:o.html,fileName:o.fileName,paper:o.paper,action,title:action==='share'?'ارسال '+INVOICE_TYPE_FA[o.inv.type]:'ذخیره PDF',text:invoiceShareText(o.inv,o.settings)});
    if(action==='save')toast(r?.savedTo?`ذخیره شد: ${r.savedTo}`:'PDF ذخیره شد','success');
  }catch(e){
    console.warn('invoice pdf',e);
    const msg=String(e?.message||'');
    if(/لغو|cancel/i.test(msg))return toast('ذخیره لغو شد');
    if(o&&action!=='attach'&&NATIVE&&Printer?.print){
      toast('ساخت مستقیم PDF روی این گوشی انجام نشد؛ در پنجره چاپ «ذخیره به‌صورت PDF» را بزن','error');
      try{await Printer.print({html:o.html,jobName:o.fileName.replace(/\.pdf$/,''),paper:o.paper});}catch(_e){}
      return;
    }
    toast(msg||'ساخت PDF انجام نشد','error');
  }finally{setInvoiceBusy(false);}
}
async function convertProforma(id){
  if(!await askConfirm('از روی این پیش‌فاکتور یک فاکتور با شماره جدید صادر شود؟',{title:'تبدیل به فاکتور',ok:'صدور فاکتور'}))return;
  try{const inv=await api(`/api/invoices/${id}/convert`,{method:'POST',body:{}});toast(`فاکتور ${inv.number} صادر شد`,'success');if(!$('#invoices')?.classList.contains('hidden'))loadInvoices();if(inv.ledger_entry_id){loadDashboard().catch(()=>{});syncCallerIdContacts().catch(()=>{});}openInvoice(inv.id);}
  catch(e){toast(e.message||'تبدیل انجام نشد','error');}
}
async function duplicateInvoice(id,type){
  try{const src=await api('/api/invoices/'+id);const {id:_i,number:_n,ledger_entry_id:_l,totals:_t,amount_words:_w,status:_s,created_at:_c,updated_at:_u,...copy}=src;await openInvoiceEditor(type,'',{copy:{...copy,type}});}
  catch(e){toast(e.message||'کپی انجام نشد','error');}
}
async function deleteInvoice(id){
  if(!await askConfirm('این سند حذف شود؟ اگر در حساب مشتری ثبت شده باشد، آن ثبت هم حذف می‌شود. برای حفظ سابقه بهتر است وضعیت را «لغوشده» کنی.',{title:'حذف فاکتور'}))return;
  try{await api('/api/invoices/'+id,{method:'DELETE'});closeModal();toast('حذف شد','success');if(!$('#invoices')?.classList.contains('hidden'))loadInvoices();loadDashboard().catch(()=>{});syncCallerIdContacts().catch(()=>{});}
  catch(e){toast(e.message||'حذف انجام نشد','error');}
}
function openInvoiceFor(type,partyType,partyId){openInvoiceEditor(type,'',{party_type:partyType,party_id:partyId});}
async function renderInvoicePartyPanel(partyType,partyId){
  try{
    const rows=await api(`/api/invoices?party_type=${partyType}&party_id=${partyId}`);
    const el=$('#partyInvoicesPanel');if(!el)return;
    el.innerHTML=`<div class="panel-head"><h3>🧾 فاکتورها و پیش‌فاکتورها</h3><div class="actions"><button type="button" class="btn" onclick="openInvoiceFor('proforma','${partyType}','${partyId}')">+ پیش‌فاکتور</button><button type="button" class="btn primary" onclick="openInvoiceFor('invoice','${partyType}','${partyId}')">+ فاکتور</button></div></div>${rows.length?`<div class="inv-list">${rows.slice(0,12).map(invoiceListRow).join('')}</div>`:'<div class="muted">هنوز سندی برای این مشتری صادر نشده است.</div>'}`;
  }catch(e){console.warn('party invoices',e);}
}

/* ---------- Products ---------- */
function debouncedProducts(){clearTimeout(productTimer);productTimer=setTimeout(()=>renderProductsView($('#invoiceContent')),180);}
async function renderProductsView(box){
  if(!box)return;
  const qEl=$('#productSearch');const q=qEl?qEl.value:'';
  const rows=await api('/api/products?include_inactive=true'+(q?`&q=${encodeURIComponent(q)}`:''));
  const listHtml=rows.length?`<div class="product-list">${rows.map(p=>`<div class="product-row ${p.active===false?'inactive':''}" role="button" tabindex="0" onclick="openProductEditor('${p.id}')" onkeydown="cardKey(event,'openProductEditor','${p.id}')"><span class="product-code ltr-num">${esc(p.code||'—')}</span><div class="product-main"><b>${esc(p.name)}</b><small class="muted">${esc([p.specs,p.category].filter(Boolean).join(' · '))}</small></div><div class="product-price"><b>${invMoney(p.unit_price)}</b><small>ریال / ${esc(p.unit)}</small>${p.tax_exempt?'<small class="badge">معاف مالیات</small>':''}</div></div>`).join('')}</div>`:emptyState('📦',q?'کالایی با این مشخصات پیدا نشد.':'هنوز کالا یا خدمتی ثبت نشده. با کد ثبت کن تا در فاکتور با تایپ کد سریع وارد شود.',`<button class="btn primary" type="button" onclick="openProductEditor()">+ کالا / خدمت</button>`);
  if(qEl&&$('#productListBox')){$('#productListBox').innerHTML=listHtml;return;}
  box.innerHTML=`<div class="panel"><div class="panel-head"><div><h3>کالاها و خدمات</h3><div class="muted">کد، شرح، مشخصات، واحد و فی؛ در فاکتور با تایپ کد یا نام خودکار پر می‌شود.</div></div><div class="actions"><button type="button" class="btn" onclick="openProductImport()">⬆ ورود CSV</button><button type="button" class="btn" onclick="exportProductsCSV()">⬇ خروجی CSV</button><button type="button" class="btn primary" onclick="openProductEditor()">+ کالا / خدمت</button></div></div><input id="productSearch" type="search" placeholder="جستجوی کد، نام یا مشخصات..." oninput="debouncedProducts()" value="${esc(q)}"></div><div class="panel" id="productListBox">${listHtml}</div>`;
}
async function openProductEditor(id=''){
  try{
    const [settings,p]=await Promise.all([api('/api/invoice-settings'),id?api('/api/products?include_inactive=true').then(r=>r.find(x=>x.id===id)):Promise.resolve(null)]);
    const x=p||{code:'',name:'',specs:'',unit:'عدد',unit_price:0,category:'',tax_exempt:false,active:true,note:''};
    $('#modalTitle').textContent=p?`ویرایش ${p.name}`:'کالا / خدمت جدید';
    $('#modalBody').innerHTML=`<div class="panel">
      <div class="inv-grid-2"><label>کد کالا<input id="prCode" class="ltr" value="${esc(x.code)}" placeholder="مثلاً A-100"></label><label>شرح کالا / خدمت *<input id="prName" value="${esc(x.name)}"></label></div>
      <label>مشخصات<input id="prSpecs" value="${esc(x.specs)}" placeholder="مدل، سایز، رنگ، برند..."></label>
      <div class="inv-grid-3"><label>واحد<input id="prUnit" list="prUnitList" value="${esc(x.unit)}"><datalist id="prUnitList">${(settings.units||[]).map(u=>`<option value="${esc(u)}"></option>`).join('')}</datalist></label><label>فی (ریال)<input id="prPrice" class="ltr" inputmode="numeric" value="${invInputMoney(x.unit_price)}" onblur="invFormatMoneyInput(this)"></label><label>دسته / گروه<input id="prCategory" value="${esc(x.category)}"></label></div>
      <div class="checks"><label><input id="prTaxExempt" type="checkbox" ${x.tax_exempt?'checked':''}> معاف از مالیات ارزش افزوده</label><label><input id="prActive" type="checkbox" ${x.active!==false?'checked':''}> فعال (در فاکتور پیشنهاد شود)</label></div>
      <label>یادداشت<input id="prNote" value="${esc(x.note||'')}"></label>
      <div class="actions"><button type="button" class="btn primary" onclick="saveProduct('${p?.id||''}')">ذخیره</button>${p?`<button type="button" class="btn danger" onclick="deleteProduct('${p.id}')">حذف</button>`:''}</div></div>`;
    openModal();
  }catch(e){toast(e.message||'باز نشد','error');}
}
async function saveProduct(id=''){
  try{
    const body={code:$('#prCode').value,name:$('#prName').value,specs:$('#prSpecs').value,unit:$('#prUnit').value,unit_price:invNum($('#prPrice').value),category:$('#prCategory').value,tax_exempt:$('#prTaxExempt').checked,active:$('#prActive').checked,note:$('#prNote').value};
    if(!body.name.trim())return toast('شرح کالا الزامی است','error');
    id?await api('/api/products/'+id,{method:'PATCH',body}):await api('/api/products',{method:'POST',body});
    closeModal();toast('کالا ذخیره شد','success');if(invoiceView==='products')loadInvoices();
  }catch(e){toast(e.message||'ذخیره انجام نشد','error');}
}
async function deleteProduct(id){
  if(!await askConfirm('این کالا از لیست حذف شود؟ فاکتورهای قبلی تغییری نمی‌کنند.',{title:'حذف کالا'}))return;
  try{await api('/api/products/'+id,{method:'DELETE'});closeModal();toast('حذف شد','success');if(invoiceView==='products')loadInvoices();}catch(e){toast(e.message,'error');}
}
function openProductImport(){
  $('#modalTitle').textContent='ورود کالاها از CSV / Excel';
  $('#modalBody').innerHTML=`<div class="panel"><p class="muted">فایل CSV (از Excel: Save As → CSV UTF-8) با ستون‌های <b>کد کالا، نام کالا، مشخصات، واحد، قیمت</b>. اگر کد تکراری باشد، همان کالا به‌روز می‌شود.</p><input id="productCsvFile" type="file" accept=".csv,text/csv"><div class="actions" style="margin-top:12px"><button type="button" class="btn primary" onclick="runProductImport()">ورود</button><button type="button" class="btn" onclick="downloadProductTemplate()">⬇ فایل نمونه</button></div></div>`;
  openModal();
}
async function runProductImport(){
  const f=$('#productCsvFile')?.files?.[0];if(!f)return toast('فایل را انتخاب کن','error');
  try{const csv=await f.text();const r=await api('/api/products/import',{method:'POST',body:{csv}});closeModal();toast(`${nfmt(r.created)} کالای جدید، ${nfmt(r.updated)} به‌روزرسانی${r.errors.length?` · ${nfmt(r.errors.length)} ردیف خطا`:''}`,r.errors.length?'error':'success');if(invoiceView==='products')loadInvoices();}
  catch(e){toast(e.message||'ورود انجام نشد','error');}
}
function productCsv(rows){const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';return '\uFEFF'+[['کد کالا','نام کالا','مشخصات','واحد','قیمت','دسته'].map(q).join(','),...rows.map(p=>[p.code,p.name,p.specs,p.unit,p.unit_price,p.category].map(q).join(','))].join('\r\n');}
async function downloadProductTemplate(){await saveBlobDownload(new Blob([productCsv([{code:'A-100',name:'نمونه کالا',specs:'مدل X',unit:'عدد',unit_price:1500000,category:''}])],{type:'text/csv;charset=utf-8'}),'CRM-NIKARA-products-sample.csv');}
async function exportProductsCSV(){try{const rows=await api('/api/products?include_inactive=true');await saveBlobDownload(new Blob([productCsv(rows)],{type:'text/csv;charset=utf-8'}),'CRM-NIKARA-products.csv');toast('فایل کالاها آماده شد','success');}catch(e){toast(e.message,'error');}}

/* ---------- Template, numbering & seller settings ---------- */
let invSettingsDraft=null;
async function renderInvoiceSettingsView(box){
  const s=await api('/api/invoice-settings');invSettingsDraft=JSON.parse(JSON.stringify(s));
  const sel=s.seller,bank=s.bank;
  const f=(path,label,val,cls='')=>`<label>${label}<input class="${cls}" value="${esc(val||'')}" oninput="setInvSetting('${path}',this.value)"></label>`;
  const numBlock=t=>{const n=s.numbering[t];return `<div class="inv-num-block"><b>${t==='invoice'?'🧾 فاکتور':'📄 پیش‌فاکتور'}</b><div class="inv-grid-3"><label>الگوی شماره<input class="ltr" value="${esc(n.pattern)}" oninput="setInvSetting('numbering.${t}.pattern',this.value);previewInvNumbers()"></label><label>شروع از شماره<input class="ltr" inputmode="numeric" value="${esc(String(n.start_number))}" oninput="setInvSetting('numbering.${t}.start_number',this.value);previewInvNumbers()"></label><label>تعداد رقم<input class="ltr" inputmode="numeric" value="${esc(String(n.digits))}" oninput="setInvSetting('numbering.${t}.digits',this.value);previewInvNumbers()"></label></div><label class="inline-check"><input type="checkbox" ${n.reset_yearly?'checked':''} onchange="setInvSetting('numbering.${t}.reset_yearly',this.checked);previewInvNumbers()"> شروع دوباره از اول هر سال شمسی</label><div class="muted">شماره بعدی: <b class="ltr-num" id="invNumPreview_${t}">…</b></div></div>`;};
  box.innerHTML=`<div class="settings-grid inv-settings">
    <div class="panel"><h3>مشخصات فروشنده (شما)</h3>
      <div class="inv-grid-2">${f('seller.name','نام / نام تجاری',sel.name)}${f('seller.legal_name','نام حقوقی',sel.legal_name)}${f('seller.national_id','شناسه / کد ملی',sel.national_id,'ltr')}${f('seller.economic_code','کد اقتصادی',sel.economic_code,'ltr')}${f('seller.registration_no','شماره ثبت',sel.registration_no,'ltr')}${f('seller.postal_code','کد پستی',sel.postal_code,'ltr')}${f('seller.phone','تلفن',sel.phone,'ltr')}${f('seller.mobile','موبایل',sel.mobile,'ltr')}${f('seller.email','ایمیل',sel.email,'ltr')}${f('seller.website','وب‌سایت',sel.website,'ltr')}</div>
      ${f('seller.address','نشانی',sel.address)}
      <div class="inv-grid-2"><label>لوگو<input type="file" accept="image/*" onchange="setInvImage('logo_data_url',this)">${sel.logo_data_url?`<span class="inv-img-preview"><img src="${esc(sel.logo_data_url)}" alt=""><button type="button" class="link" onclick="setInvSetting('seller.logo_data_url','');saveInvoiceSettings()">حذف</button></span>`:''}</label><label>تصویر مهر / امضا<input type="file" accept="image/*" onchange="setInvImage('stamp_data_url',this)">${sel.stamp_data_url?`<span class="inv-img-preview"><img src="${esc(sel.stamp_data_url)}" alt=""><button type="button" class="link" onclick="setInvSetting('seller.stamp_data_url','');saveInvoiceSettings()">حذف</button></span>`:''}</label></div>
    </div>
    <div class="panel"><h3>شماره‌گذاری خودکار</h3><p class="muted">نشانه‌ها: <code>{YYYY}</code> سال شمسی، <code>{YY}</code> دو رقم سال، <code>{MM}</code> ماه، <code>{SEQ}</code> شماره ترتیبی با صفر، <code>{N}</code> بدون صفر. «شروع از» برای ادامه شماره‌های دفتر قبلی است.</p>${numBlock('invoice')}${numBlock('proforma')}<button type="button" class="btn danger" onclick="resetInvoiceCounters()">↺ شروع دوباره شمارنده‌ها از «شروع از»</button></div>
    <div class="panel"><h3>قالب و ظاهر</h3>
      <div class="inv-grid-2"><label>قالب<select onchange="setInvSetting('template',this.value)"><option value="official" ${s.template==='official'?'selected':''}>رسمی (صورتحساب فروش)</option><option value="simple" ${s.template==='simple'?'selected':''}>ساده و مدرن</option></select></label><label>اندازه کاغذ<select onchange="setInvSetting('paper',this.value)"><option value="A4" ${s.paper==='A4'?'selected':''}>A4</option><option value="A5" ${s.paper==='A5'?'selected':''}>A5</option></select></label>${f('titles.invoice','عنوان فاکتور',s.titles.invoice)}${f('titles.proforma','عنوان پیش‌فاکتور',s.titles.proforma)}<label>رنگ اصلی<input type="color" value="${esc(s.accent)}" oninput="setInvSetting('accent',this.value)"></label><label>اعتبار پیش‌فاکتور (روز)<input class="ltr" inputmode="numeric" value="${esc(String(s.proforma_validity_days))}" oninput="setInvSetting('proforma_validity_days',this.value)"></label><label>نرخ پیش‌فرض مالیات (٪)<input class="ltr" inputmode="decimal" value="${esc(String(s.tax_rate))}" oninput="setInvSetting('tax_rate',this.value)"></label></div>
      <div class="checks"><label><input type="checkbox" ${s.show_tax?'checked':''} onchange="setInvSetting('show_tax',this.checked)"> مالیات پیش‌فرض روشن</label><label><input type="checkbox" ${s.show_amount_words?'checked':''} onchange="setInvSetting('show_amount_words',this.checked)"> مبلغ به حروف</label><label><input type="checkbox" ${s.show_signatures?'checked':''} onchange="setInvSetting('show_signatures',this.checked)"> کادر مهر و امضا</label><label><input type="checkbox" ${s.show_bank?'checked':''} onchange="setInvSetting('show_bank',this.checked)"> نمایش اطلاعات بانکی</label></div>
      ${['invoice','proforma'].map(type=>`<div class="inv-term-section"><h3>متن‌های پیش‌فرض پایین ${INVOICE_TYPE_FA[type]}</h3><p class="muted">هر خانه یک متن مستقل است. پس از ذخیره تنظیمات، متن‌ها در سندهای جدید قرار می‌گیرند.</p><div id="invDefaultTerms_${type}"></div><button type="button" class="btn" onclick="addDefaultTermRow('${type}')">+ افزودن ردیف</button></div>`).join('')}
    </div>
    <div class="panel"><h3>ستون‌های جدول کالا</h3><p class="muted">ستون‌ها را روشن/خاموش کن، نامشان را عوض کن یا جابه‌جا کن. اگر «مشخصات» خاموش باشد، زیر نام کالا چاپ می‌شود.</p><div id="invColumnsEditor"></div></div>
    <div class="panel"><h3>اطلاعات بانکی</h3><div class="inv-grid-2">${f('bank.bank_name','نام بانک',bank.bank_name)}${f('bank.holder','صاحب حساب',bank.holder)}${f('bank.account_no','شماره حساب',bank.account_no,'ltr')}${f('bank.card_no','شماره کارت',bank.card_no,'ltr')}</div>${f('bank.sheba','شماره شبا',bank.sheba,'ltr')}</div>
    <div class="panel"><h3>واحدهای اندازه‌گیری</h3><label>با ویرگول جدا کن<textarea rows="3" oninput="setInvSetting('units',this.value.split(/[,،\\n]+/).map(x=>x.trim()).filter(Boolean))">${esc((s.units||[]).join('، '))}</textarea></label></div>
  </div>
  <div class="inv-settings-save"><button type="button" class="btn" onclick="previewInvoiceTemplate()">👁 پیش‌نمایش قالب</button><button type="button" class="btn primary" onclick="saveInvoiceSettings()">💾 ذخیره تنظیمات فاکتور</button></div>`;
  invSettingsDraft.default_term_rows=invSettingsDraft.default_term_rows||{};
  for(const type of ['invoice','proforma']){
    const rows=invoiceDefaultTermRows(invSettingsDraft,type);
    while(rows.length<5)rows.push('');
    invSettingsDraft.default_term_rows[type]=rows;
    renderDefaultTermRows(type);
  }
  renderInvColumnsEditor();previewInvNumbers();
}
function setInvSetting(path,value){
  if(!invSettingsDraft)return;
  const keys=path.split('.');let o=invSettingsDraft;
  for(let i=0;i<keys.length-1;i++){o[keys[i]]=o[keys[i]]||{};o=o[keys[i]];}
  o[keys[keys.length-1]]=value;
}
function previewInvNumbers(){
  if(!invSettingsDraft)return;
  for(const t of ['invoice','proforma']){
    const n=invSettingsDraft.numbering[t],el=$('#invNumPreview_'+t);if(!el)continue;
    const pattern=/\{SEQ\}|\{N\}/.test(n.pattern||'')?n.pattern:(n.pattern||'')+'-{SEQ}';
    const key=n.reset_yearly?`${t}:${OfflineDB.jalaliYmd(new Date()).y}`:`${t}:all`;
    const seq=Math.max(Math.floor(invNum(n.start_number))||1,Number(invSettingsDraft.counters?.[key]||0));
    el.textContent=OfflineDB.formatInvoiceNumber(pattern,seq,new Date(),Math.min(10,Math.max(1,Math.floor(invNum(n.digits))||4)));
  }
}
function renderInvColumnsEditor(){
  const box=$('#invColumnsEditor');if(!box||!invSettingsDraft)return;
  const cols=invSettingsDraft.columns;
  box.innerHTML=cols.map((c,i)=>`<div class="inv-col-row"><input type="checkbox" ${c.visible?'checked':''} ${['name','total'].includes(c.key)?'disabled':''} onchange="invSettingsDraft.columns[${i}].visible=this.checked" aria-label="نمایش ستون"><input value="${esc(c.label)}" oninput="invSettingsDraft.columns[${i}].label=this.value" aria-label="عنوان ستون"><button type="button" class="icon-btn" aria-label="بالا" onclick="moveInvColumn(${i},-1)" ${i===0?'disabled':''}>↑</button><button type="button" class="icon-btn" aria-label="پایین" onclick="moveInvColumn(${i},1)" ${i===cols.length-1?'disabled':''}>↓</button></div>`).join('');
}
function moveInvColumn(i,dir){const c=invSettingsDraft.columns,j=i+dir;if(j<0||j>=c.length)return;[c[i],c[j]]=[c[j],c[i]];renderInvColumnsEditor();}
async function setInvImage(field,input){
  const file=input?.files?.[0];if(!file)return;
  if(file.size>1.5*1024*1024)return toast('حجم تصویر حداکثر ۱٫۵ مگابایت باشد','error');
  try{const url=await shrinkImageDataUrl(file,600);setInvSetting('seller.'+field,url);await saveInvoiceSettings();}catch(e){toast('تصویر خوانده نشد','error');}
}
function shrinkImageDataUrl(file,maxSide=600){
  return new Promise((resolve,reject)=>{const fr=new FileReader();fr.onerror=reject;fr.onload=()=>{const img=new Image();img.onerror=()=>resolve(fr.result);img.onload=()=>{const k=Math.min(1,maxSide/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);resolve(c.toDataURL('image/png'));};img.src=fr.result;};fr.readAsDataURL(file);});
}
async function saveInvoiceSettings(){
  try{await api('/api/invoice-settings',{method:'PUT',body:invSettingsDraft});toast('تنظیمات فاکتور ذخیره شد','success');if(invoiceView==='settings')loadInvoices();}
  catch(e){toast(e.message||'ذخیره انجام نشد','error');}
}
async function resetInvoiceCounters(){
  if(!await askConfirm('شمارنده‌ها از عدد «شروع از» دوباره شروع شوند؟ شماره‌های تکراری خودکار رد می‌شوند.',{title:'ریست شماره‌گذاری'}))return;
  try{await api('/api/invoice-settings',{method:'PUT',body:{...invSettingsDraft,reset_counters:true}});toast('شمارنده‌ها ریست شد','success');loadInvoices();}catch(e){toast(e.message,'error');}
}
function previewInvoiceTemplate(){
  if(!invSettingsDraft)return;
  const sample={type:'invoice',number:OfflineDB.formatInvoiceNumber(invSettingsDraft.numbering.invoice.pattern,invSettingsDraft.numbering.invoice.start_number,new Date(),invSettingsDraft.numbering.invoice.digits),status:'issued',issue_date:new Date().toISOString().slice(0,10),buyer:{name:'شرکت نمونه',contact_person:'آقای احمدی',economic_code:'411111111111',national_id:'10101010101',phone:'021 8877 6655',address:'تهران، خیابان ولیعصر',postal_code:'1234567890'},items:[{code:'A-100',name:'کالای نمونه',specs:'مدل استاندارد',qty:2,unit:'عدد',unit_price:12500000},{code:'S-01',name:'خدمات نصب',specs:'',qty:1,unit:'خدمت',unit_price:3000000,discount:500000}],tax_enabled:invSettingsDraft.show_tax!==false,tax_rate:invSettingsDraft.tax_rate,discount:0,shipping:0,payment_terms:'نقدی',terms:invSettingsDraft.default_terms.invoice};
  const s=JSON.parse(JSON.stringify(invSettingsDraft));
  for(const t of ['invoice','proforma'])if(!/\{SEQ\}|\{N\}/.test(s.numbering[t].pattern))s.numbering[t].pattern+='-{SEQ}';
  $('#modalTitle').textContent='پیش‌نمایش قالب';
  $('#modalBody').innerHTML=`<div class="muted" style="margin-bottom:8px">این پیش‌نمایش با داده نمونه است؛ برای اعمال، تنظیمات را ذخیره کن.</div><div class="inv-preview">${invoiceDocHtml(sample,s)}</div>`;
  openModal();
}

/* ---------- Phone contacts app: show CRM customer inside the device Contacts / Dialer ---------- */
async function setPhonebookLinkEnabled(enabled,createMissing){
  const CI=nativePlugin('CallerId');
  if(!NATIVE||!CI?.setPhonebookLink){toast('این قابلیت فقط در نسخه اندروید فعال است','error');const el=$('#phonebookLinkSetting');if(el)el.checked=false;return;}
  try{
    const cm=createMissing===undefined?($('#phonebookCreateMissingSetting')?.checked||false):createMissing;
    const r=await CI.setPhonebookLink({enabled:!!enabled,createMissing:!!cm});
    if(enabled&&r?.permissionRequested){toast('اجازه دسترسی «مخاطبین» را بده؛ بعد دوباره همین کلید را بزن','info');}
    else if(enabled){await syncCallerIdContacts();toast('پرونده CRM به مخاطبین گوشی وصل شد','success');}
    else toast('اتصال به مخاطبین گوشی خاموش شد و ردیف‌های CRM از مخاطبین پاک شد','success');
    loadCallerIdStatus().catch(()=>{});
  }catch(e){toast(e.message||'تنظیم مخاطبین انجام نشد','error');}
}
