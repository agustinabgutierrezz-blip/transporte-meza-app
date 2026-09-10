// Service worker minimo: no cachea datos (la app necesita red para funcionar,
// ya que todo se guarda en Supabase). Solo existe para que el navegador
// permita "Instalar" / "Agregar a la pantalla de inicio".
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', () => {
  // Sin caché: siempre va a la red. Evita mostrar datos viejos o rotos.
});
