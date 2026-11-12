// =========================
// VERCEL SERVERLESS FUNCTION - Verificação Turnstile
// =========================
// Endpoint: POST /api/verify-turnstile
// Body: { token: string, qualification: { service: string, neighborhood: string, urgency: string } }
// Response: { success: boolean, whatsappUrl?: string, error?: string, message?: string }

// Limitação local por instância aquecida; não garante controle global na Vercel.
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minuto
const RATE_LIMIT_MAX_REQUESTS = 10; // máx 10 req/min por IP

function checkRateLimit(ip) {
  const now = Date.now();
  for (const [entry, record] of rateLimitMap) {
    if (record.resetTime <= now) rateLimitMap.delete(entry);
  }
  const key = `ratelimit:${ip}`;
  const record = rateLimitMap.get(key);

  if (!record) {
    // Não bloquear novos clientes quando a capacidade local estiver cheia.
    if (rateLimitMap.size >= 10000) return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS };
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
  }

  if (now > record.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetTime: record.resetTime };
  }

  record.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - record.count };
}

function getClientIp(req) {
  // Vercel define x-forwarded-for
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, 200);
}

function validateQualification(qualification) {
  if (!qualification || typeof qualification !== 'object') {
    return { valid: false, error: 'Pré-qualificação inválida' };
  }

  const service = sanitizeInput(qualification.service);
  const neighborhood = sanitizeInput(qualification.neighborhood);
  const urgency = sanitizeInput(qualification.urgency);

  const validServices = ['esgoto', 'gordura', 'calha', 'outro'];
  const validUrgencies = ['emergencia', 'hoje', 'semana', 'orcamento'];

  if (!service || !validServices.includes(service)) {
    return { valid: false, error: 'Serviço inválido' };
  }

  if (!neighborhood || neighborhood.length < 2) {
    return { valid: false, error: 'Bairro/localização é obrigatório (mín. 2 caracteres)' };
  }

  if (!urgency || !validUrgencies.includes(urgency)) {
    return { valid: false, error: 'Urgência inválida' };
  }

  return { valid: true, service, neighborhood, urgency };
}

