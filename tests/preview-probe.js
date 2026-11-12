// Diagnóstico MANUAL: executar em DevTools > Sources > Snippets, no Preview autenticado.
// Não incluir no HTML. Não lê o corpo da requisição nem registra token, URL ou bairro.
(() => {
  window.restoreNoisWhatsAppProbe?.();
  const originalFetch = window.fetch;
  const icons = { service:'\u{1F6E0}\uFE0F', location:'\u{1F4CD}', urgency:'\u23F0' };
  const summarize = urlValue => {
    const url = new URL(urlValue);
    const text = url.searchParams.get('text') || '';
    return {
      replacementCount:[...text].filter(character => character === '\uFFFD').length,
      doubleEncodingSuspected:/%(?:F0%9F|E2%8F|EF%B8)/i.test(text),
      serviceEmoji:text.includes(icons.service),
      locationEmoji:text.includes(icons.location),
      urgencyEmoji:text.includes(icons.urgency)
    };
  };
  const restore = () => {
    if (window.fetch === wrappedFetch) window.fetch = originalFetch;
  };
  function wrappedFetch(...args) {
    const pending = originalFetch.apply(this,args);
    let pathname;
    try { pathname = new URL(typeof args[0] === 'string' ? args[0] : args[0].url, location.href).pathname; }
    catch { return pending; }
    if (pathname !== '/api/verify-turnstile') return pending;
    pending.then(response => {
      const copy = response.clone();
      void (async () => {
        const report = {status:response.status, contentType:response.headers.get('content-type')};
        let raw;
        try {
          raw = new TextDecoder('utf-8',{fatal:true}).decode(await copy.arrayBuffer());
          report.utf8Valid = true;
        } catch {
          report.utf8Valid = false;
          console.log('NOIS_WHATSAPP_DIAGNOSTIC',JSON.stringify(report)); return;
        }
        let data;
        try { data = JSON.parse(raw); }
        catch { report.jsonValid=false; console.log('NOIS_WHATSAPP_DIAGNOSTIC',JSON.stringify(report)); return; }
        report.jsonValid=true;
        report.rawJsonHasReplacement=raw.includes('\uFFFD');
        if (typeof data.whatsappUrl !== 'string') {
          report.hasWhatsAppUrl=false;
          console.log('NOIS_WHATSAPP_DIAGNOSTIC',JSON.stringify(report)); return;
        }
        restore();
        report.api=summarize(data.whatsappUrl);
        for (let attempt=0;attempt<100;attempt++) {
          const link=document.querySelector('#btn-whatsapp-final[href]');
          if (link) {
            report.link=summarize(link.href);
            report.sameDecodedText = new URL(link.href).searchParams.get('text') === new URL(data.whatsappUrl).searchParams.get('text');
            break;
          }
          await new Promise(resolve=>setTimeout(resolve,100));
        }
        console.log('NOIS_WHATSAPP_DIAGNOSTIC',JSON.stringify(report));
      })().catch(() => console.log('NOIS_WHATSAPP_DIAGNOSTIC: não foi possível analisar a resposta; nenhum dado bruto foi registrado.'));
    }, () => {});
    return pending;
  }
  window.fetch=wrappedFetch;
  window.restoreNoisWhatsAppProbe=restore;
  console.log('Diagnóstico ativo. Preencha o formulário; compartilhe somente a linha NOIS_WHATSAPP_DIAGNOSTIC. Não copie Payload, Copy as cURL ou HAR.');
})();
