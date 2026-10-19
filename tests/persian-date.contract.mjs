import fs from 'node:fs';

const app=fs.readFileSync('frontend/app.js','utf8');
const html=fs.readFileSync('frontend/index.html','utf8');
function assert(c,m){if(!c)throw new Error('ASSERT: '+m)}

assert(app.includes("fa-IR-u-ca-persian"),'Persian calendar locale is explicit');
assert(app.includes("Asia/Tehran"),'Tehran timezone is explicit');
assert(app.includes('tehranLocalToIso'),'Tehran timezone-safe datetime conversion exists');
assert(app.includes('formatJalaliTyping'),'automatic Jalali slash formatting exists');
assert(app.includes('openJalaliPicker')&&app.includes('renderJalaliPicker'),'interactive Jalali calendar picker exists');
assert(html.includes('id="datePickerLayer"')&&html.includes('aria-modal="true"'),'accessible date picker dialog shell exists');
assert(app.includes('role="grid"')&&app.includes('aria-live="polite"'),'date picker announces month changes and exposes a grid');
assert(!/type=["'](?:date|datetime-local)["']/.test(html),'native Gregorian date inputs removed from HTML');
assert(!/type=["'](?:date|datetime-local)["']/.test(app),'native Gregorian date inputs removed from generated forms');

const normalize=s=>String(s).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const fmtFa=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'});
assert(normalize(fmtFa.format(new Date('2026-08-31T12:00:00Z')))==='1405/06/09','2026-08-31 renders as 1405/06/09');

function formatJalaliTyping(v=''){const fa='۰۱۲۳۴۵۶۷۸۹';const latin=String(v).replace(/[۰-۹]/g,d=>String(fa.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));const digits=latin.replace(/\D/g,'').slice(0,8);return [digits.slice(0,4),digits.slice(4,6),digits.slice(6,8)].filter(Boolean).join('/')}
assert(formatJalaliTyping('14050609')==='1405/06/09','eight digits gain Jalali separators');
assert(formatJalaliTyping('۱۴۰۵۰۶۰۹')==='1405/06/09','Persian digits gain Jalali separators');

const fmtParts=new Intl.DateTimeFormat('en-US-u-ca-persian',{timeZone:'UTC',year:'numeric',month:'numeric',day:'numeric'});
function jp(d){const x=Object.fromEntries(fmtParts.formatToParts(d).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));return {jy:+x.year,jm:+x.month,jd:+x.day}}
function cmp(a,b){return a.jy-b.jy||a.jm-b.jm||a.jd-b.jd}
function toG(jy,jm,jd){let lo=Date.UTC(jy+620,0,1),hi=Date.UTC(jy+622,11,31),target={jy,jm,jd};while(lo<=hi){const mid=lo+Math.floor((hi-lo)/172800000)*86400000;const p=jp(new Date(mid));const c=cmp(p,target);if(c===0){const d=new Date(mid);return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`}if(c<0)lo=mid+86400000;else hi=mid-86400000}throw new Error('conversion failed')}
assert(toG(1404,1,1)==='2025-03-21','1404/01/01 converts to 2025-03-21');

function tehranLocalToIso(gy,gm,gd,hh=0,mm=0){const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});const wanted=Date.UTC(gy,gm-1,gd,hh,mm,0);let guess=wanted;for(let i=0;i<3;i++){const p=Object.fromEntries(fmt.formatToParts(new Date(guess)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));const represented=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);const diff=represented-wanted;if(Math.abs(diff)<1000)break;guess-=diff}return new Date(guess).toISOString()}
assert(tehranLocalToIso(2026,8,31,9,0)==='2026-08-31T05:30:00.000Z','Tehran 09:00 stored timezone-safely');
console.log('PERSIAN_DATE_CONTRACT_PASS');
