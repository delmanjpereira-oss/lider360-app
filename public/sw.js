// ============================================
// 🚀 LIDER 360 - SERVICE WORKER
// ============================================
// Habilita:
// - Cache offline
// - Notificações push
// - Atualizações automáticas
// ============================================

const VERSAO_CACHE = 'lider360-v1.0.0';
const CACHE_RUNTIME = 'lider360-runtime';

// Recursos pra cachear na instalação
const RECURSOS_ESSENCIAIS = [
  '/',
  '/manifest.json',
  '/icon.svg',
];

// ============================================
// INSTALAÇÃO
// ============================================
self.addEventListener('install', (event) => {
  console.log('🚀 SW: Instalando v1.0.0');
  
  event.waitUntil(
    caches.open(VERSAO_CACHE).then((cache) => {
      console.log('📦 SW: Cache aberto');
      return cache.addAll(RECURSOS_ESSENCIAIS).catch((err) => {
        console.warn('⚠️ SW: Falha ao cachear alguns recursos', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ============================================
// ATIVAÇÃO - Limpa caches antigos
// ============================================
self.addEventListener('activate', (event) => {
  console.log('✨ SW: Ativando v1.0.0');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== VERSAO_CACHE && name !== CACHE_RUNTIME)
          .map((name) => {
            console.log('🗑️ SW: Apagando cache antigo', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ============================================
// FETCH - Estratégia: Network First com fallback
// ============================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Ignora requests pra outras origens (Supabase, Groq, etc)
  if (!request.url.startsWith(self.location.origin)) {
    return;
  }
  
  // Ignora métodos não-GET
  if (request.method !== 'GET') {
    return;
  }
  
  // Ignora rotas de API e arquivos do Next.js internos
  if (
    request.url.includes('/api/') ||
    request.url.includes('/_next/data') ||
    request.url.includes('/_next/webpack') ||
    request.url.includes('chrome-extension')
  ) {
    return;
  }
  
  event.respondWith(
    // Tenta network primeiro
    fetch(request)
      .then((response) => {
        // Se deu certo, salva no cache e retorna
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_RUNTIME).then((cache) => {
            cache.put(request, clone).catch(() => {});
          });
        }
        return response;
      })
      .catch(() => {
        // Se network falhou, tenta o cache
        return caches.match(request).then((cached) => {
          if (cached) {
            console.log('📦 SW: Servindo do cache:', request.url);
            return cached;
          }
          
          // Se nem cache tem e é uma página HTML, retorna a home
          if (request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/');
          }
          
          return new Response('Offline e sem cache', { 
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
  console.log('🔔 SW: Notificação push recebida');
  
  let dados = { 
    titulo: 'LIDER 360',
    corpo: 'Você tem uma notificação',
    icone: '/icon.svg',
    url: '/'
  };
  
  if (event.data) {
    try {
      dados = { ...dados, ...event.data.json() };
    } catch (e) {
      dados.corpo = event.data.text();
    }
  }
  
  const options = {
    body: dados.corpo,
    icon: dados.icone,
    badge: '/icon.svg',
    vibrate: [200, 100, 200],
    requireInteraction: dados.critica || false,
    data: {
      url: dados.url,
      timestamp: Date.now(),
    },
    actions: [
      { action: 'abrir', title: '👀 Ver' },
      { action: 'fechar', title: 'Fechar' },
    ],
    tag: dados.tag || 'lider360-notif',
    renotify: true,
  };
  
  event.waitUntil(
    self.registration.showNotification(dados.titulo, options)
  );
});

// ============================================
// CLICK NA NOTIFICAÇÃO
// ============================================
self.addEventListener('notificationclick', (event) => {
  console.log('👆 SW: Click na notificação');
  
  event.notification.close();
  
  if (event.action === 'fechar') {
    return;
  }
  
  const urlAlvo = event.notification.data?.url || '/';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Se já tem janela aberta, foca nela
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(urlAlvo);
            return client.focus();
          }
        }
        // Senão, abre nova
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
  
  if (event.data?.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: VERSAO_CACHE });
  }
});

console.log('🚀 LIDER 360 Service Worker carregado');
