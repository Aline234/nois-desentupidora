'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../api/verify-turnstile.js'), 'utf8');
const good = { success: true, hostname: 'noidesentupidora.com.br', action: 'qualification' };
const qualification = { service: 'esgoto', neighborhood: 'Centro', urgency: 'hoje' };

function setup({ result = good, httpOK = true, fetchError, jsonError, env = {}, timeout = false } = {}) {
  let calls = 0;
  const encodedMessages = [];
  const sandbox = {
    encodeURIComponent(value) {
      encodedMessages.push(value);
      return encodeURIComponent(value);
    },
    module: { exports: {} }, process: { env: { TURNSTILE_SECRET_KEY: 'test-only', ...env } },
    console: { log() {}, warn() {}, error() {} }, URLSearchParams, AbortController,
    setTimeout: timeout ? fn => setTimeout(fn, 1) : setTimeout, clearTimeout,
    fetch: async (url, options) => {
      calls++;
      assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
      assert.equal(options.body.get('secret'), 'test-only');
      if (timeout) return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
      if (fetchError) throw new Error('network failure');
      return { ok: httpOK, json: async () => {
        if (jsonError) throw new SyntaxError('invalid JSON');
        return result;
      } };
    }
  };
  vm.runInNewContext(source, sandbox, { filename: 'verify-turnstile.js' });
  async function request(overrides = {}) {
    const res = {
      headers: {}, statusCode: 200, body: null,
      setHeader(key, value) { this.headers[key] = value; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
      end() { return this; }
    };
    await sandbox.module.exports({
      method: 'POST', headers: { origin: 'https://noidesentupidora.com.br', 'x-forwarded-for': '203.0.113.10' },
      body: { token: 'test-token-12345', qualification }, ...overrides
    }, res);
    return res;
  }
  return { request, calls: () => calls, encodedMessages };
}

test('token válido: URL comercial e mensagem codificada, sem cache', async () => {
  const api = setup();
  const res = await api.request();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  const url = new URL(res.body.whatsappUrl);
  assert.equal(url.origin, 'https://wa.me');
  assert.match(url.searchParams.get('text'), /Centro/);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://noidesentupidora.com.br');
});

for (const hostname of [undefined, null, '', 123, 'evil.com', 'noidesentupidora.com.br.evil.com', 'evilnoidesentupidora.com.br', 'www.noidesentupidora.com.br', 'https://noidesentupidora.com.br', 'noidesentupidora.com.br/', '.noidesentupidora.com.br', '-bad.noidesentupidora.com.br']) {
  test('rejeita hostname ' + JSON.stringify(hostname), async () => {
    const res = await setup({ result: { ...good, hostname } }).request();
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.whatsappUrl, undefined);
  });
}
for (const action of [undefined, null, '', 'login', 'Qualification', 123]) {
  test('rejeita action ' + JSON.stringify(action), async () => {
    const res = await setup({ result: { ...good, action } }).request();
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.whatsappUrl, undefined);
  });
}
test('permite apenas hosts explicitamente listados; normaliza maiúsculas DNS', async () => {
  const res = await setup({
    result: { ...good, hostname: 'WWW.noidesentupidora.com.br' },
    env: { EXPECTED_HOSTNAMES: 'noidesentupidora.com.br, www.noidesentupidora.com.br' }
  }).request();
  assert.equal(res.statusCode, 200);
});
for (const options of [
  { result: { ...good, success: false }, expected: 403 },
  { result: { ...good, success: 'true' }, expected: 502 },
  { result: null, expected: 502 },
  { fetchError: true, expected: 502 },
  { jsonError: true, expected: 502 },
  { httpOK: false, expected: 502 },
  { timeout: true, expected: 504 }
]) {
  test('falha fechada Cloudflare: ' + JSON.stringify(options), async () => {
    const res = await setup(options).request();
    assert.equal(res.statusCode, options.expected);
    assert.equal(res.body.success, false);
    assert.equal(res.body.whatsappUrl, undefined);
  });
}
test('não aceita hostname/action ausentes mesmo com success true', async () => {
  const res = await setup({ result: { success: true } }).request();
  assert.equal(res.statusCode, 403);
});
test('origem divergente rejeitada antes do Siteverify', async () => {
  const api = setup();
  const res = await api.request({ headers: { origin: 'https://evil.com' } });
  assert.equal(res.statusCode, 403);
  assert.equal(api.calls(), 0);
});
test('sem Origin continua exigindo token; OPTIONS não verifica token', async () => {
  const api = setup();
  assert.equal((await api.request({ headers: {}, body: {} })).statusCode, 400);
  assert.equal(api.calls(), 0);
  assert.equal((await api.request({ method: 'OPTIONS' })).statusCode, 200);
  assert.equal(api.calls(), 0);
  assert.equal((await api.request({ headers: {} })).statusCode, 200);
});
test('corpos inválidos e tokens fora do tamanho rejeitados', async () => {
  for (const body of [null, undefined, [], 'bad', {}, { token: 'short' }, { token: 'x'.repeat(2049), qualification }]) {
    const api = setup();
    assert.equal((await api.request({ body })).statusCode, 400);
    assert.equal(api.calls(), 0);
  }
});
test('serviço, bairro e urgência obrigatórios e validados', async () => {
  for (const invalid of [{ ...qualification, service: 'bad' }, { ...qualification, neighborhood: ' ' }, { ...qualification, urgency: 'bad' }]) {
    const api = setup();
    assert.equal((await api.request({ body: { token: 'test-token-12345', qualification: invalid } })).statusCode, 400);
    assert.equal(api.calls(), 0);
  }
});
test('segredo ausente e número inválido não liberam URL', async () => {
  for (const env of [{ TURNSTILE_SECRET_KEY: '' }, { WHATSAPP_NUMBER: 'invalid-number' }]) {
    const res = await setup({ env }).request();
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.whatsappUrl, undefined);
  }
});
test('limitador local: 10 chamadas, 11ª bloqueada, IP diferente atendido', async () => {
  const api = setup();
  for (let i = 0; i < 10; i++) assert.equal((await api.request()).statusCode, 200);
  const res = await api.request();
  assert.equal(res.statusCode, 429);
  assert.ok(res.body.retryAfter > 0);
  assert.equal(api.calls(), 10);
  assert.equal((await api.request({ headers: { 'x-forwarded-for': '203.0.113.11' } })).statusCode, 200);
});


