// Consent Mode v2 básico: este arquivo deve executar antes de qualquer tag Google.
(function () {
  'use strict';
  const KEY = 'cookie_consent_nois';
  const TYPES = ['ad_storage', 'analytics_storage', 'ad_user_data', 'ad_personalization'];
  let current = null;
  let requested = false;
  let bootstrapped = false;
  let initialized = false;
  let returnFocus = null;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };

  function state(accepted) {
    return Object.fromEntries(TYPES.map(type => [type, accepted ? 'granted' : 'denied']));
  }
  // Ordem obrigatória: default -> preferência restaurada/update -> gtm.js.
  window.gtag('consent', 'default', state(false));

  function read(value) {
    try {
      const record = JSON.parse(value);
      // O antigo "true"/"Entendi" não comprova autorização para estas finalidades.
      if (record?.version === 2 && ['accepted', 'rejected'].includes(record.choice)) return record.choice;
    } catch (error) { /* Preferência ausente/inválida: negar e perguntar. */ }
    return null;
  }
  function stored() {
    try { return read(localStorage.getItem(KEY)); } catch (error) { return null; }
  }
  function loadGTM() {
    if (requested || current !== 'accepted') return;
    requested = true;
    if (!bootstrapped) {
      bootstrapped = true;
      window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    }
    const script = document.createElement('script');
    script.id = 'nois-gtm-script';
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-55MN7ZRV';
    script.onerror = () => { script.remove(); requested = false; };
    document.head.appendChild(script);
  }
  function sync(choice) {
    current = choice;
    window.gtag('consent', 'update', state(choice === 'accepted'));
    if (choice === 'accepted') loadGTM();
  }
  function hide() {
    const banner = document.getElementById('cookie-banner');
    if (!banner) return;
    banner.classList.remove('show');
    banner.classList.add('hidden');
    banner.hidden = true;
    returnFocus?.focus();
  }
  function measureBanner() {
    const banner = document.getElementById('cookie-banner');
    if (banner && !banner.hidden) {
      document.documentElement.style.setProperty('--cookie-banner-height', Math.ceil(banner.getBoundingClientRect().height) + 'px');
    }
  }
  function show() {
    const banner = document.getElementById('cookie-banner');
    if (!banner) return;
    returnFocus = document.activeElement;
    banner.hidden = false;
    banner.classList.remove('hidden');
    banner.classList.add('show');
    measureBanner();
    document.getElementById('cookie-reject')?.focus();
  }
  function choose(choice) {
    const mustReload = requested && current === 'accepted' && choice === 'rejected';
    // Consentimento é explícito; falha de storage não transforma silêncio em aceitação.
    try {
      localStorage.setItem(KEY, JSON.stringify({version: 2, choice}));
    } catch (error) {
      // Se a gravação falhar (ex.: quota), não restaurar uma autorização antiga após revogar.
      if (choice === 'rejected') {
        try { localStorage.removeItem(KEY); } catch (storageError) { /* Storage bloqueado. */ }
      }
    }
    sync(choice);
    hide();
    if (mustReload) window.location.reload();
  }
  function init() {
    if (initialized) return;
    initialized = true;
    document.getElementById('cookie-accept')?.addEventListener('click', () => choose('accepted'));
    document.getElementById('cookie-reject')?.addEventListener('click', () => choose('rejected'));
    document.getElementById('cookie-preferences')?.addEventListener('click', show);
    const banner = document.getElementById('cookie-banner');
    if (banner && typeof ResizeObserver !== 'undefined') new ResizeObserver(measureBanner).observe(banner);
    window.addEventListener('resize', measureBanner);
    if (current) hide();
    else {
      // Apresentar o banner não muda o estado de consentimento.
      const banner = document.getElementById('cookie-banner');
      if (banner) { banner.hidden = false; banner.classList.add('show'); measureBanner(); }
    }
  }
  window.noisConsent = Object.freeze({
    init,
    canMeasure: () => current === 'accepted' && requested
  });
  const saved = stored();
  if (saved) sync(saved);
  window.addEventListener('storage', event => {
    if (event.key !== KEY && event.key !== null) return;
    const choice = stored();
    const mustReload = requested && current === 'accepted' && choice !== 'accepted';
    sync(choice);
    if (mustReload) window.location.reload();
    else if (choice) hide();
    else show();
  });
  document.addEventListener('DOMContentLoaded', init);
})();
