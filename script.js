// =========================
// SCRIPTS DE INTERATIVIDADE LEVE
// =========================

// Animação de entrada ao rolar a página
(function () {
  const fadeElements = document.querySelectorAll(".fade-in");
  const options = { threshold: 0.1, rootMargin: "0px 0px -50px 0px" };
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("show");
        obs.unobserve(entry.target);
      }
    });
  }, options);
  fadeElements.forEach((el) => observer.observe(el));
})();

// WhatsApp number - update this to the real business number
const WHATSAPP_NUMBER = "5511950566792";
const WHATSAPP_MESSAGE = encodeURIComponent(
  "Olá! Preciso de um atendimento para desentupimento. Podem me ajudar?",
);
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MESSAGE}`;

// Aplica o link correto em todos os CTAs do WhatsApp
document.addEventListener("DOMContentLoaded", function () {
  const whatsappLinks = document.querySelectorAll('a[href*="wa.me"]');
  whatsappLinks.forEach((link) => {
    link.href = WHATSAPP_LINK;
  });
});

// =========================
// BANNER DE COOKIES / LGPD
// =========================
(function () {
  const STORAGE_KEY = "cookie_consent_nois";
  const banner = document.getElementById("cookie-banner");
  const btn = document.getElementById("cookie-accept");

  if (!banner || !btn) return;

  // Verifica se já aceitou
  const hasConsented = localStorage.getItem(STORAGE_KEY);
  if (hasConsented) {
    banner.classList.add("hidden");
    return;
  }

  // Mostra o banner após um pequeno delay
  setTimeout(() => {
    banner.classList.add("show");
  }, 500);

  // Botão "Entendi"
  btn.addEventListener("click", function () {
    localStorage.setItem(STORAGE_KEY, "true");
    banner.classList.remove("show");
    banner.classList.add("hidden");
    // Pequeno delay para animação de saída antes de esconder completamente
    setTimeout(() => {
      banner.style.display = "none";
    }, 350);
  });
})();