test('backend e frontend são UTF-8 válidos, sem caracteres de substituição', () => {
  const { TextDecoder } = require('node:util');
  for (const file of ['api/verify-turnstile.js', 'script.js']) {
    const bytes = fs.readFileSync(path.join(__dirname, '..', file));
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    assert.ok(!text.includes('\uFFFD'), file);
    assert.ok(text.isWellFormed(), file);
  }
});

test('16 combinações preservam emojis e acentos antes/depois de codificar uma vez', async () => {
  const services = {
    esgoto: 'Limpeza de Esgoto',
    gordura: 'Manutenção de Caixa de Gordura',
    calha: "Limpeza de Calha e Caixa d'Água",
    outro: 'Outro serviço de desentupimento'
  };
  const urgencies = {
    emergencia: '\u{1F534} Emergência - Preciso de atendimento IMEDIATO (24h)',
    hoje: '\u{1F7E1} Urgente - Preciso de atendimento HOJE',
    semana: '\u{1F7E2} Nesta semana - Posso agendar para os próximos dias',
    orcamento: '\u{1F535} Apenas orçamento - Quero saber valores e condições'
  };
  const neighborhood = 'São João & Água Branca + Centro #1 (100%)';
  for (const [service, serviceLabel] of Object.entries(services)) {
    for (const [urgency, urgencyLabel] of Object.entries(urgencies)) {
      const api = setup({ env: { WHATSAPP_MESSAGE_EMOJIS: 'true' } });
      const res = await api.request({
        body: { token: 'unicode-token-12345', qualification: { service, neighborhood, urgency } }
      });
      assert.equal(res.statusCode, 200);
      const expected = [
        'Olá! Preciso de um atendimento.',
        '',
        '\u{1F6E0}\uFE0F *Serviço:* ' + serviceLabel,
        '',
        '\u{1F4CD} *Bairro/Local:* ' + neighborhood,
        '\u23F0 *Urgência:* ' + urgencyLabel,
        '',
        'Podem me ajudar com orçamento e agendamento?'
      ].join('\n');
      assert.equal(api.encodedMessages.length, 1, 'Uma única codificação da mensagem');
      assert.equal(api.encodedMessages[0], expected, 'Texto original intacto antes de encodeURIComponent');
      assert.ok(!api.encodedMessages[0].includes('\uFFFD'));
      assert.ok(api.encodedMessages[0].isWellFormed());
      // Simula serialização JSON HTTP e processamento da URL pelo frontend.
      const url = new URL(JSON.parse(JSON.stringify(res.body)).whatsappUrl);
      assert.equal(url.searchParams.get('text'), expected);
      const encoded = res.body.whatsappUrl.split('?text=')[1];
      assert.equal(encoded, encodeURIComponent(expected));
      // URL normaliza apóstrofos para %27; isso não é codificação dupla.
      assert.equal(decodeURIComponent(url.search.slice('?text='.length)), expected);
      assert.equal(decodeURIComponent(encoded), expected);
      assert.ok(encoded.includes('%F0%9F%9B%A0%EF%B8%8F'), 'Serviço e variation selector');
      assert.ok(encoded.includes('%F0%9F%93%8D'), 'Localização');
      assert.ok(encoded.includes('%E2%8F%B0'), 'Urgência');
      assert.ok(!/%EF%BF%BD|%25F0|%25E2|%25EF/i.test(encoded), 'Sem substituição ou codificação dupla');
    }
  }
});


test('modo padrão sem emojis mantém serviço, localização, urgência e UTF-8 explícito', async () => {
  const api = setup();
  const res = await api.request({
    body: { token: 'plaintext-token-12345', qualification: { service: 'calha', neighborhood: 'São João', urgency: 'emergencia' } }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'application/json; charset=utf-8');
  const text = new URL(res.body.whatsappUrl).searchParams.get('text');
  assert.match(text, /\*Serviço:\* Limpeza de Calha e Caixa d'Água/);
  assert.match(text, /\*Bairro\/Local:\* São João/);
  assert.match(text, /\*Urgência:\* Emergência/);
  assert.ok(!/[\p{Extended_Pictographic}\uFE0F\uFFFD]/u.test(text));
  assert.equal(api.encodedMessages.length, 1);
  assert.equal(api.encodedMessages[0], text);
});
