const CACHE='crm-nikara-v1.4.1-terms-rows';
const SHELL=['/','/style.css','/offline-store.js','/app.js','/native-bridge.js','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png','/fonts/nikara-ui-regular.ttf','/fonts/nikara-ui-bold.ttf'];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()).then(()=>{
    self.clients.matchAll({includeUncontrolled:true}).then(list=>list.forEach(c=>{try{c.postMessage({type:'update-available',version:'1.4.0'})}catch(_err){}}));
  }));
});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r})));
});
