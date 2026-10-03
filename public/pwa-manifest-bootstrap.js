(function () {
  // Capture the Chromium PWA prompt before React mounts. On fast mobile
  // connections the browser may fire beforeinstallprompt before the page
  // component is ready; keeping it here makes the install button reliable.
  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    window.__fioInstallPrompt = event;
    window.dispatchEvent(new CustomEvent('fio-install-ready'));
  });
  window.addEventListener('appinstalled', function () {
    window.__fioInstallPrompt = null;
    window.dispatchEvent(new CustomEvent('fio-app-installed'));
  });
  var path = window.location.pathname || '/';
  var parts = path.split('/').filter(Boolean);
  var query = new URLSearchParams(window.location.search);
  var reserved = new Set(['owner','barber','client','login','reset-password','confirm-email','acesso','platform','api']);
  var slug = '';
  var slugPattern = /^[a-z0-9-]{3,60}$/;

  if ((parts[0] === 'barbearia' || parts[0] === 'b') && slugPattern.test(parts[1] || '')) {
    slug = parts[1];
  } else if (parts.length === 1 && slugPattern.test(parts[0] || '') && !reserved.has(parts[0])) {
    slug = parts[0];
  } else if (query.get('audience') === 'client' && slugPattern.test(query.get('shop') || '')) {
    slug = query.get('shop');
  }

  var href = '/manifest.webmanifest';
  if (slug) href = '/api/public/manifest/' + encodeURIComponent(slug) + '?v=client-brand-v2';
  else if (/^\/owner(?:\/|$)/.test(path)) href = '/manifest-owner.webmanifest';
  else if (/^\/barber(?:\/|$)/.test(path)) href = '/manifest-staff.webmanifest';
  else if (/^\/platform(?:\/|$)/.test(path) || query.get('audience') === 'platform') href = '/manifest-platform.webmanifest';
  else if (/^\/client(?:\/|$)/.test(path) || query.get('audience') === 'client') href = '/manifest-client.webmanifest';

  var old = document.querySelector('link[rel="manifest"]');
  if (old) old.remove();
  var link = document.createElement('link');
  link.rel = 'manifest';
  link.href = href;
  document.head.appendChild(link);
})();
