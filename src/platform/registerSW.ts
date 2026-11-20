/**
 * Registers the offline service worker in production builds only.
 * Browsers only allow service workers on secure contexts (https:// or http://localhost),
 * so on a plain-http LAN address this silently does nothing — the game still runs.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((err: unknown) => {
      console.warn('[sw] registration failed', err);
    });
  });
}
