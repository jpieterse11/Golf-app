const C='golfscoring-v33';
const FILES=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png','./icon-180.png','./icon.svg','./banner.jpg','./results-photo.jpg','./course-banner.jpg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));});
// activate: delete every cache except the current one, which includes the old matchplay-* caches (app was renamed Golf Scoring Games).
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;
// indexes.json and courses.json: network only, straight to the network (bypasses the HTTP cache too; the page also adds ?t=<time> so a CDN copy can't be reused). NEVER served from a cache here.
// Offline: answer 503 so the page falls back to its own last-good copy in localStorage and tells the user it is offline.
if(/\/(indexes|courses)\.json$/.test(new URL(e.request.url).pathname)){e.respondWith(fetch(e.request.url,{cache:'no-store'}).catch(()=>new Response('offline',{status:503,statusText:'offline'})));return;}
e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r;}).catch(()=>caches.match(e.request).then(m=>m||caches.match('./index.html'))));});
