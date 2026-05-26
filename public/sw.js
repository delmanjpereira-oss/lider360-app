// ============================================
// 🚀 LIDER 360 - SERVICE WORKER (v3 fix)
// ============================================

const VERSAO = 'lider360-v3.0.0';
const CACHE_EMERGENCIA = 'lider360-fallback';

const RECURSOS_MINIMOS = [
  '/',
  '/icon.svg',
  '/manifest.json',
];

// ============================================
// INSTALAÇÃO
// ============================================
self.addEventListener('install', (event) => {
  console.log('🚀 SW v3: Instalando');
  
  event.waitUntil(
    caches.open(CACHE_EMERGENCIA).then((cache) => {
      return cache.addAll(RECURSOS_MINIMOS).catch(() => {});
    }).then(() => self.skipWaiting())
  );
});

// ============================================
// ATIVAÇÃO
// ============================================
self.addEventListener('activate', (event) => {
  console.log('✨ SW v3: Ativando - limpando caches antigos');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_EMERGENCIA)
          .map((name) => {
            console.log('🗑️ SW: Apagando cache antigo', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ============================================
// FETCH - SEMPRE deixa o navegador lidar
// Cache só pra recursos estáticos básicos
// ============================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // ❌ NUNCA INTERCEPTA:
  // - APIs (qualquer chamada que possa demorar)
  // - Rotas com /copiloto, /api, /_next
  // - Recursos de outras origens
  // - Métodos não-GET
  // - Páginas dinâmicas
  
  if (
    request.method !== 'GET' ||
    !request.url.startsWith(self.location.origin) ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/copiloto') ||
    url.pathname.startsWith('/_next/') ||
    url.pathname.includes('/analise') ||
    url.pathname.startsWith('/strategist') ||
    request.url.includes('supabase') ||
    request.url.includes('groq') ||
    request.url.includes('anthropic') ||
    request.url.includes('chrome-extension')
  ) {
    return; // Deixa o navegador lidar normalmente
  }
  
  // ✅ Apenas pra recursos estáticos (imagens, ícones, manifest):
  // Cache First com fallback de network
  if (
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_EMERGENCIA).then((cache) => {
              cache.put(request, clone).catch(() => {});
            });
          }
          return response;
        }).catch(() => {
          return new Response('Offline', { status: 503 });
        });
      })
    );
  }
  
  // Pra tudo mais: deixa o navegador lidar (sem cache, sem intercept)
});

// ============================================
// NOTIFICAÇÕES PUSH
// ============================================
self.addEventListener('push', (event) => {
  let dados = { 
    titulo: 'LIDER 360',
    corpo: 'Você tem uma notificação',
    url: '/'
  };
  
  if (event.data) {
    try {
      dados = { ...dados, ...event.data.json() };
    } catch (e) {
      dados.corpo = event.data.text();
    }
  }
  
  event.waitUntil(
    self.registration.showNotification(dados.titulo, {
      body: dados.corpo,
      icon: '/icon.svg',
      badge: '/icon.svg',
      vibrate: [200, 100, 200],
      requireInteraction: dados.critica || false,
      data: { url: dados.url },
      actions: [
        { action: 'abrir', title: '👀 Ver' },
        { action: 'fechar', title: 'Fechar' },
      ],
      tag: dados.tag || 'lider360-notif',
      renotify: true,
    })
  );
});

// ============================================
// CLICK NA NOTIFICAÇÃO
// ============================================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'fechar') return;
  
  const urlAlvo = event.notification.data?.url || '/';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(urlAlvo);
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlAlvo);
        }
      })
  );
});

// ============================================
// MESSAGE
// ============================================
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('🚀 LIDER 360 SW v3 carregado - Mínima intervenção');
