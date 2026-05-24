// ============================================
// 🚀 LIDER 360 - SERVICE WORKER (Online-First)
// ============================================
// Estratégia: SEMPRE busca da internet primeiro
// Cache só pra emergência (sem internet)
// Dados de API/Supabase NUNCA são cacheados
// ============================================

const VERSAO = 'lider360-v2.0.0';
const CACHE_EMERGENCIA = 'lider360-fallback';

// Só cacheia o mínimo absoluto (pra abrir offline)
const RECURSOS_MINIMOS = [
  '/',
  '/icon.svg',
  '/manifest.json',
];

// ============================================
// INSTALAÇÃO
// ============================================
self.addEventListener('install', (event) => {
  console.log('🚀 SW v2: Instalando');
  
  event.waitUntil(
    caches.open(CACHE_EMERGENCIA).then((cache) => {
      return cache.addAll(RECURSOS_MINIMOS).catch(() => {});
    }).then(() => self.skipWaiting())
  );
});

// ============================================
// ATIVAÇÃO - Limpa caches antigos AGRESSIVAMENTE
// ============================================
self.addEventListener('activate', (event) => {
  console.log('✨ SW v2: Ativando - limpando caches antigos');
  
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
// FETCH - SEMPRE ONLINE PRIMEIRO
// ============================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // ❌ NUNCA INTERCEPTAR:
  // - APIs (Supabase, Groq, Next.js API routes)
  // - Recursos de outras origens
  // - Métodos não-GET
  
  if (
    request.method !== 'GET' ||
    !request.url.startsWith(self.location.origin) ||
    request.url.includes('/api/') ||
    request.url.includes('supabase') ||
    request.url.includes('groq') ||
    request.url.includes('/_next/data') ||
    request.url.includes('/_next/webpack') ||
    request.url.includes('chrome-extension')
  ) {
    return; // Deixa o navegador lidar normalmente
  }
  
  // ✅ Pra páginas HTML e assets estáticos:
  // SEMPRE busca network primeiro, cache só como fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Atualiza cache de emergência em segundo plano
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_EMERGENCIA).then((cache) => {
            cache.put(request, clone).catch(() => {});
          });
        }
        return response;
      })
      .catch(() => {
        // Sem internet? Tenta o cache de emergência
        return caches.match(request).then((cached) => {
          if (cached) {
            console.log('📦 SW: Sem internet - servindo do cache', request.url);
            return cached;
          }
          
          // Se é página HTML e não tem cache, retorna a home cacheada
          if (request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/');
          }
          
          return new Response('Sem conexão e sem cache', { 
            status: 503, 
            statusText: 'Offline' 
          });
        });
      })
  );
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
// MESSAGE - Comunicação com o app
// ============================================
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('🚀 LIDER 360 SW v2 carregado - Modo Online-First');
