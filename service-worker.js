// 상무옥 예약관리 Service Worker
const CACHE_NAME = 'sangmuok-v1';
const ASSETS = ['./index.html', './manifest.json'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).catch(()=>{})
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 네트워크 우선, 실패 시 캐시 (항상 최신 코드 유지)
self.addEventListener('fetch', e => {
  const url = e.request.url;
  // 구글 스크립트 API는 항상 네트워크
  if (url.includes('script.google.com')) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (e.request.method === 'GET' && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone)).catch(()=>{});
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
