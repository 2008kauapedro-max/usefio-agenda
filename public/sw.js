const CACHE='fio-shell-v7';
function pushTarget(value){
 try{const u=new URL(value,self.location.origin);if(u.origin===self.location.origin&&(/^\/(owner|barber|client)\/agenda$/.test(u.pathname)||u.pathname==='/platform/alertas'))return u.href;}catch{}
 return new URL('/',self.location.origin).href;
}
self.addEventListener('push',event=>{
 let payload={};try{payload=event.data?.json()??{};}catch{}
 const target=pushTarget(payload.url),platform=new URL(target).pathname==='/platform/alertas';
 event.waitUntil(self.registration.showNotification(platform?'FIO Platform':'FIO — Agenda',{body:platform?'Há um alerta que precisa da sua atenção.':'Há uma atualização ou lembrete na sua agenda. Abra o FIO para conferir.',icon:'/icons/icon-192.png',tag:typeof payload.tag==='string'?payload.tag.slice(0,100):'fio-update',data:{url:target}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{
  const target=pushTarget(event.notification.data?.url);
  const existing=windows.find(w=>new URL(w.url).origin===self.location.origin&&new URL(w.url).pathname.split('/')[1]===new URL(target).pathname.split('/')[1]);
  if(existing){await existing.navigate(target);return existing.focus();}return self.clients.openWindow(target);
 }));
});
const SHELL=['/','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png','/icons/icon-maskable-192.png','/icons/icon-maskable-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).catch(()=>undefined));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).then(response=>{if(response.ok&&response.headers.get('content-type')?.includes('text/html')){const copy=response.clone();void caches.open(CACHE).then(cache=>cache.put('/',copy)).catch(()=>undefined);}return response;}).catch(async()=>await caches.match('/')||new Response('Sem conexão. Reconecte e tente novamente.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})));
  return;
 }
 event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok&&['script','style','image','font'].includes(request.destination)){const copy=response.clone();void caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>undefined);}return response;})).catch(()=>new Response('',{status:503,statusText:'Offline'})));
});
