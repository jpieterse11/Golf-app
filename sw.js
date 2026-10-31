const C='matchplay-v7';
const FILES=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png','./icon-180.png','./icon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;
// indexes.json and courses.json: network only, straight to the network (bypasses the HTTP cache too). Never cached here; the page keeps its own last-good copy in localStorage.
if(/\/(indexes|courses)\.json$/.test(new URL(e.request.url).pathname)){e.respondWith(fetch(e.request.url,{cache:'no-store'}));return;}
e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r;}).catch(()=>caches.match(e.request).then(m=>m||caches.match('./index.html'))));});
