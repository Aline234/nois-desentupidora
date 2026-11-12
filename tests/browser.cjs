'use strict';
// Chrome real, CDP nativo do Node 22+. Sem dependências ou chamadas externas.
// Apenas o servidor de testes substitui Turnstile e GTM; arquivos do site são preservados.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const root = path.resolve(__dirname, '..');
const executable = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const stub = String.raw`
window.__widgets = [];
window.__requests = [];
window.__ignoreAbort = false;
window.__removedWhileConnected = true;
window.turnstile = {
  ready() { throw new Error('Regressão: ready não pode ser usado com async/defer'); },
  render(selector, options) {
    if (window.__throwRender) throw new Error('render failure');
    const container = document.querySelector(selector);
    const id = window.__widgets.length;
    window.__widgets.push({ options, container, removed: false });
    container.textContent = 'Verificação simulada para teste local';
    return String(id);
  },
  remove(id) {
    const widget = window.__widgets[Number(id)];
    if (!widget.container.isConnected) window.__removedWhileConnected = false;
    widget.removed = true;
    widget.container.replaceChildren();
  }
};
const apiScript = document.currentScript;
const apiCallback = new URL(apiScript.src).searchParams.get('onload');
window.__notifyTurnstile = () => window[apiCallback]();
if (!new URL(location.href).searchParams.has('silentLoad')) window.__notifyTurnstile();
window.__nativeFetch = window.fetch.bind(window);
window.fetch = (url, options) => window.__useHttpApi
  ? window.__nativeFetch(url, options).then(async response => {
      const bytes = new Uint8Array(await response.clone().arrayBuffer());
      const raw = new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      window.__httpResponse = {status:response.status,contentType:response.headers.get('content-type'),raw,data:JSON.parse(raw)};
      return response;
    })
  : new Promise((resolve, reject) => {
  if (url !== '/api/verify-turnstile') { reject(new Error('Unexpected fetch')); return; }
  const request = {
    ...JSON.parse(options.body), signal: options.signal,
    respond(status, body, headers = {}) {
      resolve(new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status, headers: { 'Content-Type': 'application/json', ...headers }
      }));
    }
  };
  window.__requests.push(request);
  options.signal.addEventListener('abort', () => {
    if (!window.__ignoreAbort) reject(new DOMException('Aborted', 'AbortError'));
  }, { once: true });
});
`;
let checks = 0;
async function main() {
  if (!fs.existsSync(executable)) throw new Error('Defina CHROME_PATH para Chrome/Chromium instalado.');
  const httpMode = process.argv.includes('--http');
  const consentMode = process.argv.includes('--consent');
  const nodeApi = httpMode ? await require('./helpers/http-function.cjs').createHttpFunction() : null;
  const policy = JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8')).headers[0].headers.find(x=>x.key==='Content-Security-Policy').value;
  const scriptCounts = new Map();
  let resourceMode = 'normal';
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/api/verify-turnstile' && nodeApi) {
      void nodeApi.handle(req,res);
      return;
    }
    if (pathname === '/__turnstile.js') {
      const referrer = req.headers.referer || '';
      const count = (scriptCounts.get(referrer) || 0) + 1;
      scriptCounts.set(referrer, count);
      if (resourceMode === 'fail' || (resourceMode === 'fail-first' && count === 1)) {
        res.statusCode = 503; return res.end('Simulated load error');
      }
      res.setHeader('Content-Type', 'application/javascript');
      return res.end(stub);
    }
    if (pathname === '/__gtm.js') {
      res.setHeader('Content-Type', 'application/javascript'); return res.end('window.__gtmLoads=(window.__gtmLoads||0)+1; window.__consentAtGtm=Array.from(window.dataLayer).filter(x=>x[0]==="consent").map(x=>({command:x[1],state:x[2]}));');
    }
    res.setHeader('Content-Security-Policy', policy);
    const file = path.resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.statusCode = 403; return res.end(); }
    try {
      let body = fs.readFileSync(file);
      const ext = path.extname(file);
      if (ext === '.html') {
        body = body.toString('utf8')
          .replace('https://challenges.cloudflare.com/turnstile/v0/api.js?', '/__turnstile.js?')
          .replace('https://www.googletagmanager.com/gtm.js?id=', '/__gtm.js?id=');
      }
      if (ext === '.js' && path.basename(file) === 'script.js') {
        body = body.toString('utf8').replace('https://challenges.cloudflare.com/turnstile/v0/api.js?', '/__turnstile.js?');
      }
      if (ext === '.js' && path.basename(file) === 'consent.js') {
        body = body.toString('utf8').replace('https://www.googletagmanager.com/gtm.js?id=', '/__gtm.js?id=');
      }
      res.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' })[ext] || 'application/octet-stream');
      res.end(body);
    } catch { res.statusCode = 404; res.end(); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  if (nodeApi) process.env.ALLOWED_ORIGIN = base;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nois-browser-test-'));
  const chrome = spawn(executable, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--remote-debugging-port=0', '--user-data-dir=' + profile,
    'about:blank'
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let socket;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error('Chrome startup timeout: ' + output)), 15000);
      chrome.on('error', reject);
      chrome.stderr.on('data', chunk => {
        output += chunk;
        const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timeout); resolve(match[1]); }
      });
    });
    socket = new WebSocket(endpoint);
    await once(socket, 'open');
    let serial = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Fetch.requestPaused') {
        // Intercepta qualquer URL externa: os testes não enviam dados ao Google/Cloudflare.
        const image = message.params.resourceType === 'Image';
        const body = image
          ? 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
          : Buffer.from('// CSP test fixture').toString('base64');
        send('Fetch.fulfillRequest', {
          requestId: message.params.requestId, responseCode: 200,
          responseHeaders: [
            {name:'Content-Type',value:image?'image/png':'application/javascript'},
            {name:'Access-Control-Allow-Origin',value:'*'}
          ], body
        }, message.sessionId).catch(console.error);
        return;
      }
      if (!message.id) return;
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
      else entry.resolve(message.result);
    });
    function send(method, params = {}, sessionId) {
      return new Promise((resolve, reject) => {
        const id = ++serial;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    }
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const call = (method, params) => send(method, params, sessionId);
    await call('Page.enable');
    await call('Page.bringToFront');
    await call('Fetch.enable', {patterns:[{urlPattern:'https://*',requestStage:'Request'}]});
    await call('Page.addScriptToEvaluateOnNewDocument', {source: 'window.__documentId=crypto.randomUUID(); window.__cspViolations=[]; document.addEventListener("securitypolicyviolation",e=>window.__cspViolations.push({directive:e.effectiveDirective,blocked:e.blockedURI}));'});

    async function evaluate(expression) {
      const result = await call('Runtime.evaluate', { expression: 'eval(' + JSON.stringify(expression) + ')', awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    }
    async function wait(expression, timeout = 5000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        if (await evaluate(expression)) return;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error('Timeout: ' + expression);
    }
    async function navigate(page = '/index.html') {
      const target = new URL(page,base);
      target.searchParams.set('test',Date.now()+'-'+Math.random());
      const targetURL = target.href;
      await call('Page.navigate', {url:targetURL});
      await wait('location.href===' + JSON.stringify(targetURL) + ' && document.readyState==="complete" && typeof window.onNoisTurnstileLoad==="function"');
      if (!consentMode) {
        await evaluate('if (!window.noisConsent.canMeasure()) document.querySelector("#cookie-accept").click()');
        await wait('window.__gtmLoads===1');
      }
    }
    async function check(name, expression) {
      assert.equal(await evaluate(expression), true, name);
      checks++; console.log('PASS ' + name);
    }
    async function click(selector) { await evaluate('document.querySelector(' + JSON.stringify(selector) + ').click()'); }
    async function fillToVerification(waitForWidget = true, button = '#botao-whatsapp-hero') {
      await click(button);
      await click('[data-value="esgoto"]'); await click('#btn-next');
      await evaluate('const input=document.querySelector("#neighborhood-input"); input.value="Centro"; input.dispatchEvent(new Event("input",{bubbles:true}))');
      await click('#btn-next'); await click('[data-value="hoje"]'); await click('#btn-next');
      if (waitForWidget) await wait('window.__widgets?.length > 0 && !window.__widgets.at(-1).removed');
    }
    async function verify(token) {
      await evaluate('window.__widgets.at(-1).options.callback(' + JSON.stringify(token) + ')');
    }
    if (httpMode) {
      for (const page of ['/index.html','/termos.html']) {
        for (const emojis of [false,true]) {
          nodeApi.emojis(emojis);
          await navigate(page);
          await evaluate('window.__useHttpApi=true');
          await fillToVerification(true,'#botao-whatsapp-header');
          await evaluate('window.__diagnosticReports=[];const log=console.log;console.log=(...args)=>{if(args[0]==="NOIS_WHATSAPP_DIAGNOSTIC") window.__diagnosticReports.push(args[1]);log(...args)}');
          await evaluate(fs.readFileSync(path.join(root,'tests/preview-probe.js'),'utf8'));
          await verify('actual-http-token-'+page+'-'+emojis);
          await wait('!!document.querySelector("#btn-whatsapp-final")');
          await check('HTTP Node ao navegador '+page+' emojis='+emojis,
            '__httpResponse.status===200 && __httpResponse.contentType==="application/json; charset=utf-8" && !__httpResponse.raw.includes("\\uFFFD")');
          await check('URL HTTP e ambos links preservam mensagem '+page+' emojis='+emojis,
            '["#btn-whatsapp-final","#whatsapp-fallback"].every(selector=>new URL(document.querySelector(selector).href).searchParams.get("text")===new URL(__httpResponse.data.whatsappUrl).searchParams.get("text"))');
          await check('conteúdo comercial e modo corretos '+page+' emojis='+emojis,
            '(()=>{const text=new URL(__httpResponse.data.whatsappUrl).searchParams.get("text"); return text.includes("*Serviço:* Limpeza de Esgoto") && text.includes("*Bairro/Local:* Centro") && text.includes("*Urgência:*") && !text.includes("\\uFFFD") && ["\\u{1F6E0}\\uFE0F","\\u{1F4CD}","\\u23F0"].every(icon=>text.includes(icon)==='+JSON.stringify(emojis)+')})()');
          await wait('window.__diagnosticReports.length===1');
          await check('captura segura da resposta HTTP '+page+' emojis='+emojis,
            '(()=>{const raw=window.__diagnosticReports[0];const report=JSON.parse(raw);return report.utf8Valid && report.jsonValid && report.sameDecodedText && report.api.replacementCount===0 && !/5511950566792|Centro|actual-http-token/.test(raw)})()');
        }
      }
      nodeApi.state.success=false;
      await navigate(); await evaluate('window.__useHttpApi=true');
      await fillToVerification(); await verify('actual-http-invalid-token');
      await wait('!!document.querySelector("#retry-turnstile")');
      await check('HTTP 403 real não libera link no navegador',
        '__httpResponse.status===403 && !__httpResponse.data.whatsappUrl && !document.querySelector("#btn-whatsapp-final")');
      console.log('HTTP + Chrome: '+checks+' verificações aprovadas; apenas Cloudflare é simulado.');
      await send('Browser.close');
      return;
    }
    const expectedWhatsAppText = '\u{1F6E0}\uFE0F Serviço: Caixa d\'Água\n\u{1F4CD} São João & Centro + 100%\n\u23F0 Urgência: hoje';
    const success = { success: true, whatsappUrl: 'https://wa.me/5511950566792?text=' + encodeURIComponent(expectedWhatsAppText) };
    if (consentMode) {
      const latest = 'Array.from(dataLayer).filter(x=>x[0]==="consent").at(-1)[2]';
      const allDenied = 'Object.values('+latest+').every(x=>x==="denied")';
      const allGranted = 'Object.values('+latest+').every(x=>x==="granted")';
      const noGoogle = '!document.querySelector("#nois-gtm-script") && !window.__gtmLoads && !dataLayer.some(x=>x.event==="gtm.js") && !performance.getEntriesByType("resource").some(x=>/google|doubleclick/.test(x.name))';
      await navigate();
      await check('novo visitante: quatro defaults denied antes de qualquer Google',
        'dataLayer[0][0]==="consent" && dataLayer[0][1]==="default" && Object.keys(dataLayer[0][2]).length===4 && '+allDenied+' && '+noGoogle);
      await check('banner existente sem aceitação implícita', '!document.querySelector("#cookie-banner").hidden && localStorage.getItem("cookie_consent_nois")===null');
      await new Promise(resolve=>setTimeout(resolve,150));
      await check('silêncio não autoriza tags', allDenied+' && '+noGoogle);
      await navigate('/termos.html');
      await check('navegação sem escolha mantém denied', allDenied+' && '+noGoogle);
      await evaluate('localStorage.setItem("cookie_consent_nois","true")');
      await navigate();
      await check('preferência antiga Entendi exige nova escolha', '!document.querySelector("#cookie-banner").hidden && '+allDenied+' && '+noGoogle);
      await click('#cookie-reject');
      await check('recusa salva quatro denied sem carregar GTM',
        'JSON.parse(localStorage.getItem("cookie_consent_nois")).choice==="rejected" && document.querySelector("#cookie-banner").hidden && '+allDenied+' && '+noGoogle);
      await navigate();
      await check('recarregar restaura recusa', 'document.querySelector("#cookie-banner").hidden && '+allDenied+' && '+noGoogle);
      await navigate('/termos.html');
      await check('termos restaura recusa', allDenied+' && '+noGoogle);
      await click('#cookie-preferences');
      await check('preferências reabrem o mesmo banner sem consentir',
        'document.querySelectorAll("#cookie-banner").length===1 && !document.querySelector("#cookie-banner").hidden && '+noGoogle);
      await click('#cookie-accept');
      await wait('window.__gtmLoads===1');
      await check('aceitação concede os quatro estados', allGranted);
      await check('default e update precedem bootstrap GTM',
        'dataLayer[0][1]==="default" && dataLayer.findIndex(x=>x[0]==="consent"&&x[1]==="update"&&x[2].ad_storage==="granted")<dataLayer.findIndex(x=>x.event==="gtm.js") && __consentAtGtm.at(-1).state.ad_user_data==="granted"');
      await click('#cookie-accept');
      await check('aceitação repetida não duplica contêiner',
        '__gtmLoads===1 && document.querySelectorAll("#nois-gtm-script").length===1 && dataLayer.filter(x=>x.event==="gtm.js").length===1');
      await fillToVerification(true,'#botao-whatsapp-header');
      await verify('consent-granted-token');
      await evaluate('window.__requests.at(-1).respond(200,'+JSON.stringify(success)+')');
      await wait('!!document.querySelector("#btn-whatsapp-final")');
      await evaluate('document.querySelector("#qual-body").addEventListener("click",e=>e.preventDefault());document.querySelector("#btn-whatsapp-final").click()');
      await check('funil consentido preserva os três eventos uma vez',
        '["whatsapp_intent","qualification_completed","whatsapp_redirect"].every(event=>dataLayer.filter(x=>x.event===event).length===1) && !dataLayer.some(x=>x.event==="lead_qualified")');
      await navigate();
      await wait('window.__gtmLoads===1');
      await check('visita posterior restaura aceitação antes das tags',
        allGranted+' && __consentAtGtm[0].command==="default" && __consentAtGtm.at(-1).state.analytics_storage==="granted" && document.querySelector("#cookie-banner").hidden');
      await navigate('/termos.html');
      await wait('window.__gtmLoads===1');
      await check('navegação para termos conserva estados e contêiner único',
        allGranted+' && dataLayer.filter(x=>x.event==="gtm.js").length===1');
      const previousDocument=await evaluate('__documentId');
      await evaluate('const original=gtag;window.gtag=function(...args){if(args[0]==="consent"&&args[1]==="update")sessionStorage.setItem("test_revocation",JSON.stringify(args[2]));return original(...args)}');
      await click('#cookie-preferences');
      try { await click('#cookie-reject'); } catch(error) {
        if(!/context|navigat/i.test(error.message)) throw error;
      }
      await wait('document.readyState==="complete" && window.__documentId!=='+JSON.stringify(previousDocument)+' && !!window.noisConsent');
      await check('revogação atualiza denied antes de recarregar',
        'Object.values(JSON.parse(sessionStorage.getItem("test_revocation"))).every(x=>x==="denied")');
      await check('revogação persiste e interrompe contêiner na nova página',
        'JSON.parse(localStorage.getItem("cookie_consent_nois")).choice==="rejected" && '+allDenied+' && '+noGoogle);
      for(const page of ['/index.html','/termos.html']) {
        await navigate(page);
        await fillToVerification(true,'#botao-whatsapp-header');
        await verify('consent-denied-token-'+page);
        await evaluate('window.__requests.at(-1).respond(200,'+JSON.stringify(success)+')');
        await wait('!!document.querySelector("#btn-whatsapp-final")');
        await evaluate('document.querySelector("#qual-body").addEventListener("click",e=>e.preventDefault());document.querySelector("#btn-whatsapp-final").click()');
        await check('Turnstile e WhatsApp independentes da recusa '+page,
          'window.__requests.length===1 && document.querySelector("#btn-whatsapp-final").href.startsWith("https://wa.me/") && '+noGoogle);
        await check('não reproduz interações recusadas para Google '+page,
          '!dataLayer.some(x=>["whatsapp_intent","qualification_completed","whatsapp_redirect"].includes(x.event))');
      }
      await click('#qual-close');
      await click('#cookie-preferences'); await click('#cookie-accept');
      await wait('window.__gtmLoads===1');
      await check('aceitar depois não reproduz o funil anterior',
        '!dataLayer.some(x=>["whatsapp_intent","qualification_completed","whatsapp_redirect"].includes(x.event))');
      // Revogação em outra aba também deve interromper tags nesta aba.
      const beforeStorage=await evaluate('__documentId');
      await evaluate('localStorage.setItem("cookie_consent_nois",JSON.stringify({version:2,choice:"rejected"}));window.dispatchEvent(new StorageEvent("storage",{key:"cookie_consent_nois",newValue:localStorage.getItem("cookie_consent_nois")}))');
      await wait('document.readyState==="complete" && window.__documentId!=='+JSON.stringify(beforeStorage)+' && !!window.noisConsent');
      await check('revogação em outra aba respeitada',allDenied+' && '+noGoogle);
      await evaluate('localStorage.setItem("cookie_consent_nois","invalid-json")');
      await navigate();
      await check('preferência inválida falha fechada',allDenied+' && '+noGoogle+' && !document.querySelector("#cookie-banner").hidden');
      await click('#cookie-accept');
      await wait('window.__gtmLoads===1');
      const quotaDocument=await evaluate('__documentId');
      await evaluate('Storage.prototype.setItem=function(){throw new Error("Quota exceeded")}');
      await click('#cookie-preferences');
      try { await click('#cookie-reject'); } catch(error) {
        if(!/context|navigat/i.test(error.message)) throw error;
      }
      await wait('document.readyState==="complete" && window.__documentId!=='+JSON.stringify(quotaDocument)+' && !!window.noisConsent');
      await check('falha de gravação na revogação não restaura aceite antigo',
        'localStorage.getItem("cookie_consent_nois")===null && '+allDenied+' && '+noGoogle);
      const {identifier}=await call('Page.addScriptToEvaluateOnNewDocument',{source:'Storage.prototype.getItem=function(){throw new Error("Storage blocked")};Storage.prototype.setItem=function(){throw new Error("Storage blocked")}'});
      await navigate();
      await check('storage bloqueado não autoriza Google',allDenied+' && '+noGoogle);
      await call('Emulation.setDeviceMetricsOverride',{width:320,height:667,deviceScaleFactor:1,mobile:true});
      await new Promise(resolve=>setTimeout(resolve,400));
      await check('banner móvel usa os controles existentes sem overflow',
        'document.querySelectorAll("#cookie-banner").length===1 && document.documentElement.scrollWidth<=320 && document.querySelector("#cookie-reject").getBoundingClientRect().height>=44 && document.querySelector("#cookie-accept").getBoundingClientRect().height>=44');
      await call('Page.removeScriptToEvaluateOnNewDocument',{identifier});
      await check('botão flutuante permanece acima do banner móvel',
        'document.querySelector(".whatsapp-float").getBoundingClientRect().bottom<=document.querySelector("#cookie-banner").getBoundingClientRect().top');
      await check('sem iframe GTM que ignore consentimento com JavaScript desativado', '!document.querySelector("noscript iframe")');
      await check('consentimento compatível com a CSP existente','__cspViolations.length===0');
      console.log('Consent Mode: '+checks+' verificações aprovadas; GTM externo simulado, sem envio ao Google.');
      await send('Browser.close'); return;
    }
    await navigate();
    await check('um bootstrap GTM', 'dataLayer.filter(x=>x.event==="gtm.js").length===1');
    for (const [selector, source] of [
      ['#botao-whatsapp-header', 'header'], ['#botao-whatsapp-float', 'float'],
      ['#botao-whatsapp-hero', 'hero'], ['#botao-whatsapp-preco', 'price']
    ]) {
      await click(selector);
      await check('uma intenção: ' + source, 'dataLayer.filter(x=>x.event==="whatsapp_intent").at(-1).source===' + JSON.stringify(source));
      await click('#qual-close');
    }
    await check('quatro cliques, quatro intenções', 'dataLayer.filter(x=>x.event==="whatsapp_intent").length===4');
    await navigate();
    await evaluate('document.querySelector("#botao-whatsapp-header").focus()');
    await call('Input.dispatchKeyEvent', {type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
    await call('Input.dispatchKeyEvent', {type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
    await check('Enter nativo gera uma intenção', 'dataLayer.filter(x=>x.event==="whatsapp_intent").length===1');
    await check('serviço obrigatório antes de avançar', 'document.querySelector("#btn-next").disabled');
    await click('#qual-close');
    await evaluate('document.querySelector("#botao-whatsapp-float").focus()');
    await call('Input.dispatchKeyEvent', {type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32,nativeVirtualKeyCode:32,text:' ',unmodifiedText:' '});
    await call('Input.dispatchKeyEvent', {type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32,nativeVirtualKeyCode:32});
    await check('Espaço nativo gera uma intenção', 'dataLayer.filter(x=>x.event==="whatsapp_intent").length===2');
    await click('[data-value="esgoto"]'); await click('#btn-next');
    await evaluate('const input=document.querySelector("#neighborhood-input");input.value=" ";input.dispatchEvent(new Event("input",{bubbles:true}))');
    await check('bairro vazio impede avanço', 'document.querySelector("#btn-next").disabled');
    await navigate('/termos.html');
    await click('#botao-whatsapp-header'); await click('#qual-close'); await click('#botao-whatsapp-float');
    await check('origens termos sem duplicação', 'JSON.stringify(dataLayer.filter(x=>x.event==="whatsapp_intent").map(x=>x.source))===JSON.stringify(["terms_header","terms_float"])');

    await navigate();
    await fillToVerification();
    await check('action e progresso', 'window.__widgets.at(-1).options.action==="qualification" && document.querySelector("#progress-fill").style.width==="100%" && !document.querySelector("#progress-text").textContent.includes("0 de")');
    await click('#btn-back');
    await check('Voltar restaura urgência', 'document.querySelector("#qual-body").dataset.currentStep==="urgency" && document.querySelector("[data-value=hoje]").getAttribute("aria-checked")==="true"');
    await click('#btn-back');
    const payload = '"><img id="injected-test" src=x onerror=alert(1)>';
    await evaluate('const input=document.querySelector("#neighborhood-input"); input.value=' + JSON.stringify(payload) + '; input.dispatchEvent(new Event("input",{bubbles:true}))');
    await click('#btn-back');
    await check('seleção serviço restaurada', 'document.querySelector("[data-value=esgoto]").classList.contains("selected")');
    await click('#btn-next');
    await check('bairro usa propriedade DOM, sem injeção', 'document.querySelector("#neighborhood-input").value===' + JSON.stringify(payload) + ' && !document.querySelector("#injected-test")');
    await click('#btn-next'); await click('#btn-next');
    await evaluate('window.__widgets.at(-1).options["expired-callback"]()');
    await check('expiração permite nova verificação', '!!document.querySelector("#retry-turnstile")');
    await click('#retry-turnstile');
    await verify('token-expired-first');
    await evaluate('window.__requests.at(-1).respond(403,{success:false,error:"Token expirado"})');
    await wait('!!document.querySelector("#retry-turnstile")');
    await click('#retry-turnstile');
    await verify('token-expired-first');
    await check('token consumido não reenviado', 'window.__requests.length===1 && !!document.querySelector("#retry-turnstile")');
    await click('#retry-turnstile');
    await verify('token-new');
    await evaluate('window.__requests.at(-1).respond(200,' + JSON.stringify(success) + ')');
    await wait('!!document.querySelector("#btn-whatsapp-final")');
    await check('sucesso uma vez e fallback na mesma aba', 'dataLayer.filter(x=>x.event==="qualification_completed").length===1 && document.querySelector("#whatsapp-fallback").target==="" && document.querySelector("#whatsapp-fallback").href.startsWith("https://wa.me/")');
    await check('Unicode preservado nos dois links WhatsApp', '["#btn-whatsapp-final","#whatsapp-fallback"].every(selector=>new URL(document.querySelector(selector).href).searchParams.get("text")===' + JSON.stringify(expectedWhatsAppText) + ')');
    // Cancela apenas a navegação no teste, preservando os listeners reais de mensuração.
    await evaluate('document.querySelector("#qual-body").addEventListener("click",e=>e.preventDefault()); document.querySelector("#btn-whatsapp-final").click(); document.querySelector("#whatsapp-fallback").click()');
    await check('tentativa WhatsApp deduplicada, sem lead confirmado', 'dataLayer.filter(x=>x.event==="whatsapp_redirect").length===1 && !dataLayer.some(x=>x.event==="lead_qualified")');
    await check('widgets removidos antes de destruir containers', 'window.__removedWhileConnected && window.__widgets.filter(x=>!x.removed).length===0');

    await navigate(); await fillToVerification();
    await evaluate('window.__ignoreAbort=true');
    await verify('token-old-session');
    await click('#qual-close'); await click('#botao-whatsapp-hero');
    await evaluate('window.__requests[0].respond(200,' + JSON.stringify(success) + ')');
    await new Promise(resolve => setTimeout(resolve, 350));
    await check('resposta antiga ignorada; requisição abortada; reabertura preservada', 'window.__requests[0].signal.aborted && document.querySelector("#qual-body").dataset.currentStep==="service" && !document.querySelector("#btn-whatsapp-final") && document.querySelector("#qualification-modal").style.display==="flex" && !dataLayer.some(x=>x.event==="qualification_completed")');
    await evaluate('window.__widgets[0].options.callback("late-callback")');
    await check('callback de widget antigo ignorado', 'window.__requests.length===1');

    await navigate(); await fillToVerification();
    await evaluate('const nativeTimeout=setTimeout;window.setTimeout=(fn,ms,...args)=>nativeTimeout(fn,ms===15000?1:ms,...args)');
    await verify('frontend-timeout');
    await wait('!!document.querySelector("#retry-turnstile")');
    await check('timeout frontend aborta sem liberar WhatsApp', 'window.__requests[0].signal.aborted && !document.querySelector("#btn-whatsapp-final")');
    for (const [status, body, name] of [
      [502, { success: false, error: 'Cloudflare indisponível' }, 'erro Cloudflare'],
      [500, success, 'HTTP 500 mesmo com success true'],
      [200, '<html>bad response</html>', 'JSON inválido'],
      [200, { success: true, whatsappUrl: 'javascript:alert(1)' }, 'URL inválida']
    ]) {
      await navigate(); await fillToVerification(); await verify('token-failure-' + status);
      await evaluate('window.__requests.at(-1).respond(' + status + ',' + JSON.stringify(body) + ')');
      await wait('!!document.querySelector("#retry-turnstile")');
      await check(name + ' não libera WhatsApp', '!document.querySelector("#btn-whatsapp-final") && !dataLayer.some(x=>x.event==="qualification_completed")');
    }
    await navigate(); await fillToVerification(); await verify('rate-token');
    await evaluate('window.__requests.at(-1).respond(429,{success:false,error:"Aguarde",retryAfter:1},{"Retry-After":"1"})');
    await wait('!!document.querySelector("#retry-turnstile")');
    await check('429 respeita cooldown', 'document.querySelector("#retry-turnstile").disabled');
    await wait('!document.querySelector("#retry-turnstile").disabled', 2500);

    await call('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 1, mobile: true });
    await navigate(); await fillToVerification();
    await new Promise(resolve => setTimeout(resolve, 350));
    await check('mobile 375px: modal sem overflow horizontal', 'document.documentElement.scrollWidth<=375 && document.querySelector(".qualification-container").getBoundingClientRect().right<=375 && document.querySelector("#qual-close").getBoundingClientRect().width>=44');
    await evaluate('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
    await check('ESC fecha e restaura foco', '!document.querySelector("#qualification-modal").classList.contains("open") && document.activeElement.id==="botao-whatsapp-hero"');
    for (const width of [320, 768]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: true });
      await navigate(); await fillToVerification();
      await new Promise(resolve => setTimeout(resolve, 350));
      await check('layout ' + width + 'px sem overflow', 'document.documentElement.scrollWidth<=innerWidth && document.querySelector(".qualification-container").getBoundingClientRect().right<=innerWidth');
    }
    await call('Emulation.clearDeviceMetricsOverride');
    for (const page of ['/index.html','/termos.html']) {
      await navigate(page);
      await fillToVerification(true,'#botao-whatsapp-header');
      await check('carregamento explícito '+page, 'noisTurnstileState==="ready" && window.__widgets.length===1 && window.__widgets[0].options.action==="qualification"');
      await click('#qual-close');
      await fillToVerification(true,'#botao-whatsapp-header');
      await check('reabrir sem duplicar script '+page, 'window.__widgets.length===2 && window.__widgets[0].removed && document.querySelectorAll("#turnstile-api").length===1');
      await evaluate('window.__widgets.at(-1).options["error-callback"]()');
      await wait('!!document.querySelector("#retry-turnstile")');
      await click('#retry-turnstile');
      await wait('window.__widgets.length===3');
      await check('erro do widget recuperável '+page, '!window.__widgets.at(-1).removed && !document.querySelector("#btn-whatsapp-final")');

      // A API existe, mas o callback oficial ainda não chegou.
      await navigate(page+'?silentLoad=1');
      await fillToVerification(false,'#botao-whatsapp-header');
      await check('não renderiza antes do callback '+page, 'window.__widgets.length===0');
      await click('#qual-close');
      await fillToVerification(false,'#botao-whatsapp-header');
      await evaluate('window.__notifyTurnstile()');
      await wait('window.__widgets.length===1');
      await check('callback atrasado respeita nova sessão '+page, 'window.__widgets.length===1 && !window.__widgets[0].removed');
    }
    resourceMode='fail';
    await navigate();
    await fillToVerification(false);
    await wait('!!document.querySelector("#retry-turnstile")');
    await check('falha de rede exibe nova tentativa', '!document.querySelector("#btn-whatsapp-final") && !document.querySelector("#btn-back").disabled');
    resourceMode='normal';
    await click('#retry-turnstile');
    await wait('window.__widgets?.length===1');
    await check('nova tentativa recarrega API com sucesso', 'noisTurnstileState==="ready" && document.querySelectorAll("#turnstile-api").length===1');

    await navigate('/index.html?silentLoad=1');
    await evaluate('const nativeTimeout=setTimeout; window.setTimeout=(fn,ms,...args)=>nativeTimeout(fn,ms===10000?30:ms,...args)');
    await fillToVerification(false);
    await wait('!!document.querySelector("#retry-turnstile")');
    await check('callback ausente tem timeout limitado', 'window.__widgets.length===0 && !document.querySelector("#btn-whatsapp-final")');

    await navigate();
    await evaluate('const nativeTimeout=setTimeout; window.setTimeout=(fn,ms,...args)=>nativeTimeout(fn,ms===120000?30:ms,...args)');
    await fillToVerification(false);
    await wait('!!document.querySelector("#retry-turnstile")');
    await check('widget silencioso tem timeout limitado', 'window.__widgets[0].removed && !document.querySelector("#btn-whatsapp-final")');
    await click('#qual-close');
    await check('nenhuma violação CSP no fluxo local', '__cspViolations.length===0');

    await navigate();
    for (const domain of ['www.googletagmanager.com','www.googleadservices.com','googleads.g.doubleclick.net','ad.doubleclick.net','pagead2.googlesyndication.com','www.google.com','www.google.com.br']) {
      await check('CSP connect '+domain, 'window.__nativeFetch("https://'+domain+'/__csp_test__").then(()=>true,()=>false)');
    }
    for (const domain of ['www.googleadservices.com','www.google.com','googleads.g.doubleclick.net']) {
      await check('CSP script '+domain, 'new Promise(resolve=>{const s=document.createElement("script");s.src="https://'+domain+'/__csp_test__.js";s.onload=()=>resolve(true);s.onerror=()=>resolve(false);document.head.appendChild(s)})');
    }
    for (const domain of ['googleads.g.doubleclick.net','www.google.com','www.googleadservices.com','pagead2.googlesyndication.com']) {
      await check('CSP img '+domain, 'new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(true);img.onerror=()=>resolve(false);img.src="https://'+domain+'/__csp_test__.png"})');
    }
    // A URL exata reportada é atendida pelo interceptador local: nenhuma conversão real é enviada.
    await check('CSP permite script viewthroughconversion reportado',
      'new Promise(resolve=>{const s=document.createElement("script");s.src="https://googleads.g.doubleclick.net/pagead/viewthroughconversion/18556510889/";s.onload=()=>resolve(true);s.onerror=()=>resolve(false);document.head.appendChild(s)})');
    await check('CSP bloqueia script em host parecido não autorizado',
      'new Promise(resolve=>{const s=document.createElement("script");s.src="https://googleads.g.doubleclick.net.untrusted.invalid/pagead/viewthroughconversion/18556510889/";s.onload=()=>resolve(false);s.onerror=()=>resolve(true);document.head.appendChild(s)})');
    await check('permissão connect de ad.doubleclick.net não autoriza script',
      'new Promise(resolve=>{const s=document.createElement("script");s.src="https://ad.doubleclick.net/__csp_test__.js";s.onload=()=>resolve(false);s.onerror=()=>resolve(true);document.head.appendChild(s)})');
    await check('CSP bloqueia conexão não autorizada', 'window.__nativeFetch("https://untrusted.invalid/__csp_test__").then(()=>false,()=>true)');
    await check('CSP bloqueia script não autorizado', 'new Promise(resolve=>{const s=document.createElement("script");s.src="https://untrusted.invalid/__csp_test__.js";s.onload=()=>resolve(false);s.onerror=()=>resolve(true);document.head.appendChild(s)})');
    await check('CSP bloqueia imagem não autorizada', 'new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(false);img.onerror=()=>resolve(true);img.src="https://untrusted.invalid/__csp_test__.png"})');
    await check('CSP sem unsafe-eval', '!'+JSON.stringify(policy)+'.includes("unsafe-eval")');
    console.log('Browser: ' + checks + ' verificações aprovadas. Turnstile/GTM/API simulados; nenhum contato real enviado.');
    await send('Browser.close');
  } finally {
    socket?.close();
    chrome.kill();
    await new Promise(resolve => server.close(resolve));
    if (nodeApi) await nodeApi.close();
    // Remove apenas o perfil temporário criado acima, dentro de os.tmpdir().
    const expected = path.resolve(os.tmpdir()) + path.sep;
    if (profile.startsWith(expected) && path.basename(profile).startsWith('nois-browser-test-')) {
      for (let attempt = 0; attempt < 10; attempt++) {
        try { fs.rmSync(profile, { recursive: true, force: true }); break; }
        catch { await new Promise(resolve => setTimeout(resolve, 100)); }
      }
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
