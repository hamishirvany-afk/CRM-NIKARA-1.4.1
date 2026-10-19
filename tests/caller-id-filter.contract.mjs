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
// 1) manual CRM contact -> eligible
const real=await api('/api/contacts',{method:'POST',body:{first_name:'مشتری',last_name:'واقعی',phone:'09121234567'}});
assert(real.caller_id===true,'manual contact must be Caller ID eligible');
// 2) phonebook import -> NOT eligible
const n=await DBAPI.importCachedContacts([{name:'دوست',phone:'09350000000',source:'device-contacts'},{name:'نانوایی',phone:'09360000000',source:'device-contacts'}]);
assert(n===2,'phonebook imported');
let all=await api('/api/contacts?limit=2000');
const pb=all.filter(c=>c.source==='device-contacts');
assert(pb.length===2&&pb.every(c=>c.caller_id===false),'phonebook contacts must be excluded from Caller ID');
// 3) same eligibility rule used by app.js sync
const app=fs.readFileSync(new URL('frontend/app.js', projectRoot),'utf8');
assert(app.includes('rows.filter(callerIdEligible)')&&app.includes('orgs.filter(callerIdEligible)'),'sync must filter eligible rows');
const callerIdEligible=r=>!r.archived&&(r.caller_id===true||(r.caller_id!==false&&!['device-contacts','caller-id-cache'].includes(String(r.source||''))));
assert(all.filter(callerIdEligible).length===1,'only the registered contact goes to Caller ID');
// 4) user approves one phonebook contact -> eligible
await api('/api/contacts/'+pb[0].id,{method:'PATCH',body:{caller_id:true}});
all=await api('/api/contacts?limit=2000');
assert(all.filter(callerIdEligible).length===2,'approved phonebook contact becomes eligible');
// 5) cleanup archives unapproved phonebook contacts without history
const r=await DBAPI.cleanupPhonebookContacts();
assert(r.archived===1&&r.kept===1,'cleanup archives only unapproved, unused phonebook contacts');
// 6) native guard present
const svc=fs.readFileSync(new URL('mobile/native-caller-id/CrmCallScreeningService.java', projectRoot),'utf8');
const plg=fs.readFileSync(new URL('mobile/native-caller-id/CallerIdPlugin.java', projectRoot),'utf8');
assert(svc.includes('isCrmRegistered(row)')&&svc.includes('KEY_ENABLED'),'native service must ignore non-CRM numbers and honor master toggle');
assert(plg.includes('CrmCallScreeningService.isCrmRegistered(row)')&&plg.includes('public void setEnabled'),'native sync filter + toggle');
console.log('CALLER_ID_FILTER_CONTRACT_PASS');
