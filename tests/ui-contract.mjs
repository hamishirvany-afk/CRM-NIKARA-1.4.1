import fs from 'node:fs';

const html=fs.readFileSync('frontend/index.html','utf8');
const js=fs.readFileSync('frontend/app.js','utf8');

const handlers=[];
for(const source of [html,js]){
  for(const attr of ['onclick','onchange','oninput','onsubmit','onblur','onkeydown']){
    const re=new RegExp(`${attr}=["']?([A-Za-z_$][\\w$]*)\\s*\\(`,'g');
    for(const m of source.matchAll(re)) handlers.push(m[1]);
  }
}

const defs=new Set();
for(const m of js.matchAll(/\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) defs.add(m[1]);
for(const m of js.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g)) defs.add(m[1]);
for(const m of js.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?[A-Za-z_$][\w$]*\s*=>/g)) defs.add(m[1]);

const missing=[...new Set(handlers)].filter(x=>!defs.has(x)).sort();
if(missing.length){
  console.error('Undefined UI handlers:',missing.join(', '));
  process.exit(1);
}
const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(match=>match[1]);
const duplicateIds=[...new Set(ids.filter((id,index)=>ids.indexOf(id)!==index))];
if(duplicateIds.length){console.error('Duplicate HTML IDs:',duplicateIds.join(', '));process.exit(1)}
if(/<button\b[^>]*>\s*<\/button>/i.test(html)){console.error('Blank static button detected');process.exit(1)}
for(const marker of ['CRM-NIKARA','H.Shirvani','Caller ID','پروژه‌ها','شبکه کاری','اسناد و فاکتورها']){
  if(!html.includes(marker)&&!js.includes(marker)){
    console.error('Required product marker missing:',marker);
    process.exit(1);
  }
}
for(const marker of ['role="dialog"','aria-live="polite"','aria-label="بستن پنجره"']){
  if(!html.includes(marker)){console.error('Required accessibility marker missing:',marker);process.exit(1)}
}
console.log(`UI_CONTRACT_PASS handlers=${new Set(handlers).size}`);
