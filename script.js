// =========================
// NÓIS DESENTUPIDORA - Script Principal
// Pré-qualificação de Leads + Turnstile + GTM dataLayer
// =========================

(function () {
  'use strict';

  // =========================
  // CONFIGURAÇÕES E ESTADO
  // =========================
  const CONFIG = {
    turnstileSiteKey: '0x4AAAAAAF70VTsOQ4Q-U5DH',
    apiEndpoint: '/api/verify-turnstile',
    qualificationSteps: ['service', 'neighborhood', 'urgency']
  };

  // Estado da pré-qualificação
  let qualificationState = {
    service: null,
    neighborhood: null,
    urgency: null
  };

  let currentStep = 0;
  let turnstileWidgetId = null;
  let isProcessing = false;
  let sessionId = 0;
  let viewId = 0;
  let modalOpen = false;
  let phase = 'closed';
  let activeRequest = null;
  let previousFocus = null;
  let retryAt = 0;
  let usedTokens = new Set();
  let turnstileLoadPromise = null;
  let widgetTimeout = null;

  function loadTurnstile() {
    if (window.noisTurnstileState === 'ready' && typeof window.turnstile?.render === 'function') {
      return Promise.resolve();
    }
    if (turnstileLoadPromise) return turnstileLoadPromise;
    turnstileLoadPromise = new Promise((resolve, reject) => {
      let timer;
      const cleanup = () => {
        clearTimeout(timer);
        window.removeEventListener('nois:turnstile-load', loaded);
        window.removeEventListener('nois:turnstile-error', failed);
      };
      const loaded = () => {
        if (typeof window.turnstile?.render !== 'function') { failed(); return; }
        cleanup();
        resolve();
      };
      const failed = () => {
        cleanup();
        window.noisTurnstileState = 'error';
        reject(new Error('Não foi possível carregar a verificação. Confira sua conexão e tente novamente.'));
      };
      window.addEventListener('nois:turnstile-load', loaded);
      window.addEventListener('nois:turnstile-error', failed);
      timer = setTimeout(failed, 10000);
      // Recuperar erro de rede/timeout carregando uma nova cópia, sem scripts concorrentes.
      if (window.noisTurnstileState === 'error' || !document.getElementById('turnstile-api')) {
        document.getElementById('turnstile-api')?.remove();
        window.noisTurnstileState = 'loading';
        const script = document.createElement('script');
        script.id = 'turnstile-api';
        script.async = true;
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onNoisTurnstileLoad';
        script.onerror = window.onNoisTurnstileError;
        document.head.appendChild(script);
      }
    }).finally(() => { turnstileLoadPromise = null; });
    return turnstileLoadPromise;
  }

  function isCurrent(session, view) {
    return modalOpen && sessionId === session && viewId === view;
  }

  function removeWidget() {
    clearTimeout(widgetTimeout);
    widgetTimeout = null;
    const widget = turnstileWidgetId;
    turnstileWidgetId = null;
    if (widget !== null && window.turnstile) {
      try { window.turnstile.remove(widget); } catch (error) {
        console.warn('Não foi possível remover o widget Turnstile.');
      }
    }
  }

  function cancelRequest() {
    if (activeRequest) activeRequest.abort();
    activeRequest = null;
    isProcessing = false;
  }

  let eventFired = {
    whatsappIntent: false,
    qualificationCompleted: false,
    whatsappRedirect: false
  };

  // Dados dos passos
  const STEPS_DATA = {
    service: {
      title: 'Qual serviço você precisa?',
      subtitle: 'Selecione o tipo de desentupimento',
      options: [
        { value: 'esgoto', label: '🚽 Limpeza de Esgoto', desc: 'Canos, ralos, rede de esgoto entupida' },
        { value: 'gordura', label: '🏪 Caixa de Gordura', desc: 'Limpeza e manutenção preventiva' },
        { value: 'calha', label: '🏠 Calha e Caixa d\'Água', desc: 'Entupimentos, limpeza e vistoria' },
        { value: 'outro', label: '🔧 Outro serviço', desc: 'Desentupimento em geral / Avaliação' }
      ]
    },
    neighborhood: {
      title: 'Onde é o atendimento?',
      subtitle: 'Digite seu bairro ou cidade',
      placeholder: 'Ex: Vila Madalena, São Bernardo, Centro...',
      suggestions: [
        'São Paulo (Centro)',
        'São Paulo (Zona Norte)',
        'São Paulo (Zona Sul)',
        'São Paulo (Zona Leste)',
        'São Paulo (Zona Oeste)',
        'São Bernardo do Campo',
        'Santo André',
        'São Caetano do Sul',
        'Diadema',
        'Outro bairro/cidade'
      ]
    },
    urgency: {
      title: 'Qual a urgência?',
      subtitle: 'Isso nos ajuda a priorizar seu atendimento',
      options: [
        { value: 'emergencia', label: '🔴 Emergência', desc: 'Preciso AGORA - vazamento, retorno de esgoto' },
        { value: 'hoje', label: '🟡 Hoje', desc: 'Gostaria de ser atendido ainda hoje' },
        { value: 'semana', label: '🟢 Nesta semana', desc: 'Posso agendar para os próximos dias' },
        { value: 'orcamento', label: '🔵 Apenas orçamento', desc: 'Quero saber valores e condições primeiro' }
      ]
    }
  };

  // =========================
  // UTILITÁRIOS
  // =========================
  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];

  function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input.trim().slice(0, 200);
  }

  // =========================
  // GTM DATALAYER HELPERS
  // =========================
  function pushDataLayer(eventName, parameters = {}) {
    // Não enfileirar interações anteriores à autorização para reprodução retroativa.
    if (window.noisConsent?.canMeasure() && typeof window.dataLayer !== 'undefined') {
      const payload = {
        event: eventName,
        timestamp: new Date().toISOString(),
        ...parameters
      };
      window.dataLayer.push(payload);
      console.log('[GTM] Evento disparado:', eventName, parameters);
    }
  }

  // Eventos do funil de conversão
  function trackWhatsAppIntent(source) {
    if (eventFired.whatsappIntent) return;
    eventFired.whatsappIntent = true;
    pushDataLayer('whatsapp_intent', {
      event_category: 'engagement',
      event_label: 'whatsapp_button_click',
      source: source, // 'header', 'hero', 'price', 'float', 'terms_header', 'terms_float'
      page_location: window.location.href,
      page_title: document.title
    });
  }

  function trackQualificationCompleted(qualification) {
    if (eventFired.qualificationCompleted) return;
    eventFired.qualificationCompleted = true;
    pushDataLayer('qualification_completed', {
      event_category: 'lead',
      event_label: 'qualification_form_submitted',
      service: qualification.service,
      neighborhood: qualification.neighborhood ? 'provided' : 'missing', // Não expor PII no dataLayer
      urgency: qualification.urgency,
      has_neighborhood: !!qualification.neighborhood,
      page_location: window.location.href
    });
  }

  function trackWhatsAppRedirect(qualification) {
    if (eventFired.whatsappRedirect) return;
    eventFired.whatsappRedirect = true;
    pushDataLayer('whatsapp_redirect', {
      event_category: 'conversion',
      event_label: 'whatsapp_redirect_initiated',
      service: qualification.service,
      urgency: qualification.urgency,
      has_neighborhood: !!qualification.neighborhood,
      page_location: window.location.href
    });
  }

  // lead_qualified reservado para conversão offline confirmada (integração futura)
  // Não disparar automaticamente - requer confirmação de atendimento real
  function trackLeadQualified(qualification, extraData = {}) {
    pushDataLayer('lead_qualified', {
      event_category: 'conversion',
      event_label: 'lead_qualified_offline',
      service: qualification.service,
      urgency: qualification.urgency,
      has_neighborhood: !!qualification.neighborhood,
      ...extraData,
      page_location: window.location.href
    });
  }

  // =========================
  // MODAL DE PRÉ-QUALIFICAÇÃO
  // =========================
  function createQualificationModal() {
    const modalHtml = `
      <div id="qualification-modal" class="qualification-modal" role="dialog" aria-modal="true" aria-labelledby="qual-title" style="display: none;">
        <div class="qualification-overlay"></div>
        <div class="qualification-container">
          <header class="qualification-header">
            <button type="button" class="qualification-close" id="qual-close" aria-label="Fechar formulário">×</button>
            <h2 id="qual-title">Vamos te conectar ao especialista ideal</h2>
            <p class="qualification-subtitle" id="qual-subtitle">Responda 3 perguntinhas rápidas</p>
            <div class="qualification-progress">
              <div class="progress-bar">
                <div class="progress-fill" id="progress-fill" style="width: 0%"></div>
              </div>
              <span class="progress-text" id="progress-text">1 de 3</span>
            </div>
          </header>

          <main class="qualification-body" id="qual-body">
            <!-- Conteúdo dinâmico inserido aqui -->
          </main>

          <footer class="qualification-footer">
            <button type="button" class="btn btn-secondary btn-back" id="btn-back" disabled aria-label="Voltar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              Voltar
            </button>
            <button type="button" class="btn btn-primary btn-next" id="btn-next" disabled aria-label="Próximo">
              Próximo
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
          </footer>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    return $('#qualification-modal');
  }

  function renderStep(stepName) {
    const stepData = STEPS_DATA[stepName];
    const body = $('#qual-body');
    const progressFill = $('#progress-fill');
    const progressText = $('#progress-text');
    const btnBack = $('#btn-back');
    const btnNext = $('#btn-next');
    const stepIndex = CONFIG.qualificationSteps.indexOf(stepName);

    // Atualizar progresso
    const progressPercent = stepName === 'turnstile' ? 100 : ((stepIndex + 1) / CONFIG.qualificationSteps.length) * 100;
    progressFill.style.width = `${progressPercent}%`;
    progressText.textContent = stepName === 'turnstile' ? 'Verificação de segurança' : `${stepIndex + 1} de ${CONFIG.qualificationSteps.length}`;

    // Botão voltar
    btnBack.disabled = stepIndex === 0;

    // Mostrar/esconder botão próximo (escondido no step do Turnstile)
    if (stepName === 'turnstile') {
      btnNext.style.display = 'none';
    } else {
      btnNext.style.display = '';
    }

    // Renderizar conteúdo baseado no step
    let contentHtml = '';

    if (stepName === 'service' || stepName === 'urgency') {
      contentHtml = `
        <h3>${stepData.title}</h3>
        <p class="step-subtitle">${stepData.subtitle}</p>
        <div class="options-grid" id="options-grid" role="radiogroup" aria-label="${stepData.title}">
          ${stepData.options.map((opt, i) => `
            <button type="button"
              class="option-btn"
              data-value="${opt.value}"
              role="radio"
              aria-checked="false"
              tabindex="${i === 0 ? '0' : '-1'}">
              <span class="option-label">${opt.label}</span>
              <span class="option-desc">${opt.desc}</span>
              <svg class="option-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="20" height="20"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
          `).join('')}
        </div>
      `;
    } else if (stepName === 'neighborhood') {
      contentHtml = `
        <h3>${stepData.title}</h3>
        <p class="step-subtitle">${stepData.subtitle}</p>
        <div class="neighborhood-input-wrapper">
          <input type="text"
            id="neighborhood-input"
            class="neighborhood-input"
            placeholder="${stepData.placeholder}"
            autocomplete="address-level2"
            aria-label="Bairro ou cidade do atendimento"
            maxlength="200">
          <div class="suggestions-dropdown" id="suggestions-dropdown" role="listbox" aria-label="Sugestões de bairros" style="display: none;">
            ${stepData.suggestions.map((sug, i) => `
              <div class="suggestion-item" data-value="${sug}" role="option" tabindex="${i === 0 ? '0' : '-1'}">${sug}</div>
            `).join('')}
          </div>
        </div>
        <p class="input-hint">Digite seu bairro ou selecione uma sugestão</p>
      `;
    } else if (stepName === 'turnstile') {
      contentHtml = `
        <h3>Quase lá!</h3>
        <p class="step-subtitle">Verificando se você não é um robô...</p>
        <div class="turnstile-wrapper" id="turnstile-widget"></div>
        <p class="turnstile-notice">Esta verificação protege seu atendimento contra spam.</p>
      `;
    }

    body.innerHTML = contentHtml;
    body.dataset.currentStep = stepName;
    if (stepName === 'neighborhood') {
      $('#neighborhood-input').value = qualificationState.neighborhood || '';
    }
    const heading = $('h3', body);
    if (heading) { heading.tabIndex = -1; heading.focus(); }


    // Atualizar estado do botão próximo
    updateNextButtonState(stepName);

    // Bind events
    bindStepEvents(stepName);
  }

  function bindStepEvents(stepName) {
    const body = $('#qual-body');
    const btnNext = $('#btn-next');

    if (stepName === 'service' || stepName === 'urgency') {
      const options = $$('.option-btn', body);
      const selectedValue = qualificationState[stepName];
      options.forEach((btn, index) => {
        const selected = btn.dataset.value === selectedValue;
        btn.setAttribute('aria-checked', String(selected));
        btn.classList.toggle('selected', selected);
        btn.tabIndex = selected || (!selectedValue && index === 0) ? 0 : -1;
        btn.addEventListener('click', () => {
          $$('.option-btn', body).forEach(b => {
            b.setAttribute('aria-checked', 'false');
            b.classList.remove('selected');
            b.tabIndex = -1;
          });
          btn.setAttribute('aria-checked', 'true');
          btn.classList.add('selected');
          btn.tabIndex = 0;
          qualificationState[stepName] = btn.dataset.value;
          updateNextButtonState(stepName);
        });

        btn.addEventListener('keydown', (e) => {
          const offset = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
          if (offset) {
            e.preventDefault();
            const target = options[(options.indexOf(btn) + offset + options.length) % options.length];
            target.click();
            target.focus();
          }
          // Enter e Espaço já acionam o click nativo do botão.
        });
      });
    } else if (stepName === 'neighborhood') {
      const input = $('#neighborhood-input');
      const dropdown = $('#suggestions-dropdown');

      // Clonar para remover listeners antigos
      if (input) {
        const newInput = input.cloneNode(true);
        input.replaceWith(newInput);
      }
      if (dropdown) {
        const newDropdown = dropdown.cloneNode(true);
        dropdown.replaceWith(newDropdown);
      }

      const newInput = $('#neighborhood-input');
      const newDropdown = $('#suggestions-dropdown');

      newInput.addEventListener('input', () => {
        qualificationState.neighborhood = sanitizeInput(newInput.value);
        updateNextButtonState(stepName);

        const value = newInput.value.toLowerCase();
        $$('.suggestion-item', newDropdown).forEach(item => {
          const match = item.dataset.value.toLowerCase().includes(value);
          item.style.display = match ? '' : 'none';
        });
        newDropdown.style.display = value && $$('.suggestion-item[style*="display: none"]', newDropdown).length < $$('.suggestion-item', newDropdown).length ? 'block' : 'none';
      });

      newInput.addEventListener('focus', () => {
        if (newInput.value.trim()) {
          newDropdown.style.display = 'block';
        }
      });

      newInput.addEventListener('blur', () => {
        setTimeout(() => newDropdown.style.display = 'none', 200);
      });

      $$('.suggestion-item', newDropdown).forEach(item => {
        item.addEventListener('click', () => {
          newInput.value = item.dataset.value;
          qualificationState.neighborhood = sanitizeInput(item.dataset.value);
          newDropdown.style.display = 'none';
          updateNextButtonState(stepName);
          newInput.focus();
        });

        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            item.click();
          }
        });
      });
    } else if (stepName === 'turnstile') {
      const session = sessionId;
      const view = viewId;
      const valid = () => isCurrent(session, view) && phase === 'turnstile';
      loadTurnstile().then(() => {
        if (!valid()) return;
        const fail = message => { if (valid()) showTurnstileError(message); };
        try {
          // Prazo máximo também cobre widget/iframe que carregue sem emitir callbacks.
          widgetTimeout = setTimeout(() => fail('A verificação demorou demais. Tente novamente.'), 120000);
          turnstileWidgetId = window.turnstile.render('#turnstile-widget', {
            sitekey: CONFIG.turnstileSiteKey,
            action: 'qualification',
            theme: 'light',
            retry: 'never',
            callback: token => { if (valid()) processQualification(token, session, view); },
            'expired-callback': () => fail('A verificação expirou. Tente novamente.'),
            'timeout-callback': () => fail('O prazo da verificação terminou. Tente novamente.'),
            'unsupported-callback': () => fail('Este navegador não suporta a verificação. Tente um navegador atualizado.'),
            'error-callback': () => {
              fail('Erro na verificação de segurança. Tente novamente.');
              return true;
            }
          });
        } catch (error) {
          fail('Não foi possível iniciar a verificação. Tente novamente.');
        }
      }).catch(error => {
        if (valid()) showTurnstileError(error.message);
      });
    }
  }

  function updateNextButtonState(stepName) {
    const btnNext = $('#btn-next');
    let isValid = false;

    if (stepName === 'service' || stepName === 'urgency') {
      isValid = !!qualificationState[stepName];
    } else if (stepName === 'neighborhood') {
      isValid = qualificationState.neighborhood && qualificationState.neighborhood.length >= 2;
    }

    btnNext.disabled = !isValid;
    btnNext.setAttribute('aria-disabled', !isValid);
  }

  function goToStep(stepName) {
    if (!modalOpen) return;
    viewId++;
    phase = stepName;
    cancelRequest();
    removeWidget();
    currentStep = stepName === 'turnstile'
      ? CONFIG.qualificationSteps.length
      : CONFIG.qualificationSteps.indexOf(stepName);
    renderStep(stepName);
  }

  function nextStep() {
    if (isProcessing || currentStep >= CONFIG.qualificationSteps.length) return;
    const name = CONFIG.qualificationSteps[currentStep];
    updateNextButtonState(name);
    if ($('#btn-next').disabled) return;
    goToStep(CONFIG.qualificationSteps[currentStep + 1] || 'turnstile');
  }

  function prevStep() {
    if (!isProcessing && currentStep > 0) {
      goToStep(CONFIG.qualificationSteps[currentStep - 1]);
    }
  }

  function showTurnstileError(message) {
    if (!modalOpen) return;
    phase = 'error';
    removeWidget();
    const body = $('#qual-body');
    $('#progress-text').textContent = 'Erro na verificação';
    body.innerHTML = `
      <h3 tabindex="-1">Ops! Algo deu errado</h3>
      <p class="step-subtitle" role="alert"></p>
      <button type="button" class="btn btn-primary" id="retry-turnstile">Tentar novamente</button>
    `;
    $('.step-subtitle', body).textContent = message;
    $('#btn-back').disabled = false;
    $('h3', body).focus();
    const retryBtn = $('#retry-turnstile');
    const session = sessionId;
    const view = viewId;
    const updateRetry = () => {
      if (!isCurrent(session, view) || phase !== 'error') return;
      const remaining = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
      retryBtn.disabled = remaining > 0;
      retryBtn.textContent = remaining ? `Aguarde ${remaining}s` : 'Tentar novamente';
      if (remaining) setTimeout(updateRetry, 1000);
    };
    updateRetry();
    retryBtn.addEventListener('click', () => {
      if (isCurrent(session, view) && Date.now() >= retryAt) goToStep('turnstile');
    });
  }

  async function processQualification(token, session, view) {
    if (!isCurrent(session, view) || phase !== 'turnstile' || isProcessing) return;
    if (Date.now() < retryAt) {
      showTurnstileError('Muitas tentativas. Aguarde o prazo indicado antes de tentar novamente.');
      return;
    }
    if (typeof token !== 'string' || !token || usedTokens.has(token)) {
      showTurnstileError('É necessário realizar uma nova verificação.');
      return;
    }
    usedTokens.add(token);
    isProcessing = true;
    phase = 'processing';
    removeWidget();
    const controller = new AbortController();
    activeRequest = controller;
    const ownsRequest = () => isCurrent(session, view) && activeRequest === controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    const body = $('#qual-body');
    $('#progress-text').textContent = 'Validando segurança...';
    $('#btn-back').disabled = true;
    body.innerHTML = `
      <h3>Processando...</h3>
      <p class="step-subtitle" role="status">Validando segurança e preparando seu atendimento</p>
      <div class="loading-spinner" aria-label="Carregando"></div>
    `;
    const qualification = {
      service: sanitizeInput(qualificationState.service),
      neighborhood: sanitizeInput(qualificationState.neighborhood),
      urgency: sanitizeInput(qualificationState.urgency)
    };
    try {
      const response = await fetch(CONFIG.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ token, qualification })
      });
      if (!ownsRequest()) return;
      let data;
      try { data = await response.json(); } catch (error) {
        throw new Error('O servidor retornou uma resposta inválida. Tente novamente.');
      }
      if (!ownsRequest()) return;
      if (response.status === 429) {
        const seconds = Number(response.headers.get('Retry-After') || data?.retryAfter);
        retryAt = Date.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 60) * 1000;
      }
      if (!response.ok || data?.success !== true) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Não foi possível validar. Tente novamente.');
      }
      const url = new URL(data.whatsappUrl);
      if (url.origin !== 'https://wa.me' || !/^\/[0-9]{10,15}$/.test(url.pathname) || url.username || url.password) {
        throw new Error('O endereço de atendimento retornado é inválido.');
      }
      phase = 'success';
      trackQualificationCompleted(qualification);
      $('#progress-text').textContent = 'Verificação concluída';
      body.innerHTML = `
        <h3 tabindex="-1">✅ Verificação concluída!</h3>
        <p class="step-subtitle">Clique abaixo para abrir o WhatsApp com sua mensagem pré-preenchida.</p>
        <a class="btn btn-primary btn-whatsapp-final" id="btn-whatsapp-final" target="_blank" rel="noopener noreferrer">Conversar no WhatsApp</a>
        <p class="whatsapp-hint">Se a nova aba não abrir, use o link abaixo nesta mesma aba.</p>
        <a class="btn btn-secondary" id="whatsapp-fallback">Abrir WhatsApp nesta aba</a>
      `;
      $('#btn-back').disabled = false;
      $('h3', body).focus();
      ['#btn-whatsapp-final', '#whatsapp-fallback'].forEach(selector => {
        const link = $(selector);
        link.href = url.href;
        link.addEventListener('click', event => {
          if (!isCurrent(session, view) || phase !== 'success') { event.preventDefault(); return; }
          // Mede tentativa de saída, nunca uma conversa confirmada.
          trackWhatsAppRedirect(qualification);
        });
      });
    } catch (error) {
      if (!ownsRequest()) return;
      showTurnstileError(controller.signal.aborted
        ? 'A validação demorou demais. Realize uma nova verificação.'
        : error.message || 'Falha de conexão. Tente novamente.');
    } finally {
      clearTimeout(timeout);
      if (ownsRequest()) {
        activeRequest = null;
        isProcessing = false;
      }
    }
  }

  // =========================
  // MODAL CONTROL
  // =========================
  function openModal(source = 'unknown', trigger = document.activeElement) {
    if (modalOpen) return;
    const modal = $('#qualification-modal') || createQualificationModal();
    sessionId++;
    modalOpen = true;
    previousFocus = trigger;
    usedTokens = new Set();
    const session = sessionId;

    // Reset state completo
    qualificationState = { service: null, neighborhood: null, urgency: null };
    currentStep = 0;
    isProcessing = false;
    eventFired = {
      whatsappIntent: false,
      qualificationCompleted: false,
      whatsappRedirect: false
    };

    // Disparar evento whatsapp_intent
    trackWhatsAppIntent(source);

    // Abrir modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Animar entrada
    requestAnimationFrame(() => {
      if (modalOpen && sessionId === session) {
        modal.classList.add('open');
        $('h3', $('#qual-body'))?.focus();
      }
    });

    // Render primeiro passo
    goToStep('service');

    // Bind footer buttons (usar onclick para evitar duplicação)
    const btnNext = $('#btn-next');
    const btnBack = $('#btn-back');
    if (btnNext) btnNext.onclick = nextStep;
    if (btnBack) btnBack.onclick = prevStep;

    // Fechar no overlay
    const overlay = $('.qualification-overlay', modal);
    if (overlay) {
      overlay.onclick = closeModal;
    }

    // Fechar com ESC
    $('#qual-close').onclick = closeModal;
    document.addEventListener('keydown', handleEscape);
  }

  function closeModal() {
    const modal = $('#qualification-modal');
    if (!modal || !modalOpen) return;
    modalOpen = false;
    phase = 'closed';
    sessionId++;
    viewId++;
    cancelRequest();
    removeWidget();
    const closedSession = sessionId;
    modal.classList.remove('open');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', handleEscape);
    previousFocus?.focus();
    setTimeout(() => {
      if (!modalOpen && sessionId === closedSession) modal.style.display = 'none';
    }, 300);
  }

  function handleEscape(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
    if (e.key !== 'Tab') return;
    const focusable = $$('button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]', $('#qualification-modal'))
      .filter(element => element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const inside = focusable.includes(document.activeElement);
    if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
  }

  // =========================
  // ANIMAÇÃO DE ENTRADA (SCROLL)
  // =========================
  function initScrollAnimations() {
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
  }

  // =========================
  // BANNER DE COOKIES / LGPD
  // =========================
  function initCookieBanner() {
    window.noisConsent?.init();
  }

  // =========================
  // INICIALIZAÇÃO
  // =========================
  document.addEventListener("DOMContentLoaded", function () {
    // Inicializar componentes
    initScrollAnimations();
    initCookieBanner();

    // Mapear botões para fontes de tráfego
    const isTermsPage = window.location.pathname.endsWith('/termos.html');
    const buttonSources = {
      '#botao-whatsapp-header': 'header',
      '#botao-whatsapp-hero': 'hero',
      '#botao-whatsapp-preco': 'price',
      '#botao-whatsapp-float': 'float'
    };

    // Bind todos os botões WhatsApp para abrir modal
    Object.entries(buttonSources).forEach(([selector, source]) => {
      const btn = $(selector);
      if (btn) {
        // Remover href direto se existir (segurança)
        if (btn.tagName === 'A') {
          btn.removeAttribute('href');
          btn.setAttribute('role', 'button');
          btn.setAttribute('tabindex', '0');
        }

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          openModal(isTermsPage ? 'terms_' + source : source, btn);
        });

        if (btn.tagName !== 'BUTTON') btn.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openModal(isTermsPage ? 'terms_' + source : source, btn);
          }
        });
      }
    });

    console.log('NÓIS Desentupidora - Script carregado com pré-qualificação + Turnstile + GTM');
  });
})();