module.exports = async function handler(req, res) {
  // CORS é política de navegador, não autenticação. Todo POST exige Turnstile.
  const origins = (process.env.ALLOWED_ORIGIN || 'https://noidesentupidora.com.br')
    .split(',').map(value => value.trim()).filter(Boolean);
  const origin = req.headers.origin;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (origin && !origins.includes(origin)) {
    return res.status(403).json({ success: false, error: 'Origem não permitida' });
  }
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  // Rate limiting
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(clientIp);
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);

  if (!rateLimit.allowed) {
    const retryAfter = Math.ceil((rateLimit.resetTime - Date.now()) / 1000);
    res.setHeader('Retry-After', retryAfter);
    return res.status(429).json({
      success: false,
      error: 'Muitas tentativas. Aguarde um momento e tente novamente.',
      retryAfter
    });
  }

  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ success: false, error: 'Corpo da requisição inválido' });
    }
    const { token, qualification } = req.body;

    // Validação básica do token
    if (!token || typeof token !== 'string' || token.length < 10 || token.length > 2048) {
      return res.status(400).json({
        success: false,
        error: 'Token de verificação ausente ou inválido'
      });
    }

    // Validar pré-qualificação
    const qualValidation = validateQualification(qualification);
    if (!qualValidation.valid) {
      return res.status(400).json({
        success: false,
        error: qualValidation.error
      });
    }

    const { service, neighborhood, urgency } = qualValidation;

    // Verificar Turnstile na Cloudflare
    const secretKey = process.env.TURNSTILE_SECRET_KEY;

    if (!secretKey) {
      console.error('TURNSTILE_SECRET_KEY não configurada nas variáveis de ambiente');
      return res.status(500).json({
        success: false,
        error: 'Configuração de segurança ausente no servidor'
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let turnstileData;
    try {
      const turnstileResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: secretKey, response: token, remoteip: clientIp })
      });
      if (!turnstileResponse.ok) throw new Error('Cloudflare HTTP error');
      turnstileData = await turnstileResponse.json();
      if (!turnstileData || typeof turnstileData !== 'object' || typeof turnstileData.success !== 'boolean') {
        throw new Error('Cloudflare invalid response');
      }
    } catch (error) {
      return res.status(controller.signal.aborted ? 504 : 502).json({
        success: false,
        error: 'Serviço de verificação temporariamente indisponível. Tente novamente.'
      });
    } finally {
      clearTimeout(timeout);
    }

    // Sucesso, hostname exato e action são todos obrigatórios.
    const allowedHostnames = (process.env.EXPECTED_HOSTNAMES || process.env.EXPECTED_HOSTNAME || 'noidesentupidora.com.br')
      .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
    const hostname = turnstileData.hostname;
    const validHostname = typeof hostname === 'string'
      && hostname.length <= 253
      && hostname.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
      && allowedHostnames.includes(hostname.toLowerCase());
    if (turnstileData.success !== true || !validHostname || turnstileData.action !== 'qualification') {
      return res.status(403).json({
        success: false,
        error: 'Falha na verificação de segurança. Realize uma nova verificação.'
      });
    }

    // Número comercial; sua ocultação não é um controle de segurança.
    const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5511950566792';

    if (!/^[0-9]{10,15}$/.test(WHATSAPP_NUMBER)) {
      return res.status(500).json({ success: false, error: 'Configuração do atendimento inválida' });
    }

    // Montar mensagem dinâmica baseada na pré-qualificação
    const message = montarMensagemQualificada({ service, neighborhood, urgency });
    const encodedMessage = encodeURIComponent(message);

    // URL final do WhatsApp
    const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodedMessage}`;

    // Log para auditoria (sem expor o número real nos logs)
    console.log('Pré-qualificação validada:', {
      service,
      neighborhood: neighborhood ? 'provided' : 'missing',
      urgency,
      timestamp: new Date().toISOString(),
      hostname: turnstileData.hostname,
      action: turnstileData.action
    });

    return res.status(200).json({
      success: true,
      whatsappUrl,
      message: 'Verificação concluída com sucesso'
    });

  } catch (error) {
    console.error('Erro na verificação Turnstile:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro interno do servidor. Tente novamente mais tarde.'
    });
  }
}

/**
 * Monta a mensagem personalizada baseada na pré-qualificação do lead
 * @param {Object} qualification - { service, neighborhood, urgency }
 * @returns {string} Mensagem formatada para o WhatsApp
 */
function montarMensagemQualificada(qualification) {
  const { service, neighborhood, urgency } = qualification;

  const servicosMap = {
    'esgoto': 'Limpeza de Esgoto',
    'gordura': 'Manutenção de Caixa de Gordura',
    'calha': 'Limpeza de Calha e Caixa d\'Água',
    'outro': 'Outro serviço de desentupimento'
  };

  // Mitigação: o redirecionamento externo observado troca emojis por U+FFFD.
  // Só reativar após validar o percurso real do WhatsApp.
  const includeEmojis = process.env.WHATSAPP_MESSAGE_EMOJIS === 'true';
  const icon = value => includeEmojis ? value + ' ' : '';
  const urgenciaMap = {
    'emergencia': icon('\u{1F534}') + 'Emergência - Preciso de atendimento IMEDIATO (24h)',
    'hoje': icon('\u{1F7E1}') + 'Urgente - Preciso de atendimento HOJE',
    'semana': icon('\u{1F7E2}') + 'Nesta semana - Posso agendar para os próximos dias',
    'orcamento': icon('\u{1F535}') + 'Apenas orçamento - Quero saber valores e condições'
  };

  const servicoFormatado = servicosMap[service] || service;
  const urgenciaFormatada = urgenciaMap[urgency] || urgency;

  // A URL aplica encodeURIComponent uma única vez, também no modo sem emojis.
  return `Olá! Preciso de um atendimento.

${icon('\u{1F6E0}\uFE0F')}*Serviço:* ${servicoFormatado}

${icon('\u{1F4CD}')}*Bairro/Local:* ${neighborhood}
${icon('\u23F0')}*Urgência:* ${urgenciaFormatada}

Podem me ajudar com orçamento e agendamento?`;
}
