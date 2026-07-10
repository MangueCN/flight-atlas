// Flight Atlas service worker
// VERSION 由发布脚本自动替换,每次发布强制刷新应用外壳
const VERSION = '20260710134629';
const SHELL = `atlas-shell-${VERSION}`;
const RUNTIME = 'atlas-runtime-v1';
const TILE_LIMIT = 600;   // 地图瓦片缓存上限
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith('atlas-shell-') && k !== SHELL).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

async function trimCache(name, limit){
  const c = await caches.open(name);
  const keys = await c.keys();
  if(keys.length > limit){
    await Promise.all(keys.slice(0, keys.length - limit).map(k => c.delete(k)));
  }
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if(e.request.method !== 'GET') return;

  // 应用外壳:网络优先(保证数据更新及时),失败回退缓存 → 离线可用
  if(url.origin === location.origin && (e.request.mode === 'navigate' || url.pathname.endsWith('/index.html'))){
    e.respondWith(
      fetch(e.request).then(r => {
        const copy = r.clone();
        caches.open(SHELL).then(c => c.put('./index.html', copy));
        return r;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 照片 / Leaflet CDN / 地图瓦片:缓存优先,后台更新
  const cacheable =
    (url.origin === location.origin && url.pathname.includes('/photos/')) ||
    url.hostname === 'unpkg.com' ||
    url.hostname.endsWith('basemaps.cartocdn.com') ||
    (url.origin === location.origin && url.pathname.includes('/icons/'));
  if(cacheable){
    e.respondWith(
      caches.open(RUNTIME).then(async c => {
        const hit = await c.match(e.request);
        const net = fetch(e.request).then(r => {
          if(r.ok){ c.put(e.request, r.clone()); trimCache(RUNTIME, TILE_LIMIT); }
          return r;
        }).catch(() => hit);
        return hit || net;
      })
    );
  }
});
