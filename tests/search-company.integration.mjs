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
function assert(cond,msg){ if(!cond){ console.error('SEARCH_COMPANY_FAIL: '+msg); process.exit(1); } }
await DBAPI.resetAll();

// 1) Person with a typed NEW company name -> company file is created and linked (no more "مستقل")
const p1=await api('/api/contacts',{method:'POST',body:{first_name:'علی',last_name:'رضایی',company:'بازرگانی نیکان',phone:'09121112233',source:'manual'}});
assert(p1.organization_id,'typed company must create & link an organization');
let orgs=await api('/api/organizations');
assert(orgs.length===1&&orgs[0].name==='بازرگانی نیکان','organization created once');

// 2) Same company typed with Arabic ي/ك and ZWNJ variants -> reuses the same file
const p2=await api('/api/contacts',{method:'POST',body:{first_name:'مريم',last_name:'كريمي',company:'بازرگاني نيكان',phone:'09124445566'}});
orgs=await api('/api/organizations');
assert(orgs.length===1&&p2.organization_id===p1.organization_id,'Arabic/Persian variants must map to the same company');

// 3) Editing a linked person with a different typed company moves them to that company
const moved=await api('/api/contacts/'+p2.id,{method:'PATCH',body:{company:'پخش دارویی آوا'}});
orgs=await api('/api/organizations');
assert(orgs.length===2,'second company created on edit');
assert(moved.company==='پخش دارویی آوا'&&moved.organization_id!==p1.organization_id,'edit with typed company must re-link');
const unlinked=await api('/api/contacts/'+p2.id,{method:'PATCH',body:{organization_id:null}});
assert(!unlinked.organization_id,'explicit null unlinks');

// 4) Persian-aware search: Arabic letters, Persian digits, partial phone, multi-word, company of a person
const s1=await api('/api/contacts?q='+encodeURIComponent('كريمي'));
assert(s1.length===1,'Arabic ك/ي must find Persian کریمی');
const s2=await api('/api/contacts?q='+encodeURIComponent('۰۹۱۲۱۱۱'));
assert(s2.length===1&&s2[0].id===p1.id,'Persian-digit partial phone must match');
const s3=await api('/api/contacts?q='+encodeURIComponent('2233'));
assert(s3.length===1,'last digits of phone must match');
const s4=await api('/api/contacts?q='+encodeURIComponent('علی نیکان'));
assert(s4.length===1,'multi-word query across name + company');
const s5=await api('/api/organizations?q='+encodeURIComponent('رضایی'));
assert(s5.length===1,'company found by a member name');
const s6=await api('/api/organizations?q='+encodeURIComponent('09121112233'));
assert(s6.length===1,'company found by a member phone');

// 5) Files: searchable by title, invoice no, tag, note, owner — without leaking data_url
const fd=new FormData();
fd.append('file',new Blob(['%PDF-1.4 test'],{type:'application/pdf'}),'scan-001.pdf');
fd.append('category','contract'); fd.append('title','قرارداد سالانه ۱۴۰۵'); fd.append('invoice_no','INV-7781'); fd.append('tags','حمل، بیمه'); fd.append('note','نسخه امضا شده');
const att=await api(`/api/contacts/${p1.id}/attachments`,{method:'POST',body:fd});
assert(Array.isArray(att.tags)&&att.tags.length===2,'tags stored');
for(const q of ['قرارداد','7781','بیمه','امضا','رضایی','1405']){
  const rows=await api('/api/attachments?q='+encodeURIComponent(q));
  assert(rows.length===1,`file search by "${q}"`);
  assert(!('data_url' in rows[0]),'file list must not carry file bytes');
}
const scoped=await api(`/api/attachments?scope_type=organization&scope_id=${p1.organization_id}&q=INV`);
assert(scoped.length===1,'company scope includes member files');
const patched=await api('/api/attachments/'+att.id,{method:'PATCH',body:{title:'قرارداد تمدید',tags:'تمدید'}});
assert(patched.title==='قرارداد تمدید'&&patched.tags[0]==='تمدید','file metadata editable');

// 6) Global search groups everything
const g=await api('/api/search?q='+encodeURIComponent('نیکان'));
assert(g.organizations.length===1&&g.contacts.length>=1,'global search returns company + its people');
const g2=await api('/api/search?q='+encodeURIComponent('تمدید'));
assert(g2.files.length===1&&g2.files[0].owner?.type==='contact'&&!g2.files[0].data_url,'global search returns files with owner');
const g3=await api('/api/search?q='+encodeURIComponent('  '));
assert(g3.total===0,'empty query returns nothing');
console.log('SEARCH_COMPANY_INTEGRATION_PASS');
