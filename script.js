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
